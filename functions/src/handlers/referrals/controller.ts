import {
  Route,
  Controller,
  AuthenticateToken,
  RouteCtx,
  BaseController,
} from "../../lib/backend-framework";
import { CreateReferralDef } from "./api-definitions/route-defs";

@Controller("/referrals")
class ReferralsController extends BaseController {
  @AuthenticateToken()
  @Route(CreateReferralDef)
  public async createReferralControllerMethod(
    ctx: RouteCtx<typeof CreateReferralDef>
  ) {
    console.log(ctx.pathParams);
    console.log(ctx.queryParams);
    console.log(ctx.claims);
    return ctx.response.json({});
  }
}

export const referralsController = new ReferralsController();
