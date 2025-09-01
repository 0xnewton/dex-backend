import { getQuoteDoc } from "../generic";
import { QuoteDB } from "./types";

export const getQuoteById = async (quoteID: string): Promise<QuoteDB | null> => {
  const doc = getQuoteDoc(quoteID);
  const snap = await doc.get();
  const data = snap.data();
  if (!snap.exists || !data) return null;
  return data;
};
