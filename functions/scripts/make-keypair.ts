/** 
 * npx ts-node ./scripts/make-keypair 
 */
import bs58 from "bs58";
import { Keypair } from "@solana/web3.js";

const keypair = Keypair.generate();

const secretKeyBytes = Uint8Array.from(keypair.secretKey); // 64 bytes (ed25519)
const secretKeyBase58 = bs58.encode(secretKeyBytes);

console.log(`Created keypair with public key: ${keypair.publicKey.toBase58()}`);
console.log(`Private key (base58): ${secretKeyBase58}`);

