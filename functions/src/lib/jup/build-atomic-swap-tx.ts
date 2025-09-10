import BN from "bn.js";
import {
  PublicKey,
  AddressLookupTableAccount,
  TransactionInstruction,
  VersionedTransaction,
  TransactionMessage,
  Keypair,
} from "@solana/web3.js";
import { createTransferCheckedInstruction, getMint } from "@solana/spl-token";
import {
  AtaIx,
  BuildSwapInstructionsArgs,
  BuildSwapIntstructionsResult,
} from "./types";
import { MAX_BPS } from "../config/constants";
import { getJupiterClient } from "./client";
import { BadRequestError, ValidationError } from "../backend-framework/errors";
import { loadALTs, maybeCreateAtaIx, toIx } from "./utils";

/**
 * INPUT-mint fee path (Jupiter input-side platform fee):
 *  compute/setup
 *  → (create FeeVault INPUT-ATA if needed)
 *  → swap (feeAccount = FeeVault INPUT-ATA; Jupiter skims INPUT fee into fee vault)
 *  → (create Referrer/Cold INPUT-ATAs if needed)
 *  → transfer ref/cold (INPUT mint) from fee vault (server-signed)
 *  → cleanup
 */
export async function buildAtomicSwapTxWithFeeSplit(
  args: BuildSwapInstructionsArgs
): Promise<BuildSwapIntstructionsResult> {
  const {
    connection,
    quoteResponse,
    inputMint,
    inputAmountAtoms,
    userPublicKey,
    intermediateFeeOwner, // fee vault owner (authority)
    intermediateFeeOwnerSecretKey, // server signer for post-swap transfers
    referrer,
    coldTreasuryOwner,
    totalFeeBps,
    dynamicSlippage = true,
    dynamicComputeUnitLimit = true,
  } = args;

  // ---------- validations ----------
  if (quoteResponse.inputMint !== inputMint) {
    throw new ValidationError("inputMint mismatch");
  }
  if (quoteResponse.inAmount?.toString() !== String(inputAmountAtoms)) {
    throw new ValidationError("inAmount mismatch");
  }
  if (quoteResponse.swapMode !== "ExactIn") {
    throw new BadRequestError(
      "Only ExactIn supported for deterministic fee math"
    );
  }
  if (totalFeeBps < 0 || totalFeeBps > MAX_BPS) {
    throw new ValidationError("Total fee must be between 0 and 10,000 bps");
  }
  if (
    referrer &&
    (referrer.feeAmountBps < 0 || referrer.feeAmountBps > MAX_BPS)
  ) {
    throw new ValidationError("Referrer fee must be between 0 and 10,000 bps");
  }
  if (referrer && referrer.feeAmountBps > totalFeeBps) {
    throw new ValidationError("Referrer fee bps cannot exceed total fee bps");
  }

  const userPk = new PublicKey(userPublicKey);
  const feeOwnerPk = new PublicKey(intermediateFeeOwner);
  const coldPk = new PublicKey(coldTreasuryOwner);

  // ***** IMPORTANT: all fee ATAs & splits are in the INPUT mint *****
  const inputMintPk = new PublicKey(quoteResponse.inputMint);

  // ---------- Compute deterministic INPUT-side fee & splits ----------
  // // If Jupiter provided a platformFee.amount, validate it matches our deterministic math.
  // // (Remove this block if you don't want strict cross-checking.)
  // const quotedFeeStr = quoteResponse.platformFee?.amount ?? null;
  // if (quotedFeeStr && !expectedFeeInBN.eq(new BN(quotedFeeStr))) {
  //   throw new ValidationError(
  //     `platformFee.amount (${quotedFeeStr}) does not match expected input fee (${expectedFeeInBN.toString()})`
  //   );
  // }

  const inAmountBN = new BN(inputAmountAtoms);
  const totalBps = new BN(totalFeeBps);
  const refBps = new BN(referrer?.feeAmountBps ?? 0);

  // Total fee from volume
  const totalFeeAtoms = inAmountBN.mul(totalBps).div(new BN(10_000));
  if (totalFeeAtoms.lt(new BN(0))) {
    throw new BadRequestError("Computed fee is less than zero");
  }

  // Referrer gets refBps of volume
  const refInAtoms = inAmountBN.mul(refBps).div(new BN(10_000));
  // Treasury gets the remainder of the total fee
  const platformInAtoms = totalFeeAtoms.sub(refInAtoms);

  // ---------- ATAs in INPUT mint (payer = USER) ----------
  // Fee vault ATA (INPUT mint) used by Jupiter during swap to deposit the skimmed fee
  const { ata: feeVaultInputAta, ix: createFeeVaultATA } =
    await maybeCreateAtaIx(connection, userPk, feeOwnerPk, inputMintPk);

  if (!feeVaultInputAta) {
   throw new Error("Expected fee vault INPUT ATA to be defined");
  }

  // Optional: referrer & cold ATAs (INPUT mint) for post-swap splits
  const refEnabled = refInAtoms.gt(new BN(0)) && !!referrer;
  const refPk = refEnabled ? new PublicKey(referrer!.owner) : null;

  const {
    ata: referrerInputAta,
    ix: createRefATA,
  }: AtaIx | { ata: null; ix: null } =
    refEnabled && refPk
      ? await maybeCreateAtaIx(connection, userPk, refPk, inputMintPk)
      : { ata: null, ix: null };

  const needCold = platformInAtoms.gt(new BN(0));
  const {
    ata: coldInputAta,
    ix: createColdATA,
  }: AtaIx | { ata: null; ix: null } = needCold
    ? await maybeCreateAtaIx(connection, userPk, coldPk, inputMintPk)
    : { ata: null, ix: null };

  // ---------- Jupiter instructions (feeAccount = INPUT ATA) ----------
  const jupiter = getJupiterClient();
  const swapIns = await jupiter.swapInstructionsPost({
    swapRequest: {
      quoteResponse, // carries minOut/slippage; do not override here
      userPublicKey: userPk.toBase58(),
      feeAccount: feeVaultInputAta.toBase58(), // <-- INPUT-mint ATA for fee (Jupiter skims INPUT fee here)
      dynamicSlippage,
      dynamicComputeUnitLimit,
    },
  });

  // Decode Jup ixs
  const computeBudgetIxs = (swapIns.computeBudgetInstructions ?? []).map(toIx);
  const setupIxs = (swapIns.setupInstructions ?? []).map(toIx);
  const swapIx = toIx(swapIns.swapInstruction);
  const cleanupIxs = swapIns.cleanupInstruction
    ? [toIx(swapIns.cleanupInstruction)]
    : [];

  // ---------- Our post-swap INPUT-mint transfers (server-signed) ----------
  const inMintInfo = await getMint(connection, inputMintPk);
  const inDecimals = inMintInfo.decimals;

  const ourIxs: TransactionInstruction[] = [];

  if (refEnabled) {
    if (!referrerInputAta) {
      throw new Error("Expected referrer ATA to be defined");
    }
    if (createRefATA) ourIxs.push(createRefATA);
    ourIxs.push(
      createTransferCheckedInstruction(
        feeVaultInputAta, // source: fee vault INPUT ATA
        inputMintPk, // mint: INPUT
        referrerInputAta, // dest: referrer INPUT ATA
        feeOwnerPk, // authority: fee vault owner (server signer)
        BigInt(refInAtoms.toString()),
        inDecimals
      )
    );
  }

  if (needCold) {
    if (!coldInputAta) {
      throw new Error("Expected cold treasury ATA to be defined");
    }
    if (createColdATA) ourIxs.push(createColdATA);
    ourIxs.push(
      createTransferCheckedInstruction(
        feeVaultInputAta, // source: fee vault INPUT ATA
        inputMintPk, // mint: INPUT
        coldInputAta, // dest: cold INPUT ATA
        feeOwnerPk, // authority: fee vault owner (server signer)
        BigInt(platformInAtoms.toString()),
        inDecimals
      )
    );
  }

  // ---------- Compose order ----------
  const preSwap = [
    ...computeBudgetIxs,
    ...setupIxs,
    ...(createFeeVaultATA ? [createFeeVaultATA] : []), // ensure fee ATA exists before swap
  ];
  const postSwap = [...ourIxs, ...cleanupIxs];
  const allIxs = [...preSwap, swapIx, ...postSwap];

  // ---------- ALTs & compile v0 ----------
  const altKeys = swapIns.addressLookupTableAddresses ?? [];
  const alts: AddressLookupTableAccount[] = await loadALTs(connection, altKeys);

  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash("finalized");
  const msgV0 = new TransactionMessage({
    payerKey: userPk,
    recentBlockhash: blockhash,
    instructions: allIxs,
  }).compileToV0Message(alts);

  const tx = new VersionedTransaction(msgV0);

  // ---------- Partial sign with fee vault authority (for our INPUT transfers) ----------
  const serverSigner = Keypair.fromSecretKey(intermediateFeeOwnerSecretKey);
  if (!serverSigner.publicKey.equals(feeOwnerPk)) {
    throw new Error(
      "intermediateFeeOwnerSecretKey does not match intermediateFeeOwner"
    );
  }
  // Note: Jupiter's swap ix does not require your server signature. We sign only
  // to authorize our post-swap transfers out of feeVaultInputAta.
  if (ourIxs.length > 0) {
    tx.sign([serverSigner]);
  }

  const txBase64 = Buffer.from(tx.serialize()).toString("base64");
  return { txBase64, lastValidBlockHeight, swapIns };
}
