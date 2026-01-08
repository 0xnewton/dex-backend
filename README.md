# dex-backend

Backend for a Solana DEX aggregator that supports referral links for liquidity
pools and fee sharing. It integrates with Jupiter (JUP) for quotes and swap
instructions, manages referral records in Firestore, and uses Firebase Cloud
Functions for API and event triggers.

## Features

- Referral creation with configurable fee splits.
- Swap quote storage and swap-instruction generation via Jupiter.
- Solana RPC proxy with rate limiting.
- Firebase Auth trigger to provision user wallets and metadata.

## Architecture

- Firebase Cloud Functions
  - `internalApi` (Express) for referral + swap endpoints.
  - `rpc` (Express) for Solana JSON-RPC proxy.
  - `onUserCreated` for Firebase Auth user provisioning.
- Firestore for users, referrals, and quote snapshots.
- Google Secret Manager for wallet private keys and service secrets.

## API Overview

Base URL: the deployed function URL for `internalApi`.

- `POST /referrals`
  - Auth required (Firebase ID token in `Authorization: Bearer ...`).
  - Body: `slug?`, `description?`, `isActive?`, `feeAmountBps`.
- `POST /swaps/quote` (deprecated; clients now generate quotes)
  - Body: `referralSlug?`, `userPublicKey?`, `inputMint`, `outputMint`,
    `amount`, `slippageBps`, `dynamicSlippage`.
- `POST /swaps/instructions`
  - Body: `userPublicKey`, `inputMint`, `outputMint`, `amount`,
    `slippageBps`, `dynamicSlippage`, `referralSlug?`.

RPC Proxy:

- `POST /rpc/solana` on the `rpc` function.
  - Forwards JSON-RPC payloads to the configured upstream RPC URL.

## Configuration

Firebase secrets and variables are required:

Secrets (Firebase Functions params):
- `SOLANA_RPC_URL`
- `JUP_API_KEY`
- `FEE_VAULT_PRIVATE_KEY`

Runtime variables:
- `INTERMEDIATE_FEE_VAULT_PUBLIC_KEY`
- `PLATFORM_TREASURY_PUBLIC_KEY`

Fee constants:
- Platform fee default is `100` bps (`PLATFORM_FEE_BPS`).
- Total fee max is `10,000` bps (`MAX_BPS`).

## Local Development

From the repo root:

```bash
cd functions
npm install
npm run build
firebase emulators:start --only functions
```

Or run:

```bash
cd functions
npm run serve
```

## Tests

```bash
cd functions
npm test
```

## Project Setup Notes

See `docs/SETUP.md` for the initial Firebase setup checklist.
