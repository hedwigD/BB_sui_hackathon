import React, { useState, useEffect } from 'react';
import { ConnectButton, useWallet } from '@suiet/wallet-kit';  // 변경: @suiet/wallet-kit 사용
import { TransactionBlock } from '@mysten/sui.js/transactions';
import {
  SUI_CLIENT,
  REGISTRY_ID,
  BOARD_SIZE,
  createGame,
  joinGame,
  startGame,
  moveWithCap,
  forceTimeoutMove,
  findSuiCoin,
  getParsedGame,
  pollGame,
  ParsedGame,
  extractGameIdFromEffects,
  extractGameIdFromObjectChanges,
  extractGameIdFromEvents,
  extractMoveCapIdFromEffects,
} from './sui-helpers';

const TileGameFrontend: React.FC = () => {
  const { account, signAndExecuteTransactionBlock } = useWallet();  // 변경: useWallet 사용
  const [gameId, setGameId] = useState<string | null>(null);
  const [moveCapId, setMoveCapId] = useState<string | null>(null);
  const [parsedGame, setParsedGame] = useState<ParsedGame | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [joinGameIdInput, setJoinGameIdInput] = useState('');

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
        case 'arrowup': direction = 0; break; // 상
        case 's':
        case 'arrowdown': direction = 1; break; // 하
        case 'a':
        case 'arrowleft': direction = 2; break; // 좌
        case 'd':
        case 'arrowright': direction = 3; break; // 우
      }
      if (direction !== null) {
        handleMove(direction);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [parsedGame, moveCapId, gameId]);

  // 트랜잭션 실행 헬퍼 (변경: signAndExecuteTransactionBlock 사용)
  const executeTx = async (tx: TransactionBlock) => {
    setLoading(true);
    setError(null);
    try {
      const result = await signAndExecuteTransactionBlock({
        transactionBlock: tx as any,
        options: {
          showEffects: true,
          showEvents: true,
          showObjectChanges: true,
        },
      });
      return result;
    } catch (err) {
      setError(`트랜잭션 실패: ${err instanceof Error ? err.message : '알 수 없는 오류'}`);
      return null;
    } finally {
      setLoading(false);
    }
  };

  // 게임 생성
  const handleCreateGame = async () => {
    if (!account?.address) {
      setError('지갑을 먼저 연결해주세요.');
      return;
    }
    
    try {
      console.log('Creating game with registry ID:', REGISTRY_ID);
      const tx = createGame(REGISTRY_ID);
      const result = await executeTx(tx);
      console.log('Transaction result:', result);
      
      if (result && result.effects) {
        console.log('Effects:', result.effects);
        
        // Try multiple ways to extract game ID
        let newGameId = extractGameIdFromEffects(result.effects);
        console.log('Game ID from effects:', newGameId);
        
        if (!newGameId && result.objectChanges) {
          console.log('Object changes:', result.objectChanges);
          newGameId = extractGameIdFromObjectChanges(result.objectChanges);
          console.log('Game ID from object changes:', newGameId);
        }
        
        if (!newGameId && result.events) {
          console.log('Events:', result.events);
          newGameId = extractGameIdFromEvents(result.events);
          console.log('Game ID from events:', newGameId);
        }
        
        if (newGameId) {
          console.log('Setting game ID:', newGameId);
          setGameId(newGameId);
          setError(null);
        } else {
          setError('게임 ID를 추출할 수 없습니다. 콘솔을 확인해주세요.');
          console.error('Failed to extract game ID from result:', result);
        }
      } else {
        setError('트랜잭션 결과를 받을 수 없습니다.');
        console.error('No result or effects from transaction');
      }
    } catch (err) {
      console.error('Error creating game:', err);
      setError(`게임 생성 실패: ${err instanceof Error ? err.message : '알 수 없는 오류'}`);
    }
  };

  // 게임 참여
  const handleJoinGame = async () => {
    if (!joinGameIdInput || !account?.address) return setError('게임 ID와 지갑 연결이 필요합니다.');
    const coinId = await findSuiCoin(account.address, BigInt(50_000_000)); // 0.05 SUI for join fee
    if (!coinId) return setError('참여비 0.05 SUI가 부족합니다.');
    const tx = joinGame(joinGameIdInput, coinId);
    const result = await executeTx(tx);
    if (result) {
      setGameId(joinGameIdInput); // 참여 후 게임 ID 설정
    }
  };

  // 게임 시작 (변경: account?.address 사용)
  const handleStartGame = async () => {
    if (!gameId) return setError('게임 ID 필요');
    const tx = startGame(gameId);
    const result = await executeTx(tx);
    if (result) {
      const newMoveCapId = extractMoveCapIdFromEffects(result.effects);
      if (newMoveCapId) setMoveCapId(newMoveCapId);
    }
  };

  // 이동
  const handleMove = async (direction: number) => {
    if (!gameId || !moveCapId) return setError('게임 ID 또는 MoveCap ID 필요');
    const tx = moveWithCap(gameId, moveCapId, direction);
    await executeTx(tx);
  };

  // 타임아웃 강제 이동
  const handleForceTimeout = async () => {
    if (!gameId) return setError('게임 ID 필요');
    const tx = forceTimeoutMove(gameId);
    await executeTx(tx);
  };

  // 보드 렌더링 (11x11 그리드)
  const renderBoard = () => {
    if (!parsedGame) return null;
    const board: string[][] = Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(' '));

    // 플레이어 위치 표시
    parsedGame.playersPositions.forEach((pos, index) => {
      if (pos.x >= 0 && pos.x < BOARD_SIZE && pos.y >= 0 && pos.y < BOARD_SIZE) {
        board[pos.y][pos.x] = `P${index + 1}`;
      }
    });

    // 타일 표시 (간단히 모든 타일 위치에 'T' 표시, 실제로는 tileIds 기반 좌표 매핑 필요)
    return (
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${BOARD_SIZE}, 20px)`, gap: '1px' }}>
        {board.flat().map((cell, idx) => (
          <div key={idx} style={{ width: '20px', height: '20px', border: '1px solid #ccc', textAlign: 'center' }}>
            {cell}
          </div>
        ))}
      </div>
    );
  };

  // 게임 상태에 따른 UI (변경: account로 지갑 연결 확인)
  const isWaiting = parsedGame?.status === 0;
  const isPlaying = parsedGame?.status === 1;
  const isEnded = parsedGame?.status === 2 || parsedGame?.tilesRemaining === 0 || !!parsedGame?.winner;
  const canStart = isWaiting && parsedGame?.players.length >= 2;

  return (
    <div style={{ padding: '20px' }}>
      <h1>Sui 타일 게임</h1>
      
      <div style={{ marginBottom: '20px', padding: '10px', border: '1px solid #ddd', borderRadius: '5px' }}>
        <h3>지갑 상태</h3>
        <ConnectButton />
        {account ? (
          <div style={{ marginTop: '10px' }}>
            <p><strong>연결된 지갑:</strong> {account.address}</p>
            <p><strong>지갑 라벨:</strong> {account.label || 'Unknown'}</p>
          </div>
        ) : (
          <p style={{ color: 'orange' }}>지갑이 연결되지 않음. 위 버튼을 클릭하여 지갑을 연결하세요.</p>
        )}
      </div>

      {account ? (
        <div>
          {!gameId ? (
            <div style={{ marginBottom: '20px' }}>
              <h2>게임 시작</h2>
              
              <div style={{ marginBottom: '20px', padding: '15px', border: '1px solid #ddd', borderRadius: '5px' }}>
                <h3>새 게임 만들기</h3>
                <p>새로운 게임을 만들어서 다른 플레이어가 참여할 수 있게 하세요.</p>
                <button 
                  onClick={handleCreateGame} 
                  disabled={loading}
                  style={{ 
                    padding: '10px 20px', 
                    backgroundColor: loading ? '#ccc' : '#007bff', 
                    color: 'white', 
                    border: 'none', 
                    borderRadius: '5px',
                    cursor: loading ? 'not-allowed' : 'pointer'
                  }}
                >
                  {loading ? '게임 생성 중...' : '새 게임 생성'}
                </button>
              </div>
              
              <div style={{ padding: '15px', border: '1px solid #ddd', borderRadius: '5px' }}>
                <h3>기존 게임 참여</h3>
                <p>친구로부터 받은 게임 ID를 입력하세요 (참여비: 0.05 SUI)</p>
                <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                  <input
                    type="text"
                    placeholder="게임 ID 입력 (0x로 시작하는 긴 문자열)"
                    value={joinGameIdInput}
                    onChange={(e) => setJoinGameIdInput(e.target.value)}
                    style={{ 
                      flex: 1, 
                      padding: '8px', 
                      border: '1px solid #ccc', 
                      borderRadius: '3px',
                      fontSize: '12px'
                    }}
                  />
                  <button 
                    onClick={handleJoinGame} 
                    disabled={loading || !joinGameIdInput.trim()}
                    style={{ 
                      padding: '8px 16px', 
                      backgroundColor: loading || !joinGameIdInput.trim() ? '#ccc' : '#28a745', 
                      color: 'white', 
                      border: 'none', 
                      borderRadius: '3px',
                      cursor: loading || !joinGameIdInput.trim() ? 'not-allowed' : 'pointer'
                    }}
                  >
                    {loading ? '참여 중...' : '게임 참여'}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <>
              <div style={{ marginBottom: '20px', padding: '15px', border: '2px solid #007bff', borderRadius: '5px', backgroundColor: '#f8f9fa' }}>
                <h2>게임 생성됨! 🎮</h2>
                <div style={{ marginBottom: '15px' }}>
                  <strong>게임 ID:</strong>
                  <div style={{ 
                    backgroundColor: 'white', 
                    padding: '10px', 
                    border: '1px solid #ddd', 
                    borderRadius: '3px', 
                    fontSize: '12px',
                    fontFamily: 'monospace',
                    wordBreak: 'break-all',
                    marginTop: '5px'
                  }}>
                    {gameId}
                  </div>
                  <button 
                    onClick={() => navigator.clipboard.writeText(gameId || '')}
                    style={{
                      marginTop: '10px',
                      padding: '5px 10px',
                      backgroundColor: '#6c757d',
                      color: 'white',
                      border: 'none',
                      borderRadius: '3px',
                      cursor: 'pointer',
                      fontSize: '12px'
                    }}
                  >
                    📋 게임 ID 복사
                  </button>
                </div>
                <p><strong>친구를 초대하세요!</strong> 위 게임 ID를 복사해서 친구에게 보내주세요. 친구는 이 ID를 사용해서 게임에 참여할 수 있습니다.</p>
                
                {isWaiting && (
                  <div style={{ marginTop: '15px', padding: '10px', backgroundColor: '#fff3cd', border: '1px solid #ffeaa7', borderRadius: '3px' }}>
                    <p><strong>대기 중...</strong> 플레이어 수: {parsedGame?.players.length || 1}/2</p>
                    {parsedGame?.players.length === 2 ? (
                      <button 
                        onClick={handleStartGame} 
                        disabled={loading || !canStart}
                        style={{
                          padding: '10px 20px',
                          backgroundColor: '#28a745',
                          color: 'white',
                          border: 'none',
                          borderRadius: '5px',
                          cursor: 'pointer',
                          fontSize: '16px',
                          fontWeight: 'bold'
                        }}
                      >
                        🚀 게임 시작!
                      </button>
                    ) : (
                      <p>두 번째 플레이어를 기다리는 중...</p>
                    )}
                  </div>
                )}
                {isPlaying && (
                  <div style={{ marginTop: '15px', padding: '10px', backgroundColor: '#d4edda', border: '1px solid #c3e6cb', borderRadius: '3px' }}>
                    <p><strong>게임 진행 중! 🎯</strong> WASD 또는 화살표 키로 이동하세요.</p>
                    <button onClick={handleForceTimeout} disabled={loading}>타임아웃 강제 이동</button>
                  </div>
                )}
                {isEnded && (
                  <div style={{ marginTop: '15px', padding: '10px', backgroundColor: '#f8d7da', border: '1px solid #f5c6cb', borderRadius: '3px' }}>
                    <p><strong>게임 종료! 🏁</strong> 승자: {parsedGame?.winner || '무승부'}</p>
                  </div>
                )}
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
        </div>
      ) : (
        <div style={{ textAlign: 'center', padding: '20px' }}>
          <h2>게임을 시작하려면 지갑을 연결하세요</h2>
          <p>위의 "Connect Wallet" 버튼을 클릭하여 Sui 지갑을 연결해주세요.</p>
        </div>
      )}
    </div>
  );
};

export default TileGameFrontend;
