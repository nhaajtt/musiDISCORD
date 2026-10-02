import en from "./en.js";
import vi from "./vi.js";

const banks = { en, vi };

/** The content bank for a language ("en" or "vi"); anything else falls back to English. */
export const getContent = (language) => banks[language] ?? en;
