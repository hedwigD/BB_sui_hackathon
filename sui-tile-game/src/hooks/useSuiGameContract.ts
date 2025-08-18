/**
 * Enhanced Sui Game Hook - Integrates real blockchain functionality
 */

import { useState, useEffect, useCallback } from "react";
import { GameState } from "../types/game";
import { useSoundEffects } from "./useSoundEffects";
import { useSuiContract, useWallet } from "../services/sui";

// Enhanced game state with blockchain integration
interface EnhancedGameState extends GameState {
  gameId?: string;
  playerIds?: { [playerId: string]: string }; // Map local player IDs to blockchain object IDs
  connected: boolean;
  networkError?: string;
}

export function useSuiGameContract() {
  const [state, setState] = useState<EnhancedGameState>({
    boardSize: 10,
    players: [
      { id: "p1", name: "Hero", pos: { x: 0, y: 0 }, score: 0 },
      { id: "p2", name: "Villain", pos: { x: 9, y: 9 }, score: 0 },
    ],
    suiTiles: [],
    currentTurn: "p1",
    phase: "lobby",
    connected: false,
    playerIds: {},
  });

  const [playerConfig, setPlayerConfig] = useState({
    p1: { 
      avatar: "🦸‍♂️", 
      name: "Hero", 
      bgGradient: "from-blue-400 to-blue-600",
      borderColor: "border-blue-500",
      glowColor: "shadow-blue-500/50"
    },
    p2: { 
      avatar: "🦹‍♀️", 
      name: "Villain", 
      bgGradient: "from-red-400 to-red-600",
      borderColor: "border-red-500",
      glowColor: "shadow-red-500/50"
    }
  });

  const [turnTimeLeft, setTurnTimeLeft] = useState(3);
  const [totalMoves, setTotalMoves] = useState(0);
  const soundEffects = useSoundEffects();
  
  // Wallet and contract integration
  const wallet = useWallet();
  const contract = useSuiContract(process.env.REACT_APP_SUI_PACKAGE_ID || 'YOUR_PACKAGE_ID');

  // Check wallet connection
  useEffect(() => {
    setState(prev => ({
      ...prev,
      connected: wallet.connected,
      networkError: wallet.error || contract.error || undefined,
    }));
  }, [wallet.connected, wallet.error, contract.error]);

  /**
   * Connect to wallet
   */
  const connectWallet = useCallback(async () => {
    try {
      await wallet.connect();
      soundEffects.buttonClick();
    } catch (error) {
      console.error('Failed to connect wallet:', error);
      soundEffects.warning();
    }
  }, [wallet, soundEffects]);

  /**
   * Create a new game on blockchain
   */
  const createBlockchainGame = useCallback(async () => {
    if (!wallet.connected) {
      throw new Error('Wallet not connected');
    }

    try {
      const txDigest = await contract.actions.createGame(state.boardSize);
      console.log('Game created on blockchain:', txDigest);
      
      // In a real implementation, you'd get the game ID from the transaction result
      const gameId = 'game_' + Date.now(); // Placeholder
      
      setState(prev => ({
        ...prev,
        gameId,
        phase: 'playing',
      }));
      
      return gameId;
    } catch (error) {
      console.error('Failed to create blockchain game:', error);
      throw error;
    }
  }, [wallet.connected, contract.actions, state.boardSize]);

  /**
   * Move player on blockchain
   */
  const movePlayerOnChain = useCallback(async (
    playerId: string, 
    direction: "up" | "down" | "left" | "right"
  ) => {
    if (!state.gameId || !state.playerIds?.[playerId]) {
      // Fallback to local simulation
      return movePlayerLocal(playerId, direction);
    }

    try {
      const blockchainPlayerId = state.playerIds[playerId];
      const txDigest = await contract.actions.movePlayer(
        state.gameId, 
        blockchainPlayerId, 
        direction
      );
      
      console.log('Player moved on blockchain:', txDigest);
      
      // Refresh game state from blockchain
      await refreshFromBlockchain();
      
      soundEffects.move();
      setTotalMoves(prev => prev + 1);
      
    } catch (error) {
      console.error('Blockchain move failed, falling back to local:', error);
      movePlayerLocal(playerId, direction);
    }
  }, [state.gameId, state.playerIds, contract.actions, soundEffects]);

  /**
   * Local fallback move function
   */
  const movePlayerLocal = useCallback((
    playerId: string, 
    direction: "up" | "down" | "left" | "right"
  ) => {
    setState((prev) => {
      if (prev.phase !== "playing" || prev.currentTurn !== playerId) return prev;
      
      const pIdx = prev.players.findIndex((p) => p.id === playerId);
      if (pIdx < 0) return prev;
      
      let { x, y } = prev.players[pIdx].pos;
      if (direction === "up") y -= 1;
      if (direction === "down") y += 1;
      if (direction === "left") x -= 1;
      if (direction === "right") x += 1;
      
      if (x < 0 || y < 0 || x >= prev.boardSize || y >= prev.boardSize) return prev;

      // Check if Sui tile is captured
      const tileAtPosition = prev.suiTiles.find(
        tile => tile.pos.x === x && tile.pos.y === y && !tile.owner
      );
      
      let suiTiles = prev.suiTiles.map((tile) =>
        tile.pos.x === x && tile.pos.y === y && !tile.owner
          ? { ...tile, owner: playerId }
          : tile
      );
      
      // Update player position and score
      const players = prev.players.map((p, idx) =>
        idx === pIdx
          ? {
              ...p,
              pos: { x, y },
              score: tileAtPosition ? p.score + 1 : p.score,
            }
          : p
      );
      
      // Switch turns
      const nextTurn = prev.players[(pIdx + 1) % prev.players.length].id;
      
      // Check if game should end
      const phase =
        suiTiles.filter((t) => !t.owner).length === 0 ? "finished" : prev.phase;
      
      return { ...prev, players, suiTiles, currentTurn: nextTurn, phase };
    });
    
    soundEffects.move();
    setTotalMoves(prev => prev + 1);
  }, [soundEffects]);

  /**
   * Refresh game state from blockchain
   */
  const refreshFromBlockchain = useCallback(async () => {
    if (!state.gameId) return;

    try {
      const { gameData, tiles } = await contract.actions.refreshGameState(state.gameId);
      
      if (gameData) {
        // Convert blockchain data to local state format
        setState(prev => ({
          ...prev,
          // Map blockchain data to local format
          currentTurn: gameData.players[gameData.currentTurn] || prev.currentTurn,
          phase: gameData.gameStatus as any,
          suiTiles: tiles.map(tile => ({
            id: tile.id,
            pos: tile.position,
            owner: tile.owner,
          })),
        }));
      }
    } catch (error) {
      console.error('Failed to refresh from blockchain:', error);
    }
  }, [state.gameId, contract.actions]);

  /**
   * Generate random Sui tiles (fallback)
   */
  const generateSuiTiles = useCallback((boardSize: number, count: number = 10) => {
    const tiles = [];
    const usedPositions = new Set<string>();
    
    // Reserve corners for players
    usedPositions.add("0,0");
    usedPositions.add(`${boardSize-1},${boardSize-1}`);
    
    for (let i = 0; i < count; i++) {
      let x, y;
      do {
        x = Math.floor(Math.random() * boardSize);
        y = Math.floor(Math.random() * boardSize);
      } while (usedPositions.has(`${x},${y}`));
      
      usedPositions.add(`${x},${y}`);
      tiles.push({ id: `sui${i + 1}`, pos: { x, y } });
    }
    return tiles;
  }, []);

  /**
   * Start new game (hybrid blockchain/local)
   */
  const startGame = useCallback(async () => {
    soundEffects.gameStart();
    setTotalMoves(0);
    
    if (wallet.connected) {
      try {
        await createBlockchainGame();
        return; // Success - blockchain game created
      } catch (error) {
        console.error('Blockchain game creation failed, starting local game:', error);
      }
    }
    
    // Fallback to local game
    setState((prev) => ({
      ...prev,
      players: prev.players.map(p => ({ 
        ...p, 
        score: 0, 
        pos: p.id === "p1" ? { x: 0, y: 0 } : { x: 9, y: 9 } 
      })),
      suiTiles: generateSuiTiles(prev.boardSize),
      currentTurn: "p1",
      phase: "playing"
    }));
  }, [soundEffects, wallet.connected, createBlockchainGame, generateSuiTiles]);

  /**
   * Reset game
   */
  const resetGame = useCallback(() => {
    setTotalMoves(0);
    setState((prev) => ({
      ...prev,
      gameId: undefined,
      playerIds: {},
      players: prev.players.map(p => ({ 
        ...p, 
        score: 0, 
        pos: p.id === "p1" ? { x: 0, y: 0 } : { x: 9, y: 9 } 
      })),
      suiTiles: generateSuiTiles(prev.boardSize),
      currentTurn: "p1",
      phase: "lobby"
    }));
  }, [generateSuiTiles]);

  /**
   * Customize players
   */
  const customizePlayers = useCallback((player1Config: any, player2Config: any) => {
    setPlayerConfig({
      p1: { ...player1Config },
      p2: { ...player2Config }
    });
    
    setState(prev => ({
      ...prev,
      players: [
        { ...prev.players[0], name: player1Config.name },
        { ...prev.players[1], name: player2Config.name }
      ]
    }));
  }, []);

  return {
    state,
    movePlayer: movePlayerOnChain,
    startGame,
    resetGame,
    customizePlayers,
    playerConfig,
    turnTimeLeft: state.phase === "playing" ? turnTimeLeft : 3,
    totalMoves,
    
    // Blockchain specific features
    wallet: {
      ...wallet,
      connect: connectWallet,
    },
    contract: {
      loading: contract.loading,
      error: contract.error,
      refreshFromBlockchain,
    },
  };
}