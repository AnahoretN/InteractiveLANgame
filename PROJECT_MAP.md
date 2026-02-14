# Interactive LAN Game - Project Map

## Project Structure

```
InteractiveLANgame/
├── components/
│   ├── Button.tsx                 # Reusable button component
│   ├── ErrorBoundary.tsx            # Error boundary component
│   ├── MobileView.tsx               # Main mobile client view
│   ├── HostView.tsx                 # Main host view
│   ├── App.tsx                      # Root application component
│   └── host/                        # Host-specific components
│       ├── ConnectionPanel.tsx       # Connection info and QR code display
│       ├── LobbyPanel.tsx           # Main lobby panel
│       ├── GameSelectorCard.tsx     # Individual pack selection card
│       ├── GamePlay.tsx             # Main game play component
│       ├── GameSession.tsx           # Session management panel
│       ├── GameSelectorModal.tsx     # Pack selection modal
│       ├── ListItems.tsx            # Client/Team list items
│       ├── SettingsModal.tsx         # Settings modal
│       ├── TeamManager.tsx           # Team management interface
│       ├── HostSetupPanel.tsx        # Initial host setup
│       ├── messageHandlers/          # Message handler components
│       │   ├── CommandsHandler.tsx   # Commands/teams message handling
│       │   └── BuzzerHandler.tsx    # Buzzer message handling
│       ├── game/                     # Game play components
│       │   ├── GameBoard.tsx         # Game board with themes/questions
│       │   ├── GameBoardExtended.tsx # Extended game board
│       │   ├── GameScreens.tsx        # Cover, themes, round intro screens
│       │   ├── QuestionModal.tsx      # Question display modal
│       │   ├── SuperGameRound.tsx    # Super game betting and answers
│       │   ├── ScorePanel.tsx         # Team scores display
│       │   ├── TimerDisplay.tsx       # Timer display component
│       │   ├── GameNavigation.tsx     # Next/prev round controls
│       │   ├── BettingPanel.tsx       # Super game betting interface
│       │   ├── AnswersGrid.tsx        # Super game answers grid
│       │   ├── SuperGameModals.tsx    # Super game modal screens
│       │   ├── useGameState.ts       # Game state management hook
│       │   ├── useSuperGame.ts       # Super game state hook
│       │   ├── fontUtils.ts          # Font size calculations
│       │   └── types.ts             # Game-specific type definitions
│       ├── packeditor/                # Pack editor subdirectory (modular)
│       │   ├── Modals.tsx            # BaseModal, FileUpload components
│       │   ├── RoundModal.tsx         # Round editing modal
│       │   ├── ThemeModal.tsx         # Theme editing modal
│       │   ├── QuestionModal.tsx      # Question editing modal
│       │   ├── RoundManager.tsx       # Round list management
│       │   ├── PackManager.tsx        # Pack management interface
│       │   ├── utils.ts              # File conversion utilities
│       │   ├── types.ts              # Pack editor types with legacy support
│       │   └── pack/                 # Legacy pack components
│       │       ├── ThemeCard.tsx       # Theme card component
│       │       ├── QuestionEditor.tsx   # Question editor
│       │       └── Editor.tsx         # Editor placeholder
│       └── index.ts                  # Host components barrel file
├── hooks/
│   ├── useLocalStorage.ts           # LocalStorage utilities & hooks
│   ├── useSessionSettings.ts        # Session settings management
│   ├── useTeams.ts                # Team management hook
│   ├── useBuzz.ts                  # Buzzer state management
│   ├── useBuzzerDebounce.ts        # Buzzer debounce hook
│   ├── useInterval.ts              # Interval management hook
│   ├── useURLParams.ts             # URL parameter hooks
│   ├── useBuzzerTimer.ts          # Buzzer timer management
│   ├── useP2PHost.ts              # P2P host connection hook
│   ├── useP2PClient.ts             # P2P client connection hook
│   ├── useGamePlayState.ts         # Game play state management
│   ├── useKeyboardNavigation.ts     # Keyboard navigation hook (NEW)
│   ├── useSyncEffects.tsx          # Sync effects hook (NEW)
│   ├── useP2PMessageHandlers.tsx # P2P message handlers (NEW)
│   ├── useHostStateManager.ts      # Host state manager (NEW)
│   ├── useHostStateManager.tsx     # Host state manager .tsx version (backup)
│   └── index.ts                    # Hooks barrel file
├── utils/
│   ├── uuid.ts                     # UUID generation utility
│   ├── healthColor.ts              # Health color calculation utilities
│   └── network.ts                  # Network utilities
├── types.ts                          # Global type definitions (P2P messages)
├── config.ts                         # App configuration constants
├── .prettierrc.json                  # Prettier configuration
├── .eslintrc.json                    # ESLint configuration
└── server/                          # WebRTC signalling server
```

## Key Optimizations Performed

### 1. PackEditor Refactoring
- **Before**: 1743 lines with duplicate modal components
- **After**: 933 lines using modular components from `packeditor/`
- **Reduction**: ~810 lines (46% smaller)

### 2. Utility Extraction
Created shared utilities to eliminate code duplication:
- `utils/uuid.ts` - UUID generation (was duplicated in 5+ files)
- `utils/healthColor.ts` - Health color calculation (was duplicated in 4+ files)
- `utils/network.ts` - Network utilities (was duplicated in 2 files)
- `components/host/packeditor/utils.ts` - Uses centralized UUID generation

