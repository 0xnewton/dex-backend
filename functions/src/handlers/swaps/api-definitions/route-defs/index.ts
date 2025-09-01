import { HttpMethod } from "../../../../lib/backend-framework";
import { getQuoteBodySchema, quoteInstructionsBodySchema } from "../request-schemas";

export const getQuoteRouteDef = {
  path: "/quote",
  method: HttpMethod.POST,
  payloadSchema: getQuoteBodySchema,
} as const;

export const swapTransactionsRouteDef = {
    path: "/instructions",
    method: HttpMethod.POST,
    payloadSchema: quoteInstructionsBodySchema,
} as const;