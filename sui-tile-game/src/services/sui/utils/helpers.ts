/**
 * Sui Service Helper Functions
 */

import { Coord } from '../../../types/game';
import { SuiObjectResponse } from '@mysten/sui.js/client';

/**
 * Convert direction string to movement coordinates
 */
export function directionToCoordDelta(direction: 'up' | 'down' | 'left' | 'right'): Coord {
  switch (direction) {
    case 'up': return { x: 0, y: -1 };
    case 'down': return { x: 0, y: 1 };
    case 'left': return { x: -1, y: 0 };
    case 'right': return { x: 1, y: 0 };
    default: return { x: 0, y: 0 };
  }
}

/**
 * Calculate new position after move
 */
export function calculateNewPosition(currentPos: Coord, direction: 'up' | 'down' | 'left' | 'right'): Coord {
  const delta = directionToCoordDelta(direction);
  return {
    x: currentPos.x + delta.x,
    y: currentPos.y + delta.y,
  };
}

/**
 * Check if position is within board bounds
 */
export function isValidPosition(pos: Coord, boardSize: number): boolean {
  return pos.x >= 0 && pos.x < boardSize && pos.y >= 0 && pos.y < boardSize;
}

/**
 * Calculate distance between two positions
 */
export function calculateDistance(pos1: Coord, pos2: Coord): number {
  return Math.abs(pos1.x - pos2.x) + Math.abs(pos1.y - pos2.y);
}

/**
 * Generate random positions for tiles
 */
export function generateRandomPositions(count: number, boardSize: number, excludePositions: Coord[] = []): Coord[] {
  const positions: Coord[] = [];
  const usedPositions = new Set(excludePositions.map(pos => `${pos.x},${pos.y}`));
  
  while (positions.length < count) {
    const x = Math.floor(Math.random() * boardSize);
    const y = Math.floor(Math.random() * boardSize);
    const key = `${x},${y}`;
    
    if (!usedPositions.has(key)) {
      positions.push({ x, y });
      usedPositions.add(key);
    }
  }
  
  return positions;
}

/**
 * Format Sui address for display
 */
export function formatSuiAddress(address: string, length: number = 8): string {
  if (!address || address.length <= length * 2) {
    return address;
  }
  
  return `${address.slice(0, length)}...${address.slice(-length)}`;
}

/**
 * Parse Sui object response safely
 */
export function parseSuiObject<T>(object: SuiObjectResponse, parser: (fields: any) => T): T | null {
  try {
    if (object.data?.content && 'fields' in object.data.content) {
      return parser((object.data.content as any).fields);
    }
    return null;
  } catch (error) {
    console.error('Failed to parse Sui object:', error);
    return null;
  }
}

/**
 * Retry function with exponential backoff
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  let lastError: Error;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      if (i === maxRetries - 1) {
        throw lastError;
      }
      
      const delay = baseDelay * Math.pow(2, i);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError!;
}

/**
 * Convert Move struct fields to TypeScript object
 */
export function moveStructToObject(fields: any): Record<string, any> {
  const result: Record<string, any> = {};
  
  for (const [key, value] of Object.entries(fields)) {
    if (value && typeof value === 'object' && 'fields' in value) {
      result[key] = moveStructToObject((value as any).fields);
    } else {
      result[key] = value;
    }
  }
  
  return result;
}

/**
 * Validate transaction digest format
 */
export function isValidTransactionDigest(digest: string): boolean {
  return /^[A-Za-z0-9+/]{43}=$/.test(digest);
}

/**
 * Wait for transaction confirmation
 */
export async function waitForTransaction(
  client: any,
  txDigest: string,
  timeoutMs: number = 30000
): Promise<boolean> {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeoutMs) {
    try {
      const result = await client.getTransactionBlock({ digest: txDigest });
      if (result.effects?.status?.status === 'success') {
        return true;
      }
      if (result.effects?.status?.status === 'failure') {
        throw new Error('Transaction failed');
      }
    } catch (error) {
      // Continue waiting if transaction not found yet
    }
    
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  throw new Error('Transaction confirmation timeout');
}