import { HttpMethod } from "./http";
import { z, ZodType } from "zod";
import { Claims } from "./rest-api-context";
import { RequestMiddleware } from "./base-controller";

type ZodTypeAny = ZodType<any, any>;

export type RouteDefinition<
  PayloadSchema extends ZodTypeAny = ZodTypeAny,
  PathParamsSchema extends ZodTypeAny = ZodTypeAny,
  QueryParamsSchema extends ZodTypeAny = ZodTypeAny,
> = {
  path: string;
  method: HttpMethod;
  payloadSchema?: PayloadSchema;
  pathParamsSchema?: PathParamsSchema;
  queryParamsSchema?: QueryParamsSchema;
  middleware?: RequestMiddleware[];
};

export type PathParamsType<T extends RouteDefinition> =
  T["pathParamsSchema"] extends ZodTypeAny
    ? z.infer<T["pathParamsSchema"]>
    : never;

export type QueryParamsType<T extends RouteDefinition> =
  T["queryParamsSchema"] extends ZodTypeAny
    ? z.infer<T["queryParamsSchema"]>
    : never;

export type PayloadType<T extends RouteDefinition> =
  T["payloadSchema"] extends ZodTypeAny ? z.infer<T["payloadSchema"]> : never;
export type AuthenticatedType<
  T extends RouteDefinition,
  ReturnType,
> = T extends {
  authenticated: boolean;
}
  ? ReturnType
  : never;

export type ArgsDefinition<T extends RouteDefinition> = {
  pathParams: PathParamsType<T>;
  queryParams: QueryParamsType<T>;
  payload: PayloadType<T>;
  token?: AuthenticatedType<T, string>;
  claims?: Claims;
};

export type Args<T extends RouteDefinition> = {
  [K in keyof ArgsDefinition<T> as ArgsDefinition<T>[K] extends never
    ? never
    : K]: ArgsDefinition<T>[K];
};

export type ArgsWithClaimsDefinition<C> = {
  claims?: C;
};
export type ArgsWithClaims<C> =
  ArgsWithClaimsDefinition<C> extends {
    claims?: never;
  }
    ? never
    : ArgsWithClaimsDefinition<C>;
