# Sui Tile Game Frontend Setup

This is a React TypeScript frontend for the Sui Tile Game built according to the specifications in `tip.md`.

## Prerequisites

1. Node.js (v16 or higher)
2. npm or yarn
3. Sui wallet extension (Sui Wallet, Ethos, etc.)

## Installation

1. Install dependencies:
```bash
npm install
```

2. Configure the contract details in `src/utils/sui.ts`:
   - Update `PACKAGE_ID` with your deployed contract package ID
   - Update `REGISTRY_ID` with your deployed registry object ID

## Deployment Steps

After deploying your Move contract:

1. Deploy the Move contract:
```bash
cd ../move_logic
sui client publish --gas-budget 10000000
```

2. Note the package ID and any shared objects created during deployment
3. Update the frontend configuration:
   - Copy the package ID to `PACKAGE_ID` in `src/utils/sui.ts`
   - Copy the registry object ID to `REGISTRY_ID` in `src/utils/sui.ts`

## Running the Frontend

```bash
npm start
```

The app will open at http://localhost:3000

## Features Implemented

✅ **Game Lifecycle**
- Create new games
- Join existing games  
- Start games with 10 SUI funding
- Real-time game state updates

✅ **Gameplay**
- Turn-based movement controls (Up, Down, Left, Right)
- Turn timeout system (3 second limit)
- Force timeout moves for inactive players
- Score tracking and tile capture events

✅ **UI Components**
- Game lobby for creating/joining games
- Interactive game board (11x11 grid)
- Player controls with directional buttons
- Real-time timer and move counter
- Score display and game status

✅ **Wallet Integration**
- Sui wallet connectivity
- Transaction signing and execution
- Error handling with user-friendly messages

✅ **Event System**
- Real-time event subscription
- Game state synchronization
- Turn changes and tile captures

## Architecture

### Key Components

- **`GameLobby`**: Create or join games
- **`GameWaitingRoom`**: Lobby before game starts
- **`GameBoard`**: Visual game board with player positions
- **`GameControls`**: Movement controls and timeout actions
- **`useGameState`**: Custom hook for game state management

### State Management

The app uses React hooks and context for state management:
- Game state synchronization via Sui events
- Local timer management for turn timeouts
- Error handling and user feedback

### Transaction Flow

1. **Create Game**: Calls `create_game` on the registry
2. **Join Game**: Calls `join_game` with game ID
3. **Start Game**: Creator funds with 10 SUI, calls `start_game`
4. **Make Move**: Uses MoveCap to call `move_with_cap`
5. **Force Timeout**: Anyone can call `force_timeout_move` after 3s

## Error Handling

The frontend includes comprehensive error handling:
- Wallet connection errors
- Transaction failures
- Game state validation
- User-friendly error messages for all contract abort codes

## Next Steps

1. Deploy the Move contract to testnet/mainnet
2. Update the configuration with actual IDs
3. Test the full game flow with two players
4. Optional: Add additional features like game history, spectator mode, etc.

## Configuration Required

Before running, update these values in `src/utils/sui.ts`:

```typescript
export const PACKAGE_ID = 'YOUR_PACKAGE_ID_HERE'; // From sui client publish
export const REGISTRY_ID = 'YOUR_REGISTRY_ID_HERE'; // From deployment output
```

The registry ID will be shown in the deployment output as a shared object.