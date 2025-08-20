import React, { useState, useEffect } from 'react';
import { ConnectButton, useWallet } from '@suiet/wallet-kit';
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
  extractGameIdFromObjectChanges,
  extractGameIdFromEvents,
  checkDeployedObjects,
} from './sui-helpers';

// ZK Login imports
import {
  jwtToAddress,
  genAddressSeed,
  computeZkLoginAddressFromSeed,
  generateRandomness,
  generateNonce,
  getExtendedEphemeralPublicKey,
  getZkLoginSignature,
} from '@mysten/sui/zklogin';
import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { initializeApp } from "firebase/app";
import { getAuth, 
  signInWithPopup, 
  GoogleAuthProvider, 
  signInWithRedirect,
  getRedirectResult,
  browserPopupRedirectResolver, } from "firebase/auth";

// Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyDThzSKDeMtc7513VvVHTI9e0A52R8DApA",
  authDomain: "sui-tile-game.firebaseapp.com",
  projectId: "sui-tile-game",
  storageBucket: "sui-tile-game.firebasestorage.app",
  messagingSenderId: "2420150248",
  appId: "1:2420150248:web:a3d22f7accceaceeb2de5d",
  measurementId: "G-XWYXQ2N3JM",
};

// Firebase init
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const googleAuthProvider = new GoogleAuthProvider();

// Google Auth Provider 설정
googleAuthProvider.setCustomParameters({
  prompt: 'select_account'
});

