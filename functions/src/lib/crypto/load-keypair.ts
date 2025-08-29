import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";

export function loadKeypair(secret: string): Keypair {
  secret = secret.trim();

  // 1) Try solana-keygen JSON array
  try {
    const arr = JSON.parse(secret);
    if (Array.isArray(arr) && arr.every((n) => Number.isInteger(n))) {
      const bytes = Uint8Array.from(arr);
      if (bytes.length === 64) return Keypair.fromSecretKey(bytes);
      if (bytes.length === 32) return Keypair.fromSeed(bytes);
    }
  } catch (_) {}

  // 2) Try base58
  try {
    const b58 = bs58.decode(secret);
    if (b58.length === 64) return Keypair.fromSecretKey(b58);
    if (b58.length === 32) return Keypair.fromSeed(b58);
  } catch (_) {}

  // 3) Try base64
  try {
    const b64 = Buffer.from(secret, "base64");
    if (b64.length === 64) return Keypair.fromSecretKey(new Uint8Array(b64));
    if (b64.length === 32) return Keypair.fromSeed(new Uint8Array(b64));
  } catch (_) {}

  // 4) Try hex
  if (/^(0x)?[0-9a-fA-F]+$/.test(secret)) {
    const hex = secret.startsWith("0x") ? secret.slice(2) : secret;
    const buf = Buffer.from(hex, "hex");
    if (buf.length === 64) return Keypair.fromSecretKey(new Uint8Array(buf));
    if (buf.length === 32) return Keypair.fromSeed(new Uint8Array(buf));
  }

  throw new Error(
    "Unrecognized key format or wrong length. Provide a 64-byte secret (priv+pub) or 32-byte seed in JSON/base58/base64/hex."
  );
}
