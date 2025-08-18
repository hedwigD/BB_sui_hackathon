import { useState, useEffect, useCallback } from 'react';
import { useWallet } from '@suiet/wallet-kit';
import { GameState, MoveCap, TURN_TIMEOUT_MS } from '../types/game';
import { SUI_CLIENT, PACKAGE_ID, fetchGame, fetchMoveCap, parseGameContent, parseMoveCapContent } from '../utils/sui';

export function useGameState(gameId: string | null) {
  const { account } = useWallet();
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [moveCap, setMoveCap] = useState<MoveCap | null>(null);
  const [myIndex, setMyIndex] = useState<number | null>(null);
  const [timeRemaining, setTimeRemaining] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Calculate my player index
  useEffect(() => {
    if (gameState && account?.address) {
      const index = gameState.players.findIndex(p => p === account.address);
      setMyIndex(index >= 0 ? index : null);
    } else {
      setMyIndex(null);
    }
  }, [gameState, account]);

  // Timer for turn timeout
  useEffect(() => {
    if (!gameState || gameState.status !== 1) {
      setTimeRemaining(0);
      return;
    }

    const interval = setInterval(() => {
      const now = Date.now();
      const elapsed = now - gameState.turnStartTime;
      const remaining = Math.max(0, TURN_TIMEOUT_MS - elapsed);
      setTimeRemaining(remaining);
    }, 100);

    return () => clearInterval(interval);
  }, [gameState]);

  // Fetch game state
  const refreshGameState = useCallback(async () => {
    if (!gameId) return;
    
    try {
      setIsLoading(true);
      const gameObject = await fetchGame(gameId);
      
      if (gameObject.data?.content) {
        const parsed = parseGameContent(gameObject.data.content);
        setGameState(parsed);
      }
    } catch (err) {
      setError(`Failed to fetch game: ${err}`);
    } finally {
      setIsLoading(false);
    }
  }, [gameId]);

  // Fetch move cap
  const refreshMoveCap = useCallback(async (moveCapId: string) => {
    try {
      const moveCapObject = await fetchMoveCap(moveCapId);
      
      if (moveCapObject.data?.content) {
        const parsed = parseMoveCapContent(moveCapObject.data.content);
        setMoveCap(parsed);
      }
    } catch (err) {
      setError(`Failed to fetch move cap: ${err}`);
    }
  }, []);

  // Subscribe to events
  useEffect(() => {
    if (!gameId || !PACKAGE_ID) return;

    const subscription = SUI_CLIENT.subscribeEvent({
      filter: { 
        MoveModule: { 
          package: PACKAGE_ID, 
          module: 'tile_game_core' 
        } 
      },
      onMessage: (event) => {
        const eventType = event.type;
        const data = event.parsedJson as any;

        // Only process events for our game
        if (data.game_id !== gameId) return;

        if (eventType.endsWith('PlayerMoved') || eventType.endsWith('PlayerAutoMoved')) {
          // Update position and reset timer
          setGameState(prev => {
            if (!prev) return prev;
            const newPositions = [...prev.playersPositions];
            newPositions[data.player_index] = data.to_pos;
            
            return {
              ...prev,
              playersPositions: newPositions,
              turnStartTime: Date.now(), // Reset timer
            };
          });
        } else if (eventType.endsWith('TileCaptured')) {
          // Update score and tiles remaining
          setGameState(prev => {
            if (!prev) return prev;
            const newScores = [...prev.playersScores];
            newScores[data.player_index] = data.new_score;
            
            return {
              ...prev,
              playersScores: newScores,
              tilesRemaining: prev.tilesRemaining - 1,
            };
          });
        } else if (eventType.endsWith('TurnChanged')) {
          setGameState(prev => {
            if (!prev) return prev;
            return {
              ...prev,
              currentTurn: data.turn_index,
              turnStartTime: Date.now(),
            };
          });
        } else if (eventType.endsWith('GameFinished')) {
          setGameState(prev => {
            if (!prev) return prev;
            return {
              ...prev,
              status: 2,
              winner: data.winner,
            };
          });
        }
      }
    });

    return () => {
      subscription.then(unsub => unsub());
    };
  }, [gameId]);

  // Initial fetch
  useEffect(() => {
    if (gameId) {
      refreshGameState();
    }
  }, [gameId, refreshGameState]);

  const isMyTurn = gameState && myIndex !== null && gameState.currentTurn === myIndex;
  const canForceTimeout = gameState && myIndex !== null && 
    gameState.currentTurn !== myIndex && timeRemaining <= 0;

  return {
    gameState,
    moveCap,
    myIndex,
    timeRemaining,
    error,
    isLoading,
    isMyTurn,
    canForceTimeout,
    refreshGameState,
    refreshMoveCap,
    setError,
  };
}