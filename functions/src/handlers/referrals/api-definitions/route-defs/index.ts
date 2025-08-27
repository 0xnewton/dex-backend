import { HttpMethod } from "../../../../lib/backend-framework";
import { PathParamsSchema, QueryParamsSchema } from "../request-schemas";

export const CreateReferralDef = {
  path: "",
  method: HttpMethod.POST,
  pathParamsSchema: PathParamsSchema,
  queryParamsSchema: QueryParamsSchema,
} as const;
