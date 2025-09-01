import {
  HttpMethod,
  RouteDefinition,
} from "../../../../../lib/backend-framework";
import { createReferralBodySchema } from "../request-schemas";

export const createReferralDef: RouteDefinition = {
  path: "",
  method: HttpMethod.POST,
  payloadSchema: createReferralBodySchema,
};
