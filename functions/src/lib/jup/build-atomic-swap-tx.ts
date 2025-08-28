import BN from "bn.js";
import {
  Connection,
  PublicKey,
  AddressLookupTableAccount,
  TransactionInstruction,
  VersionedTransaction,
  TransactionMessage,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  createTransferCheckedInstruction,
  getMint,
} from "@solana/spl-token";
import { SwapInstructionsResponse } from "@jup-ag/api";
import { BuildAtomicArgs } from "./types";
import { DEFAULT_TOTAL_FEE_BPS } from "../constants";
import { getJupiterClient } from "./client";
import { BadRequestError, ValidationError } from "../errors";

/** Small helper to decode a Jupiter instruction object into web3 Instruction */
function toIx(i: {
  programId: string;
  accounts: any[];
  data: string;
}): TransactionInstruction {
  return new TransactionInstruction({
    programId: new PublicKey(i.programId),
    keys: i.accounts.map((a) => ({
      pubkey: new PublicKey(a.pubkey),
      isSigner: a.isSigner,
      isWritable: a.isWritable,
    })),
    data: Buffer.from(i.data, "base64"),
  });
}

async function loadALTs(
  connection: Connection,
  keys: string[] | undefined
): Promise<AddressLookupTableAccount[]> {
  if (!keys?.length) return [];
  const lookups = await Promise.all(
    keys.map((k) => connection.getAddressLookupTable(new PublicKey(k)))
  );
  return lookups.flatMap((r) => (r.value ? [r.value] : []));
}

async function maybeCreateAtaIx(
  connection: Connection,
  payer: PublicKey,
  owner: PublicKey,
  mint: PublicKey
) {
  const ata = await getAssociatedTokenAddress(mint, owner, true);
  const info = await connection.getAccountInfo(ata);
  const ix = info
    ? null
    : createAssociatedTokenAccountInstruction(payer, ata, owner, mint);
  return { ata, ix };
}

/**
 * Compose a single atomic v0 transaction:
 *  setup → (create Intermediate ATA if needed) → swap →
 *  (create Referrer ATA if needed) → transfer ref →
 *  (create Cold ATA if needed) → sweep remainder → cleanup
 *
 * Server partial-signs as the authority for the fee ATA. User signs & sends.
 */
