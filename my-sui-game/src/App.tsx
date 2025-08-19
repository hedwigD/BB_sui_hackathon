import React from 'react';
import { WalletProvider } from '@suiet/wallet-kit';
import '@suiet/wallet-kit/style.css';
import TileGameFrontend from './TileGameFrontend';
import './App.css';

function App() {
  return (
    <WalletProvider>
      <div className="App">
        <TileGameFrontend />
      </div>
    </WalletProvider>
  );
}

export default App;
