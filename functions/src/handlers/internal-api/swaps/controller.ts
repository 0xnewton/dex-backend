import {
  Route,
  Controller,
  RouteCtx,
  BaseController,
} from "../../../lib/backend-framework";
import {
  getQuoteRouteDef,
  swapTransactionsRouteDef,
} from "./api-definitions/route-definitions";
import SwapService from "../../../services/swap";

@Controller("/swaps")
class SwapsController extends BaseController {
  private swapService = new SwapService();

  /** @deprecated - quotes are now generated client side */
  @Route(getQuoteRouteDef)
  public async getQuoteControllerMethod(
    ctx: RouteCtx<typeof getQuoteRouteDef>
  ) {
    const {
      referralSlug,
      userPublicKey,
      inputMint,
      outputMint,
      amount,
      slippageBps,
      dynamicSlippage,
    } = ctx.request.body;

    const quote = await this.swapService.getAndStoreQuote({
      referralSlug,
      userPublicKey,
      inputMint,
      outputMint,
      amount,
      slippageBps,
      dynamicSlippage,
    });

    return quote;
  }

  @Route(swapTransactionsRouteDef)
  public async swapTransactionsControllerMethod(
    ctx: RouteCtx<typeof swapTransactionsRouteDef>
  ) {
    const {
      userPublicKey,
      inputMint,
      outputMint,
      amount,
      slippageBps,
      dynamicSlippage,
      referralSlug,
    } = ctx.request.body;

    const result = await this.swapService.swapInstructions({
      userPublicKey,
      inputMint,
      outputMint,
      amount,
      slippageBps,
      dynamicSlippage,
      referralSlug,
    });

    return result;
  }
}

export const swapsController = new SwapsController();
