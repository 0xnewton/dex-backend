import { Router } from "express";
import { logger } from "firebase-functions";
import {
  ExpressNextFunction,
  ExpressRequest,
  ExpressRequestHandler,
  ExpressResponse,
  ExpressRouter,
} from "./express.types";
import { BaseApiError } from "./errors";

export interface RequestMiddleware extends ExpressRequestHandler {
  <TRequest, TResponse>(
    request: TRequest extends ExpressRequest ? TRequest : never,
    response: TResponse extends ExpressResponse ? TResponse : never,
    next: ExpressNextFunction
  ): TResponse | Promise<TResponse> | void;
}

export interface RequestHandler extends ExpressRequestHandler {
  <TRequest, TResponse>(
    request: TRequest extends ExpressRequest ? TRequest : never,
    response: TResponse extends ExpressResponse ? TResponse : never
  ): TResponse | Promise<TResponse> | void;
}

export interface IRouteMeta {
  method: "get" | "post" | "put" | "patch" | "delete";
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
  return async <TRequest, TResponse>(
    request: TRequest extends ExpressRequest ? TRequest : never,
    response: TResponse extends ExpressResponse ? TResponse : never
  ) => {
    logger.info(`${controllerName}.${methodName} request`, {
      body: request.body,
      queryParams: request.query,
    });
    try {
      const result = await callback(request, response);
      return result;
    } catch (err) {
      logger.error(`${controllerName}.${methodName} unexpected error`, {
        stack: err instanceof Error ? err.stack : undefined,
        body: request.body,
        queryParams: request.query,
        message: err instanceof Error ? err.message : undefined,
      });
      if (err instanceof BaseApiError) {
        return response.status(err.status).send({ message: err.message });
      } else {
        return response
          .status(500)
          .send({ message: "Unexpected error occurred" });
      }
    }
  };
};
