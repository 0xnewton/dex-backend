import { z } from "zod";
import {
  IBaseController,
  IRouteMeta,
  RequestHandler,
} from "../base-controller";
import { RestApiContext, RestApiContextWith } from "../rest-api-context";
import { RouteDefinition } from "../route-definition";

export const Route =
  <T extends RouteDefinition>(def: T) =>
  <
    This extends IBaseController,
    Fn extends (
      this: This,
      ctx: RestApiContextWith<T>
    ) => ReturnType<RequestHandler>, // Promise<ExpressResponse>
  >(
    value: Fn,
    context: ClassMethodDecoratorContext<This, Fn>
  ) => {
    const methodName = String(context.name);

    context.addInitializer(function (this: This) {
      // Build the callback the router will invoke
      const callback: RequestHandler = async (ctx: RestApiContext) => {
        // Parse only if schema provided
        const payload = def.payloadSchema
          ? def.payloadSchema.parse(ctx.request.body)
          : undefined;

        const pathParams = def.pathParamsSchema
          ? def.pathParamsSchema.parse(ctx.request.params)
          : undefined;

        const queryParams = def.queryParamsSchema
          ? (def.queryParamsSchema as z.ZodTypeAny).parse(ctx.request.query)
          : undefined;

        // Build typed args
        const typedCtx = {
          ...ctx,
          ...(payload !== undefined ? { payload } : {}),
          ...(pathParams !== undefined ? { pathParams } : {}),
          ...(queryParams !== undefined ? { queryParams } : {}),
        } as RestApiContextWith<T>;

        return value.call(this, typedCtx);
      };

      const route: IRouteMeta = {
        method: def.method,
        path: def.path,
        methodName,
        callback,
      };

      this.routes = this.routes ? [...this.routes, route] : [route];
    });

    return value;
  };

export type RouteCtx<TDef extends RouteDefinition> = RestApiContextWith<TDef>;