const TileGameFrontend: React.FC = () => {
  const { account, signAndExecuteTransactionBlock } = useWallet();
  const [gameId, setGameId] = useState<string | null>(null);
  const [moveCapId, setMoveCapId] = useState<string | null>(null);
  const [parsedGame, setParsedGame] = useState<ParsedGame | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [joinGameIdInput, setJoinGameIdInput] = useState('');

  // ZK Login states
  const [zkAddress, setZkAddress] = useState<string | null>(null);
  const [zkSession, setZkSession] = useState<any>(null);

  // JWT payload 파서
  const parseJwt = (jwt: string) => {
    const [, payload] = jwt.split('.');
    return JSON.parse(atob(payload)) as { sub: string; aud: string; iss: string };
  };

  // 유저 고정 salt (주소 안정화) - 메모리에 저장
  const getOrCreateUserSalt = (): bigint => {
    if (!(window as any).__zkLoginUserSalt) {
      const bytes = crypto.getRandomValues(new Uint8Array(32));
      const hex = '0x' + Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
      (window as any).__zkLoginUserSalt = BigInt(hex);
    }
    return (window as any).__zkLoginUserSalt;
  };

  // Google 로그인 → JWT
  const getGoogleJwt = async (): Promise<string> => {
    try {
      // 팝업 우선 + 환경 감지 리졸버
      const result = await signInWithPopup(auth, googleAuthProvider, browserPopupRedirectResolver);
      return await result.user.getIdToken();
    } catch (e: any) {
      // 팝업이 닫히거나 막히면 → 리다이렉트 플로우 폴백
      if (e?.code === 'auth/popup-closed-by-user' || e?.code === 'auth/popup-blocked') {
        await signInWithRedirect(auth, googleAuthProvider);
        const redirectResult = await getRedirectResult(auth);
        if (!redirectResult?.user) throw new Error('Redirect login failed');
        return await redirectResult.user.getIdToken();
      }
      throw e;
    }
  };
  

  // zkLogin 핸들러
  const handleZkLogin = async () => {
    setLoading(true);
    setError(null);

    try {
      const jwt = await getGoogleJwt();
      const { sub, aud, iss } = parseJwt(jwt);

      const userSalt = getOrCreateUserSalt();
      const legacyAddress = false;

      // 주소 계산
      const address = jwtToAddress(jwt, userSalt, legacyAddress);

      // 네트워크 상태로 만료 에폭 산정
      const sui = new SuiClient({ url: getFullnodeUrl('testnet') });
      const { epoch } = await sui.getLatestSuiSystemState();
      const maxEpoch = Number(epoch) + 2;

      // 에페메럴 키 & nonce 생성
      const ephem = new Ed25519Keypair();
      const randomness = generateRandomness();
      const nonce = generateNonce(ephem.getPublicKey(), maxEpoch, randomness);
      const ephemPublicKey = getExtendedEphemeralPublicKey(ephem.getPublicKey());

      // (프루버는 아직 안 호출) — 세션 정보만 저장
      const sessionData = {
        jwt,
        nonce,
        maxEpoch,
        ephemPublicKey,
        iss,
        aud,
        sub,
        userSalt: userSalt.toString(),
        legacyAddress,
        ephem,
        address,
      };

      setZkAddress(address);
      setZkSession(sessionData);

      console.log('✅ zkLogin address:', address);
      console.log('✅ zkLogin session set up successfully');
    } catch (err) {
      console.error('zkLogin failed:', err);
      setError(`ZK 로그인 실패: ${err instanceof Error ? err.message : '알 수 없는 오류'}`);
    } finally {
      setLoading(false);
    }
  };

  // ✅ (A) 프루버 입력 확보 헬퍼: 세션에 inputs 없으면 /api/zklogin/prove 호출
  async function ensureZkInputs(session: any) {
    if (session?.inputs) return session;
    const {
      jwt, nonce, maxEpoch, ephemPublicKey, iss, aud, sub, userSalt, legacyAddress,
    } = session;

    const res = await fetch('/api/zklogin/prove', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jwt, nonce, maxEpoch, ephemPublicKey, iss, aud, sub, userSalt, legacyAddress,
      }),
    });
    if (!res.ok) throw new Error(`Prover request failed: ${res.status}`);
    const inputs = await res.json();
    const updated = { ...session, inputs };
    setZkSession(updated);
    return updated;
  }

  // ✅ (B) 지갑 없이 zk로 트랜잭션 전송
  async function executeTxWithZk(tx: TransactionBlock) {
    if (!zkSession || !zkAddress) throw new Error('ZK 세션이 없습니다.');
    const session = await ensureZkInputs(zkSession);

    // 보낸이/가스 설정
    tx.setSender(zkAddress);
    tx.setGasBudget(1_000_000_000);

    // 트랜잭션 바이트 빌드
    const txBytes = await tx.build({ client: SUI_CLIENT });

    // 에페메럴 키로 서명
    const userSignature = await (session.ephem as any).signTransaction(txBytes); // SDK 버전에 따라 signTransactionBlock 등일 수 있음

    // zkLogin 직렬화 서명 생성
    if (!session.inputs) throw new Error('ZK inputs가 없습니다. 프루버 응답을 먼저 준비하세요.');
    const serialized = (getZkLoginSignature as unknown as (a: any) => any)({
      inputs: session.inputs,
      maxEpoch: session.maxEpoch,
      userSignature,
    });

    // RPC 전송
    const result = await SUI_CLIENT.executeTransactionBlock({
      transactionBlock: txBytes,
      signature: serialized,
      options: {
        showEffects: true,
        showEvents: true,
        showObjectChanges: true,
        showBalanceChanges: true,
      },
    });
    return result;
  }

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

  // ✅ (C) 트랜잭션 실행 헬퍼: 지갑 있으면 지갑, 없으면 zk로 라우팅
  const executeTx = async (tx: TransactionBlock) => {
    setLoading(true);
    setError(null);
    try {
      console.log('[DEBUG] Executing transaction:', tx);
      try {
        console.log('[DEBUG] Transaction data:', JSON.stringify(tx, null, 2));
      } catch {}

      // 활성 주소
      const targetAddress = zkAddress || account?.address || '';
      if (!targetAddress) {
        throw new Error('주소가 없습니다. 지갑 연결 또는 ZK 로그인을 해주세요.');
      }

      // 가스 잔액 확인(선택)
      const balance = await SUI_CLIENT.getBalance({
        owner: targetAddress,
        coinType: '0x2::sui::SUI'
      });
      console.log('[DEBUG] User SUI balance:', balance);

      // 공통 설정
      tx.setGasBudget(1_000_000_000);
      tx.setSender(targetAddress);

      let result;
      if (account?.address) {
        // A) 지갑 서명 경로
        console.log('[DEBUG] Proceeding to wallet signature');
        result = await signAndExecuteTransactionBlock({
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
      } else if (zkSession && zkAddress) {
        // B) zk 서명 경로
        console.log('[DEBUG] Proceeding to zk signature');
        result = await executeTxWithZk(tx);
      } else {
        throw new Error('서명 수단이 없습니다. 지갑을 연결하거나 ZK 로그인을 해주세요.');
      }

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

  // 게임 생성
  const handleCreateGame = async () => {
    const targetAddress = zkAddress || account?.address;
    if (!targetAddress) {
      setError('지갑을 연결하거나 ZK 로그인을 해주세요.');
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

      if (objectChanges) {
        console.log('[DEBUG] Trying to extract from objectChanges...');
        newGameId = extractGameIdFromObjectChanges(objectChanges);
        console.log('[DEBUG] Extracted from objectChanges:', newGameId);
      }

      if (!newGameId && events) {
        console.log('[DEBUG] Trying to extract from events...');
        newGameId = extractGameIdFromEvents(events);
        console.log('[DEBUG] Extracted from events:', newGameId);
      }

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

  // 게임 참여
  const handleJoinGame = async () => {
    if (!joinGameIdInput) {
      setError('게임 ID를 입력하세요.');
      return;
    }

    const targetAddress = zkAddress || account?.address;
    if (!targetAddress) {
      setError('지갑을 연결하거나 ZK 로그인을 해주세요.');
      return;
    }

    try {
      console.log('[DEBUG] Checking game status before joining:', joinGameIdInput);
      const gameState = await getParsedGame(joinGameIdInput);
      console.log('[DEBUG] Game state:', gameState);

      if (!gameState) {
        setError('게임을 찾을 수 없습니다.');
        return;
      }

      if (gameState.status !== 0) {
        setError(`게임이 참여 가능한 상태가 아닙니다. 현재 상태: ${gameState.status}`);
        return;
      }

      // 0.05 SUI 코인 찾기
      const coinId = await findSuiCoin(targetAddress, BigInt(50_000_000));
      if (!coinId) {
        setError('충분한 SUI가 없습니다. (최소 0.05 SUI 필요)');
        return;
      }

      const tx = joinGame(joinGameIdInput, coinId);
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
    const targetAddress = zkAddress || account?.address;
    if (!gameId || !targetAddress) {
      setError('지갑 연결/ZK 로그인 및 게임 ID 필요');
      return;
    }

    console.log('[DEBUG] Starting game with ID:', gameId);

    try {
      const tx = startGame(gameId);
      const result = await executeTx(tx);

      if (result) {
        let newMoveCapId = null;

        if (result.objectChanges) {
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

  // 보드 렌더링
  const renderBoard = () => {
    if (!parsedGame) return null;
    const board: string[][] = Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(' '));

    parsedGame.playersPositions.forEach((pos, index) => {
      if (pos.x >= 0 && pos.x < BOARD_SIZE && pos.y >= 0 && pos.y < BOARD_SIZE) {
        board[pos.y][pos.x] = `P${index + 1}`;
      }
    });

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

  // 게임 상태
  const isWaiting = parsedGame?.status === 0;
  const isPlaying = parsedGame?.status === 1;
  const isEnded = parsedGame?.status === 2 || parsedGame?.tilesRemaining === 0 || !!parsedGame?.winner;
  const canStart = isWaiting && parsedGame?.players.length >= 2;

  // 연결된 주소 표시
  const connectedAddress = zkAddress || account?.address;

  return (
    <div style={{ padding: '20px' }}>
      <h1>Sui 타일 게임</h1>

      {/* 지갑 연결 및 ZK 로그인 섹션 */}
      <div style={{ marginBottom: '20px', padding: '15px', border: '1px solid #ddd', borderRadius: '8px' }}>
        <h3>로그인 옵션</h3>

        {/* 기존 지갑 연결 */}
        <div style={{ marginBottom: '10px' }}>
          <ConnectButton />
          {account && (
            <p style={{ fontSize: '12px', color: '#666', marginTop: '5px' }}>
              지갑 주소: {account.address.slice(0, 10)}...
            </p>
          )}
        </div>

        {/* ZK 로그인 - 항상 표시 */}
        <div>
          {!zkAddress ? (
            <button
              onClick={handleZkLogin}
              disabled={loading}
              style={{
                padding: '10px 20px',
                backgroundColor: '#4285f4',
                color: 'white',
                border: 'none',
                borderRadius: '5px',
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.6 : 1
              }}
            >
              🔐 Google로 ZK 로그인
            </button>
          ) : (
            <div>
              <p style={{ color: 'green', fontWeight: 'bold' }}>
                ✅ ZK 로그인 완료
              </p>
              <p style={{ fontSize: '12px', color: '#666' }}>
                ZK 주소: {zkAddress.slice(0, 10)}...
              </p>
              <button
                onClick={() => {
                  setZkAddress(null);
                  setZkSession(null);
                }}
                style={{
                  padding: '5px 10px',
                  backgroundColor: '#dc3545',
                  color: 'white',
                  border: 'none',
                  borderRadius: '3px',
                  fontSize: '12px',
                  cursor: 'pointer',
                  marginTop: '5px'
                }}
              >
                로그아웃
              </button>
            </div>
          )}
        </div>

        {connectedAddress && (
          <p style={{
            marginTop: '10px',
            padding: '10px',
            backgroundColor: '#f0f8ff',
            borderRadius: '5px',
            fontSize: '14px'
          }}>
            <strong>활성 주소:</strong> {connectedAddress.slice(0, 10)}...
            <br />
            <small>({zkAddress ? 'ZK 로그인' : '지갑 연결'} 사용 중)</small>
          </p>
        )}
      </div>

      {connectedAddress && (
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
                {isWaiting && (
                  <>
                    <p>플레이어 수: {parsedGame?.players.length || 1} (2명 이상 필요)</p>
                    <button onClick={handleStartGame} disabled={loading || !canStart}>게임 시작</button>
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
