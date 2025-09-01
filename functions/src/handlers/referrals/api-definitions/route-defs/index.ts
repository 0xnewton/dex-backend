import { HttpMethod } from "../../../../lib/backend-framework";
import { createReferralBodySchema } from "../request-schemas";

export const createReferralDef = {
  path: "",
  method: HttpMethod.POST,
  payloadSchema: createReferralBodySchema,
} as const;
