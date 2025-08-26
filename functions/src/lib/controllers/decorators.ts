import {
  BaseController,
  IBaseController,
  IRouteMeta,
  RequestHandler,
  RequestMiddleware,
} from "./base-controller";

type GetProps<TBase> = TBase extends new (props: infer P) => any ? P : never;
type GetInstance<TBase> = TBase extends new (...args: any[]) => infer I
  ? I
  : never;
type MergeCtor<A, B> = new (
  props: GetProps<A> & GetProps<B>
) => GetInstance<A> & GetInstance<B>;

export const Controller = (basePath?: string) => {
  return <T extends typeof BaseController>(target: T) => {
    return class extends (target as any) {
      constructor(..._args: any[]) {
        super(
          target.prototype.constructor.name,
          basePath,
          target.prototype.routes
        );
      }
    } as MergeCtor<T, BaseController>;
  };
};

type RequestMethodDecorator = (
  path?: string,
  middleware?: RequestMiddleware[]
) => <T extends IBaseController>(
  target: T,
  _propertyKey: string,
  descriptor: TypedPropertyDescriptor<RequestHandler>
) => void;

export const Get: RequestMethodDecorator = (path, middleware) => {
  return (target, _propertyKey, descriptor) => {
    const route: IRouteMeta = {
      method: "get",
      path,
      methodName: _propertyKey,
      middleware,
      callback: descriptor.value!,
    };
    target.routes = !target.routes ? [route] : [...target.routes, route];
  };
};

export const Post: RequestMethodDecorator = (path, middleware) => {
  return (target, _propertyKey, descriptor) => {
    const route: IRouteMeta = {
      method: "post",
      path,
      methodName: _propertyKey,
      middleware,
      callback: descriptor.value!,
    };
    target.routes = !target.routes ? [route] : [...target.routes, route];
  };
};

export const Put: RequestMethodDecorator = (path, middleware) => {
  return (target, _propertyKey, descriptor) => {
    const route: IRouteMeta = {
      method: "put",
      path,
      methodName: _propertyKey,
      middleware,
      callback: descriptor.value!,
    };
    target.routes = !target.routes ? [route] : [...target.routes, route];
  };
};

export const Patch: RequestMethodDecorator = (path, middleware) => {
  return (target, _propertyKey, descriptor) => {
    const route: IRouteMeta = {
      method: "patch",
      path,
      methodName: _propertyKey,
      middleware,
      callback: descriptor.value!,
    };
    target.routes = !target.routes ? [route] : [...target.routes, route];
  };
};

export const Delete: RequestMethodDecorator = (path, middleware) => {
  return (target, _propertyKey, descriptor) => {
    const route: IRouteMeta = {
      method: "delete",
      path,
      methodName: _propertyKey,
      middleware,
      callback: descriptor.value!,
    };
    target.routes = !target.routes ? [route] : [...target.routes, route];
  };
};
