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
import { DEFAULT_TOTAL_FEE_BPS } from "../config/constants";
import { getJupiterClient } from "./client";
import { BadRequestError, ValidationError } from "../backend-framework/errors";
import { loadALTs, maybeCreateAtaIx, toIx } from "./utils";

/**
 * OUTPUT-mint fee path:
 *  compute/setup → (create FeeVault OUTPUT-ATA if needed) → swap →
 *  (create Referrer/Coold OUTPUT-ATAs if needed) → transfer ref/cold (OUTPUT mint) → cleanup
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
    platformFeeBps,
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
  if (platformFeeBps !== DEFAULT_TOTAL_FEE_BPS) {
    throw new BadRequestError(
      `Unexpected platformFeeBps ${platformFeeBps}, must be ${DEFAULT_TOTAL_FEE_BPS}`
    );
  }
  if (quoteResponse.swapMode !== "ExactIn") {
    throw new BadRequestError(
      "Only ExactIn supported for deterministic fee math"
    );
  }

  // Jupiter's output-side fee: expect an amount in OUTPUT mint atoms
  const totalFeeOutAtoms = new BN(quoteResponse.platformFee?.amount ?? "0");
  if (totalFeeOutAtoms.isZero()) {
    throw new BadRequestError(
      "Quote has no platformFee.amount (output-mint fee)."
    );
  }

  if (
    referrer &&
    (referrer.shareBpsOfFee < 0 || referrer.shareBpsOfFee > 10_000)
  ) {
    throw new ValidationError("Referrer fee must be between 0 and 10,000 bps");
  }

  const userPk = new PublicKey(userPublicKey);
  const feeOwnerPk = new PublicKey(intermediateFeeOwner);
  const coldPk = new PublicKey(coldTreasuryOwner);

  // ***** IMPORTANT: all fee ATAs are in the OUTPUT mint *****
  const outputMintPk = new PublicKey(quoteResponse.outputMint);

  // Split the OUTPUT-mint fee for referrer/cold (in OUTPUT atoms)
  const refBps = new BN(referrer?.shareBpsOfFee ?? 0);
  const refOutAtoms = totalFeeOutAtoms.mul(refBps).div(new BN(10_000));
  const sweepOutAtoms = totalFeeOutAtoms.sub(refOutAtoms);

  // ---------- ATAs in OUTPUT mint (payer = USER) ----------
  // Fee vault ATA (OUTPUT mint) used by Jupiter during swap
  const { ata: feeVaultAta, ix: createFeeVaultATA } = await maybeCreateAtaIx(
    connection,
    userPk,
    feeOwnerPk,
    outputMintPk
  );

  // Optional: referrer & cold ATAs (OUTPUT mint) for post-swap splits
  const refEnabled = refOutAtoms.gt(new BN(0)) && !!referrer;
  const refPk = refEnabled ? new PublicKey(referrer!.owner) : null;

  const {
    ata: referrerAta,
    ix: createRefATA,
  }: AtaIx | { ata: null; ix: null } =
    refEnabled && refPk
      ? await maybeCreateAtaIx(connection, userPk, refPk, outputMintPk)
      : { ata: null, ix: null };

  const needCold = sweepOutAtoms.gt(new BN(0));
  const {
    ata: coldTreasuryAta,
    ix: createColdATA,
  }: AtaIx | { ata: null; ix: null } = needCold
    ? await maybeCreateAtaIx(connection, userPk, coldPk, outputMintPk)
    : { ata: null, ix: null };

  // ---------- Jupiter instructions (feeAccount = OUTPUT ATA) ----------
  const jupiter = getJupiterClient();
  const swapIns = await jupiter.swapInstructionsPost({
    swapRequest: {
      quoteResponse, // carries minOut/slippage; do not override here
      userPublicKey: userPk.toBase58(),
      feeAccount: feeVaultAta.toBase58(), // <-- OUTPUT-mint ATA for fee
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

  // ---------- Our post-swap OUTPUT-mint transfers ----------
  const outMintInfo = await getMint(connection, outputMintPk);
  const outDecimals = outMintInfo.decimals;

  const ourIxs: TransactionInstruction[] = [];

  if (refEnabled) {
    if (!referrerAta) throw new Error("Expected referrer ATA to be defined");
    if (createRefATA) ourIxs.push(createRefATA);
    ourIxs.push(
      createTransferCheckedInstruction(
        feeVaultAta, // source: fee vault OUTPUT ATA
        outputMintPk, // mint: OUTPUT
        referrerAta, // dest: referrer OUTPUT ATA
        feeOwnerPk, // authority: fee vault owner (server signer)
        BigInt(refOutAtoms.toString()),
        outDecimals
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
        feeVaultAta, // source: fee vault OUTPUT ATA
        outputMintPk, // mint: OUTPUT
        coldTreasuryAta, // dest: cold OUTPUT ATA
        feeOwnerPk, // authority: fee vault owner (server signer)
        BigInt(sweepOutAtoms.toString()),
        outDecimals
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

  // ---------- Partial sign with fee vault authority (for our OUTPUT transfers) ----------
  const serverSigner = Keypair.fromSecretKey(intermediateFeeOwnerSecretKey);
  if (!serverSigner.publicKey.equals(feeOwnerPk)) {
    throw new Error(
      "intermediateFeeOwnerSecretKey does not match intermediateFeeOwner"
    );
  }
  // Note: Jupiter's swap ix does not require your server signature. We sign only
  // to authorize our post-swap transfers out of feeVaultAta.
  if (ourIxs.length > 0) {
    tx.sign([serverSigner]);
  }

  const txBase64 = Buffer.from(tx.serialize()).toString("base64");
  return { txBase64, lastValidBlockHeight, swapIns };
}
