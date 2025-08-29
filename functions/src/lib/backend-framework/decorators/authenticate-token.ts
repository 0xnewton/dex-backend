import { logger } from "firebase-functions";
import { getUserByID } from "../../db/users";
import { UnauthorizedError } from "../errors";
import { auth } from "../../firebase";
import { DecodedIdToken } from "firebase-admin/auth";
import { Claims } from "../rest-api-context";

export function AuthenticateToken() {
  return function <
    This,
    Fn extends (this: This, ...args: any[]) => Promise<any>,
  >(value: Fn, _meta: ClassMethodDecoratorContext<This, Fn>) {
    const wrapped = async function (this: This, ...args: any[]) {
      // Treat the first arg as the context at runtime; assert minimal fields.
      const ctx = args[0];

      logger.info("Authenticating token...");

      const token = ctx.token;
      if (!token) throw new UnauthorizedError("Missing token");

      const checkRevoked = true;
      let data: DecodedIdToken;
      try {
        data = await auth.verifyIdToken(token, checkRevoked);
      } catch (e) {
        logger.error("Error verifying token", { details: e?.message });
        throw new UnauthorizedError("Invalid token");
      }

      const user = await getUserByID(data.uid);
      if (!user) throw new UnauthorizedError("User not found");

      ctx.claims = { user } as Claims;

      // Call original method with unchanged signature
      return value.apply(this, args);
    };

    return wrapped;
  };
}
