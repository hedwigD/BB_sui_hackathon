/**
 * React hook for wallet integration
 */

import { useState, useEffect, useCallback } from 'react';
import { walletManager, WalletState } from '../wallet/walletAdapter';

export function useWallet() {
  const [state, setState] = useState<WalletState>(walletManager.getState());

  useEffect(() => {
    const unsubscribe = walletManager.subscribe(setState);
    return unsubscribe;
  }, []);

  const connect = useCallback(async () => {
    try {
      await walletManager.connect();
    } catch (error) {
      console.error('Failed to connect wallet:', error);
      throw error;
    }
  }, []);

  const disconnect = useCallback(async () => {
    try {
      await walletManager.disconnect();
    } catch (error) {
      console.error('Failed to disconnect wallet:', error);
    }
  }, []);

  const getAdapter = useCallback(() => {
    return walletManager.getAdapter();
  }, []);

  return {
    ...state,
    connect,
    disconnect,
    getAdapter,
  };
}