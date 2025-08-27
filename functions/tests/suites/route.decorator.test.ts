import { ZodError } from "zod";
import { type IRouteMeta } from "../../src/lib/backend-framework/base-controller";
import { makeRandomObject, makeRestApiContext } from "../factories/http";
import { makeRandomRoute, RandomRoute } from "../factories/route";
import { makeController, makeControllerWithMultipleRoutes, TestControllerBase } from "../factories/controller";
import { faker } from "@faker-js/faker";
import { fakeFromZod } from "../factories/zod";

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

      let err: any;
      try {
        await r.callback(ctx);
      } catch (e) {
        err = e;
      }
      expect(err).toBeInstanceOf(ZodError);
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

      let err: any;
      try {
        await r.callback(ctx);
      } catch (e) {
        err = e;
      }
      expect(err).toBeInstanceOf(ZodError);
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

      let err: any;
      try {
        await r.callback(ctx);
      } catch (e) {
        err = e;
      }
      expect(err).toBeInstanceOf(ZodError);
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

      let err: any;
      try {
        await r.callback(ctx);
      } catch (e) {
        err = e;
      }
      expect(err).toBeInstanceOf(ZodError);
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

      let err: any;
      try {
        await route.callback(ctx);
      } catch (e) {
        err = e;
      }
      expect(err).toBeInstanceOf(ZodError);
    });
  });

  describe("with a multiple routes", () => {
    let randomRoutes: RandomRoute<any>[];
    let controller: TestControllerBase;

    beforeEach(() => {
      randomRoutes = [
        makeRandomRoute(),
        makeRandomRoute(),
      ];
      controller = makeControllerWithMultipleRoutes(randomRoutes[0].def, randomRoutes[1].def);
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
});
