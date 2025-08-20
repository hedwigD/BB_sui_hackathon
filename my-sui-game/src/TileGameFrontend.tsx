import React, { useState, useEffect } from 'react';
import { ConnectButton, useWallet } from '@suiet/wallet-kit';
import { TransactionBlock } from '@mysten/sui.js/transactions';
import {
  SUI_CLIENT,
  REGISTRY_ID,
  BOARD_SIZE,
  createGame,
  joinGame,
  chooseStart,
  startGame,
  moveWithCap,
  forceTimeoutMove,
  getParsedGame,
  pollGame,
  ParsedGame,
  extractGameIdFromEffects,
  extractMoveCapIdFromEffects,
  extractGameIdFromObjectChanges,  // 추가
  extractGameIdFromEvents,          // 추가
  checkDeployedObjects,             // 추가
} from './sui-helpers';

const TileGameFrontend: React.FC = () => {
  const { account, signAndExecuteTransactionBlock } = useWallet();
  const [gameId, setGameId] = useState<string | null>(null);
  const [moveCapId, setMoveCapId] = useState<string | null>(null);
  const [parsedGame, setParsedGame] = useState<ParsedGame | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [joinGameIdInput, setJoinGameIdInput] = useState('');
  const [selectedPosition, setSelectedPosition] = useState<{x: number, y: number} | null>(null);

  // 게임 상태 폴링
  useEffect(() => {
    if (!gameId) return;
    const stopPoll = pollGame(gameId, (updatedGame) => {
      setParsedGame(updatedGame);
    }, 2000, { immediate: true });
    return () => stopPoll();
  }, [gameId]);

  // 키보드 입력 핸들러 (게임 진행 중에만)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!parsedGame || parsedGame.status !== 1 || !moveCapId || !gameId) return;
      let direction: number | null = null;
      switch (e.key.toLowerCase()) {
        case 'w':
        case 'arrowup': direction = 0; break;
        case 's':
        case 'arrowdown': direction = 1; break;
        case 'a':
        case 'arrowleft': direction = 2; break;
        case 'd':
        case 'arrowright': direction = 3; break;
      }
      if (direction !== null) {
        handleMove(direction);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [parsedGame, moveCapId, gameId]);

  // 트랜잭션 실행 헬퍼
  const executeTx = async (tx: TransactionBlock) => {
    setLoading(true);
    setError(null);
    try {
      console.log('[DEBUG] Executing transaction:', tx);
      console.log('[DEBUG] Transaction data:', JSON.stringify(tx, null, 2));
      
      // Check user's SUI balance for gas
      const balance = await SUI_CLIENT.getBalance({
        owner: account?.address || '',
        coinType: '0x2::sui::SUI'
      });
      console.log('[DEBUG] User SUI balance:', balance);
      
      // Set gas budget
      tx.setGasBudget(1000000000); // 1 SUI in MIST
      
      // Set sender for the transaction
      tx.setSender(account?.address || '');
      
      // Skip dry run for now - it's causing issues
      console.log('[DEBUG] Skipping dry run, proceeding directly to wallet signature');
      
      const result = await signAndExecuteTransactionBlock({
        transactionBlock: tx as any,
        options: {
          showEffects: true,
          showEvents: true,
          showObjectChanges: true,
          showInput: false,
          showRawInput: false,
          showBalanceChanges: true,
        },
      });
      console.log('[DEBUG] Transaction successful:', result);
      return result;
    } catch (err) {
      console.error('[DEBUG] Transaction error:', err);
      setError(`트랜잭션 실패: ${err instanceof Error ? err.message : '알 수 없는 오류'}`);
      return null;
    } finally {
      setLoading(false);
    }
  };

  // 게임 생성 (수정: 여러 방법으로 게임 ID 추출 시도)
  const handleCreateGame = async () => {
    if (!account?.address) {
      setError('지갑을 먼저 연결해주세요.');
      return;
    }
    
    const tx = createGame(REGISTRY_ID);
    const result = await executeTx(tx);
    
    if (result) {
      console.log('Transaction result:', result);
      console.log('[DEBUG] ObjectChanges:', result.objectChanges);
      console.log('[DEBUG] Events:', result.events);
      
      // If objectChanges/events are missing from wallet result, fetch them manually
      let objectChanges = result.objectChanges;
      let events = result.events;
      let effects = result.effects;
      
      if (!objectChanges || !events) {
        console.log('[DEBUG] Missing objectChanges/events, fetching full transaction...');
        try {
          const fullTx = await SUI_CLIENT.waitForTransactionBlock({
            digest: result.digest,
            options: {
              showEffects: true,
              showEvents: true,
              showObjectChanges: true,
            },
          });
          console.log('[DEBUG] Full transaction result:', fullTx);
          objectChanges = fullTx.objectChanges;
          events = fullTx.events as any;
          effects = fullTx.effects;
        } catch (e) {
          console.warn('[DEBUG] Failed to fetch full transaction:', e);
        }
      }
      
      // 여러 방법으로 게임 ID 추출 시도
      let newGameId = null;
      
      // 1. objectChanges에서 추출 (가장 신뢰할 수 있음)
      if (objectChanges) {
        console.log('[DEBUG] Trying to extract from objectChanges...');
        newGameId = extractGameIdFromObjectChanges(objectChanges);
        console.log('[DEBUG] Extracted from objectChanges:', newGameId);
      }
      
      // 2. events에서 추출
      if (!newGameId && events) {
        console.log('[DEBUG] Trying to extract from events...');
        newGameId = extractGameIdFromEvents(events);
        console.log('[DEBUG] Extracted from events:', newGameId);
      }
      
      // 3. effects에서 추출 (Base64 문자열이 아닌 경우만)
      if (!newGameId && typeof effects === 'object') {
        console.log('[DEBUG] Trying to extract from effects...');
        newGameId = extractGameIdFromEffects(effects);
        console.log('[DEBUG] Extracted from effects:', newGameId);
      }
      
      if (newGameId) {
        console.log('Game created with ID:', newGameId);
        setGameId(newGameId);
      } else {
        setError('게임 ID를 추출할 수 없습니다. 수동으로 콘솔에서 확인하세요.');
        console.log('[DEBUG] Failed to extract game ID. Manual check needed.');
      }
    }
  };

  // 게임 참여 (수정: coinId 추가)
  // TileGameFrontend.tsx 수정

const handleJoinGame = async () => {
  if (!joinGameIdInput) {
    setError('게임 ID를 입력하세요.');
    return;
  }
  
  if (!account?.address) {
    setError('지갑을 먼저 연결해주세요.');
    return;
  }
  
  try {
    // First check the game status
    console.log('[DEBUG] Checking game status before joining:', joinGameIdInput);
    const gameState = await getParsedGame(joinGameIdInput);
    console.log('[DEBUG] Game state:', gameState);
    console.log('[DEBUG] Game status value:', gameState?.status);
    console.log('[DEBUG] Current players:', gameState?.players);
    console.log('[DEBUG] Current user address:', account?.address);
    
    if (!gameState) {
      setError('게임을 찾을 수 없습니다.');
      return;
    }
    
    if (gameState.status !== 0) {
      setError(`게임이 참여 가능한 상태가 아닙니다. 현재 상태: ${gameState.status} (0=Lobby, 1=Placement, 2=Playing, 3=Finished)`);
      return;
    }
    
    // Check if user has enough SUI for joining fee + gas
    const balance = await SUI_CLIENT.getBalance({
      owner: account.address,
      coinType: '0x2::sui::SUI'
    });
    const balanceInSui = Number(balance.totalBalance) / 1_000_000_000;
    if (balanceInSui < 0.1) { // Need at least 0.1 SUI (0.05 for fee + some for gas)
      setError(`충분한 SUI가 없습니다. (최소 0.1 SUI 필요, 현재: ${balanceInSui.toFixed(4)} SUI)`);
      return;
    }
    
    const tx = joinGame(joinGameIdInput, ""); // coinId not needed anymore
    const result = await executeTx(tx);
    
    if (result) {
      setGameId(joinGameIdInput);
    }
  } catch (err) {
    setError(`게임 참여 실패: ${err instanceof Error ? err.message : '알 수 없는 오류'}`);
  }
};


  // 게임 시작
  const handleStartGame = async () => {
    if (!gameId || !account?.address) {
      setError('지갑 연결 및 게임 ID 필요');
      return;
    }
    
    console.log('[DEBUG] Starting game with ID:', gameId);
    console.log('[DEBUG] Current parsed game:', parsedGame);
    
    try {
      const tx = startGame(gameId);
      console.log('[DEBUG] Transaction created:', tx);
      const result = await executeTx(tx);
      
      if (result) {
        // MoveCap ID 추출도 비슷하게 여러 방법 시도
        let newMoveCapId = null;
        
        if (result.objectChanges) {
          // objectChanges에서 MoveCap 찾기
          for (const change of result.objectChanges) {
            if (change.type === 'created' && change.objectType?.includes('MoveCap')) {
              newMoveCapId = change.objectId;
              break;
            }
          }
        }
        
        if (!newMoveCapId && typeof result.effects === 'object') {
          newMoveCapId = extractMoveCapIdFromEffects(result.effects);
        }
        
        if (newMoveCapId) {
          setMoveCapId(newMoveCapId);
        }
      }
    } catch (err) {
      setError(`게임 시작 실패: ${err instanceof Error ? err.message : '알 수 없는 오류'}`);
    }
  };

  // 이동
  const handleMove = async (direction: number) => {
    if (!gameId || !moveCapId) {
      setError('게임 ID 또는 MoveCap ID 필요');
      return;
    }
    const tx = moveWithCap(gameId, moveCapId, direction);
    await executeTx(tx);
  };

  // 타임아웃 강제 이동
  const handleForceTimeout = async () => {
    if (!gameId) {
      setError('게임 ID 필요');
      return;
    }
    const tx = forceTimeoutMove(gameId);
    await executeTx(tx);
  };

  // 수동으로 게임 상태 새로고침
  const handleRefreshGame = async () => {
    if (!gameId) return;
    try {
      const updated = await getParsedGame(gameId);
      setParsedGame(updated);
    } catch (err) {
      console.error('Failed to refresh game:', err);
    }
  };

  // 시작 위치 선택
  const handleChooseStart = async () => {
    if (!gameId || !selectedPosition || !account?.address) {
      setError('게임 ID, 선택된 위치, 지갑 연결이 필요합니다.');
      return;
    }

    try {
      const tx = chooseStart(gameId, selectedPosition.x, selectedPosition.y);
      const result = await executeTx(tx);
      
      if (result) {
        console.log('Start position chosen successfully');
        setSelectedPosition(null); // Clear selection after successful transaction
      }
    } catch (err) {
      setError(`시작 위치 선택 실패: ${err instanceof Error ? err.message : '알 수 없는 오류'}`);
    }
  };

  // 보드 렌더링 (10x10 그리드)
  const renderBoard = () => {
    if (!parsedGame) return null;
    const board: string[][] = Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(' '));

    // 플레이어 위치 표시
    parsedGame.playersPositions.forEach((pos, index) => {
      if (pos.x >= 0 && pos.x < BOARD_SIZE && pos.y >= 0 && pos.y < BOARD_SIZE) {
        board[pos.y][pos.x] = `P${index + 1}`;
      }
    });

    const handleCellClick = (x: number, y: number) => {
      if (isPlacement && account?.address) {
        setSelectedPosition({x, y});
      }
    };

    // 타일 표시 (간단히 모든 타일 위치에 'T' 표시)
    return (
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${BOARD_SIZE}, 30px)`, gap: '1px' }}>
        {board.flat().map((cell, idx) => {
          const x = idx % BOARD_SIZE;
          const y = Math.floor(idx / BOARD_SIZE);
          const isSelected = selectedPosition?.x === x && selectedPosition?.y === y;
          const isClickable = isPlacement && account?.address;
          
          return (
            <div 
              key={idx} 
              onClick={() => handleCellClick(x, y)}
              style={{ 
                width: '30px', 
                height: '30px', 
                border: '1px solid #ccc', 
                textAlign: 'center',
                backgroundColor: isSelected ? '#lightblue' : isClickable ? '#f0f0f0' : 'white',
                cursor: isClickable ? 'pointer' : 'default',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '12px'
              }}
            >
              {cell}
            </div>
          );
        })}
      </div>
    );
  };

  // 게임 상태에 따른 UI
  const isWaiting = parsedGame?.status === 0; // STATUS_LOBBY
  const isPlacement = parsedGame?.status === 1; // STATUS_PLACEMENT
  const isPlaying = parsedGame?.status === 2; // STATUS_PLAYING  
  const isEnded = parsedGame?.status === 3 || parsedGame?.tilesRemaining === 0 || !!parsedGame?.winner; // STATUS_FINISHED
  
  // Game can start when both players have chosen their positions
  const bothPlayersPlaced = parsedGame?.hasPlaced && parsedGame.hasPlaced.length === 2 && 
    parsedGame.hasPlaced[0] && parsedGame.hasPlaced[1];
  const canStart = isPlacement && parsedGame?.players.length >= 2 && bothPlayersPlaced;

  return (
    <div style={{ padding: '20px' }}>
      <h1>Sui 타일 게임</h1>
      <ConnectButton />

      {account && (
        <>
          {!gameId ? (
            <div>
              <h2>게임 시작</h2>
              <button onClick={checkDeployedObjects}>배포된 객체 확인 (디버그)</button>
              <button onClick={handleCreateGame} disabled={loading}>새 게임 생성</button>
              <div>
                <input
                  type="text"
                  placeholder="게임 ID 입력"
                  value={joinGameIdInput}
                  onChange={(e) => setJoinGameIdInput(e.target.value)}
                />
                <button onClick={handleJoinGame} disabled={loading}>게임 참여 (0.05 SUI)</button>
              </div>
            </div>
          ) : (
            <>
              <div>
                <h2>게임 ID: {gameId}</h2>
                <p>플레이어 수: {parsedGame?.players.length || 0}</p>
                <p>게임 상태: {parsedGame?.status === 0 ? 'Lobby' : parsedGame?.status === 1 ? 'Placement' : parsedGame?.status === 2 ? 'Playing' : 'Finished'}</p>
                <button onClick={handleRefreshGame} disabled={loading}>수동 새로고침</button>
                
                {isWaiting && (
                  <>
                    <p>2명 이상의 플레이어가 필요합니다.</p>
                  </>
                )}
                
                {isPlacement && (
                  <>
                    <p>시작 위치 선택 단계입니다.</p>
                    <p>보드에서 클릭하여 시작 위치를 선택하세요.</p>
                    {parsedGame?.hasPlaced && (
                      <p>
                        플레이어 배치 상태: 
                        P1: {parsedGame.hasPlaced[0] ? '✓' : '✗'} 
                        {parsedGame.hasPlaced.length > 1 && ` P2: ${parsedGame.hasPlaced[1] ? '✓' : '✗'}`}
                      </p>
                    )}
                    {selectedPosition && (
                      <p>선택된 위치: ({selectedPosition.x}, {selectedPosition.y})</p>
                    )}
                    <button 
                      onClick={handleChooseStart} 
                      disabled={loading || !selectedPosition}
                    >
                      시작 위치 확정
                    </button>
                    {account?.address === parsedGame?.creator && (
                      <button onClick={handleStartGame} disabled={loading || !canStart}>
                        게임 시작 {!bothPlayersPlaced && '(모든 플레이어가 배치 완료 필요)'}
                      </button>
                    )}
                  </>
                )}
                
                {isPlaying && (
                  <>
                    <p>게임 진행 중! WASD 또는 화살표 키로 이동하세요.</p>
                    <p>현재 턴: {parsedGame?.currentTurn === 0 ? '플레이어 1' : '플레이어 2'}</p>
                    <button onClick={handleForceTimeout} disabled={loading}>타임아웃 강제 이동</button>
                  </>
                )}
                
                {isEnded && <p>게임 종료! 승자: {parsedGame?.winner || '무승부'}</p>}
              </div>

              <div>
                <h2>보드</h2>
                {renderBoard()}
                <p>남은 타일: {parsedGame?.tilesRemaining || 0}</p>
                <p>점수: {parsedGame?.playersScores.map((score, idx) => `P${idx + 1}: ${score}`).join(', ')}</p>
              </div>

              <div>
                <h2>게임 상태 (디버깅)</h2>
                <pre>{JSON.stringify(parsedGame, null, 2)}</pre>
              </div>
            </>
          )}

          {error && <p style={{ color: 'red' }}>{error}</p>}
          {loading && <p>로딩 중...</p>}
        </>
      )}
    </div>
  );
};

export default TileGameFrontend;