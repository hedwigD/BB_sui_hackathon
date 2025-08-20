import { useSuiGame } from "./hooks/useSuiGame";
import EnhancedGameBoard from "./components/EnhancedGameBoard";
import PlayerPanel from "./components/PlayerPanel";
import GameStats from "./components/GameStats";
import PlayerCustomization from "./components/PlayerCustomization";
import KeyboardIndicator from "./components/KeyboardIndicator";
import { useSoundEffects } from "./hooks/useSoundEffects";
import { useKeyboardControls } from "./hooks/useKeyboardControls";
import { useState } from "react";

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
import { getAuth, signInWithPopup, GoogleAuthProvider } from "firebase/auth";
// import { getAnalytics } from "firebase/analytics"; // 브라우저 가드 없으면 주석 권장

// Firebase config (그대로 사용)
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
// if (typeof window !== "undefined") getAnalytics(app); // 필요시 가드 후 사용

const auth = getAuth(app);                     // ✅ app 전달
const googleAuthProvider = new GoogleAuthProvider();

function App() {
  const {
    state,
    movePlayer,
    startGame,
    resetGame,
    customizePlayers,
    playerConfig,
    turnTimeLeft,
    totalMoves,
  } = useSuiGame();

  const [zkAddress, setZkAddress] = useState<string | null>(null);
  const soundEffects = useSoundEffects();
  const [showCustomization, setShowCustomization] = useState(false);

  // Google 로그인 → JWT
  async function getGoogleJwt(): Promise<string> {
    const result = await signInWithPopup(auth, googleAuthProvider); // ✅ auth 포함
    return await result.user.getIdToken();
  }

  // zkLogin 핸들러
  // JWT payload 파서 (sub/aud/iss 꺼내기)
  function parseJwt(jwt: string) {
    const [, payload] = jwt.split('.');
    return JSON.parse(atob(payload)) as { sub: string; aud: string; iss: string };
  }

  // 유저 고정 salt (주소 안정화). 데모: localStorage에 저장
  function getOrCreateUserSalt(): bigint {
    const k = 'zklogin_user_salt';
    const v = localStorage.getItem(k);
    if (v) return BigInt(v);
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    const hex = '0x' + Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
    localStorage.setItem(k, hex);
    return BigInt(hex);
  }

  // zkLogin 핸들러 (세션 설정)
  async function handleZkLogin() {
    try {
      const jwt = await getGoogleJwt();
      const { sub, aud, iss } = parseJwt(jwt);

      // 0) 주소 고정용 salt(BigInt). 실제 서비스에선 서버 보관 권장
      const userSalt = getOrCreateUserSalt();
      const legacyAddress = false; // 전역으로 일관되게 유지!

      // 1) 주소 계산 (둘 중 하나만 쓰면 됨)
      const address = jwtToAddress(jwt, userSalt, legacyAddress);

      setZkAddress(address);
      console.log('✅ zkLogin address:', address);
      /*같아야 정상: seed 경유 계산 (검증용)
      const seed = genAddressSeed(userSalt, 'sub', sub, aud);
      const address2 = computeZkLoginAddressFromSeed(seed, iss, legacyAddress);
      if (address !== address2) console.warn('Address mismatch (legacy 플래그 불일치 가능)');
*/
      // 2) 네트워크 상태로 만료 에폭 산정
      const sui = new SuiClient({ url: getFullnodeUrl('testnet') });
      const { epoch } = await sui.getLatestSuiSystemState();
      const maxEpoch = Number(epoch) + 2;

      // 3) 에페메럴 키 & nonce 생성 (지갑 팝업 없이 서명용)
      const ephem = new Ed25519Keypair();
      const randomness = generateRandomness();
      const nonce = generateNonce(ephem.getPublicKey(), maxEpoch, randomness);
      const ephemPublicKey = getExtendedEphemeralPublicKey(ephem.getPublicKey());

      // 4) (백엔드) 프루버 호출해서 proof inputs 받기
      //    프루버는 jwt/nonce/ephemPublicKey/iss/aud/sub/userSalt 등을 받아 증명을 생성.
      //    응답을 그대로 inputs로 사용.
      const res = await fetch('/api/zklogin/prove', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jwt,
          nonce,
          maxEpoch,
          ephemPublicKey,
          iss,
          aud,
          sub,
          userSalt: userSalt.toString(),
          legacyAddress,
        }),
      });
      if (!res.ok) throw new Error('Prover request failed');
      const inputs: any = await res.json(); // 프루버 스키마에 맞게 그대로 사용

      // 🔑 여기까지가 "로그인/세션" 단계.
      // 이후 실제 move 트랜잭션 때:
      //   1) txBytes = await tx.build({ client: sui })
      //   2) const userSignature = await ephem.signTransaction(txBytes)
      //   3) const serialized = getZkLoginSignature({ inputs, maxEpoch, userSignature })
      //   4) executeTransactionBlock({ transactionBlock: txBytes, signature: serialized })

      setZkAddress(address);
      console.log('✅ zkLogin address:', address);
      console.log('✅ session:', { maxEpoch, nonce, ephemPublicKey });

      // 원한다면 세션 정보를 전역/컨텍스트에 저장해 다음 이동에서 사용:
      // window.__zk = { inputs, maxEpoch, ephem, address, client: sui };
    } catch (err) {
      console.error('zkLogin failed:', err);
    }
  }


  // 키보드 이동
  useKeyboardControls(
    (direction) => {
      if (state.phase === "playing") {
        movePlayer(state.currentTurn, direction);
      }
    },
    state.phase === "playing"
  );

  function getGameResult() {
    if (state.phase !== "finished") return null;
    const [p1, p2] = state.players;
    if (p1.score > p2.score) return { winner: playerConfig.p1.name, isDraw: false };
    if (p2.score > p1.score) return { winner: playerConfig.p2.name, isDraw: false };
    return { winner: null, isDraw: true };
  }

  const gameResult = getGameResult();

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-4">
      <div className="flex flex-col items-center">
        <h1 className="text-5xl font-bold mb-8 bg-gradient-to-r from-blue-400 via-purple-500 to-pink-500 bg-clip-text text-transparent drop-shadow-lg">
          ⚡ Sui Tile Capture Arena ⚡
        </h1>

        {/* Game Controls */}
        <div className="mb-8 flex space-x-6">
          {state.phase === "lobby" && (
            <button
              onClick={() => {
                soundEffects.buttonClick();
                startGame();
              }}
              className="px-8 py-4 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-2xl font-bold text-lg shadow-2xl transform transition-all duration-200 hover:scale-105 hover:shadow-green-500/25 active:scale-95"
            >
              🚀 Start Epic Battle
            </button>
          )}

          {!zkAddress && (
            <button
              onClick={handleZkLogin}
              className="px-6 py-3 bg-gradient-to-r from-yellow-500 to-yellow-600 text-white rounded-xl font-semibold shadow-xl transform transition-all duration-200 hover:scale-105 hover:shadow-yellow-500/25 active:scale-95"
            >
              🔐 Login with zkLogin
            </button>
          )}

          {state.phase === "finished" && (
            <button
              onClick={() => {
                soundEffects.buttonClick();
                resetGame();
              }}
              className="px-8 py-4 bg-gradient-to-r from-blue-500 to-cyan-600 text-white rounded-2xl font-bold text-lg shadow-2xl transform transition-all duration-200 hover:scale-105 hover:shadow-blue-500/25 active:scale-95"
            >
              🔄 Play Again
            </button>
          )}

          <button
            onClick={() => {
              soundEffects.buttonClick();
              resetGame();
            }}
            className="px-6 py-3 bg-gradient-to-r from-gray-600 to-gray-700 text-white rounded-xl font-semibold shadow-xl transform transition-all duration-200 hover:scale-105 hover:shadow-gray-500/25 active:scale-95"
          >
            🔄 Reset
          </button>

          {state.phase === "lobby" && (
            <button
              onClick={() => {
                soundEffects.buttonClick();
                setShowCustomization(true);
              }}
              className="px-6 py-3 bg-gradient-to-r from-purple-600 to-purple-700 text-white rounded-xl font-semibold shadow-xl transform transition-all duration-200 hover:scale-105 hover:shadow-purple-500/25 active:scale-95"
            >
              🎨 Customize
            </button>
          )}
        </div>

        {/* Game Statistics */}
        <GameStats
          players={state.players}
          suiTiles={state.suiTiles}
          phase={state.phase}
          totalMoves={totalMoves}
        />

        {/* Player Panel */}
        <PlayerPanel
          players={state.players}
          currentTurn={state.currentTurn}
          turnTimeLeft={turnTimeLeft}
          playerConfig={playerConfig}
        />

        {/* Enhanced Game Board */}
        <EnhancedGameBoard
          boardSize={state.boardSize}
          players={state.players}
          suiTiles={state.suiTiles}
          onMove={movePlayer}
          currentTurn={state.currentTurn}
          phase={state.phase}
          playerConfig={playerConfig}
        />

        {/* Game Status */}
        {state.phase === "lobby" && (
          <div className="mt-8 p-8 bg-gradient-to-r from-indigo-500/20 to-purple-500/20 backdrop-blur rounded-2xl border border-white/20 text-center max-w-2xl mx-auto">
            <h2 className="text-2xl font-bold mb-4 text-white">🎮 How to Play:</h2>
            <div className="text-white/90 space-y-2">
              {zkAddress && <div className="text-white/80 text-sm">Logged in: {zkAddress.slice(0,10)}…</div>}

              <p>🦸‍♂️ Control your hero to capture precious Sui gems 💎</p>
              <p>⏱️ Each turn lasts 3 seconds - think fast!</p>
              <p>🏆 Capture more gems than your opponent to win!</p>
              <p>⌨️ Use WASD keys or Arrow keys to move</p>
              <p>🖱️ Or click the directional buttons on screen</p>
            </div>
          </div>
        )}

        {state.phase === "finished" && gameResult && (
          <div className="mt-8 p-8 bg-gradient-to-r from-yellow-400/20 to-orange-500/20 backdrop-blur rounded-2xl border border-yellow-400/30 text-center max-w-2xl mx-auto">
            <div className="text-6xl mb-4">{gameResult.isDraw ? "🤝" : "🎉"}</div>
            <h2 className="text-3xl font-bold mb-4 text-white">
              {gameResult.isDraw ? "Epic Draw!" : `${gameResult.winner} Conquers!`}
            </h2>
            <div className="text-xl text-white/90 mb-4">Final Battle Results:</div>
            <div className="flex justify-center space-x-8 text-white">
              {state.players.map((p) => (
                <div key={p.id} className="text-center">
                  <div className="text-2xl mb-1">
                    {playerConfig[p.id as keyof typeof playerConfig]?.avatar}
                  </div>
                  <div className="font-bold">
                    {playerConfig[p.id as keyof typeof playerConfig]?.name}
                  </div>
                  <div className="text-2xl font-bold">{p.score} 💎</div>
                </div>
              ))}
            </div>
            <div className="mt-4 text-sm text-white/70">
              Total moves: {totalMoves} • Battle duration: Epic!
            </div>
          </div>
        )}

        <PlayerCustomization
          isOpen={showCustomization}
          onClose={() => setShowCustomization(false)}
          onCustomize={(p1, p2) => {
            customizePlayers(p1, p2);
            soundEffects.buttonClick();
          }}
        />

        <KeyboardIndicator isVisible={state.phase === "playing"} />
      </div>
    </div>
  );
}

export default App;
