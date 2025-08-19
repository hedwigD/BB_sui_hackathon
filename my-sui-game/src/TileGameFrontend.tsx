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
    const tx = createGame(REGISTRY_ID);
    const result = await executeTx(tx);
    if (result) {
      const newGameId = extractGameIdFromEffects(result.effects);
      setGameId(newGameId);
    }
  };

  // 게임 참여
  const handleJoinGame = async () => {
    if (!joinGameIdInput) return setError('게임 ID를 입력하세요.');
    const tx = joinGame(joinGameIdInput);
    const result = await executeTx(tx);
    if (result) {
      setGameId(joinGameIdInput); // 참여 후 게임 ID 설정
    }
  };

  // 게임 시작 (변경: account?.address 사용)
  const handleStartGame = async () => {
    if (!gameId || !account?.address) return setError('지갑 연결 및 게임 ID 필요');
    const coinId = await findSuiCoin(account.address, BigInt(500_000_000));
    if (!coinId) return setError('충분한 SUI 없음');
    const tx = startGame(gameId, coinId);
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
      <ConnectButton />

      {account && (  // 변경: currentAccount 대신 account 사용
        <>
          {!gameId ? (
            <div>
              <h2>게임 시작</h2>
              <button onClick={handleCreateGame} disabled={loading}>새 게임 생성</button>
              <div>
                <input
                  type="text"
                  placeholder="게임 ID 입력"
                  value={joinGameIdInput}
                  onChange={(e) => setJoinGameIdInput(e.target.value)}
                />
                <button onClick={handleJoinGame} disabled={loading}>게임 참여</button>
              </div>
            </div>
          ) : (
            <>
              <div>
                <h2>게임 ID: {gameId}</h2>
                {isWaiting && (
                  <>
                    <p>플레이어 수: {parsedGame?.players.length || 1} (2명 이상 필요)</p>
                    <button onClick={handleStartGame} disabled={loading || !canStart}>게임 시작 (0.5 SUI)</button>
                  </>
                )}
                {isPlaying && (
                  <>
                    <p>게임 진행 중! WASD 또는 화살표 키로 이동하세요.</p>
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
