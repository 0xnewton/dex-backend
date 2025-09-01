import { Args, ArgsWithClaims, RouteDefinition } from "./route-definition";

type ResponseType<T extends RouteDefinition> = T extends {
  responseValidator: (data: unknown) => Promise<unknown>;
}
  ? ReturnType<T["responseValidator"]>
  : any;

type FunctionWithArgs<T extends RouteDefinition> = (
  args?: Args<T>
) => ResponseType<T>;
type FunctionWithoutArgs<T extends RouteDefinition> = () => ResponseType<T>;

export type ApiHandlerFunction<T extends RouteDefinition> =
  Args<T> extends never ? FunctionWithoutArgs<T> : FunctionWithArgs<T>;

export type ApiHandlerFunctionWithClaims<C> = (args: ArgsWithClaims<C>) => any;
