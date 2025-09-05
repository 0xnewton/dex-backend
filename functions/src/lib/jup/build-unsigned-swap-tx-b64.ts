import type { SwapInstructionsResponse } from "@jup-ag/api";
import {
  PublicKey,
  TransactionInstruction,
  AddressLookupTableAccount,
  VersionedTransaction,
  TransactionMessage,
  Connection,
  Transaction,
} from "@solana/web3.js";

type JupAccountMeta = {
  pubkey: string;
  isSigner: boolean;
  isWritable: boolean;
};
type JupIx = { programId: string; accounts: JupAccountMeta[]; data: string };

const toWeb3Ix = (ix: JupIx): TransactionInstruction => {
  return new TransactionInstruction({
    programId: new PublicKey(ix.programId),
    keys: ix.accounts.map((a) => ({
      pubkey: new PublicKey(a.pubkey),
      isSigner: a.isSigner,
      isWritable: a.isWritable,
    })),
    data: Buffer.from(ix.data, "base64"),
  });
};

async function fetchALTs(
  connection: Connection,
  addrs: string[]
): Promise<AddressLookupTableAccount[]> {
  if (!addrs.length) return [];

  const pubkeys = addrs.map((a) => new PublicKey(a));
  const accounts = await connection.getMultipleAccountsInfo(pubkeys);

  return accounts
    .map((acc, i) => {
      if (!acc) return null;
      try {
        return new AddressLookupTableAccount({
          key: pubkeys[i],
          state: AddressLookupTableAccount.deserialize(acc.data),
        });
      } catch {
        return null;
      }
    })
    .filter((x): x is AddressLookupTableAccount => !!x);
}

export const buildUnsignedSwapTxBase64 = async (
  instructions: SwapInstructionsResponse,
  userPublicKey: string,
  connection: Connection
): Promise<string> => {
  const payer = new PublicKey(userPublicKey);

  // 1) Convert all instructions
  const ixs: TransactionInstruction[] = [
    ...instructions.computeBudgetInstructions.map(toWeb3Ix),
    ...(instructions.otherInstructions?.map(toWeb3Ix) ?? []), // e.g., Jito tips, extra setup
    ...instructions.setupInstructions.map(toWeb3Ix),
    toWeb3Ix(instructions.swapInstruction),
    ...(instructions.cleanupInstruction
      ? [toWeb3Ix(instructions.cleanupInstruction)]
      : []),
  ];

  // 2) Recent blockhash
  const { blockhash } =
    await connection.getLatestBlockhash("finalized");

  // 3) If there are ALTs → build v0; else legacy
  if (instructions.addressLookupTableAddresses?.length) {
    const alts = await fetchALTs(
      connection,
      instructions.addressLookupTableAddresses
    );

    const msg = new TransactionMessage({
      payerKey: payer,
      recentBlockhash: blockhash,
      instructions: ixs,
    }).compileToV0Message(alts);

    const vtx = new VersionedTransaction(msg);
    // DO NOT sign here (user signs in wallet); serialize unsigned
    const bytes = vtx.serialize();
    return Buffer.from(bytes).toString("base64");
  } else {
    const tx = new Transaction({
      feePayer: payer,
      recentBlockhash: blockhash,
      // lastValidBlockHeight is for confirmations; not required on legacy tx object
    });
    tx.add(...ixs);
    const bytes = tx.serialize({
      requireAllSignatures: false,
      verifySignatures: false,
    });
    return Buffer.from(bytes).toString("base64");
  }
};
