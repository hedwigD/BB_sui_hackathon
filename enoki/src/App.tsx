import { useCurrentAccount, ConnectButton, useSignAndExecuteTransaction, useSuiClient } from '@mysten/dapp-kit';
import { Transaction } from '@mysten/sui/transactions';
import { useState } from 'react';

function toMistFromSuiString(input: string): bigint | null {
  const s = input.trim();
  if (!s) return null;
  const parts = s.split('.');
  if (parts.length > 2) return null;
  const wholeStr = parts[0];
  const fracStrRaw = parts[1] ?? '';
  const digits = '0123456789';
  if (!wholeStr.split('').every((c) => digits.includes(c))) return null;
  if (fracStrRaw && !fracStrRaw.split('').every((c) => digits.includes(c))) return null;
  if (fracStrRaw.length > 9) return null; // 소수점 9자리까지 허용
  const whole = BigInt(wholeStr);
  const frac = BigInt((fracStrRaw + '0'.repeat(9)).slice(0, 9));
  return whole * 1_000_000_000n + frac; // 1 SUI = 1e9 MIST
}

export default function App() {
  const account = useCurrentAccount();
  const client = useSuiClient();
  const { mutateAsync: signAndExecute, isPending } = useSignAndExecuteTransaction();
  const [lastDigest, setLastDigest] = useState<string | null>(null);
  const [recipient, setRecipient] = useState('');
  const [amountSui, setAmountSui] = useState('');
  const [sendingAll, setSendingAll] = useState(false);
  const [sendingSome, setSendingSome] = useState(false);

  const sendNoPopupTx = async () => {
    if (!account) return;

    const tx = new Transaction();
    const [coin] = tx.splitCoins(tx.gas, [tx.pure.u64(1n)]); // 1 MIST
    tx.transferObjects([coin], tx.pure.address(account.address));
    tx.setGasBudget(1_000_000n);

    const res = await signAndExecute({ transaction: tx });
    setLastDigest(res.digest);
  };

  // 임의 금액 전송 (SUI 단위 입력, 가스는 별도 예산에서 지불)
  const sendAmountToRecipient = async () => {
    if (!account) return;
    if (!recipient) {
      alert('수신자 주소를 입력하세요.');
      return;
    }
    const mist = toMistFromSuiString(amountSui);
    if (mist === null || mist <= 0n) {
      alert('보낼 금액을 SUI 단위로 올바르게 입력하세요. 예: 0.1, 1, 2.3456789');
      return;
    }

    setSendingSome(true);
    try {
      const owner = account.address;
      // 1) 내 SUI 코인들 조회
      let coins: { coinObjectId: string; balance: string }[] = [];
      let cursor: string | null | undefined = undefined;
      do {
        const res = await client.getCoins({ owner, coinType: '0x2::sui::SUI', cursor, limit: 200 });
        coins = coins.concat(res.data.map((d) => ({ coinObjectId: d.coinObjectId, balance: d.balance })));
        cursor = res.hasNextPage ? res.nextCursor : null;
      } while (cursor);

      if (coins.length === 0) {
        alert('SUI 코인이 없습니다. faucet으로 충전 후 다시 시도하세요.');
        return;
      }

      const balances = coins.map((c) => BigInt(c.balance));
      const total = balances.reduce((a, b) => a + b, 0n);
      const gasBudget = 3_000_000n; // 0.001 SUI
      if (total < mist + gasBudget) {
        alert('가스를 포함해 잔액이 부족합니다.');
        return;
      }

      // 가장 큰 코인을 가스 코인으로 남김
      const sorted = coins.sort((a, b) => (BigInt(b.balance) > BigInt(a.balance) ? 1 : -1));
      const gasCoinId = sorted[0].coinObjectId;

      const tx = new Transaction();
      tx.setGasBudget(gasBudget);

      if (coins.length === 1) {
        const [sendCoin] = tx.splitCoins(tx.gas, [tx.pure.u64(mist)]);
        tx.transferObjects([sendCoin], tx.pure.address(recipient));
      } else {
        const nonGas = sorted.slice(1).map((c) => c.coinObjectId);
        const primaryId = nonGas[0];
        const primary = tx.object(primaryId);
        for (const cid of nonGas.slice(1)) {
          tx.mergeCoins(primary, [tx.object(cid)]);
        }
        try {
          // SDK 버전에 따라 setGasPayment 지원
          // @ts-ignore
          tx.setGasPayment([tx.object(gasCoinId)]);
        } catch {}
        const [sendCoin] = tx.splitCoins(primary, [tx.pure.u64(mist)]);
        tx.transferObjects([sendCoin], tx.pure.address(recipient));
      }

      const res = await signAndExecute({ transaction: tx });
      setLastDigest(res.digest);
    } finally {
      setSendingSome(false);
    }
  };

  // 잔액 전부 보내기(가스 제외)
  const sendAllToRecipient = async () => {
    if (!account) return;
    if (!recipient) {
      alert('수신자 주소를 입력하세요.');
      return;
    }

    setSendingAll(true);
    try {
      const owner = account.address;
      let coins: { coinObjectId: string; balance: string }[] = [];
      let cursor: string | null | undefined = undefined;
      do {
        const res = await client.getCoins({ owner, coinType: '0x2::sui::SUI', cursor, limit: 200 });
        coins = coins.concat(res.data.map((d) => ({ coinObjectId: d.coinObjectId, balance: d.balance })));
        cursor = res.hasNextPage ? res.nextCursor : null;
      } while (cursor);

      if (coins.length === 0) {
        alert('SUI 코인이 없습니다. faucet으로 충전 후 다시 시도하세요.');
        return;
      }

      const balances = coins.map((c) => BigInt(c.balance));
      const total = balances.reduce((a, b) => a + b, 0n);
      const gasBudget = 2_000_000n;
      if (total <= gasBudget) {
        alert('잔액이 가스 예산보다 작아서 전송할 수 없습니다.');
        return;
      }
      const amountToSend = total - gasBudget;

      const sorted = coins.sort((a, b) => (BigInt(b.balance) > BigInt(a.balance) ? 1 : -1));
      const gasCoinId = sorted[0].coinObjectId;

      const tx = new Transaction();
      tx.setGasBudget(gasBudget);

      if (coins.length === 1) {
        const [sendCoin] = tx.splitCoins(tx.gas, [tx.pure.u64(amountToSend)]);
        tx.transferObjects([sendCoin], tx.pure.address(recipient));
      } else {
        const nonGas = sorted.slice(1).map((c) => c.coinObjectId);
        const primaryId = nonGas[0];
        const primary = tx.object(primaryId);
        for (const cid of nonGas.slice(1)) {
          tx.mergeCoins(primary, [tx.object(cid)]);
        }
        try {
          // @ts-ignore
          tx.setGasPayment([tx.object(gasCoinId)]);
        } catch {}
        const [sendCoin] = tx.splitCoins(primary, [tx.pure.u64(amountToSend)]);
        tx.transferObjects([sendCoin], tx.pure.address(recipient));
      }

      const res = await signAndExecute({ transaction: tx });
      setLastDigest(res.digest);
    } finally {
      setSendingAll(false);
    }
  };

  return (
    <div style={{ maxWidth: 760, margin: '40px auto', fontFamily: 'Inter, sans-serif' }}>
      <h1>Enoki zkLogin Demo</h1>
      <p>구글로 로그인 → 팝업 없이 트랜잭션 실행 데모</p>

      <section style={{ margin: '24px 0' }}>
        <ConnectButton />
        {account && (
          <div style={{ marginTop: 8, fontSize: 14 }}>
            <b>Address:</b> {account.address}
          </div>
        )}
      </section>

      <section style={{ marginTop: 16 }}>
        <button
          onClick={sendNoPopupTx}
          disabled={!account || isPending}
          style={{
            padding: '10px 16px', borderRadius: 10, border: '1px solid #ddd', cursor: 'pointer',
            opacity: !account || isPending ? 0.6 : 1,
            marginRight: 12,
          }}
        >
          {isPending ? 'Submitting…' : 'Send transaction without popup'}
        </button>
      </section>

      <section style={{ marginTop: 24, display: 'grid', gap: 8 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            placeholder="Recipient address (0x...)"
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            style={{ flex: 1, padding: '10px 12px', borderRadius: 10, border: '1px solid #ddd' }}
          />
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            placeholder="Amount (SUI) 예: 0.1"
            value={amountSui}
            onChange={(e) => setAmountSui(e.target.value)}
            style={{ flex: 1, padding: '10px 12px', borderRadius: 10, border: '1px solid #ddd' }}
          />
          <button
            onClick={sendAmountToRecipient}
            disabled={!account || !recipient || !amountSui || sendingSome}
            style={{ padding: '10px 16px', borderRadius: 10, border: '1px solid #ddd', cursor: 'pointer', opacity: !account || !recipient || !amountSui || sendingSome ? 0.6 : 1 }}
          >
            {sendingSome ? 'Sending…' : 'Send amount'}
          </button>
        </div>
        <div>
          <button
            onClick={sendAllToRecipient}
            disabled={!account || !recipient || sendingAll}
            style={{ padding: '10px 16px', borderRadius: 10, border: '1px solid #ddd', cursor: 'pointer', opacity: !account || !recipient || sendingAll ? 0.6 : 1 }}
          >
            {sendingAll ? 'Sending…' : 'Send ALL (minus gas)'}
          </button>
        </div>
        <small style={{ color: '#666' }}>보낼 금액은 SUI 단위로 입력합니다. "Send ALL"은 가스(기본 0.001 SUI)를 제외한 전액을 전송합니다.</small>
      </section>

      {lastDigest && (
        <p style={{ marginTop: 16 }}>
          ✅ Submitted. Digest: <code>{lastDigest}</code>
        </p>
      )}

      <hr style={{ margin: '32px 0' }} />
      <details>
        <summary>설명</summary>
        <ul>
          <li>Send amount: 입력한 SUI 금액을 전송(소수점 최대 9자리). 가스는 별도 예산에서 지불.</li>
          <li>Send ALL: 보유 SUI를 조회해 가스 예산(기본 1,000,000 MIST = 0.001 SUI)을 제외하고 전송.</li>
          <li>보유 코인이 여러 개인 경우 자동으로 병합 후 전송합니다.</li>
        </ul>
      </details>
    </div>
  );
}