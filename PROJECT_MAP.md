# Interactive LAN Game - Project Map

> **Last updated**: 2026-04-29 (based on Graphify analysis)
> **Codebase**: 175 files, ~146K lines, 841 nodes, 1178 edges, 158 communities

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         HostView                                 │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  useP2PHost → P2PConnectionPool → WebRTC Connections      │  │
│  └───────────────────────────────────────────────────────────┘  │
│                              │                                  │
│         ┌────────────────────┼────────────────────┐             │
│         ▼                    ▼                    ▼             │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐        │
│  │ GamePlay    │    │ TeamManager │    │ PackEditor  │        │
│  │ (game/)     │    │             │    │ (packeditor/)│        │
│  └─────────────┘    └─────────────┘    └─────────────┘        │
└─────────────────────────────────────────────────────────────────┘
         │                    │                    │
         ▼                    ▼                    ▼
┌─────────────────┐  ┌─────────────┐  ┌─────────────────┐
│  ScreenView     │  │ MobileView  │  │  Other Hosts    │
│  (Demo Screen)  │  │ (Players)   │  │                 │
└─────────────────┘  └─────────────┘  └─────────────────┘
```

## Project Structure

```
InteractiveLANgame/
├── components/
│   ├── Button.tsx                 # Reusable button component
│   ├── ErrorBoundary.tsx          # Error boundary component
│   ├── MobileView.tsx             # Main mobile client view
│   ├── HostView.tsx               # Main host view (~2200 lines)
│   ├── ScreenView.tsx             # Demo/audience screen view (~2300 lines)
│   ├── App.tsx                    # Root application component
│   └── host/                      # Host-specific components
│       ├── ConnectionPanel.tsx    # Connection info and QR code display
│       ├── LobbyPanel.tsx         # Main lobby panel
│       ├── GameSelectorCard.tsx   # Individual pack selection card
│       ├── GamePlay.tsx           # Main game play component
│       ├── GameSession.tsx        # Session management panel
│       ├── GameSelectorModal.tsx  # Pack selection modal
│       ├── ListItems.tsx          # Client/Team list items
│       ├── SettingsModal.tsx      # Settings modal
│       ├── TeamManager.tsx        # Team management interface
│       ├── SessionDashboard.tsx   # Session dashboard
│       ├── CommandsManager.tsx    # Commands/rooms management
│       ├── CommandsSection.tsx    # Commands display section
│       ├── messageHandlers/       # Message handler components
│       │   ├── CommandsHandler.tsx   # Commands/teams message handling
│       │   └── BuzzerHandler.tsx    # Buzzer message handling
│       ├── game/                  # Game play components
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
│       │   ├── useGameState.ts        # Game state management hook
│       │   ├── useSuperGame.ts        # Super game state hook
│       │   ├── fontUtils.ts           # Font size calculations
│       │   ├── modals/                # Modal components
│       │   │   ├── QuestionModal.tsx    # Question modal
│       │   │   └── ShowWinnerScreen.tsx # Winner display
│       │   └── types.ts               # Game-specific type definitions
│       ├── packeditor/             # Pack editor subdirectory
│       │   ├── Modals.tsx            # BaseModal, FileUpload components
│       │   ├── RoundModal.tsx         # Round editing modal
│       │   ├── ThemeModal.tsx         # Theme editing modal
│       │   ├── QuestionModal.tsx      # Question editing modal
│       │   ├── RoundManager.tsx       # Round list management
│       │   ├── PackManager.tsx        # Pack management interface
│       │   ├── QuestionsList.tsx      # Questions list view
│       │   ├── utils.ts              # File conversion utilities
│       │   ├── types.ts              # Pack editor types
│       │   └── pack/                 # Legacy pack components
│       │       ├── ThemeCard.tsx       # Theme card component
│       │       └── QuestionEditor.tsx  # Question editor
│       ├── hostview/               # Host view components
│       │   └── LobbyHeader.tsx        # Lobby header with QR code
│       └── index.ts                # Host components barrel file
│
├── hooks/                         # Custom React hooks
│   ├── useLocalStorage.ts        # LocalStorage utilities & hooks
│   ├── useSessionSettings.ts     # Session settings management
│   ├── useTeams.ts               # Team management hook
│   ├── useBuzz.ts                # Buzzer state management
│   ├── useBuzzerDebounce.ts      # Buzzer debounce hook
│   ├── useInterval.ts            # Interval management hook
│   ├── useURLParams.ts           # URL parameter hooks
│   ├── useBuzzerTimer.ts         # Buzzer timer management
│   ├── useP2PHost.ts             # P2P host connection hook
│   ├── useP2PClient.ts            # P2P client connection hook
│   ├── useGamePlayState.ts        # Game play state management
│   ├── useKeyboardNavigation.ts  # Keyboard navigation hook
│   ├── useSyncEffects.tsx         # Sync effects for storage
│   ├── useP2PMessageHandlers.tsx # P2P message handlers
│   ├── useHostStateManager.ts    # Host state manager
│   ├── useHostModals.ts          # Host modal management
│   ├── useGameTimer.ts           # Game timer hook
│   ├── useScoreManager.ts        # Score management hook
│   ├── useTeamStates.ts          # Team states hook
│   ├── useDemoScreenMedia.ts     # Demo screen media handling
│   └── index.ts                  # Hooks barrel file
│
├── utils/                        # Utility functions
│   ├── uuid.ts                   # UUID generation
│   ├── healthColor.ts            # Health color calculation
│   ├── network.ts                # Network utilities
│   ├── p2pConnectionPool.ts      # P2P connection pooling
│   ├── messageQueue.ts           # Message queue management
│   ├── mediaManager.ts           # Media file management
│   ├── mediaStream.ts            # P2P media streaming
│   ├── binaryProtocol.ts         # Binary message encoding
│   ├── chunkedFileTransfer.ts    # Large file transfer via chunks
│   ├── syncMediaStreamer.ts      # Synchronous media streaming
│   ├── mediaUtils.ts             # Media utilities
│   ├── backgroundMediaPreloader.ts  # Media preloading
│   ├── sequencedMessageQueue.ts  # Ordered message delivery
│   ├── performanceMetrics.ts     # Performance tracking
│   ├── lazyLoad.ts               # Component lazy loading
│   ├── memoUtils.ts              # Memoization utilities
│   ├── index.ts                  # Utils barrel file
│   ├── media/                    # Media utilities
│   │   └── index.ts
│   └── p2p/                      # P2P utilities
│       └── index.ts
│
├── types.ts                      # Global type definitions (P2P messages)
├── config.ts                     # App configuration constants
├── index.tsx                     # Application entry point
├── .prettierrc.json              # Prettier configuration
└── .eslintrc.json                # ESLint configuration
```

## God Nodes (Most Critical Components)

Based on Graphify analysis (by connection count):

| Component | Edges | Role |
|-----------|-------|------|
| **P2PConnectionPool** | 27 | P2P connection management and pooling |
| **PerformanceMetricsTracker** | 18 | Performance monitoring |
| **SequencedMessageQueue** | 18 | Ordered message delivery |
| **BackgroundMediaPreloader** | 17 | Media preloading for performance |
| **DemoScreenMediaHandler** | 16 | Demo screen media handling |
| **decodeMessage()** | 14 | Binary protocol decoding |
| **ConnectionQualityMonitor** | 14 | Connection health tracking |

## Major Communities (Functional Groups)

### 1. Message Handlers & State Sync
- `BuzzerHandler`, `CommandsHandler`
- `useP2PMessageHandlers`, `useSyncEffects`
- State synchronization logic

### 2. Media Streaming & Chunking
- `ParallelChunkSender`, `ChunkAssembler`
- `DemoScreenMediaHandler`, `BackgroundMediaPreloader`
- `chunkedFileTransfer`, `syncMediaStreamer`

### 3. Binary Protocol & Encoding
- `BinaryEncoder`, `BinaryDecoder`
- `BinaryProtocolStats`
- `encodeMessage()`, `decodeMessage()`

### 4. P2P Connection Management
- `P2PConnectionPool`, `PoolStatsManager`
- `ConnectionHealthMonitor`, `ConnectionRateLimiter`
- `useP2PHost`, `useP2PClient`

### 5. Game State & Timer Logic
- `useGameTimer`, `useBuzzerTimer`
- `useGameState`, `useGamePlayState`
- Timer state management

### 6. UI Components
- `GameBoard`, `ScorePanel`, `TeamManager`
- `QuestionModal`, `TimerDisplay`
- `BettingPanel`, `AnswersGrid`

## Communication Architecture

### Message Flow (Broadcast-based)

```
HostView → useP2PHost → broadcast() → P2P/WebRTC
                                          │
                    ┌─────────────────────┼─────────────────────┐
                    ▼                     ▼                     ▼
              MobileView           ScreenView           Other Clients
              (Players)            (Demo Screen)        (Screens)
