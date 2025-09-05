import {
  getAndStoreQuote,
} from "./get-and-store-quote";
import {
  swapInstructions,
} from "./swap-instructions";

export default class SwapService {
  getAndStoreQuote = getAndStoreQuote;
  swapInstructions = swapInstructions;
  executeSwap = () => {
    console.log("foo bar");
  };
}
