import type { Request, Response } from "express";
import type { RestApiContext } from "../../src/lib/backend-framework/rest-api-context";
import { faker } from "@faker-js/faker";

export function makeMockResponse(): Response {
  const res: Partial<Response> = {};
  let _status = 200;
  let _json: any;

  (res as any).status = (code: number) => {
    _status = code;
    return res as Response;
  };
  (res as any).json = (val: any) => {
    _json = val;
    return res as Response;
  };
  (res as any).send = (val: any) => {
    _json = val;
    return res as Response;
  };

  Object.defineProperties(res, {
    _status: { get: () => _status },
    _json: { get: () => _json },
  });

  return res as Response;
}

export function makeMockRequest(init?: {
  body?: any;
  params?: any;
  query?: any;
  headers?: Record<string, string>;
}): Request {
// normalize lookups to be case-insensitive
  const lookupHeader = (name: string) => {
    if (!init?.headers) return undefined;
    const keyLower = name.toLowerCase();
    // allow both lower/upper keys and arrays
    const val =
      (init?.headers as any)[name] ??
      (init?.headers as any)[keyLower];
    if (Array.isArray(val)) return val[0];
    return val;
  };

  const req: Partial<Request> = {
    body: init?.body,
    params: init?.params,
    query: init?.query,
    headers: init?.headers || {},
    header: lookupHeader,
  };
  return req as Request;
}

export function makeRestApiContext(init?: {
  body?: any;
  params?: any;
  query?: any;
  headers?: Record<string, string>;
}): RestApiContext {
  const req = makeMockRequest(init);
  const res = makeMockResponse();
  return { request: req as Request, response: res as Response };
}

export function makeRandomObject() {
  const keys = faker.helpers.uniqueArray(
    () => faker.helpers.slugify(faker.word.noun()).replace(/-/g, "_"),
    1 + faker.datatype.number({ min: 1, max: 5 })
  );
  const o: Record<string, any> = {};
  for (const k of keys) {
    o[k] = faker.datatype.boolean()
      ? faker.lorem.word()
      : faker.datatype.number({ min: 0, max: 1000 });
  }
  return o;
}
