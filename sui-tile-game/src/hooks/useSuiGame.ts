import { useState, useEffect, useRef } from "react";
import { GameState } from "../types/game";
import { useSoundEffects } from "./useSoundEffects";

// Generate random Sui tiles
function generateSuiTiles(boardSize: number, count: number = 10) {
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
}

export function useSuiGame() {
  const [state, setState] = useState<GameState>({
    boardSize: 10,
    players: [
      { id: "p1", name: "Hero", pos: { x: 0, y: 0 }, score: 0 },
      { id: "p2", name: "Villain", pos: { x: 9, y: 9 }, score: 0 },
    ],
    suiTiles: generateSuiTiles(10),
    currentTurn: "p1",
    phase: "lobby",
  });

  const turnTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [turnTimeLeft, setTurnTimeLeft] = useState(3);
  const [totalMoves, setTotalMoves] = useState(0);
  const soundEffects = useSoundEffects();
  
  // Player customization
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

  // Clear turn timer
  function clearTurnTimer() {
    if (turnTimerRef.current) {
      clearInterval(turnTimerRef.current);
      turnTimerRef.current = null;
    }
  }

  // Start turn timer (3 seconds)
  function startTurnTimer() {
    clearTurnTimer();
    setTurnTimeLeft(3);
    
    turnTimerRef.current = setInterval(() => {
      setTurnTimeLeft((prev) => {
        if (prev <= 1) {
          // Time's up - automatically pass turn
          soundEffects.warning();
          setState((gameState) => {
            if (gameState.phase !== "playing") return gameState;
            const currentPlayerIdx = gameState.players.findIndex(p => p.id === gameState.currentTurn);
            const nextTurn = gameState.players[(currentPlayerIdx + 1) % gameState.players.length].id;
            soundEffects.turnChange();
            return { ...gameState, currentTurn: nextTurn };
          });
          return 3; // Reset timer for next player
        } else if (prev <= 2) {
          soundEffects.tick(); // Countdown sound
        }
        return prev - 1;
      });
    }, 1000);
  }

  // Auto-start timer when game is playing and turn changes
  useEffect(() => {
    if (state.phase === "playing") {
      startTurnTimer();
    } else {
      clearTurnTimer();
    }
    
    return () => clearTurnTimer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.currentTurn, state.phase]);

  // Move player function
  function movePlayer(playerId: string, dir: "up" | "down" | "left" | "right") {
    let capturedTile = false;
    let gameEnded = false;
    
    setState((prev) => {
      if (prev.phase !== "playing" || prev.currentTurn !== playerId) return prev;
      const pIdx = prev.players.findIndex((p) => p.id === playerId);
      if (pIdx < 0) return prev;
      let { x, y } = prev.players[pIdx].pos;
      if (dir === "up") y -= 1;
      if (dir === "down") y += 1;
      if (dir === "left") x -= 1;
      if (dir === "right") x += 1;
      if (x < 0 || y < 0 || x >= prev.boardSize || y >= prev.boardSize) return prev;

      // Check if Sui tile is captured
      const tileAtPosition = prev.suiTiles.find(
        tile => tile.pos.x === x && tile.pos.y === y && !tile.owner
      );
      capturedTile = !!tileAtPosition;
      
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
      
      // Check if game should end (all Sui tiles captured)
      const phase =
        suiTiles.filter((t) => !t.owner).length === 0 ? "finished" : prev.phase;
      gameEnded = phase === "finished";
      
      return { ...prev, players, suiTiles, currentTurn: nextTurn, phase };
    });
    
    // Play sound effects
    soundEffects.move();
    if (capturedTile) {
      setTimeout(() => soundEffects.capture(), 100);
    }
    if (gameEnded) {
      setTimeout(() => soundEffects.gameEnd(), 300);
    } else {
      setTimeout(() => soundEffects.turnChange(), 200);
    }
    
    // Increment total moves
    setTotalMoves(prev => prev + 1);
  }

  // Start new game
  function startGame() {
    soundEffects.gameStart();
    setTotalMoves(0);
    setState((prev) => ({
      ...prev,
      players: prev.players.map(p => ({ ...p, score: 0, pos: p.id === "p1" ? { x: 0, y: 0 } : { x: 9, y: 9 } })),
      suiTiles: generateSuiTiles(prev.boardSize),
      currentTurn: "p1",
      phase: "playing"
    }));
  }

  // Reset game
  function resetGame() {
    clearTurnTimer();
    setTotalMoves(0);
    setState((prev) => ({
      ...prev,
      players: prev.players.map(p => ({ ...p, score: 0, pos: p.id === "p1" ? { x: 0, y: 0 } : { x: 9, y: 9 } })),
      suiTiles: generateSuiTiles(prev.boardSize),
      currentTurn: "p1",
      phase: "lobby"
    }));
  }

  // Customize players
  function customizePlayers(player1Config: any, player2Config: any) {
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
  }

  return { 
    state, 
    movePlayer, 
    startGame, 
    resetGame, 
    customizePlayers,
    playerConfig,
    turnTimeLeft: state.phase === "playing" ? turnTimeLeft : 3,
    totalMoves
  };
}
