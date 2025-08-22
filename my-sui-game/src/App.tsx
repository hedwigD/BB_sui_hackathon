import React from 'react';
import { SuiClientProvider, WalletProvider } from '@mysten/dapp-kit';
import { getFullnodeUrl } from '@mysten/sui/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@mysten/dapp-kit/dist/index.css';
import TileGameFrontend from './TileGameFrontend';
import './App.css';
import { registerEnoki } from './registerEnoki';

// Create a network configuration for testnet
const networks = {
  testnet: { url: getFullnodeUrl('testnet') },
};

const queryClient = new QueryClient();

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <SuiClientProvider networks={networks} defaultNetwork="testnet">
        <registerEnoki.Component />
        <WalletProvider>
          <div className="App">
            <TileGameFrontend />
          </div>
        </WalletProvider>
      </SuiClientProvider>
    </QueryClientProvider>
  );
}

export default App;
