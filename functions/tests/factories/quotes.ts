import { faker } from "@faker-js/faker";
import { QuoteResponse } from "@jup-ag/api";
import { GetAndStoreQuotePayload } from "../../src/services/swap/get-and-store-quote";
import { QuoteDB } from "../../src/lib/db/quotes";
import { Timestamp } from "firebase-admin/firestore";

export const makeJupQuote = (
  overrides?: Partial<QuoteResponse>
): QuoteResponse => {
  const quote: QuoteResponse = {
    inputMint: faker.random.alphaNumeric(44), // base58-like pubkey
    inAmount: faker.datatype.number({ min: 1_000, max: 1_000_000 }).toString(),
    outputMint: faker.random.alphaNumeric(44),
    outAmount: faker.datatype.number({ min: 1_000, max: 1_000_000 }).toString(),
    otherAmountThreshold: faker.datatype
      .number({ min: 900, max: 999_999 })
      .toString(),
    // swapMode: faker.helpers.arrayElement(["ExactIn", "ExactOut"]),
    swapMode: "ExactIn",
    slippageBps: faker.datatype.number({ min: 1, max: 500 }), // 0.01–5%
    platformFee: {
      amount: faker.datatype.number({ min: 1, max: 1000 }).toString(),
      feeBps: faker.datatype.number({ min: 1, max: 100 }),
    },
    priceImpactPct: faker.datatype
      .float({ min: 0, max: 0.5, precision: 0.0001 })
      .toFixed(4),
    routePlan: [
      {
        swapInfo: {
          ammKey: faker.random.alphaNumeric(44),
          label: "Saber",
          inputMint: faker.random.alphaNumeric(44),
          outputMint: faker.random.alphaNumeric(44),
          inAmount: faker.datatype
            .number({ min: 1_000, max: 1_000_000 })
            .toString(),
          outAmount: faker.datatype
            .number({ min: 1_000, max: 1_000_000 })
            .toString(),
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

export const makeGetAndStoreQuotePayload = (
  overrides?: Partial<GetAndStoreQuotePayload>
): GetAndStoreQuotePayload => {
  const payload: GetAndStoreQuotePayload = {
    referralSlug: faker.datatype.boolean() ? faker.lorem.word() : undefined,
    userPublicKey: faker.random.alphaNumeric(44),
    inputMint: faker.random.alphaNumeric(44),
    outputMint: faker.random.alphaNumeric(44),
    amount: faker.datatype.number({ min: 1_000, max: 1_000_000 }),
    slippageBps: faker.datatype.number({ min: 1, max: 500 }),
    dynamicSlippage: faker.datatype.boolean(),
  };
  return {
    ...payload,
    ...overrides,
  };
};

export const makeQuote = (overrides?: Partial<QuoteDB>): QuoteDB => {
  const hasReferral = faker.datatype.boolean();
  const platformFeeBps = faker.datatype.number({ min: 1, max: 100 });
  const referrerFeeBps = hasReferral ? faker.datatype.number({ min: 1, max: 100 }) : 0;
  const totalFeeBps = platformFeeBps + referrerFeeBps;
  const baseQuote: Omit<QuoteDB, "quote"> = {
    id: faker.datatype.uuid(),
    timestamp: Timestamp.fromDate(faker.date.recent()),
    expiresAt: Timestamp.fromDate(faker.date.soon(1)),
    userPublicKey: faker.random.alphaNumeric(44),
    platformFeeBps,
    referrerFeeBps,
    totalFeeBps,
    referralId: hasReferral ? faker.datatype.uuid() : null,
    referralSlug: hasReferral ? faker.lorem.word() : null,
    referralUserId: hasReferral ? faker.datatype.uuid() : null,
    swapMode: "ExactIn",
    dynamicSlippage: faker.datatype.boolean(),
    inputMint: faker.random.alphaNumeric(44),
    outputMint: faker.random.alphaNumeric(44),
    amount: faker.datatype.number({ min: 1_000, max: 1_000_000 }).toString(),
    slippageBps: faker.datatype.number({ min: 1, max: 500 }),
  };

  const quote = makeJupQuote({
    inAmount: baseQuote.amount,
    outAmount: faker.datatype.number({ min: 1_000, max: 1_000_000 }).toString(),
    inputMint: baseQuote.inputMint,
    outputMint: baseQuote.outputMint,
    slippageBps: baseQuote.slippageBps,
    swapMode: baseQuote.swapMode,
  });

  return {
    ...baseQuote,
    quote,
    ...overrides,
  };
};
