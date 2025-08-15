/**
 * Sui Network Client Configuration
 */

import { SuiClient, getFullnodeUrl } from '@mysten/sui.js/client';
import { Ed25519Keypair } from '@mysten/sui.js/keypairs/ed25519';

export type SuiNetwork = 'devnet' | 'testnet' | 'mainnet';

export class SuiClientManager {
  private client: SuiClient;
  private network: SuiNetwork;
  private keypair?: Ed25519Keypair;

  constructor(network: SuiNetwork = 'devnet') {
    this.network = network;
    this.client = new SuiClient({ url: getFullnodeUrl(network) });
  }

  /**
   * Initialize client with keypair for transactions
   */
  initializeWallet(keypair: Ed25519Keypair) {
    this.keypair = keypair;
  }

  /**
   * Get the current client instance
   */
  getClient(): SuiClient {
    return this.client;
  }

  /**
   * Get the current network
   */
  getNetwork(): SuiNetwork {
    return this.network;
  }

  /**
   * Get wallet address
   */
  getWalletAddress(): string | null {
    return this.keypair?.getPublicKey().toSuiAddress() || null;
  }

  /**
   * Switch to a different network
   */
  switchNetwork(network: SuiNetwork) {
    this.network = network;
    this.client = new SuiClient({ url: getFullnodeUrl(network) });
  }

  /**
   * Check connection to the network
   */
  async checkConnection(): Promise<boolean> {
    try {
      await this.client.getLatestSuiSystemState();
      return true;
    } catch (error) {
      console.error('Sui network connection failed:', error);
      return false;
    }
  }
}

// Singleton instance
export const suiClientManager = new SuiClientManager();