### 3. Modular Component Structure
Created `components/host/game/` subdirectory with reusable components:
- `GameBoard.tsx` - Game board rendering
- `GameScreens.tsx` - Cover, themes, and round intro screens
- `QuestionModal.tsx` - Question display modal
- `SuperGameRound.tsx` - Super game betting and answers
- `ScorePanel.tsx` - Team scores display
- `TimerDisplay.tsx` - Timer display component
- `GameNavigation.tsx` - Navigation controls
- `BettingPanel.tsx` - Betting interface (simplified)
- `AnswersGrid.tsx` - Answers grid display

### 4. Custom Hooks
Created specialized hooks for state management:
- `useInterval.ts` - Declarative setInterval with cleanup
- `useURLParams.ts` - URL parameter management
- `useBuzzerTimer.ts` - Buzzer timer state
- `useGamePlayState.ts` - Game play state management
- `useKeyboardNavigation.ts` - Keyboard navigation for game play
- `useSyncEffects.tsx` - Sync effects for teams
- `useP2PMessageHandlers.tsx` - P2P message handlers
- `useHostStateManager.ts` - Host state management

### 5. Type Safety Improvements (Latest)
- **Replaced all `any` types** with proper TypeScript interfaces:
  - `useKeyboardNavigation.ts` - Added `ActiveQuestion`, `PackRound`, `PackTheme` interfaces
  - `useSyncEffects.tsx` - Added `Team`, `Command`, `P2PHost` interfaces
  - `useP2PMessageHandlers.tsx` - Added `ConnectedClient`, `P2PHost` interfaces
  - `useHostStateManager.ts` - Added `ConnectedClient` interface
  - `GameSelectorModal.tsx` - Fixed `Round` type usage
- **Result**: Zero `any` types in codebase

### 6. Code Quality Tools
- **Prettier**: Configured with `.prettierrc.json`
  - `npm run format` - Format all files
  - `npm run format:check` - Check formatting
- **ESLint**: Configured with `.eslintrc.json`
  - `npm run lint` - Lint all files
- **Build**: All optimizations verified passing (2109 modules, ~2.5s)

### 7. Component Optimization
- **React.memo**: Added to frequently re-rendering components
- **Error Boundaries**: Added for graceful error handling
- **Context**: Created `useGameState` for centralized state management
- **JSDoc Comments**: Added comprehensive documentation

### 8. Code Cleanup
- **Removed unused imports**: Cleaned up MobileView.tsx
- **Removed unused code**: Deleted unused variables and functions

## Type System

### Global Types (types.ts)
- `P2PSMessage` - Union type for all P2P messages
- `Team` - Team interface with timestamps
- `ConnectionStatus` - Connection state enum
- `MessageCategory` - Message priority categories
- Specific message types (BuzzEventMessage, TeamStateMessage, etc.)

### Game Types (components/host/game/types.ts)
- `GameScreen` - Game screen state types
- Screen-specific interfaces

### Pack Editor Types (components/host/packeditor/types.ts)
- `GamePack` - Pack structure
- `Round` - Round structure with timer settings
- `Theme` - Theme structure
- `Question` - Question structure
- `TimerSettings` - Timer configuration
- Legacy timer settings support

## HOST View Pages & States

| Page/State | Description | Elements |
|-------------|-------------|-----------|
| **Main Dashboard** | Default view when host loads | - Connection status (Connected/Disconnected)<br>- Host ID display (6-character code)<br>- Start/Disconnect buttons<br>- Instructions panel |
| **Connected State** | When host is active | - Green "CONNECTED" indicator<br>- Teams list (when teams exist)<br>- "Select Pack" button<br>- Game controls (when pack selected) |
| **Game Selector** | Pack selection modal | - Grid of available game packs with cover images<br>- "Create New Pack" button<br>- "Import Pack" option |
| **Lobby** | Team management screen | - Team list with scores<br>- "Add Team" button<br>- "Edit/Delete" team buttons<br>- Ready indicator when teams are ready |
| **Game Play** | Active game screen | - Game board with themed questions<br>- Question modal overlay<br>- Timer display<br>- Score panel<br>- Buzzer controls (Space=correct, Ctrl=wrong)<br>- Super game interface for super rounds |

## State Management

### Storage Keys (useLocalStorage.ts)

| Key | Purpose |
|-----|---------|
| `STORAGE_KEYS.HOST_ID` | Generated 6-character host ID (displayed to clients) |
| `STORAGE_KEYS.HOST_UNIQUE_ID` | 12-character unique ID for host binding |
| `STORAGE_KEYS.USER_NAME` | Player's name (saved across sessions) |
| `STORAGE_KEYS.TEAMS` | Array of team objects with scores |
| `STORAGE_KEYS.CLIENTS` | Connected clients mapping |
| `STORAGE_KEYS.COMMANDS` | Commands/rooms for quick join |

### Session Management
- **Session Version**: Timestamp-based version for state synchronization
- **TTL**: 5-hour TTL for client data (username, team selection)
- **Cleanup**: Automatic cleanup of expired data

## Routing

| Route | Component | URL |
|-------|-----------|------|
| Host | `HostView` | `/` or `#/` |
| Mobile | `MobileView` | `#/mobile` |

## Future Extensions

### Completed Features
- [x] Team management screen
- [x] Game pack selector
- [x] Scoreboard
- [x] Settings modal
- [x] Mobile team selection screen
- [x] Mobile buzzer button
- [x] Mobile score display
- [x] Super game betting screen
- [x] Super game answers screen

### Potential Future Improvements
- [ ] Multi-language support
- [ ] Custom theme system
- [ ] Sound effects for buzz/timer
- [ ] Animated transitions between screens
- [ ] Statistics/analytics dashboard
- [ ] Export game results to CSV/JSON
