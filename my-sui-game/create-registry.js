#!/usr/bin/env node

const { SuiClient, getFullnodeUrl } = require('@mysten/sui/client');
const { Transaction } = require('@mysten/sui/transactions');
const { Ed25519Keypair } = require('@mysten/sui/keypairs/ed25519');
const fs = require('fs');

// Your package ID
const PACKAGE_ID = '0x5ef053bccf5ceb726968b36738295bd55b2e41eec9b5cf91a81c680e3adae16a';

async function createRegistry() {
  try {
    console.log('Creating new registry...');
    
    // Initialize Sui client
    const client = new SuiClient({ url: getFullnodeUrl('testnet') });
    
    // Check if we can read the current active address from sui config
    console.log('Please run this command in your terminal:');
    console.log('\n=== COPY AND RUN THESE COMMANDS ===');
    console.log(`sui client call \\`);
    console.log(`  --package ${PACKAGE_ID} \\`);
    console.log(`  --module tile_game_core \\`);
    console.log(`  --function create_registry \\`);
    console.log(`  --gas-budget 100000000`);
    console.log('\n=== END COMMANDS ===\n');
    
    console.log('After running the command:');
    console.log('1. Copy the object ID from the transaction output');
    console.log('2. Look for "Created Objects" section');
    console.log('3. Find the object with type containing "Registry"');
    console.log('4. Update REGISTRY_ID in sui-helpers.ts with the new object ID');
    
  } catch (error) {
    console.error('Error:', error);
  }
}

createRegistry();