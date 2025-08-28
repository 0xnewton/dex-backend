import { GetAndStoreQuoteFunction, getAndStoreQuote } from "./get-and-store-quote";

interface SwapServiceInterface {
  getAndStoreQuote: GetAndStoreQuoteFunction;
  swapInstructions: unknown;
  executeSwap: unknown;
}

export class SwapService implements SwapServiceInterface {
  getAndStoreQuote = getAndStoreQuote;
  swapInstructions = () => {};
  executeSwap = () => {};
}
