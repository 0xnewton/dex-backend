import BN from "bn.js";
import {
  Connection,
  PublicKey,
  AddressLookupTableAccount,
  TransactionInstruction,
  VersionedTransaction,
  TransactionMessage,
  Keypair,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  createTransferCheckedInstruction,
  getMint,
} from "@solana/spl-token";
import { SwapInstructionsResponse } from "@jup-ag/api";
import { BuildAtomicArgs } from "./types";
import { DEFAULT_TOTAL_FEE_BPS } from "../config/constants";
import { getJupiterClient } from "./client";
import { BadRequestError, ValidationError } from "../backend-framework/errors";

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

interface AtaIx {
  ata: PublicKey;
  ix: TransactionInstruction | null;
}

async function maybeCreateAtaIx(
  connection: Connection,
  payer: PublicKey,
  owner: PublicKey,
  mint: PublicKey
): Promise<AtaIx> {
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
    referrer,
    coldTreasuryOwner,
    platformFeeBps,
    dynamicSlippage = true,
    dynamicComputeUnitLimit = true,
  } = args;

  // --- validation ---
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
  if (
    referrer &&
    (referrer.shareBpsOfFee < 0 || referrer.shareBpsOfFee > 10_000)
  ) {
    throw new ValidationError("Referrer fee must be between 0 and 10,000");
  }
  if (quoteResponse.swapMode !== "ExactIn") {
    throw new BadRequestError(
      "Only ExactIn supported for deterministic fee math"
    );
  }

  const jupiter = getJupiterClient();

  // --- math ---
  const inAtomsBN = new BN(inputAmountAtoms.toString());
  const feeBpsBN = new BN(platformFeeBps);
  const tenThousand = new BN(10_000);

  // fee = floor(inputAtoms * platformFeeBps / 10_000)
  const feeAtomsBN = inAtomsBN.mul(feeBpsBN).div(tenThousand);
  if (feeAtomsBN.isZero()) throw new Error("Fee is zero for given amount/bps.");

  // referrer split (optional)
  const refShareBpsBN = new BN(referrer?.shareBpsOfFee ?? 0);
  const refAtomsBN = feeAtomsBN.mul(refShareBpsBN).div(tenThousand);
  const sweepAtomsBN = feeAtomsBN.sub(refAtomsBN);

  const userPk = new PublicKey(userPublicKey);
  const feeOwnerPk = new PublicKey(intermediateFeeOwner);
  const coldPk = new PublicKey(coldTreasuryOwner);
  const mintPk = new PublicKey(inputMint);

  // --- ATAs (payer = user; created inside the same atomic tx) ---
  const { ata: intermediateFeeAta, ix: createIntermediateATA } =
    await maybeCreateAtaIx(connection, userPk, feeOwnerPk, mintPk);

  // referrer ATA only if needed
  const refEnabled = refAtomsBN.gt(new BN(0)) && !!referrer;
  const refPk = refEnabled ? new PublicKey(referrer!.owner) : null;
  const {
    ata: referrerAta,
    ix: createRefATA,
  }: AtaIx | { ata: null; ix: null } = refEnabled
    ? await maybeCreateAtaIx(connection, userPk, refPk!, mintPk)
    : { ata: null, ix: null };

  // cold treasury ATA (only if we actually sweep > 0)
  const needCold = sweepAtomsBN.gt(new BN(0));
  const {
    ata: coldTreasuryAta,
    ix: createColdATA,
  }: AtaIx | { ata: null; ix: null } = needCold
    ? await maybeCreateAtaIx(connection, userPk, coldPk, mintPk)
    : { ata: null, ix: null };

  // --- Jupiter instructions ---
  const swapIns = await jupiter.swapInstructionsPost({
    swapRequest: {
      quoteResponse, // ExactIn, fee taken in INPUT mint
      userPublicKey: userPk.toBase58(),
      feeAccount: intermediateFeeAta.toBase58(),
      dynamicSlippage,
      dynamicComputeUnitLimit,
    },
  });

  // --- decode ---
  const computeBudgetIxs = (swapIns.computeBudgetInstructions || []).map(toIx);
  const setupIxs = (swapIns.setupInstructions || []).map(toIx);
  const swapIx = toIx(swapIns.swapInstruction);
  const cleanupIxs = swapIns.cleanupInstruction
    ? [toIx(swapIns.cleanupInstruction)]
    : [];

  // --- our post-swap transfers ---
  const { decimals } = await getMint(connection, mintPk);
  const ourIxs: TransactionInstruction[] = [];

  if (refEnabled) {
    if (!referrerAta) {
      throw new Error("Expected referrer ATA to be defined");
    }
    if (createRefATA) ourIxs.push(createRefATA);
    ourIxs.push(
      createTransferCheckedInstruction(
        intermediateFeeAta,
        mintPk,
        referrerAta,
        feeOwnerPk,
        BigInt(refAtomsBN.toString()),
        decimals
      )
    );
  }

  if (needCold) {
    if (!coldTreasuryAta) {
      throw new Error("Expected cold treasury ATA to be defined");
    }
    if (createColdATA) ourIxs.push(createColdATA);
    ourIxs.push(
      createTransferCheckedInstruction(
        intermediateFeeAta,
        mintPk,
        coldTreasuryAta,
        feeOwnerPk,
        BigInt(sweepAtomsBN.toString()),
        decimals
      )
    );
  }

  // --- compose order ---
  const preSwap = [
    ...computeBudgetIxs,
    ...setupIxs,
    ...(createIntermediateATA ? [createIntermediateATA] : []),
  ];
  const postSwap = [...ourIxs, ...cleanupIxs];
  const allIxs = [...preSwap, swapIx, ...postSwap];

  // --- ALTs ---
  const altKeys = swapIns.addressLookupTableAddresses || [];
  const alts: AddressLookupTableAccount[] = await loadALTs(connection, altKeys);

  // --- compile v0 ---
  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash();
  const msgV0 = new TransactionMessage({
    payerKey: userPk,
    recentBlockhash: blockhash,
    instructions: allIxs,
  }).compileToV0Message(alts);

  const tx = new VersionedTransaction(msgV0);

  // --- partial sign as fee ATA authority ---
  const serverSigner = Keypair.fromSecretKey(intermediateFeeOwnerSecretKey);
  if (!serverSigner.publicKey.equals(feeOwnerPk)) {
    throw new Error(
      "intermediateFeeOwnerSecretKey does not match intermediateFeeOwner"
    );
  }

  tx.sign([serverSigner]);

  // --- return for user to co-sign & send ---
  const txBase64 = Buffer.from(tx.serialize()).toString("base64");
  return { txBase64, lastValidBlockHeight, swapIns };
}
