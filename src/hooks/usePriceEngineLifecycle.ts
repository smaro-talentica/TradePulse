/**
 * usePriceEngineLifecycle.ts
 *
 * Starts the price engine when a component mounts and optionally stops it
 * when it unmounts.  Mount this hook once at the application root (Dashboard),
 * not inside individual ticker rows.
 */

import { useEffect } from 'react';
import { priceEngine } from '../engine/priceEngine';

/**
 * @param stopOnUnmount - If true (default), the engine is stopped when the
 *   component unmounts.  Set to false if you want the engine to keep ticking
 *   in the background (e.g. during hot-module replacement in development).
 */
export function usePriceEngineLifecycle(stopOnUnmount = true): void {
  useEffect(() => {
    priceEngine.start();

    return () => {
      if (stopOnUnmount) {
        priceEngine.stop();
      }
    };
  }, [stopOnUnmount]);
}