```

### Message Types

| Type | Category | Purpose |
|------|----------|---------|
| `BROADCAST` → `GAME_STATE_UPDATE` | EVENT | Full game state sync |
| `BROADCAST` → `MEDIA_TRANSFER` | EVENT | Media file transfer |
| `BROADCAST` → `SUPER_GAME_STATE_SYNC` | EVENT | Super game state |
| `BUZZER_STATE` | STATE | Timer/buzzer state |
| `BUZZ_EVENT` | EVENT | Buzz notification |
| `STATE_SYNC` | SYNC | Initial client state |
| `TEAM_CONFIRMED` | STATE | Team join confirmation |
| `COMMANDS_LIST` | STATE | Available teams/commands |
| `QR_CODE_STATE` | STATE | QR code visibility |

## Key Optimizations

### 1. Modular Component Structure
- `components/host/game/` - Reusable game components
- `components/host/packeditor/` - Modular pack editor
- `components/shared/` - Shared components

### 2. Custom Hooks
- State management hooks (`useGameTimer`, `useScoreManager`, `useTeamStates`)
- P2P hooks (`useP2PHost`, `useP2PClient`)
- Media hooks (`useDemoScreenMedia`)

### 3. Performance Optimizations
- React.memo for frequently re-rendering components
- Lazy loading for heavy components
- Media preloading for smooth playback
- Connection pooling for P2P

### 4. Code Quality
- TypeScript strict mode
- ESLint + Prettier configuration
- Error boundaries for graceful error handling

## Type System

### Global Types (types.ts)
```typescript
- P2PSMessage              // Union type for all P2P messages
- Team                    // Team interface
- ConnectionStatus        // Connection state enum
- MessageCategory         // Message priority categories
- BuzzEventMessage        // Buzz event
- TeamsSyncMessage        // Teams sync
- CommandsListMessage     // Commands list
- StateDeltaV2Message     // State delta (removed, legacy)
```

### Game Types (components/host/game/types.ts)
```typescript
- GameScreen              // Game screen states
- TimerState              // Timer configuration
```

### Pack Types (components/host/packeditor/types.ts)
```typescript
- GamePack                // Pack structure
- Round                   // Round structure
- Theme                   // Theme structure
- Question                // Question structure
- TimerSettings           // Timer configuration
```

## HOST View Pages & States

| Page/State | Description | Key Elements |
|-------------|-------------|--------------|
| **Lobby** | Default view when host loads | Connection status, Host ID, Teams list, QR code |
| **Game Play** | Active game screen | Game board, Question modal, Timer, Scores, Buzzer controls |
| **Pack Editor** | Edit/create question packs | Themes, Questions, Media, Timer settings |
| **Demo Screen** | Audience display | Game state, Media, Timer, Scores |

## State Management

### Storage Keys (useLocalStorage.ts)

| Key | Purpose |
|-----|---------|
| `HOST_ID` | Generated host ID (displayed to clients) |
| `HOST_UNIQUE_ID` | 12-character unique ID for host binding |
| `USER_NAME` | Player's name (saved across sessions) |
| `TEAMS` | Array of team objects with scores |
| `CLIENTS` | Connected clients mapping |
| `COMMANDS` | Commands/rooms for quick join |
| `QR_URL` | Stored QR code URL |
| `LOCKED_IP` | Locked IP for LAN mode |

### Session Management
- **Session Version**: Timestamp-based version for state tracking
- **TTL**: 5-hour TTL for client data
- **Cleanup**: Automatic cleanup of expired data

## Routing

| Route | Component | URL |
|-------|-----------|------|
| Host | `HostView` | `/` or `#/` |
| Mobile | `MobileView` | `#/mobile` |
| Screen | `ScreenView` | `#/screen` |

## Implemented Features

- [x] Team management
- [x] Game pack selector
- [x] Scoreboard
- [x] Settings modal
- [x] Mobile buzzer button
- [x] Mobile team selection
- [x] Mobile score display
- [x] Demo/audience screen
- [x] Super game betting
- [x] Super game answers
- [x] Media streaming (images, video, audio)
- [x] QR code join flow
- [x] P2P WebRTC connections
- [x] LAN and Internet modes
- [x] Pack editor with media support
