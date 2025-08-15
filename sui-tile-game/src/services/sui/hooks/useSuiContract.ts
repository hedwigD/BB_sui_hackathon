/**
 * React hooks for Sui contract interactions
 */

import { useState, useCallback, useEffect } from 'react';
import { GameContract, GameObjectData } from '../contracts/gameContract';
import { TileContract, TileObjectData } from '../contracts/tileContract';
import { suiClientManager } from '../client';

export interface ContractState {
  gameData: GameObjectData | null;
  tiles: TileObjectData[];
  loading: boolean;
  error: string | null;
}

export function useSuiContract(packageId: string) {
  const [state, setState] = useState<ContractState>({
    gameData: null,
    tiles: [],
    loading: false,
    error: null,
  });

  const gameContract = new GameContract(packageId);
  const tileContract = new TileContract(packageId);

  const setLoading = useCallback((loading: boolean) => {
    setState(prev => ({ ...prev, loading }));
  }, []);

  const setError = useCallback((error: string | null) => {
    setState(prev => ({ ...prev, error }));
  }, []);

  /**
   * Create a new game
   */
  const createGame = useCallback(async (boardSize: number = 10) => {
    try {
      setLoading(true);
      setError(null);
      
      const txDigest = await gameContract.createGame(boardSize);
      console.log('Game created:', txDigest);
      
      return txDigest;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Failed to create game';
      setError(errorMsg);
      throw error;
    } finally {
      setLoading(false);
    }
  }, [gameContract]);

  /**
   * Join an existing game
   */
  const joinGame = useCallback(async (gameId: string, playerName: string) => {
    try {
      setLoading(true);
      setError(null);
      
      const txDigest = await gameContract.joinGame(gameId, playerName);
      console.log('Joined game:', txDigest);
      
      return txDigest;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Failed to join game';
      setError(errorMsg);
      throw error;
    } finally {
      setLoading(false);
    }
  }, [gameContract]);

  /**
   * Move player
   */
  const movePlayer = useCallback(async (
    gameId: string, 
    playerId: string, 
    direction: 'up' | 'down' | 'left' | 'right'
  ) => {
    try {
      setLoading(true);
      setError(null);
      
      const txDigest = await gameContract.movePlayer(gameId, playerId, direction);
      console.log('Player moved:', txDigest);
      
      return txDigest;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Failed to move player';
      setError(errorMsg);
      throw error;
    } finally {
      setLoading(false);
    }
  }, [gameContract]);

  /**
   * Capture a tile
   */
  const captureTile = useCallback(async (gameId: string, playerId: string, tileId: string) => {
    try {
      setLoading(true);
      setError(null);
      
      const txDigest = await gameContract.captureTile(gameId, playerId, tileId);
      console.log('Tile captured:', txDigest);
      
      return txDigest;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Failed to capture tile';
      setError(errorMsg);
      throw error;
    } finally {
      setLoading(false);
    }
  }, [gameContract]);

  /**
   * Refresh game state
   */
  const refreshGameState = useCallback(async (gameId: string) => {
    try {
      setLoading(true);
      setError(null);
      
      const [gameData, tiles] = await Promise.all([
        gameContract.getGameState(gameId),
        tileContract.getGameTiles(gameId),
      ]);
      
      setState(prev => ({
        ...prev,
        gameData,
        tiles,
      }));
      
      return { gameData, tiles };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Failed to refresh game state';
      setError(errorMsg);
      throw error;
    } finally {
      setLoading(false);
    }
  }, [gameContract, tileContract]);

  /**
   * Subscribe to game events
   */
  const subscribeToEvents = useCallback(async (gameId: string) => {
    try {
      return await gameContract.subscribeToGameEvents(gameId, (event) => {
        console.log('Game event received:', event);
        // Auto-refresh state when events are received
        refreshGameState(gameId);
      });
    } catch (error) {
      console.error('Failed to subscribe to events:', error);
    }
  }, [gameContract, refreshGameState]);

  /**
   * Check network connection
   */
  const checkConnection = useCallback(async () => {
    try {
      setLoading(true);
      const isConnected = await suiClientManager.checkConnection();
      
      if (!isConnected) {
        setError('Failed to connect to Sui network');
      }
      
      return isConnected;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Network connection failed';
      setError(errorMsg);
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    ...state,
    actions: {
      createGame,
      joinGame,
      movePlayer,
      captureTile,
      refreshGameState,
      subscribeToEvents,
      checkConnection,
    },
    contracts: {
      game: gameContract,
      tile: tileContract,
    },
  };
}