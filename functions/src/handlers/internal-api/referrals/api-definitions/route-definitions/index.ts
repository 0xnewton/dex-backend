import {
  HttpMethod,
  RouteDefinition,
} from "../../../../../lib/backend-framework";
import { createReferralBodySchema } from "../request-schemas";

export const createReferralDef = {
  path: "",
  method: HttpMethod.POST,
  payloadSchema: createReferralBodySchema,
} satisfies RouteDefinition<typeof createReferralBodySchema>;
