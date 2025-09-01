import {
  Connection,
  PublicKey,
  AddressLookupTableAccount,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
} from "@solana/spl-token";
import { AtaIx } from "./types";

/** Small helper to decode a Jupiter instruction object into web3 Instruction */
export const toIx = (i: {
  programId: string;
  accounts: any[];
  data: string;
}): TransactionInstruction => {
  return new TransactionInstruction({
    programId: new PublicKey(i.programId),
    keys: i.accounts.map((a) => ({
      pubkey: new PublicKey(a.pubkey),
      isSigner: a.isSigner,
      isWritable: a.isWritable,
    })),
    data: Buffer.from(i.data, "base64"),
  });
};

export const loadALTs = async (
  connection: Connection,
  keys: string[] | undefined
): Promise<AddressLookupTableAccount[]> => {
  if (!keys?.length) return [];
  const lookups = await Promise.all(
    keys.map((k) => connection.getAddressLookupTable(new PublicKey(k)))
  );
  return lookups.flatMap((r) => (r.value ? [r.value] : []));
};

export const maybeCreateAtaIx = async (
  connection: Connection,
  payer: PublicKey,
  owner: PublicKey,
  mint: PublicKey
): Promise<AtaIx> => {
  const ata = await getAssociatedTokenAddress(mint, owner, true);
  const info = await connection.getAccountInfo(ata);
  const ix = info
    ? null
    : createAssociatedTokenAccountInstruction(payer, ata, owner, mint);
  return { ata, ix };
};
