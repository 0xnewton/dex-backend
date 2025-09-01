import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";

/**
 * Loads a Solana Keypair from either:
 *  - base58-encoded 64-byte secret key string (most wallets)
 *  - JSON string of a 64-length number[] (solana-keygen file content)
 *
 * Rejects anything 32 bytes to avoid seed/half-key ambiguity.
 */
export function loadKeypair(secret: string): Keypair {
  const s = secret.trim();

  // Try base58 (Phantom/exported “private key” strings)
  try {
    const bytes = bs58.decode(s);
    if (bytes.length === 64) {
      return Keypair.fromSecretKey(bytes);
    }
    if (bytes.length === 32) {
      throw new Error(
        "Got 32 bytes (likely a seed or truncated key). Expected a 64-byte secret key."
      );
    }
  } catch {
    /* not base58, continue */
  }

  // Try solana-keygen JSON array (the file content as a string)
  try {
    const arr = JSON.parse(s);
    if (
      Array.isArray(arr) &&
      arr.length === 64 &&
      arr.every((n) => Number.isInteger(n) && n >= 0 && n <= 255)
    ) {
      const bytes = Uint8Array.from(arr);
      return Keypair.fromSecretKey(bytes);
    }
  } catch {
    /* not JSON array */
  }

  throw new Error(
    "Unrecognized key format. Provide a base58-encoded 64-byte secret key (preferred) " +
      "or a JSON array of 64 numbers from solana-keygen."
  );
}
