import React, { useState, useEffect } from 'react';
import { useCurrentAccount, ConnectButton, useSignAndExecuteTransaction, useSuiClient } from '@mysten/dapp-kit';
import { Transaction } from '@mysten/sui/transactions';

// --- Sui 관련 헬퍼/상수/유틸 임포트 (실제 경로에 맞게 조정) ---
import {
  REGISTRY_ID,
  BOARD_SIZE,
  createGame,
  joinGame,
  chooseStart,
  startGame,
  moveWithCap,
  forceTimeoutMove,
  getParsedGame,
  getTileDetails,
  pollGame,
  ParsedGame,
  ParsedTile,
  extractGameIdFromEffects,
  extractMoveCapIdFromEffects,
  extractGameIdFromObjectChanges,
  extractGameIdFromEvents,
  checkDeployedObjects,
} from './sui-helpers';

// --- 트랜잭션 결과에서 objectChanges, events, effects 추출 ---
const extractTxInfo = async (result: any, suiClient: any): Promise<{
  objectChanges?: any,
  events?: any,
  effects?: any,
}> => {
  if (!result) return {};
  let effects = result.effects;
  let objectChanges = effects?.objectChanges;
  let events = effects?.events;

  if (!objectChanges || !events) {
    try {
      const fullTx = await suiClient.waitForTransaction({
        digest: result.digest,
        options: {
          showEffects: true,
          showEvents: true,
          showObjectChanges: true,
        },
      });
      objectChanges = fullTx.objectChanges;
      events = fullTx.events as any;
      effects = fullTx.effects;
    } catch (e) {
      console.warn('[DEBUG] Failed to fetch full transaction:', e);
    }
  }
  return { objectChanges, events, effects };
};

