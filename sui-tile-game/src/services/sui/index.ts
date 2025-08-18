/**
 * Sui Services Main Export
 */

// Client
export { SuiClientManager, suiClientManager } from './client';
export type { SuiNetwork } from './client';

// Contracts
export { GameContract } from './contracts/gameContract';
export { TileContract } from './contracts/tileContract';
export type { GameObjectData, PlayerObjectData } from './contracts/gameContract';
export type { TileObjectData } from './contracts/tileContract';

// Hooks
export { useSuiContract } from './hooks/useSuiContract';
export { useWallet } from './hooks/useWallet';
export type { ContractState } from './hooks/useSuiContract';

// Wallet
export { walletManager, SuiWalletAdapter, WalletManager } from './wallet/walletAdapter';
export type { WalletAdapter, WalletState } from './wallet/walletAdapter';

// Utilities
export * from './utils/constants';
export * from './utils/helpers';