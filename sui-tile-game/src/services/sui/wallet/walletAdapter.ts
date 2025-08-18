/**
 * Wallet Integration Adapter
 */

import { suiClientManager } from '../client';
import { Ed25519Keypair } from '@mysten/sui.js/keypairs/ed25519';

export interface WalletAdapter {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  getAddress(): Promise<string | null>;
  signAndExecuteTransaction(transaction: any): Promise<string>;
  isConnected(): boolean;
}

export interface WalletState {
  connected: boolean;
  address: string | null;
  connecting: boolean;
  error: string | null;
}

export class SuiWalletAdapter implements WalletAdapter {
  private wallet: any;
  private keypair: Ed25519Keypair | null = null;

  constructor(wallet?: any) {
    this.wallet = wallet;
  }

  async connect(): Promise<void> {
    try {
      if (this.wallet) {
        // Connect to external wallet (Sui Wallet, Ethos, etc.)
        await this.wallet.connect();
        const accounts = await this.wallet.getAccounts();
        
        if (accounts && accounts.length > 0) {
          suiClientManager.initializeWallet(this.wallet);
        }
      } else {
        // Generate a new keypair for development
        this.keypair = new Ed25519Keypair();
        suiClientManager.initializeWallet(this.keypair);
      }
    } catch (error) {
      throw new Error(`Failed to connect wallet: ${error}`);
    }
  }

  async disconnect(): Promise<void> {
    if (this.wallet) {
      await this.wallet.disconnect();
    }
    this.keypair = null;
  }

  async getAddress(): Promise<string | null> {
    if (this.wallet) {
      const accounts = await this.wallet.getAccounts();
      return accounts?.[0]?.address || null;
    } else if (this.keypair) {
      return this.keypair.getPublicKey().toSuiAddress();
    }
    return null;
  }

  async signAndExecuteTransaction(transaction: any): Promise<string> {
    if (this.wallet) {
      const result = await this.wallet.signAndExecuteTransactionBlock({
        transactionBlock: transaction,
      });
      return result.digest;
    } else if (this.keypair) {
      const client = suiClientManager.getClient();
      const result = await client.signAndExecuteTransactionBlock({
        transactionBlock: transaction,
        signer: this.keypair,
      });
      return result.digest;
    }
    throw new Error('No wallet connected');
  }

  isConnected(): boolean {
    return !!(this.wallet || this.keypair);
  }
}

export class WalletManager {
  private adapter: SuiWalletAdapter | null = null;
  private state: WalletState = {
    connected: false,
    address: null,
    connecting: false,
    error: null,
  };
  private listeners: Array<(state: WalletState) => void> = [];

  constructor() {
    this.detectWallets();
  }

  private async detectWallets() {
    // Detect available Sui wallets
    if (typeof window !== 'undefined') {
      // Check for Sui Wallet
      if ((window as any).suiWallet) {
        this.adapter = new SuiWalletAdapter((window as any).suiWallet);
      }
      // Check for other wallets...
    }
  }

  async connect(): Promise<void> {
    try {
      this.updateState({ connecting: true, error: null });
      
      if (!this.adapter) {
        // Create development adapter if no wallet detected
        this.adapter = new SuiWalletAdapter();
      }
      
      await this.adapter.connect();
      const address = await this.adapter.getAddress();
      
      this.updateState({
        connected: true,
        address,
        connecting: false,
        error: null,
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Failed to connect wallet';
      this.updateState({
        connected: false,
        address: null,
        connecting: false,
        error: errorMsg,
      });
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    try {
      if (this.adapter) {
        await this.adapter.disconnect();
      }
      
      this.updateState({
        connected: false,
        address: null,
        connecting: false,
        error: null,
      });
    } catch (error) {
      console.error('Failed to disconnect wallet:', error);
    }
  }

  getState(): WalletState {
    return { ...this.state };
  }

  subscribe(listener: (state: WalletState) => void): () => void {
    this.listeners.push(listener);
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index > -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  getAdapter(): SuiWalletAdapter | null {
    return this.adapter;
  }

  private updateState(updates: Partial<WalletState>) {
    this.state = { ...this.state, ...updates };
    this.listeners.forEach(listener => listener(this.state));
  }
}

// Singleton instance
export const walletManager = new WalletManager();