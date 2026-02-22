/**
 * useTradingContext.ts — Hook to consume TradingContext.
 *
 * Kept in a plain .ts file (no JSX) for Vite fast-refresh compliance.
 */
import { useContext } from 'react';
import { TradingContext } from './TradingContextDef';
import type { TradingContextValue } from './TradingContextDef';

export function useTradingContext(): TradingContextValue {
  const ctx = useContext(TradingContext);
  if (!ctx) {
    throw new Error('useTradingContext must be used inside <TradingProvider>');
  }
  return ctx;
}
