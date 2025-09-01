import { ExpressRequest } from "./types";

export enum HttpMethod {
  GET = "get",
  POST = "post",
  PUT = "put",
  DELETE = "delete",
  PATCH = "patch",
}

export enum StatusCodes {
  OK = 200,
  CREATED = 201,
  NO_CONTENT = 204,
  FOUND = 302,
  NOT_MODIFIED = 304,
  BAD_REQUEST = 400,
  UNAUTHORIZED = 401,
  FORBIDDEN = 403,
  NOT_FOUND = 404,
  CONFLICT = 409,
  UNPROCESSABLE_ENTITY = 422,
  INTERNAL_SERVER_ERROR = 500,
  TEMPORARILY_UNAVAILABLE = 503,
}

export const getHeader = (req: ExpressRequest, name: string): string => {
  const fromFn =
    (typeof req.header === "function" ? req.header(name) : undefined) ??
    (typeof req.get === "function" ? req.get(name) : undefined);

  const headers = req.headers ?? {};
  const key = Object.keys(headers).find((k) => k.toLowerCase() === name.toLowerCase());
  const fromObj = key ? headers[key] : undefined;

  const v = fromFn ?? fromObj ?? "";
  return Array.isArray(v) ? v[0] : v;
};
