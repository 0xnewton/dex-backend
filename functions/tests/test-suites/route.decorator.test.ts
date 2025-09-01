import express from "express";
import request from "supertest";
import { ZodError } from "zod";
import { type IRouteMeta } from "../../src/lib/backend-framework/base-controller";
import { makeRandomObject, makeRestApiContext } from "../factories/http";
import { makeRandomRoute, RandomRoute } from "../factories/route";
import {
  makeController,
  makeControllerWithMultipleRoutes,
  TestControllerBase,
} from "../factories/controller";
import { faker } from "@faker-js/faker";
import { fakeFromZod } from "../factories/zod";
import { BaseApiError } from "../../src/lib/backend-framework";

describe("Route decorator", () => {
  describe("with all combinations of path/payload/query", () => {
    let randomRoute: RandomRoute<any>;
    let controller: TestControllerBase;

    beforeEach(() => {
      randomRoute = makeRandomRoute({
        withPathParams: true,
        withPayload: true,
        withQuery: true,
      });
      controller = makeController(randomRoute.def);
    });

    it("registers metadata and parses/flattens ctx (all schemas)", async () => {
      expect(controller.routes).toHaveLength(1);
      const r: IRouteMeta = controller.routes[0];
      expect(r.method).toBe(randomRoute.def.method);
      expect(r.path).toBe(randomRoute.def.path);
      expect(r.methodName).toBe("handler");
      expect(typeof r.callback).toBe("function");

      const payload = fakeFromZod(randomRoute.def.payloadSchema);
      const params = fakeFromZod(randomRoute.def.pathParamsSchema);
      const query = fakeFromZod(randomRoute.def.queryParamsSchema);

      const ctx = makeRestApiContext({
        params,
        query,
        body: payload,
      });
      const res = await r.callback(ctx);
      expect((res as any)._status).toBe(200);
      expect((res as any)._json).toEqual({
        ok: true,
      });

      const seen = controller.seen!;
      for (const k of Object.keys(randomRoute.def.pathParamsSchema.shape)) {
        expect(seen.pathParams[k]).toBe(params[k]);
      }
      for (const k of Object.keys(randomRoute.def.queryParamsSchema.shape)) {
        expect(seen.queryParams[k]).toBe(query[k]);
      }
      for (const k of Object.keys(randomRoute.def.payloadSchema.shape)) {
        expect(seen.payload[k]).toBe(payload[k]);
      }
    });

    it("throws a ZodError for invalid inputs", async () => {
      const r: IRouteMeta = controller.routes[0];

      // Build bad ctx by omitting params/query/payload
      const ctx = makeRestApiContext({
        params: makeRandomObject(),
        query: makeRandomObject(),
        body: makeRandomObject(),
      });

      await expect(r.callback(ctx)).rejects.toBeInstanceOf(ZodError);
    });
  });

  describe("with only path params", () => {
    let randomRoute: RandomRoute<any>;
    let controller: TestControllerBase;

    beforeEach(() => {
      randomRoute = makeRandomRoute({
        withPathParams: true,
        withPayload: false,
        withQuery: false,
      });
      controller = makeController(randomRoute.def);
    });

    it("omits keys when schema isn't provided (path-only)", async () => {
      const r = controller.routes[0];
      const params = fakeFromZod(randomRoute.def.pathParamsSchema);

      await r.callback(makeRestApiContext({ params }));
      const seen = controller.seen!;
      expect(seen.pathParams).toBeDefined();
      expect("queryParams" in seen).toBe(false);
      expect("payload" in seen).toBe(false);
    });

    it("throws a ZodError for invalid inputs", async () => {
      const r: IRouteMeta = controller.routes[0];

      // Build bad ctx by omitting params
      const ctx = makeRestApiContext({
        params: makeRandomObject(),
      });

      await expect(r.callback(ctx)).rejects.toBeInstanceOf(ZodError);
    });
  });

  describe("with only query params", () => {
    let randomRoute: RandomRoute<any>;
    let controller: TestControllerBase;

    beforeEach(() => {
      randomRoute = makeRandomRoute({
        withPathParams: false,
        withPayload: false,
        withQuery: true,
      });
      controller = makeController(randomRoute.def);
    });

    it("omits keys when schema isn't provided (query-only)", async () => {
      const r = controller.routes[0];
      const query = fakeFromZod(randomRoute.def.queryParamsSchema);

      await r.callback(makeRestApiContext({ query }));
      const seen = controller.seen!;
      expect(seen.queryParams).toBeDefined();
      expect("pathParams" in seen).toBe(false);
      expect("payload" in seen).toBe(false);
    });

    it("throws a ZodError for invalid inputs", async () => {
      const r: IRouteMeta = controller.routes[0];

      // Build bad ctx by omitting query
      const ctx = makeRestApiContext({
        query: makeRandomObject(),
      });

      await expect(r.callback(ctx)).rejects.toBeInstanceOf(ZodError);
    });
  });

  describe("with only payload", () => {
    let randomRoute: RandomRoute<any>;
    let controller: TestControllerBase;

    beforeEach(() => {
      randomRoute = makeRandomRoute({
        withPathParams: false,
        withPayload: true,
        withQuery: false,
      });
      controller = makeController(randomRoute.def);
    });

    it("omits keys when schema isn't provided (payload-only)", async () => {
      const r = controller.routes[0];
      const payload = fakeFromZod(randomRoute.def.payloadSchema);

      await r.callback(makeRestApiContext({ body: payload }));
      const seen = controller.seen!;
      expect(seen.payload).toBeDefined();
      expect("pathParams" in seen).toBe(false);
      expect("queryParams" in seen).toBe(false);
    });

    it("throws a ZodError for invalid inputs", async () => {
      const r: IRouteMeta = controller.routes[0];

      // Build bad ctx by omitting payload
      const ctx = makeRestApiContext({
        body: makeRandomObject(),
      });

      await expect(r.callback(ctx)).rejects.toBeInstanceOf(ZodError);
    });
  });

  describe("with a randomized route definition", () => {
    let randomRoute: RandomRoute<any>;
    let controller: TestControllerBase;

    beforeEach(() => {
      const bools = [
        faker.datatype.boolean(),
        faker.datatype.boolean(),
        faker.datatype.boolean(),
      ];
      if (bools.every((b) => !b)) {
        // Ensure at least one schema to validate
        bools[faker.datatype.number({ min: 0, max: 2 })] = true;
      }
      randomRoute = makeRandomRoute({
        withPathParams: bools[0],
        withPayload: bools[1],
        withQuery: bools[2],
      });
      controller = makeController(randomRoute.def);
    });

    it("registers metadata and parses/ flattens ctx", async () => {
      expect(controller.routes).toHaveLength(1);
      const route: IRouteMeta = controller.routes[0];
      expect(typeof route.callback).toBe("function");
      expect(route.path).toBe(randomRoute.def.path);
      expect(route.method).toBe(randomRoute.def.method);

      const ctx = makeRestApiContext({
        params: randomRoute.params,
        query: randomRoute.query,
        body: randomRoute.payload,
      });

      const res = await route.callback(ctx);
      expect((res as any)._status).toBe(200);
      expect((res as any)._json).toEqual({ ok: true });

      const seen = controller.seen!;
      if (randomRoute.def.pathParamsSchema)
        expect(seen.pathParams).toBeDefined();
      if (randomRoute.def.queryParamsSchema)
        expect(seen.queryParams).toBeDefined();
      if (randomRoute.def.payloadSchema) expect(seen.payload).toBeDefined();
    });

    it("throws a ZodError for invalid inputs", async () => {
      const route: IRouteMeta = controller.routes[0];

      // Build bad ctx by omitting any params/query/payload that are expected
      const ctx = makeRestApiContext({
        params: randomRoute.def.pathParamsSchema
          ? makeRandomObject()
          : undefined,
        query: randomRoute.def.queryParamsSchema
          ? makeRandomObject()
          : undefined,
        body: randomRoute.def.payloadSchema ? makeRandomObject() : undefined,
      });

      await expect(route.callback(ctx)).rejects.toBeInstanceOf(ZodError);
    });
  });

  describe("with a multiple routes", () => {
    let randomRoutes: RandomRoute<any>[];
    let controller: TestControllerBase;

    beforeEach(() => {
      randomRoutes = [makeRandomRoute(), makeRandomRoute()];
      controller = makeControllerWithMultipleRoutes(
        randomRoutes[0].def,
        randomRoutes[1].def
      );
    });

    it("registers metadata for both routes", () => {
      expect(controller.routes).toHaveLength(2);
      const r1: IRouteMeta = controller.routes[0];
      expect(r1.method).toBe(randomRoutes[0].def.method);
      expect(r1.path).toBe(randomRoutes[0].def.path);
      expect(r1.methodName).toBe("handler1");
      expect(typeof r1.callback).toBe("function");

      const r2: IRouteMeta = controller.routes[1];
      expect(r2.method).toBe(randomRoutes[1].def.method);
      expect(r2.path).toBe(randomRoutes[1].def.path);
      expect(r2.methodName).toBe("handler2");
      expect(typeof r2.callback).toBe("function");
    });
  });

  describe("with middleware", () => {
    let mA: jest.Mock;
    let mB: jest.Mock;
    let mShortCircuit: jest.Mock;
    let mBoom: jest.Mock;
    let mApiError: jest.Mock;
    let order: string[];
    let hit: (
      app: any,
      basePath,
      def: RandomRoute<any>,
      body?: any
    ) => request.Test;

    beforeEach(() => {
      jest.clearAllMocks();
      order = [];
      mA = jest.fn((req, res, next) => {
        order.push("mA");
        next();
      });
      mB = jest.fn((req, res, next) => {
        order.push("mB");
        next();
      });
      mShortCircuit = jest.fn((req, res, _next) => {
        res.status(429).json({ error: "rate_limited" });
      });
      mBoom = jest.fn(() => {
        throw new Error("boom");
      });
      mApiError = jest.fn((req, res, next) => {
        throw new BaseApiError("ouch", 418);
      });
      hit = (
        app: express.Express,
        basePath: string,
        def: RandomRoute<any>,
        body?: any
      ) => {
        const method = def.def.method.toLowerCase();
        const url = `${basePath}${def.def.path}`;
        const agent = request(app);
        const req = agent[method](url);
        if (!["get", "head", "delete"].includes(method)) req.send(body ?? {});
        return req;
      };
    });

    it("preserves middleware metadata from the route definition", () => {
      const def = makeRandomRoute();
      const routeDef = { ...def.def, middleware: [mA, mB] };

      const controller = makeController(routeDef);
      const basePath = controller.basePath;

      expect(controller.routes).toHaveLength(1);
      const r: IRouteMeta = controller.routes[0];

      expect(Array.isArray(r.middleware)).toBe(true);
      expect(r.middleware?.length).toBe(2);
      expect(r.middleware![0]).toBe(mA);
      expect(r.middleware![1]).toBe(mB);
    });

    it("executes middleware in order before the handler (integration with Express)", async () => {
      const def = makeRandomRoute({
        withPathParams: false,
        withPayload: false,
        withQuery: false,
      });
      const routeDefs = { ...def.def, middleware: [mA, mB] };
      const controller = makeController(routeDefs);

      // The handler in TestControllerBase typically sets { ok: true } and records "seen".
      // We'll verify order by reading a value the handler returns OR by side effect.
      const app = express();
      app.use(controller.basePath, controller.register());
      const basePath = controller.basePath;

      const res = await hit(app, basePath, def);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true });

      // Our middleware pushed into `order` before handler ran
      expect(order).toEqual(["mA", "mB"]);
    });

    it("short-circuits when a middleware sends the response", async () => {
      const def = makeRandomRoute({
        withPathParams: false,
        withPayload: false,
        withQuery: false,
      });
      def.def.middleware = [mShortCircuit, mA]
      const controller = makeController(def.def);

      const app = express();
      app.use(express.json());
      app.use(controller.basePath, controller.register());

      const res = await hit(app, controller.basePath, def);

      expect(res.status).toBe(429);
      expect(res.body).toEqual({ error: "rate_limited" });
      // Ensure anything after the short-circuit did not run
      expect(order).toEqual([]);
      // And the handler wasn't called (no ctx flattening observed)
      expect(controller.seen).toBeUndefined();
    });

    it("propagates internal errors from middleware via next(err)", async () => {
      const def = makeRandomRoute({
        withPathParams: false,
        withPayload: false,
        withQuery: false,
      });
      def.def.middleware = [mBoom];
      const controller = makeController(def.def);

      const app = express();
      app.use(express.json());
      app.use(controller.basePath, controller.register());

      const res = await hit(app, controller.basePath, def)
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ message: "Unexpected error occurred" });
      // No handler run
      expect(controller.seen).toBeUndefined();
    });

    it("propagates api errors and maps the status via next(err)", async () => {
      const def = makeRandomRoute({
        withPathParams: false,
        withPayload: false,
        withQuery: false,
      });
      def.def.middleware = [mApiError];
      const controller = makeController(def.def);

      const app = express();
      app.use(express.json());
      app.use(controller.basePath, controller.register());

      const res = await hit(app, controller.basePath, def)
      expect(res.status).toBe(418);
      expect(res.body).toEqual({ message: "ouch" });
      // No handler run
      expect(controller.seen).toBeUndefined();
    });

    it("still allows calling the route.callback(ctx) directly (middleware-free path)", async () => {
      const def = makeRandomRoute({
        withPathParams: false,
        withPayload: false,
        withQuery: false,
      });
      const routeDefs = { ...def.def, middleware: [mA] };
      const controller = makeController(routeDefs);

      const r: IRouteMeta = controller.routes[0];
      // No schemas on purpose; direct ctx call should succeed and skip middleware
      const ctx = makeRestApiContext({ body: {} });
      const res = await r.callback(ctx);

      expect(res._status).toBe(200);
      expect(res._json).toEqual({ ok: true });
      // Since we didn't go through Express, middleware didn't run
      expect(order).toEqual([]);
    });
  });
});
