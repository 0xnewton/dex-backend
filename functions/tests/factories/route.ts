import { faker } from '@faker-js/faker';
import { z } from 'zod';
import { HttpMethod } from '../../src/lib/backend-framework/http';
import type { RouteDefinition } from '../../src/lib/backend-framework/route-definition';
import { fakeFromZod, randomZodObject } from './zod';

export type RandomRoute<T extends RouteDefinition> = {
  def: T;
  concretePath: string;             // e.g. "/foo/123-abc"
  params?: Record<string, any>;
  query?: Record<string, any>;
  payload?: Record<string, any>;
};

const METHODS = [
  HttpMethod.GET,
  HttpMethod.POST,
  HttpMethod.PUT,
  HttpMethod.PATCH,
  HttpMethod.DELETE,
] as const;


export function randomPathFromKeys(keys: string[]): string {
  const base = '/' + faker.helpers.slugify(faker.word.noun());
  const segments = keys.map(k => `:${k}`);
  return [base, ...segments].join('/');
}

/**
 * Build a random RouteDefinition and matching fake values (path/query/payload).
 * You can pass partial schemas to control fields; otherwise they'll be random.
 */
export function makeRandomRoute(opts?: {
  withPayload?: boolean;
  withQuery?: boolean;
  withPathParams?: boolean;
  payloadSchema?: z.ZodObject<any>;
  querySchema?: z.ZodObject<any>;
  pathSchema?: z.ZodObject<any>;
}): RandomRoute<any> {
  const withPayload = opts?.withPayload ?? faker.datatype.boolean();
  const withQuery = opts?.withQuery ?? faker.datatype.boolean();
  const withPath = opts?.withPathParams ?? true; // default true to exercise params

  const payloadSchema = withPayload ? (opts?.payloadSchema ?? randomZodObject()) : undefined;
  const queryParamsSchema = withQuery ? (opts?.querySchema ?? randomZodObject()) : undefined;

  // Path params schema decides :segments in path
  const pathParamsSchema = withPath ? (opts?.pathSchema ?? randomZodObject()) : undefined;
  const pathParamKeys = pathParamsSchema ? Object.keys(pathParamsSchema.shape) : [];
  const path = pathParamsSchema ? randomPathFromKeys(pathParamKeys) : '/' + faker.word.noun();

  const def = {
    path,
    method: faker.helpers.arrayElement(METHODS),
    payloadSchema,
    pathParamsSchema,
    queryParamsSchema,
  } as const;

  // Generate matching values
  const params = pathParamsSchema ? fakeFromZod(pathParamsSchema) : undefined;
  const query = queryParamsSchema ? fakeFromZod(queryParamsSchema) : undefined;
  const payload = payloadSchema ? fakeFromZod(payloadSchema) : undefined;

  // Inject params into concrete path
  const concretePath = params
    ? def.path.replace(/:([A-Za-z0-9_]+)/g, (_m, key) => encodeURIComponent(String((params as any)[key])))
    : def.path;

  return { def, concretePath, params, query, payload };
}
