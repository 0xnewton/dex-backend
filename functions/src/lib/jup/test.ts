/** npx ts-node ./src/lib/jup/test.ts */

import { createSolanaWallet } from "../crypto";

fetch(
  "https://lite-api.jup.ag/swap/v1/quote?inputMint=So11111111111111111111111111111111111111112&outputMint=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v&amount=100000000&slippageBps=50&restrictIntermediateTokens=true"
)
  .then((res) => res.json())
  .then((res) => {console.log(JSON.stringify(res, null, 2))
    return res;
  })
  .then((res) => {
    const dummyWallet = createSolanaWallet()
    return fetch('https://lite-api.jup.ag/swap/v1/swap-instructions', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json'
    },
    body: JSON.stringify({
        quoteResponse: res,
        userPublicKey: dummyWallet.publicKey,
    })
    })
  }).then((res) => res.json()).then((res) => {
    console.log(JSON.stringify(res, null, 2));
    return res;
  });
