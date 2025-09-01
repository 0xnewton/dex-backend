import {
  GetAndStoreQuoteFunction,
  getAndStoreQuote,
} from "./get-and-store-quote";
import {
  SwapInstructionsFunction,
  swapInstructions,
} from "./swap-instructions";

interface SwapServiceInterface {
  getAndStoreQuote: GetAndStoreQuoteFunction;
  swapInstructions: SwapInstructionsFunction;
  executeSwap: unknown;
}

export default class SwapService implements SwapServiceInterface {
  getAndStoreQuote = getAndStoreQuote;
  swapInstructions = swapInstructions;
  executeSwap = () => {
    console.log("foo bar");
  };
}
