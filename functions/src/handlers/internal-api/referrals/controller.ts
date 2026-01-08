import {
  Route,
  Controller,
  AuthenticateToken,
  RouteCtx,
  BaseController,
  UnauthorizedError,
} from "../../../lib/backend-framework";
import { createReferralDef } from "./api-definitions/route-definitions";
import ReferralService from "../../../services/referrals";

@Controller("/referrals")
class ReferralsController extends BaseController {
  private referralService: ReferralService = new ReferralService();

  @AuthenticateToken()
  @Route(createReferralDef)
  public async createReferralControllerMethod(
    ctx: RouteCtx<typeof createReferralDef>
  ) {
    if (!ctx.claims?.user) {
      throw new UnauthorizedError();
    }

    const referralCreated = await this.referralService.createReferral({
      userID: ctx.claims.user.id,
      slug: ctx.request.body.slug,
      description: ctx.request.body.description,
      isActive: ctx.request.body.isActive,
      feeAmountBps: ctx.request.body.feeAmountBps,
    });

    return referralCreated;
  }
}

export const referralsController = new ReferralsController();
