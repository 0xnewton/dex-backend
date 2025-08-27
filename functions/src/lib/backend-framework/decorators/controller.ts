import { BaseController } from "../base-controller";

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
