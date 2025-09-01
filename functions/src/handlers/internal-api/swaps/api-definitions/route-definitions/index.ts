import {
  HttpMethod,
  RouteDefinition,
} from "../../../../../lib/backend-framework";
import { swapRateLimiter } from "../../middleware";
import {
  getQuoteBodySchema,
  quoteInstructionsBodySchema,
} from "../request-schemas";

export const getQuoteRouteDef: RouteDefinition = {
  path: "/quote",
  method: HttpMethod.POST,
  payloadSchema: getQuoteBodySchema,
  middleware: [swapRateLimiter],
};

export const swapTransactionsRouteDef: RouteDefinition = {
  path: "/instructions",
  method: HttpMethod.POST,
  payloadSchema: quoteInstructionsBodySchema,
  middleware: [swapRateLimiter],
};
