/**
 * Tile Contract Interactions
 */

import { TransactionBlock } from '@mysten/sui.js/transactions';
import { SuiObjectResponse } from '@mysten/sui.js/client';
import { suiClientManager } from '../client';
import { Coord } from '../../../types/game';

export interface TileObjectData {
  id: string;
  position: Coord;
  owner?: string;
  value: number;
  gameId: string;
}

export class TileContract {
  private packageId: string;
  private moduleName: string = 'sui_tile';

  constructor(packageId: string) {
    this.packageId = packageId;
  }

  /**
   * Create Sui tiles for a game
   */
  async createTiles(gameId: string, positions: Coord[], values: number[]): Promise<string> {
    const txb = new TransactionBlock();
    
    txb.moveCall({
      target: `${this.packageId}::${this.moduleName}::create_tiles`,
      arguments: [
        txb.object(gameId),
        txb.pure(positions),
        txb.pure(values),
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
   * Transfer tile ownership
   */
  async transferTile(tileId: string, newOwner: string): Promise<string> {
    const txb = new TransactionBlock();
    
    txb.moveCall({
      target: `${this.packageId}::${this.moduleName}::transfer_tile`,
      arguments: [
        txb.object(tileId),
        txb.pure(newOwner),
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
   * Get tile data from chain
   */
  async getTileData(tileId: string): Promise<TileObjectData | null> {
    try {
      const client = suiClientManager.getClient();
      const object = await client.getObject({
        id: tileId,
        options: { showContent: true },
      });

      if (object.data?.content && 'fields' in object.data.content) {
        return this.parseTileObject(object);
      }
      return null;
    } catch (error) {
      console.error('Failed to get tile data:', error);
      return null;
    }
  }

  /**
   * Get all tiles for a game
   */
  async getGameTiles(gameId: string): Promise<TileObjectData[]> {
    try {
      const client = suiClientManager.getClient();
      
      // Query objects by type and filter by game_id
      const objects = await client.getOwnedObjects({
        owner: gameId, // This might need adjustment based on your contract design
        options: { showContent: true },
        filter: {
          StructType: `${this.packageId}::${this.moduleName}::SuiTile`,
        },
      });

      return objects.data
        .map(obj => this.parseTileObject(obj))
        .filter((tile): tile is TileObjectData => tile !== null);
    } catch (error) {
      console.error('Failed to get game tiles:', error);
      return [];
    }
  }

  /**
   * Batch update tile positions
   */
  async batchUpdateTilePositions(updates: Array<{ tileId: string; position: Coord }>): Promise<string> {
    const txb = new TransactionBlock();
    
    for (const update of updates) {
      txb.moveCall({
        target: `${this.packageId}::${this.moduleName}::update_tile_position`,
        arguments: [
          txb.object(update.tileId),
          txb.pure(update.position.x),
          txb.pure(update.position.y),
        ],
      });
    }

    const client = suiClientManager.getClient();
    const result = await client.signAndExecuteTransactionBlock({
      transactionBlock: txb,
      signer: this.getKeypair(),
    });

    return result.digest;
  }

  // Helper methods
  private parseTileObject(object: SuiObjectResponse): TileObjectData | null {
    try {
      const fields = (object.data?.content as any)?.fields;
      
      return {
        id: object.data?.objectId || '',
        position: {
          x: fields?.position?.fields?.x || 0,
          y: fields?.position?.fields?.y || 0,
        },
        owner: fields?.owner || undefined,
        value: fields?.value || 1,
        gameId: fields?.game_id || '',
      };
    } catch (error) {
      console.error('Failed to parse tile object:', error);
      return null;
    }
  }

  private getKeypair() {
    // This should be implemented based on your wallet integration
    throw new Error('Keypair not initialized. Please connect wallet first.');
  }
}