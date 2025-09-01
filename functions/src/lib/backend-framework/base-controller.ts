import { Router } from "express";
import { logger } from "firebase-functions";
import {
  ExpressNextFunction,
  ExpressRequest,
  ExpressRequestHandler,
  ExpressResponse,
  ExpressRouter,
} from "./types";
import { BaseApiError } from "./errors";
import { RestApiContext } from "./rest-api-context";
import { getHeader, HttpMethod } from "./http";
import { ZodError } from "zod";

export interface RequestMiddleware extends ExpressRequestHandler {
  <TRequest, TResponse>(
    request: TRequest extends ExpressRequest ? TRequest : never,
    response: TResponse extends ExpressResponse ? TResponse : never,
    next: ExpressNextFunction
  ): TResponse | Promise<TResponse> | void;
}

export interface RequestHandler {
  (context: RestApiContext): Promise<any>;
}

export interface IRouteMeta {
  method: HttpMethod;
  path?: string;
  methodName: string;
  middleware?: RequestMiddleware[];
  callback: RequestHandler;
}

export interface IBaseController {
  basePath: string;
  routes: IRouteMeta[];
  register(): ExpressRouter;
}

export class BaseController implements IBaseController {
  public basePath: string;
  public routes: IRouteMeta[];
  private controllerName: string;

  constructor(
    controllerName?: string,
    basePath?: string,
    routes?: IRouteMeta[]
  ) {
    this.controllerName = controllerName ?? this.constructor.name;
    this.basePath = !basePath ? "/" : basePath;
    this.routes = !routes ? [] : routes;
  }

  public register() {
    const router = Router();
    for (const route of this.routes) {
      const {
        method,
        path = "/",
        methodName,
        middleware = [],
        callback,
      } = route;
      const routeHandler = requestCallbackExpressHandler(
        this.controllerName,
        methodName,
        callback
      );
      router[method](path, ...middleware, routeHandler);
    }

    router.use(
      (
        err: unknown,
        req: ExpressRequest,
        res: ExpressResponse,
        _next: ExpressNextFunction
      ) => {
        logger.error(`${this.controllerName} unexpected error`, {
          stack: err instanceof Error ? err.stack : undefined,
          body: req.body,
          queryParams: req.query,
          message: err instanceof Error ? err.message : String(err),
        });

        if (err instanceof BaseApiError) {
          return res.status(err.status).send({ message: err.message });
        }
        if (err instanceof ZodError) {
          return res
            .status(400)
            .send({ message: "Validation error", issues: err.issues });
        }
        return res.status(500).send({ message: "Unexpected error occurred" });
      }
    );
    return router;
  }
}

export const makeContextFromExpress = (
  req: ExpressRequest,
  res: ExpressResponse
): RestApiContext => {
  return {
    request: req,
    response: res,
  };
};

export const requestCallbackExpressHandler = (
  controllerName: string,
  methodName: string,
  callback: (ctx: RestApiContext) => Promise<ExpressResponse>
): ExpressRequestHandler => {
  const wrapped = requestCallbackErrorHandlerWrapper(
    controllerName,
    methodName,
    callback
  );
  return async (
    req: ExpressRequest,
    res: ExpressResponse,
    next: ExpressNextFunction
  ) => {
    try {
      const ctx = makeContextFromExpress(req, res);
      await wrapped(ctx);
    } catch (err) {
      next(err);
    }
  };
};

const normalizeAndSend = (
  ctx: RestApiContext,
  result: any 
) => {
  if (result === undefined) return ctx.response.status(204).send();

  return ctx.response.status(200).send(result);
}

export const requestCallbackErrorHandlerWrapper = (
  controllerName: string,
  methodName: string,
  callback: RequestHandler
): RequestHandler => {
  return async (context: RestApiContext) => {
    logger.info(`${controllerName}.${methodName} request`, {
      body: context.request.body,
      queryParams: context.request.query,
    });

    const authHeader = getHeader(context.request, "authorization");
    const matchedToken = authHeader.match(/^\s*bearer\s+(.+?)\s*$/i);
    if (matchedToken) {
      context.token = matchedToken[1];
    }

    const result = await callback(context);

    // If the handler already sent the response, don’t send again
    if (context.response.headersSent) {
      return context.response;
    }

    return normalizeAndSend(context, result);
  };
};
