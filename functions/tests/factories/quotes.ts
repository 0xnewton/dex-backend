import { faker } from "@faker-js/faker";
import { QuoteResponse } from "@jup-ag/api";

export const makeJupQuote = (overrides?: Partial<QuoteResponse>): QuoteResponse => {
  const quote: QuoteResponse = {
    inputMint: faker.random.alphaNumeric(44), // base58-like pubkey
    inAmount: faker.datatype.number({ min: 1_000, max: 1_000_000 }).toString(),
    outputMint: faker.random.alphaNumeric(44),
    outAmount: faker.datatype.number({ min: 1_000, max: 1_000_000 }).toString(),
    otherAmountThreshold: faker.datatype.number({ min: 900, max: 999_999 }).toString(),
    // swapMode: faker.helpers.arrayElement(["ExactIn", "ExactOut"]),
    swapMode: "ExactIn",
    slippageBps: faker.datatype.number({ min: 1, max: 500 }), // 0.01–5%
    platformFee: {
      amount: faker.datatype.number({ min: 1, max: 1000 }).toString(),
      feeBps: faker.datatype.number({ min: 1, max: 100 }),
    },
    priceImpactPct: faker.datatype.float({ min: 0, max: 0.5, precision: 0.0001 }).toFixed(4),
    routePlan: [
      {
        swapInfo: {
          ammKey: faker.random.alphaNumeric(44),
          label: "Saber",
          inputMint: faker.random.alphaNumeric(44),
          outputMint: faker.random.alphaNumeric(44),
          inAmount: faker.datatype.number({ min: 1_000, max: 1_000_000 }).toString(),
          outAmount: faker.datatype.number({ min: 1_000, max: 1_000_000 }).toString(),
          feeAmount: faker.datatype.number({ min: 1, max: 100 }).toString(),
          feeMint: faker.random.alphaNumeric(44),
        },
        percent: 100,
      },
    ],
    contextSlot: faker.datatype.number({ min: 1, max: 10_000 }),
    timeTaken: faker.datatype.number({ min: 1, max: 200 }),
  };

  return {
    ...quote,
    ...overrides,
  };
};
