/**
 * Game Contract Interactions
 */

import { TransactionBlock } from '@mysten/sui.js/transactions';
import { SuiObjectResponse } from '@mysten/sui.js/client';
import { suiClientManager } from '../client';
import { Coord } from '../../../types/game';

export interface GameObjectData {
  id: string;
  boardSize: number;
  players: string[];
  currentTurn: number;
  gameStatus: 'lobby' | 'playing' | 'finished';
  suiTiles: Array<{
    id: string;
    position: Coord;
    owner?: string;
  }>;
}

export interface PlayerObjectData {
  id: string;
  owner: string;
  position: Coord;
  score: number;
  name: string;
}

export class GameContract {
  private packageId: string;
  private moduleName: string = 'tile_game';

  constructor(packageId: string) {
    this.packageId = packageId;
  }

  /**
   * Create a new game instance
   */
  async createGame(boardSize: number = 10): Promise<string> {
    const txb = new TransactionBlock();
    
    txb.moveCall({
      target: `${this.packageId}::${this.moduleName}::create_game`,
      arguments: [
        txb.pure(boardSize),
      ],
    });

    const client = suiClientManager.getClient();
    const result = await client.signAndExecuteTransactionBlock({
      transactionBlock: txb,
      signer: this.getKeypair(),
    });

    return result.digest;
  }

  /**
   * Join an existing game
   */
  async joinGame(gameId: string, playerName: string): Promise<string> {
    const txb = new TransactionBlock();
    
    txb.moveCall({
      target: `${this.packageId}::${this.moduleName}::join_game`,
      arguments: [
        txb.object(gameId),
        txb.pure(playerName),
      ],
    });

    const client = suiClientManager.getClient();
    const result = await client.signAndExecuteTransactionBlock({
      transactionBlock: txb,
      signer: this.getKeypair(),
    });

    return result.digest;
  }

  /**
   * Move player on the board
   */
  async movePlayer(
    gameId: string, 
    playerId: string, 
    direction: 'up' | 'down' | 'left' | 'right'
  ): Promise<string> {
    const txb = new TransactionBlock();
    
    const directionValue = this.directionToNumber(direction);
    
    txb.moveCall({
      target: `${this.packageId}::${this.moduleName}::move_player`,
      arguments: [
        txb.object(gameId),
        txb.object(playerId),
        txb.pure(directionValue),
      ],
    });

    const client = suiClientManager.getClient();
    const result = await client.signAndExecuteTransactionBlock({
      transactionBlock: txb,
      signer: this.getKeypair(),
    });

    return result.digest;
  }

  /**
   * Capture a Sui tile
   */
  async captureTile(gameId: string, playerId: string, tileId: string): Promise<string> {
    const txb = new TransactionBlock();
    
    txb.moveCall({
      target: `${this.packageId}::${this.moduleName}::capture_tile`,
      arguments: [
        txb.object(gameId),
        txb.object(playerId),
        txb.object(tileId),
      ],
    });

    const client = suiClientManager.getClient();
    const result = await client.signAndExecuteTransactionBlock({
      transactionBlock: txb,
      signer: this.getKeypair(),
    });

    return result.digest;
  }

  /**
   * Get game state from chain
   */
  async getGameState(gameId: string): Promise<GameObjectData | null> {
    try {
      const client = suiClientManager.getClient();
      const object = await client.getObject({
        id: gameId,
        options: { showContent: true },
      });

      if (object.data?.content && 'fields' in object.data.content) {
        return this.parseGameObject(object);
      }
      return null;
    } catch (error) {
      console.error('Failed to get game state:', error);
      return null;
    }
  }

  /**
   * Get player data from chain
   */
  async getPlayerData(playerId: string): Promise<PlayerObjectData | null> {
    try {
      const client = suiClientManager.getClient();
      const object = await client.getObject({
        id: playerId,
        options: { showContent: true },
      });

      if (object.data?.content && 'fields' in object.data.content) {
        return this.parsePlayerObject(object);
      }
      return null;
    } catch (error) {
      console.error('Failed to get player data:', error);
      return null;
    }
  }

  /**
   * Subscribe to game events
   */
  async subscribeToGameEvents(gameId: string, callback: (event: any) => void) {
    const client = suiClientManager.getClient();
    
    return client.subscribeEvent({
      filter: {
        Package: this.packageId,
      },
      onMessage: callback,
    });
  }

  // Helper methods
  private directionToNumber(direction: string): number {
    const directions = { up: 0, right: 1, down: 2, left: 3 };
    return directions[direction as keyof typeof directions] || 0;
  }

  private parseGameObject(object: SuiObjectResponse): GameObjectData {
    // Parse the Sui object content into GameObjectData
    // This would depend on your contract's data structure
    const fields = (object.data?.content as any)?.fields;
    
    return {
      id: object.data?.objectId || '',
      boardSize: fields?.board_size || 10,
      players: fields?.players || [],
      currentTurn: fields?.current_turn || 0,
      gameStatus: fields?.game_status || 'lobby',
      suiTiles: fields?.sui_tiles || [],
    };
  }

  private parsePlayerObject(object: SuiObjectResponse): PlayerObjectData {
    // Parse the Sui object content into PlayerObjectData
    const fields = (object.data?.content as any)?.fields;
    
    return {
      id: object.data?.objectId || '',
      owner: fields?.owner || '',
      position: fields?.position || { x: 0, y: 0 },
      score: fields?.score || 0,
      name: fields?.name || '',
    };
  }

  private getKeypair() {
    // This should be implemented based on your wallet integration
    // For now, throwing an error to indicate it needs implementation
    throw new Error('Keypair not initialized. Please connect wallet first.');
  }
}