export async function buildAtomicSwapTxWithFeeSplit(
  args: BuildAtomicArgs
): Promise<{
  txBase64: string;
  lastValidBlockHeight: number;
  swapIns: SwapInstructionsResponse;
}> {
  const {
    connection,
    quoteResponse,
    inputMint,
    inputAmountAtoms,
    userPublicKey,
    intermediateFeeOwner,
    intermediateFeeOwnerSecretKey,
    referrerOwner,
    coldTreasuryOwner,
    platformFeeBps,
    referrerShareBpsOfFee = 0, // basis points of fee, i.e. 5000 = 50% of fee
    dynamicSlippage = true,
    dynamicComputeUnitLimit = true,
  } = args;

  if (quoteResponse.inputMint !== inputMint) {
    throw new ValidationError("inputMint mismatch");
  }
  if (quoteResponse.inAmount?.toString() !== String(inputAmountAtoms)) {
    throw new ValidationError("inAmount mismatch");
  }
  if (platformFeeBps !== DEFAULT_TOTAL_FEE_BPS) {
    throw new BadRequestError(
      `Unexpected platformFeeBps ${platformFeeBps}, must be ${DEFAULT_TOTAL_FEE_BPS}`
    );
  }
  if (referrerShareBpsOfFee < 0 || referrerShareBpsOfFee > 10_000) {
    throw new ValidationError(
      "referrerShareBpsOfFee must be between 0 and 10,000"
    );
  }
  if (quoteResponse.swapMode !== "ExactIn") {
    throw new BadRequestError(
      "Only ExactIn supported for deterministic fee math"
    );
  }
  const jupiter = getJupiterClient();

  // ——— SOLID INT MATH WITH BN ———
  const inAtomsBN = new BN(inputAmountAtoms.toString());
  const feeBpsBN = new BN(platformFeeBps);
  const tenThousand = new BN(10_000);

  // fee = floor(inputAtoms * platformFeeBps / 10_000)
  const feeAtomsBN = inAtomsBN.mul(feeBpsBN).div(tenThousand);
  if (feeAtomsBN.isZero()) throw new Error("Fee is zero for given amount/bps.");

  // split
  const refShareBpsBN = new BN(referrerShareBpsOfFee); // e.g. 5000 = 50% of fee
  const refAtomsBN = feeAtomsBN.mul(refShareBpsBN).div(tenThousand);
  const sweepAtomsBN = feeAtomsBN.sub(refAtomsBN);

  const userPk = new PublicKey(userPublicKey);
  const feeOwnerPk = new PublicKey(intermediateFeeOwner);
  const refPk = new PublicKey(referrerOwner);
  const coldPk = new PublicKey(coldTreasuryOwner);
  const mintPk = new PublicKey(inputMint);

  // ——— PREP ATAs (payer = user; costs are user-paid in this atomic tx) ———
  const { ata: intermediateFeeAta, ix: createIntermediateATA } =
    await maybeCreateAtaIx(connection, userPk, feeOwnerPk, mintPk);
  const { ata: referrerAta, ix: createRefATA } = await maybeCreateAtaIx(
    connection,
    userPk,
    refPk,
    mintPk
  );
  const { ata: coldTreasuryAta, ix: createColdATA } = await maybeCreateAtaIx(
    connection,
    userPk,
    coldPk,
    mintPk
  );

  // ——— JUP SDK: fetch instructions (typed) ———
  const swapIns = await jupiter.swapInstructionsPost({
    swapRequest: {
      quoteResponse, // ExactIn, already chosen to fee in INPUT for determinism
      userPublicKey: userPk.toBase58(),
      feeAccount: intermediateFeeAta.toBase58(), // Jupiter deposits the fee here
      dynamicSlippage,
      dynamicComputeUnitLimit,
    },
  });

  // ——— Decode JUP instructions ———
  const computeBudgetIxs = (swapIns.computeBudgetInstructions || []).map(toIx);
  const setupIxs = (swapIns.setupInstructions || []).map(toIx);
  const swapIx = toIx(swapIns.swapInstruction);
  // some deployments expose cleanupInstruction singular; handle both
  const cleanupIxs = swapIns.cleanupInstruction
    ? [toIx(swapIns.cleanupInstruction)]
    : [];

  // ——— Our transfer ixs (post-swap) ———
  const { decimals } = await getMint(connection, mintPk);
  const refAmountBigInt = BigInt(refAtomsBN.toString());
  const sweepAmountBigInt = BigInt(sweepAtomsBN.toString());

  const ourIxs: TransactionInstruction[] = [];
  if (!refAtomsBN.isZero()) {
    if (createRefATA) ourIxs.push(createRefATA);
    ourIxs.push(
      createTransferCheckedInstruction(
        intermediateFeeAta, // from
        mintPk, // mint
        referrerAta, // to
        feeOwnerPk, // authority (server signer)
        refAmountBigInt,
        decimals
      )
    );
  }

  if (!sweepAtomsBN.isZero()) {
    if (createColdATA) ourIxs.push(createColdATA);
    ourIxs.push(
      createTransferCheckedInstruction(
        intermediateFeeAta,
        mintPk,
        coldTreasuryAta,
        feeOwnerPk,
        sweepAmountBigInt,
        decimals
      )
    );
  }

  // ——— Compose final instruction order ———
  const preSwap = [
    ...computeBudgetIxs,
    ...setupIxs,
    ...(createIntermediateATA ? [createIntermediateATA] : []),
  ];
  const postSwap = [...ourIxs, ...cleanupIxs];
  const allIxs = [...preSwap, swapIx, ...postSwap];

  // ——— Load ALTs Jupiter referenced ———
  const altKeys = swapIns.addressLookupTableAddresses || [];
  const alts: AddressLookupTableAccount[] = await loadALTs(connection, altKeys);

  // ——— Compile v0 (payer = user) ———
  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash();
  const msgV0 = new TransactionMessage({
    payerKey: userPk,
    recentBlockhash: blockhash,
    instructions: allIxs,
  }).compileToV0Message(alts);

  const tx = new VersionedTransaction(msgV0);

  // ——— Server partial-signs as fee ATA authority ———
  // convert to a Keypair-like signer (publicKey + secretKey)
  const serverSigner = {
    publicKey: feeOwnerPk,
    secretKey: intermediateFeeOwnerSecretKey, // Uint8Array from KMS/GSM
  };

  tx.sign([serverSigner]); // add server signature

  // ——— Return base64 for client to co-sign & send ———
  const txBase64 = Buffer.from(tx.serialize()).toString("base64");
  return { txBase64, lastValidBlockHeight, swapIns };
}
