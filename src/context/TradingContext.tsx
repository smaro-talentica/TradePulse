/**
 * TradingContext.tsx — TradingProvider component only.
 *
 * This file exports exactly ONE React component so Vite fast-refresh
 * works correctly. Context definition lives in TradingContextDef.ts.
 */
import { useReducer, useEffect, useRef, type ReactNode } from 'react';
import { TradingContext } from './TradingContextDef';
import { tradingReducer, loadState, STORAGE_KEY } from './tradingReducer';

interface TradingProviderProps {
  children: ReactNode;
}

export function TradingProvider({ children }: TradingProviderProps) {
  const [state, dispatch] = useReducer(tradingReducer, undefined, loadState);

  // Always keep a synchronous ref to the latest state so the beforeunload
  // handler can save it reliably (effects run after paint, beforeunload does not wait).
  const stateRef = useRef(state);
  stateRef.current = state;

  // Primary save: after every state change.
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  // Backup save: guaranteed to fire before the browser closes/refreshes.
  // Reads from stateRef so it always has the latest value.
  useEffect(() => {
    const handleUnload = () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stateRef.current));
    };
    window.addEventListener('beforeunload', handleUnload);
    return () => window.removeEventListener('beforeunload', handleUnload);
  }, []);

  return (
    <TradingContext.Provider value={{ state, dispatch }}>
      {children}
    </TradingContext.Provider>
  );
}

