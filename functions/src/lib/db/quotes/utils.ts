import { QuoteDB, QuoteWithReferralDB } from "./types";

export function isQuoteWithReferral(q: QuoteDB): q is QuoteWithReferralDB {
  return !!q.referralId && !!q.referralUserId && !!q.referralSlug;
}