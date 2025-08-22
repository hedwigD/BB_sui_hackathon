import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

import { getFullnodeUrl } from '@mysten/sui/client';
import { createNetworkConfig, SuiClientProvider, WalletProvider } from '@mysten/dapp-kit';
import '@mysten/dapp-kit/dist/index.css';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { registerEnoki } from './registerEnoki';

const queryClient = new QueryClient();

// 네트워크 설정 (testnet 권장)
const { networkConfig } = createNetworkConfig({
  testnet: { url: getFullnodeUrl('testnet') },
  mainnet: { url: getFullnodeUrl('mainnet') },
});

function Root() {
  return (
    <QueryClientProvider client={queryClient}>
      <SuiClientProvider networks={networkConfig} defaultNetwork="testnet">
        {/* Enoki 지갑을 dapp-kit에 등록 */}
        <registerEnoki.Component />
        <WalletProvider autoConnect>
          <App />
        </WalletProvider>
      </SuiClientProvider>
    </QueryClientProvider>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);