import { Router } from "express";
import { logger } from "firebase-functions";
import {
  ExpressNextFunction,
  ExpressRequest,
  ExpressRequestHandler,
  ExpressResponse,
  ExpressRouter,
} from "./types";
import { BaseApiError } from "../errors";
import { RestApiContext } from "./rest-api-context";
import { HttpMethod } from "./http";
import { ZodError } from "zod";

export interface RequestMiddleware extends ExpressRequestHandler {
  <TRequest, TResponse>(
    request: TRequest extends ExpressRequest ? TRequest : never,
    response: TResponse extends ExpressResponse ? TResponse : never,
    next: ExpressNextFunction
  ): TResponse | Promise<TResponse> | void;
}

export interface RequestHandler {
  (context: RestApiContext): Promise<ExpressResponse>;
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
      const routeHandler = requestCallbackErrorHandlerWrapper(
        this.controllerName,
        methodName,
        callback
      );
      router[method](path, ...middleware, routeHandler);
    }
    return router;
  }
}

const requestCallbackErrorHandlerWrapper = (
  controllerName: string,
  methodName: string,
  callback: RequestHandler
): RequestHandler => {
  return async (context: RestApiContext) => {
    logger.info(`${controllerName}.${methodName} request`, {
      body: context.request.body,
      queryParams: context.request.query,
    });

    try {
      const result = await callback(context);
      return result;
    } catch (err) {
      logger.error(`${controllerName}.${methodName} unexpected error`, {
        stack: err instanceof Error ? err.stack : undefined,
        body: context.request.body,
        queryParams: context.request.query,
        message: err instanceof Error ? err.message : undefined,
      });
      if (err instanceof BaseApiError) {
        return context.response
          .status(err.status)
          .send({ message: err.message });
      } else if (err instanceof ZodError) {
        return context.response
          .status(400)
          .send({ message: "Validation error", issues: err.issues });
      } else {
        return context.response
          .status(500)
          .send({ message: "Unexpected error occurred" });
      }
    }
  };
};
