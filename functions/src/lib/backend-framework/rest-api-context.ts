import { UserDB } from "../db/users/types";
import {
  PathParamsType,
  PayloadType,
  QueryParamsType,
  RouteDefinition,
} from "./route-definition";
import { ExpressRequest, ExpressResponse } from "./types";

interface BaseRestApiContext {
  request: ExpressRequest;
  response: ExpressResponse;
}

export interface RestApiContext extends BaseRestApiContext {
  claims?: Claims;
  token?: string;
}

export interface Claims {
  user: UserDB;
}

export type RestApiContextWith<T extends RouteDefinition> = Omit<
  RestApiContext,
  "claims" | "payload" | "pathParams" | "queryParams"
> &
  (PayloadType<T> extends never ? {} : { payload: PayloadType<T> }) &
  (PathParamsType<T> extends never ? {} : { pathParams: PathParamsType<T> }) &
  (QueryParamsType<T> extends never
    ? {}
    : { queryParams: QueryParamsType<T> }) & { claims?: Claims };
