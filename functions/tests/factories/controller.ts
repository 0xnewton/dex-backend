import {
  AuthenticateToken,
  BaseController,
  Controller,
  Route,
  RouteCtx,
  RouteDefinition,
} from "../../src/lib/backend-framework";

export class TestControllerBase extends BaseController {
  seen?: any;
}

export function makeController<T extends RouteDefinition>(def: T) {
  @Controller("/foo")
  class TestController extends TestControllerBase {
    @Route(def)
    async handler(ctx: RouteCtx<T>) {
      this.seen = ctx;
      return ctx.response.json({ ok: true });
    }
  }
  return new TestController("TestController", "/t");
}

export function makeControllerWithMultipleRoutes<
  T1 extends RouteDefinition,
  T2 extends RouteDefinition,
>(def1: T1, def2: T2) {
  @Controller("/foo")
  class TestController extends TestControllerBase {
    @Route(def1)
    async handler1(ctx: RouteCtx<T1>) {
      this.seen = { route: 1, ctx };
      return ctx.response.json({ ok: true, route: 1 });
    }

    @Route(def2)
    async handler2(ctx: RouteCtx<T2>) {
      this.seen = { route: 2, ctx };
      return ctx.response.json({ ok: true, route: 2 });
    }
  }
  return new TestController("TestController", "/t");
}

export function makeControllerWithAuthentication<T extends RouteDefinition>(
  def: T
) {
  @Controller("/foo")
  class TestController extends TestControllerBase {
    @AuthenticateToken()
    @Route(def)
    async handler(ctx: RouteCtx<T>) {
      this.seen = ctx;
      return ctx.response.json({ ok: true });
    }
  }
  return new TestController("TestController", "/t");
}
