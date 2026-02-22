/**
 * TradingContextDef.ts — Isolated createContext call.
 *
 * Kept in a plain .ts file (no JSX) so Vite fast-refresh does not
 * complain about mixing context objects with React components.
 */
import { createContext, type Dispatch } from 'react';
import type { TradingState, TradingAction } from '../types/trading';

export interface TradingContextValue {
  state: TradingState;
  dispatch: Dispatch<TradingAction>;
}

export const TradingContext = createContext<TradingContextValue | null>(null);
