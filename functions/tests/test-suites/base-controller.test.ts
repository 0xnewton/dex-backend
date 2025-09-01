import express from "express";
import request from "supertest";
import { ZodError } from "zod";
import {
  BaseController,
  IRouteMeta,
  BaseApiError,
} from "../../src/lib/backend-framework";
import { makeController, TestControllerBase } from "../factories/controller";
import { makeRandomRoute, RandomRoute } from "../factories/route";
import { faker } from "@faker-js/faker";

describe("BaseController.register()", () => {
  let controller: TestControllerBase & BaseController;
  let routeDefinition: RandomRoute<any>;
  let app: express.Express;
  let basePath: string;
  let routePath: string;
  let method: string;
  let hit: (headers?: Record<string, string>, body?: any) => request.Test;

  beforeEach(() => {
    routeDefinition = makeRandomRoute(); // provides def.method, def.path, etc.
    controller = makeController(routeDefinition.def) as any;

    // cache route info for convenience
    const meta = controller.routes[0] as IRouteMeta;
    basePath = controller.basePath;
    routePath = meta.path ?? "/";
    method = (meta.method ?? "get").toLowerCase();
    hit = (headers?: Record<string, string>, body?: any) => {
      const url = `${basePath}${routePath}`;
      const agent = request(app);
      const req = agent[method](url);
      if (headers)
        Object.entries(headers).forEach(([k, v]) => req.set(k, v as string));
      if (!["get", "head", "delete"].includes(method)) req.send(body ?? {});
      return req;
    };
  });

  it("wires method + path (default '/') and returns handler response", async () => {
    // replace callback to a deterministic handler
    controller.routes[0].callback = async (ctx: any) =>
      ctx.response.status(200).send({ ok: true });
    app = express();
    app.use(express.json());
    app.use(controller.basePath, controller.register());

    await hit().expect(200, { ok: true });
  });

  it("preserves middleware order", async () => {
    const order: string[] = [];
    const m1 = (_req: any, _res: any, next: any) => {
      order.push("m1");
      next();
    };
    const m2 = (_req: any, _res: any, next: any) => {
      order.push("m2");
      next();
    };

    controller.routes[0].middleware = [m1, m2];
    controller.routes[0].callback = async (ctx: any) => {
      order.push("handler");
      return ctx.response.status(200).send({ ok: true });
    };

    app = express();
    app.use(express.json());
    app.use(controller.basePath, controller.register());

    await hit().expect(200, { ok: true });
    expect(order).toEqual(["m1", "m2", "handler"]);
  });

  it("mounts under basePath only", async () => {
    controller.routes[0].callback = async (ctx: any) =>
      ctx.response.status(200).send({ hi: true });
    app = express();
    app.use(express.json());
    app.use(controller.basePath, controller.register());

    await hit().expect(200, { hi: true });
    const agent = request(app);
    await agent[method]("/" + faker.lorem.word()).expect(404);
  });

  it("extracts Bearer token (case-insensitive, trims space)", async () => {
    let seenToken: string | undefined;

    controller.routes[0].callback = async (ctx: any) => {
      seenToken = ctx.token;
      return ctx.response.status(200).send({ ok: true });
    };

    app = express();
    app.use(express.json());
    app.use(controller.basePath, controller.register());

    await hit({ Authorization: "BeArEr   nemo   " }).expect(200, { ok: true });
    expect(seenToken).toBe("nemo");
  });

  it("maps BaseApiError to status + message", async () => {
    class Nope extends BaseApiError {
      constructor() {
        super("nope", 418);
      }
    }
    controller.routes[0].callback = async () => {
      throw new Nope();
    };

    app = express();
    app.use(express.json());
    app.use(controller.basePath, controller.register());

    await hit().expect(418, { message: "nope" });
  });

  it("maps ZodError to 400 with issues", async () => {
    const zerr = new ZodError([
      { code: "custom", path: ["x"], message: "bad" } as any,
    ]);
    controller.routes[0].callback = async () => {
      throw zerr;
    };
    app = express();
    app.use(express.json());
    app.use(controller.basePath, controller.register());

    const res = await hit().expect(400);
    expect(res.body).toEqual({
      message: "Validation error",
      issues: zerr.issues,
    });
  });

  it("maps unexpected errors to 500 generic message", async () => {
    controller.routes[0].callback = async () => {
      throw new Error("kaboom");
    };

    app = express();
    app.use(express.json());
    app.use(controller.basePath, controller.register());

    await hit().expect(500, { message: "Unexpected error occurred" });
  });

  it("returns 404 for unmatched route when there are no routes", async () => {
    // Make an empty controller (if your factory supports it) or temporarily clear routes
    controller.routes = [];
    app = express();
    app.use(express.json());
    app.use(controller.basePath, controller.register());

    // pick GET for a simple probe
    await request(app).get(`${controller.basePath}/anything`).expect(404);
  });

  //   it("hang prevention: a middleware that doesn't next() will not return", async () => {
  //     const bad = (_req: any, _res: any, _next: any) => {
  //       /* no next, no send */
  //     };
  //     controller.routes[0].middleware = [bad];
  //     controller.routes[0].callback = async (ctx: any) =>
  //       ctx.response.status(200).send({ ok: true });

  //     app = express();
  //     app.use(express.json());
  //     app.use(controller.basePath, controller.register());

  //     // This will time out if not handled; instead, assert 500 via a global error guard (optional),
  //     // or just document the behavior. I'd keep this commented to avoid slowing the suite.
  //   });

  it("returns 204 when handler returns undefined", async () => {
    controller.routes[0].callback = async (ctx: any) => {
      // no send; return nothing
      return undefined;
    };
    app = express();
    app.use(express.json());
    app.use(controller.basePath, controller.register());

    await hit().expect(204);
  });

  it("serializes primitive and array results as 200", async () => {
    controller.routes[0].callback = async () => "ok";
    app = express();
    app.use(express.json());
    app.use(controller.basePath, controller.register());
    await hit().expect(200, "ok");

    controller.routes[0].callback = async () => [1, 2, 3];
    app = express();
    app.use(express.json());
    app.use(controller.basePath, controller.register());
    const res = await hit().expect(200);
    expect(res.body).toEqual([1, 2, 3]);
  });

  it("does not double-send if handler already responded", async () => {
    controller.routes[0].callback = async (ctx: any) => {
      ctx.response.status(202).send({ ok: true });
      // return anything; wrapper should see headersSent and skip
      return { status: 999, body: { nope: true } };
    };

    app = express();
    app.use(express.json());
    app.use(controller.basePath, controller.register());

    await hit().expect(202, { ok: true });
  });

  it("passes through response-like return value", async () => {
    controller.routes[0].callback = async (ctx: any) => {
      return ctx.response.status(206).send({ partial: true });
    };

    app = express();
    app.use(express.json());
    app.use(controller.basePath, controller.register());

    await hit().expect(206, { partial: true });
  });

  it("ignores malformed Authorization header", async () => {
    let seenToken: string | undefined = "preset";
    controller.routes[0].callback = async (ctx: any) => {
      seenToken = ctx.token;
      return ctx.response.status(200).send({ ok: true });
    };

    app = express();
    app.use(express.json());
    app.use(controller.basePath, controller.register());

    await hit({ Authorization: "Bearer" }).expect(200); // no token
    expect(seenToken).toBeUndefined();

    await hit({ Authorization: "Token abc" }).expect(200); // different scheme
    expect(seenToken).toBeUndefined();
  });

  it("maps errors thrown by middleware", async () => {
    const m = (_req: any, _res: any, _next: any) => {
      throw new Error("midfail");
    };
    controller.routes[0].middleware = [m];
    controller.routes[0].callback = async (ctx: any) =>
      ctx.response.status(200).send({ ok: true });

    app = express();
    app.use(express.json());
    app.use(controller.basePath, controller.register());

    await hit().expect(500, { message: "Unexpected error occurred" });
  });
});