const TileGameFrontend: React.FC = () => {
  // dapp-kit hooks
  const account = useCurrentAccount();
  const client = useSuiClient();
  const { mutateAsync: signAndExecuteTransaction } = useSignAndExecuteTransaction();

  // 상태 관리
  const [gameId, setGameId] = useState<string | null>(null);
  const [moveCapId, setMoveCapId] = useState<string | null>(null);
  const [parsedGame, setParsedGame] = useState<ParsedGame | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [joinGameIdInput, setJoinGameIdInput] = useState('');
  const [selectedPosition, setSelectedPosition] = useState<{x: number, y: number} | null>(null);
  const [tiles, setTiles] = useState<ParsedTile[]>([]);

  // Polling
  useEffect(() => {
    if (!gameId) return;
    const stopPoll = pollGame(client, gameId, (updatedGame) => {
      setParsedGame(updatedGame);
      if (updatedGame?.status === 2 && !moveCapId && account?.address) {
        setTimeout(() => {
          findPlayerMoveCap();
        }, 1000);
      }
    }, 2000, { immediate: true });
    return () => stopPoll();
  }, [gameId, moveCapId, account?.address]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!parsedGame || parsedGame.status !== 2 || !moveCapId || !gameId) return;
      let direction: number | null = null;
      switch (e.key.toLowerCase()) {
        case 'w':
        case 'arrowup': direction = 0; break;
        case 'd':
        case 'arrowright': direction = 1; break;
        case 's':
        case 'arrowdown': direction = 2; break;
        case 'a':
        case 'arrowleft': direction = 3; break;
      }
      if (direction !== null) handleMove(direction);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [parsedGame, moveCapId, gameId]);

  useEffect(() => {
    if (parsedGame?.tilePositions && parsedGame.tilePositions.length > 0) {
      fetchTiles();
    }
  }, [parsedGame?.tilePositions]);

  // dapp-kit 기반 트랜잭션 실행
  const executeTx = async (tx: Transaction) => {
    setLoading(true);
    setError(null);
    try {
      tx.setGasBudget(1_000_000_000);
      tx.setSender(account?.address || '');
      const result = await signAndExecuteTransaction({
        transaction: tx,
        account: account ?? undefined,
      });
      return result;
    } catch (err) {
      setError(`Transaction failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
      return null;
    } finally {
      setLoading(false);
    }
  };

  // --- 게임 생성 핸들러 ---
  const handleCreateGame = async () => {
    if (!account?.address) {
      setError('지갑 연결이 필요합니다.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const tx = createGame(REGISTRY_ID);
      const result = await executeTx(tx);

      if (result) {
        const { objectChanges, events, effects } = await extractTxInfo(result, client);

        let newGameId = null;
        if (objectChanges) newGameId = extractGameIdFromObjectChanges(objectChanges);
        if (!newGameId && events) newGameId = extractGameIdFromEvents(events);
        if (!newGameId && typeof effects === 'object') newGameId = extractGameIdFromEffects(effects);

        if (newGameId) {
          setGameId(newGameId);

          // ✅ [추가] 바로 joinGame() 실행
          const joinTx = joinGame(newGameId, '');
          const joinResult = await executeTx(joinTx);

          if (!joinResult) {
            setError('게임 생성은 성공했지만 참가에 실패했습니다.');
          }
        }

        else setError('게임 ID 추출 실패. 콘솔을 확인하세요.');
      }
    } catch (err) {
      setError(`게임 생성 실패: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  // --- 게임 참가 핸들러 ---
  const handleJoinGame = async () => {
    if (!joinGameIdInput) {
      setError('Please enter a game ID.');
      return;
    }
    if (!account?.address) {
      setError('Please connect your wallet first.');
      return;
    }
    try {
      const gameState = await getParsedGame(client, joinGameIdInput);
      if (!gameState) {
        setError('Game not found.');
        return;
      }
      if (gameState.status !== 0) {
        setError(`Game is not joinable. Current status: ${gameState.status}`);
        return;
      }
      const balance = await client.getBalance({
        owner: account.address,
        coinType: '0x2::sui::SUI'
      });
      const balanceInSui = Number(balance.totalBalance) / 1_000_000_000;
      if (balanceInSui < 0.1) {
        setError(`Insufficient SUI. (Need at least 0.1 SUI, current: ${balanceInSui.toFixed(4)} SUI)`);
        return;
      }
      const tx = joinGame(joinGameIdInput, "");
      const result = await executeTx(tx);

      if (result) {
        const { objectChanges, events, effects } = await extractTxInfo(result, client);

        let joinedGameId = null;
        if (objectChanges) joinedGameId = extractGameIdFromObjectChanges(objectChanges);
        if (!joinedGameId && events) joinedGameId = extractGameIdFromEvents(events);
        if (!joinedGameId && typeof effects === 'object') joinedGameId = extractGameIdFromEffects(effects);

        if (joinedGameId) setGameId(joinedGameId);
        else setGameId(joinGameIdInput); // fallback
      }
    } catch (err) {
      setError(`Failed to join game: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  // --- 게임 시작 핸들러 ---
  const handleStartGame = async () => {
    if (!gameId || !account?.address) {
      setError('Wallet connection and game ID required');
      return;
    }
    try {
      const tx = startGame(gameId);
      const result = await executeTx(tx);

      if (result) {
        const { objectChanges, effects } = await extractTxInfo(result, client);

        let newMoveCapId = null;
        if (objectChanges) {
          for (const change of objectChanges) {
            if (change.type === 'created' && change.objectType?.includes('MoveCap')) {
              newMoveCapId = change.objectId;
              break;
            }
          }
        }
        if (!newMoveCapId && typeof effects === 'object') {
          newMoveCapId = extractMoveCapIdFromEffects(effects);
        }
        if (newMoveCapId) {
          setMoveCapId(newMoveCapId);
        } else {
          setTimeout(async () => {
            await findPlayerMoveCap();
          }, 2000);
        }
      }
    } catch (err) {
      setError(`Failed to start game: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  // --- 말 이동 핸들러 ---
  const handleMove = async (direction: number) => {
    if (!gameId || !moveCapId) {
      setError('Game ID or MoveCap ID required');
      return;
    }
    const tx = moveWithCap(gameId, moveCapId, direction);
    await executeTx(tx);
  };

  // --- 강제 타임아웃 핸들러 ---
  const handleForceTimeout = async () => {
    if (!gameId) {
      setError('Game ID required');
      return;
    }
    const tx = forceTimeoutMove(gameId);
    await executeTx(tx);
  };

  // --- 시작 위치 선택 핸들러 ---
  const handleChooseStart = async () => {
    if (!gameId || !selectedPosition || !account?.address) {
      setError('Game ID, selected position, and wallet connection required.');
      return;
    }
    try {
      const tx = chooseStart(gameId, selectedPosition.x, selectedPosition.y);
      const result = await executeTx(tx);

      if (result) {
        await extractTxInfo(result, client);
        setSelectedPosition(null);
      }
    } catch (err) {
      setError(`Failed to choose start position: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  // --- Find MoveCap in player's owned objects ---
  const findPlayerMoveCap = async () => {
    if (!account?.address || !gameId) return;

    try {
      const ownedObjects = await client.getOwnedObjects({
        owner: account.address,
        options: {
          showContent: true,
          showType: true,
        },
      });

      for (const obj of ownedObjects.data) {
        const objectType = obj.data?.type;
        if (objectType && objectType.includes('MoveCap')) {
          const content = obj.data?.content;
          if (content && content.dataType === 'moveObject' && content.fields && obj.data) {
            const gameId_field = (content.fields as any).game_id;
            if (gameId_field === gameId) {
              const moveCapId = obj.data.objectId;
              setMoveCapId(moveCapId);
              return;
            }
          }
        }
      }
    } catch (err) {
      console.error('[DEBUG] Error finding MoveCap:', err);
    }
  };

  // --- Fetch tile details ---
  const fetchTiles = async () => {
    if (!gameId || !parsedGame?.tilePositions) return;
    try {
      const tileDetails = await getTileDetails(client, gameId, parsedGame.tilePositions);
      setTiles(tileDetails);
    } catch (err) {
      console.error('[DEBUG] Error fetching tiles:', err);
    }
  };


  // Helper functions for rendering the board
  const getTileInfo = (x: number, y: number) => {
    return tiles.find(tile => tile.position.x === x && tile.position.y === y);
  };

  const getPlayerAtPosition = (x: number, y: number) => {
    if (!parsedGame?.playersPositions) return -1;
    return parsedGame.playersPositions.findIndex(pos => pos.x === x && pos.y === y);
  };

  const handleCellClick = (x: number, y: number) => {
    if (isPlacement && account?.address) {
      setSelectedPosition({ x, y });
    }
  };

  const handleRefreshGame = async () => {
    if (!gameId) return;
    try {
      const updated = await getParsedGame(client, gameId);
      if (updated) {
        setParsedGame(updated);
      }
    } catch (err) {
      console.error('Failed to refresh game:', err);
    }
  };

  const createBoard = () => {
    const board = [];
    for (let y = 0; y < BOARD_SIZE; y++) {
      const row = [];
      for (let x = 0; x < BOARD_SIZE; x++) {
        const tileInfo = getTileInfo(x, y);
        const playerIndex = getPlayerAtPosition(x, y);
        
        if (playerIndex >= 0) {
          row.push(`P${playerIndex + 1}`);
        } else if (tileInfo) {
          row.push('SUI_LOGO');
        } else {
          row.push('');
        }
      }
      board.push(row);
    }
    return board;
  };

  const renderBoard = () => {
    const board = createBoard();
    
    return (
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: `repeat(${BOARD_SIZE}, 50px)`, 
        gap: '2px',
        padding: '20px',
        background: 'rgba(0,0,0,0.3)',
        borderRadius: '15px',
        border: '2px solid rgba(255,255,255,0.2)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.3)'
      }}>
        {board.flat().map((cell, idx) => {
          const x = idx % BOARD_SIZE;
          const y = Math.floor(idx / BOARD_SIZE);
          const isSelected = selectedPosition?.x === x && selectedPosition?.y === y;
          const isClickable = isPlacement && account?.address;
          const tileInfo = getTileInfo(x, y);
          const playerIndex = getPlayerAtPosition(x, y);
          
          let bgColor = 'rgba(255,255,255,0.1)';
          let borderColor = 'rgba(255,255,255,0.2)';
          let textColor = '#fff';
          let fontSize = '14px';
          let fontWeight = 'normal';
          
          if (isSelected) {
            bgColor = 'rgba(255, 230, 102, 0.4)';
            borderColor = '#FFE066';
            textColor = '#FFE066';
          } else if (playerIndex >= 0) {
            bgColor = playerIndex === 0 ? 'rgba(255, 107, 107, 0.4)' : 'rgba(78, 205, 196, 0.4)';
            borderColor = playerIndex === 0 ? '#FF6B6B' : '#4ECDC4';
            textColor = playerIndex === 0 ? '#FF6B6B' : '#4ECDC4';
            fontSize = '16px';
            fontWeight = 'bold';
          } else if (tileInfo) {
            if (tileInfo.claimed) {
              bgColor = 'rgba(244, 67, 54, 0.3)';
              borderColor = '#F44336';
              textColor = '#FFCDD2';
            } else {
              bgColor = 'rgba(96, 165, 250, 0.2)'; // Blue background for SUI logo
              borderColor = '#60A5FA';
              textColor = '#FFF8E1';
              fontSize = '18px';
            }
          } else if (isClickable) {
            bgColor = 'rgba(255,255,255,0.15)';
            borderColor = 'rgba(255,255,255,0.3)';
          }
          
          return (
            <div 
              key={idx} 
              onClick={() => handleCellClick(x, y)}
              title={tileInfo ? `Tile at (${x},${y}): ${tileInfo.value/1000000000} SUI ${tileInfo.claimed ? '(Claimed)' : '(Available)'}` : `Position (${x},${y})`}
              style={{ 
                width: '50px', 
                height: '50px', 
                border: `2px solid ${borderColor}`,
                borderRadius: '8px',
                textAlign: 'center',
                backgroundColor: bgColor,
                cursor: isClickable ? 'pointer' : 'default',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize,
                fontWeight,
                color: textColor,
                transition: 'all 0.3s ease',
                backdropFilter: 'blur(5px)',
                position: 'relative',
                overflow: 'hidden'
              }}
              onMouseEnter={(e) => {
                if (isClickable) {
                  e.currentTarget.style.transform = 'scale(1.05)';
                  e.currentTarget.style.boxShadow = '0 4px 15px rgba(255,255,255,0.2)';
                }
              }}
              onMouseLeave={(e) => {
                if (isClickable) {
                  e.currentTarget.style.transform = 'scale(1)';
                  e.currentTarget.style.boxShadow = 'none';
                }
              }}
            >
              {/* Grid coordinates overlay */}
              <div style={{
                position: 'absolute',
                top: '2px',
                left: '2px',
                fontSize: '8px',
                color: 'rgba(255,255,255,0.3)',
                fontFamily: 'monospace'
              }}>
                {x},{y}
              </div>
              
              {/* Cell content */}
              <div style={{ zIndex: 1 }}>
                {cell === 'SUI_LOGO' ? (
                  <img 
                    src="/sui-logo.png" 
                    alt="SUI Token"
                    style={{
                      width: '30px',
                      height: '30px',
                      objectFit: 'contain'
                    }}
                  />
                ) : (
                  cell
                )}
              </div>
              
              {/* Selection indicator */}
              {isSelected && (
                <div style={{
                  position: 'absolute',
                  inset: '0',
                  border: '3px solid #FFE066',
                  borderRadius: '6px',
                  background: 'rgba(255, 230, 102, 0.1)',
                  zIndex: 0,
                  animation: 'pulse 2s infinite'
                }} />
              )}
            </div>
          );
        })}
      </div>
    );
  };

// Game state helpers (방어적 리팩터링)
const isWaiting = parsedGame?.status === 0;
const isPlacement = parsedGame?.status === 1;
const isPlaying = parsedGame?.status === 2;
const isEnded =
  parsedGame?.status === 3 ||
  (typeof parsedGame?.tilesRemaining === 'number' && parsedGame.tilesRemaining === 0) ||
  (!!parsedGame?.winner && typeof parsedGame.winner === 'string' && parsedGame.winner !== '');

const hasPlacedArr: boolean[] = Array.isArray(parsedGame?.hasPlaced)
  ? parsedGame?.hasPlaced.map(Boolean) || []
  : [];

const bothPlayersPlaced =
  hasPlacedArr.length >= 2 &&
  hasPlacedArr[0] === true &&
  hasPlacedArr[1] === true;

const canStart =
  isPlacement &&
  Array.isArray(parsedGame?.players) &&
  parsedGame.players.length >= 2 &&
  bothPlayersPlaced;

  return (
    <div style={{ 
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      color: '#fff',
      fontFamily: 'system-ui, -apple-system, sans-serif'
    }}>
      <div style={{ 
        maxWidth: '1200px', 
        margin: '0 auto', 
        padding: '20px'
      }}>
        <div style={{
          textAlign: 'center',
          marginBottom: '40px'
        }}>
          <h1 style={{
            fontSize: '3rem',
            fontWeight: 'bold',
            background: 'linear-gradient(45deg, #FFE066, #FF6B6B)',
            backgroundClip: 'text',
            WebkitBackgroundClip: 'text',
            color: 'transparent',
            textShadow: '0 4px 8px rgba(0,0,0,0.3)',
            margin: '0 0 20px 0'
          }}>🎮 Sui Tile Game</h1>
          <div style={{
            display: 'inline-block',
            padding: '10px 20px',
            background: 'rgba(255,255,255,0.1)',
            borderRadius: '25px',
            backdropFilter: 'blur(10px)',
            border: '1px solid rgba(255,255,255,0.2)'
          }}>
            <ConnectButton />
          </div>
        </div>

        {account && (
          <>
            {!gameId ? (
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '30px'
              }}>
                <div style={{
                  background: 'rgba(255,255,255,0.1)',
                  padding: '40px',
                  borderRadius: '20px',
                  backdropFilter: 'blur(10px)',
                  border: '1px solid rgba(255,255,255,0.2)',
                  textAlign: 'center',
                  maxWidth: '500px',
                  width: '100%'
                }}>
                  <h2 style={{
                    fontSize: '1.8rem',
                    marginBottom: '30px',
                    color: '#fff'
                  }}>🚀 Start Your Game</h2>
                  
                  <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '20px'
                  }}>
                    <button 
                      onClick={handleCreateGame} 
                      disabled={loading}
                      style={{
                        padding: '15px 30px',
                        fontSize: '1.1rem',
                        background: 'linear-gradient(45deg, #4CAF50, #45a049)',
                        color: 'white',
                        border: 'none',
                        borderRadius: '12px',
                        cursor: loading ? 'not-allowed' : 'pointer',
                        transition: 'all 0.3s ease',
                        opacity: loading ? 0.7 : 1,
                        boxShadow: '0 4px 15px rgba(76, 175, 80, 0.3)'
                      }}
                    >
                      ✨ Create New Game
                    </button>
                    
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      margin: '10px 0'
                    }}>
                      <div style={{
                        flex: 1,
                        height: '1px',
                        background: 'rgba(255,255,255,0.3)'
                      }}></div>
                      <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.9rem' }}>or</span>
                      <div style={{
                        flex: 1,
                        height: '1px',
                        background: 'rgba(255,255,255,0.3)'
                      }}></div>
                    </div>
                    
                    <div style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '15px'
                    }}>
                      <input
                        type="text"
                        placeholder="Enter Game ID to join..."
                        value={joinGameIdInput}
                        onChange={(e) => setJoinGameIdInput(e.target.value)}
                        style={{
                          padding: '15px 20px',
                          fontSize: '1rem',
                          border: '2px solid rgba(255,255,255,0.3)',
                          borderRadius: '12px',
                          background: 'rgba(255,255,255,0.1)',
                          color: '#fff',
                          outline: 'none',
                          transition: 'all 0.3s ease'
                        }}
                      />
                      <button 
                        onClick={handleJoinGame} 
                        disabled={loading || !joinGameIdInput}
                        style={{
                          padding: '15px 30px',
                          fontSize: '1.1rem',
                          background: 'linear-gradient(45deg, #2196F3, #1976D2)',
                          color: 'white',
                          border: 'none',
                          borderRadius: '12px',
                          cursor: (loading || !joinGameIdInput) ? 'not-allowed' : 'pointer',
                          transition: 'all 0.3s ease',
                          opacity: (loading || !joinGameIdInput) ? 0.5 : 1,
                          boxShadow: '0 4px 15px rgba(33, 150, 243, 0.3)'
                        }}
                      >
                        🎯 Join Game (0.05 SUI)
                      </button>
                    </div>
                    
                    <button 
                      onClick={() => checkDeployedObjects(client)}
                      style={{
                        padding: '10px 20px',
                        fontSize: '0.9rem',
                        background: 'transparent',
                        color: 'rgba(255,255,255,0.7)',
                        border: '1px solid rgba(255,255,255,0.3)',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        transition: 'all 0.3s ease',
                        marginTop: '10px'
                      }}
                    >
                      🔍 Debug: Check Deployed Objects
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 2fr 1fr',
                  gap: '30px',
                  alignItems: 'start'
                }} className="game-grid">
                  {/* Left Panel - Game Info */}
                  <div style={{
                    background: 'rgba(255,255,255,0.1)',
                    padding: '25px',
                    borderRadius: '15px',
                    backdropFilter: 'blur(10px)',
                    border: '1px solid rgba(255,255,255,0.2)'
                  }}>
                    <h2 style={{
                      fontSize: '1.4rem',
                      marginBottom: '20px',
                      color: '#FFE066',
                      textAlign: 'center'
                    }}>🎲 Game Info</h2>
                    
                    <div style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '15px'
                    }}>
                      <div style={{
                        background: 'rgba(255,255,255,0.1)',
                        padding: '15px',
                        borderRadius: '10px',
                        border: '1px solid rgba(255,255,255,0.2)'
                      }}>
                        <div style={{ fontSize: '0.9rem', color: 'rgba(255,255,255,0.7)', marginBottom: '5px' }}>Game ID</div>
                        <div style={{ fontFamily: 'monospace', fontSize: '0.8rem', wordBreak: 'break-all', color: '#FFE066' }}>
                          {gameId}
                        </div>
                      </div>
                      
                      <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        background: 'rgba(255,255,255,0.1)',
                        padding: '15px',
                        borderRadius: '10px'
                      }}>
                        <span>👥 Players:</span>
                        <span style={{ fontWeight: 'bold', fontSize: '1.2rem' }}>{parsedGame?.players.length || 0}/2</span>
                      </div>
                      
                      <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        background: 'rgba(255,255,255,0.1)',
                        padding: '15px',
                        borderRadius: '10px'
                      }}>
                        <span>🎩 Status:</span>
                        <span style={{ 
                          fontWeight: 'bold',
                          color: parsedGame?.status === 0 ? '#FFE066' : 
                                parsedGame?.status === 1 ? '#FF9800' : 
                                parsedGame?.status === 2 ? '#4CAF50' : '#F44336'
                        }}>
                          {parsedGame?.status === 0 ? 'Lobby' : 
                           parsedGame?.status === 1 ? 'Placement' : 
                           parsedGame?.status === 2 ? 'Playing' : 'Finished'}
                        </span>
                      </div>
                      
                      <button 
                        onClick={handleRefreshGame} 
                        disabled={loading}
                        style={{
                          padding: '12px 20px',
                          background: 'linear-gradient(45deg, #9C27B0, #673AB7)',
                          color: 'white',
                          border: 'none',
                          borderRadius: '10px',
                          cursor: loading ? 'not-allowed' : 'pointer',
                          opacity: loading ? 0.7 : 1,
                          transition: 'all 0.3s ease',
                          fontSize: '0.9rem'
                        }}
                      >
                        🔄 Refresh
                      </button>
                    </div>
                  </div>
                  
                  {/* Center Panel - Game Board */}
                  <div style={{
                    background: 'rgba(255,255,255,0.1)',
                    padding: '25px',
                    borderRadius: '15px',
                    backdropFilter: 'blur(10px)',
                    border: '1px solid rgba(255,255,255,0.2)',
                    textAlign: 'center'
                  }}>
                    {isWaiting && (
                      <div style={{
                        padding: '30px',
                        textAlign: 'center',
                        background: 'rgba(255,255,255,0.1)',
                        borderRadius: '15px',
                        margin: '20px 0'
                      }}>
                        <div style={{ fontSize: '3rem', marginBottom: '15px' }}>⏳</div>
                        <h3 style={{ color: '#FFE066', marginBottom: '10px' }}>Waiting for Players</h3>
                        <p style={{ color: 'rgba(255,255,255,0.8)' }}>Need 2 or more players to start</p>
                      </div>
                    )}
                    
                    {isPlacement && (
                      <div style={{
                        padding: '20px',
                        textAlign: 'center',
                        background: 'rgba(255,255,255,0.1)',
                        borderRadius: '15px',
                        margin: '20px 0'
                      }}>
                        <div style={{ fontSize: '2.5rem', marginBottom: '15px' }}>🎯</div>
                        <h3 style={{ color: '#FF9800', marginBottom: '15px' }}>Choose Starting Position</h3>
                        <p style={{ color: 'rgba(255,255,255,0.8)', marginBottom: '15px' }}>Click on the board to select your starting position</p>
                        
                        {parsedGame?.hasPlaced && (
                          <div style={{
                            display: 'flex',
                            justifyContent: 'center',
                            gap: '20px',
                            margin: '15px 0'
                          }}>
                            <div style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px',
                              padding: '8px 15px',
                              background: parsedGame.hasPlaced[0] ? 'rgba(76, 175, 80, 0.3)' : 'rgba(244, 67, 54, 0.3)',
                              borderRadius: '20px',
                              border: `1px solid ${parsedGame.hasPlaced[0] ? '#4CAF50' : '#F44336'}`
                            }}>
                              <span>P1:</span>
                              <span style={{ fontSize: '1.2rem' }}>{parsedGame.hasPlaced[0] ? '✓' : '✗'}</span>
                            </div>
                            {parsedGame.hasPlaced.length > 1 && (
                              <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                padding: '8px 15px',
                                background: parsedGame.hasPlaced[1] ? 'rgba(76, 175, 80, 0.3)' : 'rgba(244, 67, 54, 0.3)',
                                borderRadius: '20px',
                                border: `1px solid ${parsedGame.hasPlaced[1] ? '#4CAF50' : '#F44336'}`
                              }}>
                                <span>P2:</span>
                                <span style={{ fontSize: '1.2rem' }}>{parsedGame.hasPlaced[1] ? '✓' : '✗'}</span>
                              </div>
                            )}
                          </div>
                        )}
                        
                        {selectedPosition && (
                          <div style={{
                            padding: '10px 20px',
                            background: 'rgba(255, 230, 102, 0.2)',
                            border: '1px solid #FFE066',
                            borderRadius: '20px',
                            margin: '15px 0',
                            color: '#FFE066'
                          }}>
                            Selected: ({selectedPosition.x}, {selectedPosition.y})
                          </div>
                        )}
                        
                        <div style={{
                          display: 'flex',
                          gap: '15px',
                          justifyContent: 'center',
                          flexWrap: 'wrap',
                          marginTop: '20px'
                        }}>
                          <button 
                            onClick={handleChooseStart} 
                            disabled={loading || !selectedPosition}
                            style={{
                              padding: '12px 25px',
                              background: 'linear-gradient(45deg, #FF9800, #F57C00)',
                              color: 'white',
                              border: 'none',
                              borderRadius: '10px',
                              cursor: (loading || !selectedPosition) ? 'not-allowed' : 'pointer',
                              opacity: (loading || !selectedPosition) ? 0.5 : 1,
                              transition: 'all 0.3s ease',
                              fontSize: '1rem'
                            }}
                          >
                            ✅ Confirm Position
                          </button>
                          
                          {account?.address === parsedGame?.creator && (
                            <button 
                              onClick={handleStartGame} 
                              disabled={loading || !canStart}
                              style={{
                                padding: '12px 25px',
                                background: canStart ? 'linear-gradient(45deg, #4CAF50, #45a049)' : 'rgba(255,255,255,0.2)',
                                color: 'white',
                                border: 'none',
                                borderRadius: '10px',
                                cursor: (loading || !canStart) ? 'not-allowed' : 'pointer',
                                opacity: (loading || !canStart) ? 0.5 : 1,
                                transition: 'all 0.3s ease',
                                fontSize: '1rem'
                              }}
                            >
                              🚀 Start Game {!bothPlayersPlaced && '(All players must place)'}
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                    
                    {isPlaying && (
                      <div style={{
                        padding: '20px',
                        textAlign: 'center',
                        background: 'rgba(255,255,255,0.1)',
                        borderRadius: '15px',
                        margin: '20px 0'
                      }}>
                        <div style={{ fontSize: '2.5rem', marginBottom: '15px' }}>🎮</div>
                        <h3 style={{ color: '#4CAF50', marginBottom: '15px' }}>Game in Progress!</h3>
                        <p style={{ color: 'rgba(255,255,255,0.8)', marginBottom: '15px' }}>Use WASD or arrow keys to move</p>
                        
                        <div style={{
                          display: 'flex',
                          justifyContent: 'center',
                          gap: '20px',
                          margin: '20px 0',
                          flexWrap: 'wrap'
                        }}>
                          <div style={{
                            padding: '10px 20px',
                            background: 'rgba(255,255,255,0.1)',
                            borderRadius: '10px',
                            border: '1px solid rgba(255,255,255,0.2)'
                          }}>
                            <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.7)' }}>Current Turn</div>
                            <div style={{ fontWeight: 'bold', color: parsedGame?.currentTurn === 0 ? '#FF6B6B' : '#4ECDC4' }}>
                              {parsedGame?.currentTurn === 0 ? 'Player 1' : 'Player 2'}
                            </div>
                          </div>
                          
                          <div style={{
                            padding: '10px 20px',
                            background: moveCapId ? 'rgba(76, 175, 80, 0.2)' : 'rgba(244, 67, 54, 0.2)',
                            borderRadius: '10px',
                            border: `1px solid ${moveCapId ? '#4CAF50' : '#F44336'}`
                          }}>
                            <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.7)' }}>MoveCap Status</div>
                            <div style={{ fontWeight: 'bold' }}>
                              {moveCapId ? `✓ ${moveCapId.slice(0, 8)}...` : '✗ Missing'}
                            </div>
                          </div>
                        </div>
                        
                        <div style={{
                          display: 'flex',
                          gap: '10px',
                          justifyContent: 'center',
                          flexWrap: 'wrap',
                          marginTop: '20px'
                        }}>
                          {!moveCapId && (
                            <button 
                              onClick={findPlayerMoveCap} 
                              disabled={loading}
                              style={{
                                padding: '10px 20px',
                                background: 'linear-gradient(45deg, #FF9800, #F57C00)',
                                color: 'white',
                                border: 'none',
                                borderRadius: '8px',
                                cursor: loading ? 'not-allowed' : 'pointer',
                                opacity: loading ? 0.7 : 1,
                                fontSize: '0.9rem'
                              }}
                            >
                              🔍 Find MoveCap
                            </button>
                          )}
                          <button 
                            onClick={fetchTiles} 
                            disabled={loading}
                            style={{
                              padding: '10px 20px',
                              background: 'linear-gradient(45deg, #2196F3, #1976D2)',
                              color: 'white',
                              border: 'none',
                              borderRadius: '8px',
                              cursor: loading ? 'not-allowed' : 'pointer',
                              opacity: loading ? 0.7 : 1,
                              fontSize: '0.9rem'
                            }}
                          >
                            🔄 Refresh Tiles
                          </button>
                          <button 
                            onClick={handleForceTimeout} 
                            disabled={loading}
                            style={{
                              padding: '10px 20px',
                              background: 'linear-gradient(45deg, #F44336, #D32F2F)',
                              color: 'white',
                              border: 'none',
                              borderRadius: '8px',
                              cursor: loading ? 'not-allowed' : 'pointer',
                              opacity: loading ? 0.7 : 1,
                              fontSize: '0.9rem'
                            }}
                          >
                            ⏱️ Force Timeout
                          </button>
                        </div>
                      </div>
                    )}
                    
                    {isEnded && (
                      <div style={{
                        padding: '30px',
                        textAlign: 'center',
                        background: 'rgba(255,255,255,0.1)',
                        borderRadius: '15px',
                        margin: '20px 0'
                      }}>
                        <div style={{ fontSize: '3rem', marginBottom: '15px' }}>🏆</div>
                        <h3 style={{ color: '#FFD700', marginBottom: '10px' }}>Game Finished!</h3>
                        <p style={{ fontSize: '1.2rem', color: '#FFE066' }}>Winner: {parsedGame?.winner || 'Draw'}</p>
                      </div>
                    )}
                    
                    <h2 style={{
                      fontSize: '1.6rem',
                      textAlign: 'center',
                      marginBottom: '20px',
                      color: '#FFE066'
                    }}>🎨 Game Board</h2>
                    
                    <div style={{
                      background: 'rgba(255,255,255,0.05)',
                      padding: '15px',
                      borderRadius: '10px',
                      marginBottom: '20px',
                      fontSize: '0.9rem',
                      color: 'rgba(255,255,255,0.8)',
                      textAlign: 'center'
                    }}>
                      🔵 = SUI Tokens (clickable) • ✓ = Captured • P1/P2 = Players
                    </div>
                    
                    <div style={{
                      display: 'flex',
                      justifyContent: 'center',
                      marginBottom: '20px'
                    }} className="board-container">
                      {renderBoard()}
                    </div>
                    
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-around',
                      background: 'rgba(255,255,255,0.1)',
                      padding: '15px',
                      borderRadius: '10px',
                      margin: '20px 0'
                    }}>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.7)' }}>Tiles Remaining</div>
                        <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#FFE066' }}>
                          {parsedGame?.tilesRemaining || 0}
                        </div>
                      </div>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.7)' }}>Scores</div>
                        <div style={{ fontSize: '1rem', fontWeight: 'bold' }}>
                          {parsedGame?.playersScores.map((score, idx) => (
                            <div key={idx} style={{ 
                              color: idx === 0 ? '#FF6B6B' : '#4ECDC4',
                              margin: '2px 0'
                            }}>
                              P{idx + 1}: {(score/1000000000).toFixed(3)} SUI
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  {/* Right Panel - Tile Info */}
                  <div style={{
                    background: 'rgba(255,255,255,0.1)',
                    padding: '25px',
                    borderRadius: '15px',
                    backdropFilter: 'blur(10px)',
                    border: '1px solid rgba(255,255,255,0.2)'
                  }}>
                    <h2 style={{
                      fontSize: '1.4rem',
                      marginBottom: '20px',
                      color: '#FFE066',
                      textAlign: 'center'
                    }}>📎 Tile Info</h2>
                    
                    {tiles.length > 0 ? (
                      <>
                        <div style={{
                          background: 'rgba(255,255,255,0.1)',
                          padding: '15px',
                          borderRadius: '10px',
                          marginBottom: '15px',
                          textAlign: 'center'
                        }}>
                          <div style={{ fontSize: '2rem', marginBottom: '5px' }}>🎯</div>
                          <div style={{ fontWeight: 'bold', fontSize: '1.2rem' }}>{tiles.length}</div>
                          <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.7)' }}>Tiles Discovered</div>
                        </div>
                        
                        <div style={{ 
                          maxHeight: '400px', 
                          overflowY: 'auto',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '8px'
                        }}>
                          {tiles.map((tile, idx) => (
                            <div key={idx} style={{ 
                              background: tile.claimed ? 'rgba(244, 67, 54, 0.2)' : 'rgba(76, 175, 80, 0.2)',
                              border: `1px solid ${tile.claimed ? '#F44336' : '#4CAF50'}`,
                              padding: '12px',
                              borderRadius: '8px',
                              fontSize: '0.8rem'
                            }}>
                              <div style={{ 
                                display: 'flex', 
                                justifyContent: 'space-between',
                                marginBottom: '8px'
                              }}>
                                <span style={{ fontWeight: 'bold' }}>({tile.position.x}, {tile.position.y})</span>
                                <span style={{ color: '#FFE066' }}>{(tile.value/1000000000).toFixed(3)} SUI</span>
                              </div>
                              <div style={{ 
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center'
                              }}>
                                <span style={{
                                  padding: '2px 8px',
                                  borderRadius: '10px',
                                  fontSize: '0.7rem',
                                  background: tile.claimed ? 'rgba(244, 67, 54, 0.3)' : 'rgba(76, 175, 80, 0.3)',
                                  color: tile.claimed ? '#FFCDD2' : '#C8E6C9'
                                }}>
                                  {tile.claimed ? '✓ Captured' : '🔵 Available'}
                                </span>
                                {tile.owner && (
                                  <span style={{ 
                                    fontSize: '0.7rem',
                                    color: 'rgba(255,255,255,0.7)',
                                    fontFamily: 'monospace'
                                  }}>
                                    {tile.owner.slice(0, 8)}...
                                  </span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </>
                    ) : (
                      <div style={{
                        textAlign: 'center',
                        padding: '40px 20px',
                        color: 'rgba(255,255,255,0.5)'
                      }}>
                        <div style={{ fontSize: '3rem', marginBottom: '15px' }}>🔍</div>
                        <p>No tiles discovered yet</p>
                      </div>
                    )}
                  </div>
                </div>
                
                {/* Debug Info - Collapsible */}
                <details style={{
                  background: 'rgba(255,255,255,0.05)',
                  padding: '20px',
                  borderRadius: '10px',
                  marginTop: '30px',
                  border: '1px solid rgba(255,255,255,0.1)'
                }}>
                  <summary style={{
                    cursor: 'pointer',
                    fontSize: '1.1rem',
                    fontWeight: 'bold',
                    color: '#FFE066',
                    marginBottom: '15px'
                  }}>
                    🔧 Debug Info (Click to expand)
                  </summary>
                  <pre style={{
                    background: 'rgba(0,0,0,0.3)',
                    padding: '15px',
                    borderRadius: '8px',
                    fontSize: '0.75rem',
                    color: '#E0E0E0',
                    overflow: 'auto',
                    maxHeight: '300px',
                    border: '1px solid rgba(255,255,255,0.1)'
                  }}>
                    {JSON.stringify(parsedGame, null, 2)}
                  </pre>
                </details>
              </>
            )}
            
            {/* Error and Loading States */}
            {error && (
              <div style={{
                position: 'fixed',
                top: '20px',
                right: '20px',
                background: 'linear-gradient(45deg, #F44336, #D32F2F)',
                color: 'white',
                padding: '15px 20px',
                borderRadius: '10px',
                boxShadow: '0 4px 20px rgba(244, 67, 54, 0.3)',
                zIndex: 1000,
                maxWidth: '400px',
                border: '1px solid rgba(255,255,255,0.2)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '1.2rem' }}>⚠️</span>
                  <span>{error}</span>
                </div>
              </div>
            )}
            
            {loading && (
              <div style={{
                position: 'fixed',
                top: '20px',
                left: '50%',
                transform: 'translateX(-50%)',
                background: 'rgba(255,255,255,0.1)',
                backdropFilter: 'blur(10px)',
                color: 'white',
                padding: '15px 25px',
                borderRadius: '25px',
                boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
                zIndex: 1000,
                border: '1px solid rgba(255,255,255,0.2)',
                display: 'flex',
                alignItems: 'center',
                gap: '10px'
              }}>
                <div style={{
                  width: '20px',
                  height: '20px',
                  border: '2px solid rgba(255,255,255,0.3)',
                  borderTop: '2px solid #FFE066',
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite'
                }}></div>
                <span>Loading...</span>
              </div>
            )}
          </>
        )}
        
        <style>{`
          @keyframes pulse {
            0%, 100% { opacity: 0.5; }
            50% { opacity: 1; }
          }
          
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
          
          input:focus {
            border-color: #FFE066 !important;
            box-shadow: 0 0 10px rgba(255, 230, 102, 0.3) !important;
          }
          
          button:hover:not(:disabled) {
            transform: translateY(-2px);
            box-shadow: 0 6px 20px rgba(0,0,0,0.2);
          }
          
          button:active:not(:disabled) {
            transform: translateY(0px);
          }
          
          details[open] summary {
            margin-bottom: 15px;
          }
          
          /* Scrollbar styling */
          ::-webkit-scrollbar {
            width: 8px;
          }
          
          ::-webkit-scrollbar-track {
            background: rgba(255,255,255,0.1);
            border-radius: 4px;
          }
          
          ::-webkit-scrollbar-thumb {
            background: rgba(255,255,255,0.3);
            border-radius: 4px;
          }
          
          ::-webkit-scrollbar-thumb:hover {
            background: rgba(255,255,255,0.5);
          }
          
          /* Mobile responsiveness */
          @media (max-width: 768px) {
            .game-grid {
              grid-template-columns: 1fr !important;
              gap: 20px !important;
            }
            
            .board-container {
              grid-template-columns: repeat(10, 40px) !important;
            }
          }
        `}</style>
      </div>
    </div>
  );
};

export default TileGameFrontend;