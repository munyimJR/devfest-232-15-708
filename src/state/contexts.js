import { createContext, useContext } from "react";

export const I18nContext = createContext(null);
export const StoreContext = createContext(null);

/** { lang, t, num, date, bytes, title, titlePair } for the current language. */
export function useI18n() {
  return useContext(I18nContext);
}

/** { state, derived, actions } from useTenderStore(). */
export function useStore() {
  return useContext(StoreContext);
}
