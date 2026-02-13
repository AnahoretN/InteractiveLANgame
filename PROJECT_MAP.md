# Interactive LAN Game - Project Map

## Project Structure

```
InteractiveLANgame/
├── components/
│   ├── Button.tsx                 # Reusable button component
│   ├── MobileLobby.tsx            # Mobile lobby screen
│   ├── MobileQuestion.tsx           # Mobile question display
│   ├── MobileBuzzer.tsx             # Mobile buzzer button
│   ├── HostView.tsx                # Main host view
│   ├── MobileView.tsx               # Main mobile view
│   ├── host/
│   │   ├── ConnectionPanel.tsx       # Connection info and QR code
│   │   ├── LobbyPanel.tsx           # Main lobby panel
│   │   ├── GameSelectorCard.tsx     # Individual pack selection card
│   │   ├── GamePlay.tsx             # Main game play component
│   │   ├── GameSession.tsx           # Session management
│   │   ├── GameSelectorModal.tsx    # Pack selection modal
│   │   ├── ListItems.tsx            # List components
│   │   ├── SettingsModal.tsx         # Settings modal
│   │   ├── TeamManager.tsx           # Team management interface
│   │   ├── CommandsSection.tsx       # Admin commands panel
│   │   ├── SessionDashboard.tsx       # Session overview dashboard
│   │   ├── PackEditor.tsx            # Pack editor (modular, ~933 lines)
│   │   ├── game/                       # Game components subdirectory
│   │   │   ├── GameBoard.tsx         # Game board with themes/questions
│   │   │   ├── GameScreens.tsx        # Cover, themes, round intro screens
│   │   │   ├── QuestionModal.tsx      # Question display modal
│   │   │   ├── SuperGameRound.tsx    # Super game betting and answers
│   │   │   ├── ScorePanel.tsx          # Team scores display
│   │   │   ├── TimerDisplay.tsx        # Timer display component
│   │   │   ├── GameNavigation.tsx       # Next/prev round controls
│   │   │   ├── BettingPanel.tsx         # Super game betting interface
│   │   │   ├── AnswersGrid.tsx          # Super game answers grid
│   │   │   ├── useGameState.ts        # Game state management hook
│   │   │   ├── useSuperGame.ts          # Super game state hook
│   │   │   ├── fontUtils.ts            # Font size calculations
│   │   │   └── types.ts              # Game type definitions
│   │   ├── packeditor/                 # Pack editor subdirectory (modular)
│   │   │   ├── Modals.tsx            # BaseModal, FileUpload
│   │   │   ├── RoundModal.tsx          # Round editing modal
│   │   │   ├── ThemeModal.tsx          # Theme editing modal
│   │   │   ├── QuestionModal.tsx       # Question editing modal
│   │   │   ├── RoundManager.tsx        # Round list management
│   │   │   ├── PackManager.tsx         # Pack management
│   │   │   ├── utils.ts               # File conversion utilities
│   │   │   └── types.ts              # Pack editor types
│   │   ├── pack/                         # Legacy pack components
│   │   │   ├── ThemeCard.tsx          # Theme card component
│   │   │   └── Editor.tsx             # Placeholder (to check usage)
│   │   └── index.ts                  # Host components barrel file
│   └── mobile/                        # Mobile specific components
│       ├── MobileLobby.tsx            # Moved to main components/
│       ├── MobileQuestion.tsx           # Moved to main components/
│       └── MobileBuzzer.tsx             # Moved to main components/
├── hooks/
│   ├── useLocalStorage.ts            # LocalStorage utilities
│   ├── useSessionSettings.ts         # Session settings management
│   ├── useTeams.ts                 # Team management hook
│   ├── useBuzz.ts                  # Buzzer state management
│   ├── useInterval.ts               # Interval management hook
│   ├── useURLParams.ts             # URL parameter hooks
│   ├── useBuzzerTimer.ts           # Buzzer timer management
│   ├── useP2PHost.ts              # P2P host connection hook
│   ├── useP2PClient.ts             # P2P client connection hook
│   ├── useGamePlayState.ts         # NEW: Game play state management
│   ├── useP2PClient.ts             # P2P client hook (refactored)
│   └── index.ts                     # Hooks barrel file
├── utils/
│   ├── uuid.ts                      # UUID generation utility
│   ├── healthColor.ts               # Health color calculation utilities
│   └── network.ts                  # Network utilities
├── types.ts                          # Global type definitions
├── config.ts                        # App configuration
└── server/                          # Signalling server
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
- `useGamePlayState.ts` - Game play state management (NEW)

### 5. Type System
Centralized type definitions:
- `components/host/game/types.ts` - Game-specific types
- `components/host/packeditor/types.ts` - Pack editor types with legacy support

## HOST View Pages & States

| Page/State | Description | Elements |
|------------|-------------|-----------|
| **Main Dashboard** | Default view when host loads | - Connection status (Connected/Disconnected)<br>- Host ID display (6-character code)<br>- Start/Disconnect buttons<br>- Instructions panel |
| **Connected State** | When host is active | - Green "CONNECTED" indicator<br>- Teams list (when teams exist)<br>- "Select Pack" button<br>- Game controls (when pack selected) |
| **Game Selector** | Pack selection modal | Grid of available game packs with cover images<br>- "Create New Pack" button<br>- "Import Pack" option |
| **Lobby** | Team management screen | Team list with scores<br>- "Add Team" button<br>- "Edit/Delete" team buttons<br>- Ready indicator when teams are ready |
| **Game Play** | Active game screen | Game board with themed questions<br>- Question modal overlay<br>- Timer display<br>- Score panel<br>- Buzzer controls (Space=correct, Ctrl=wrong)<br>- Super game interface for super rounds |

## HOST Elements

| Component | File | Props | Description |
|-----------|------|--------|-------------|
| `ConnectionStatus` | `host/ConnectionStatus.tsx` | `status: string, hostId: string` | Shows connection state with colored indicator |
| `HostIdDisplay` | `host/HostIdDisplay.tsx` | `hostId: string` | Large display of 6-character host ID |
| `Instructions` | `host/Instructions.tsx` | `items: string[]` | How-to-play instructions list |
| `GameBoard` | `host/game/GameBoard.tsx` | Round data, theme selection handler | Displays themes and point values grid |
| `TimerDisplay` | `host/game/TimerDisplay.tsx` | Buzzer state object | Shows reading/response timers with visual indicators |
| `ScorePanel` | `host/game/ScorePanel.tsx` | Teams array | Displays all teams with scores |
| `QuestionModal` | `host/game/QuestionModal.tsx` | Question data, show answer flag, media display | Question modal with media support |
| `SuperGameRound` | `host/game/SuperGameRound.tsx` | Round, bets, answers | Super game betting and answers modal |
| `BettingPanel` | `host/game/BettingPanel.tsx` | Teams, bets, maxBet | Super game betting interface |
| `AnswersGrid` | `host/game/AnswersGrid.tsx` | Answers array | Grid showing all teams' answers |
| `GameNavigation` | `host/game/GameNavigation.tsx` | Round index, total rounds, onPrev/Next | Previous/Next round buttons |

## State Management

### Storage Keys (useLocalStorage.ts)
| Key | Purpose |
|-----|---------|
| `STORAGE_KEYS.HOST_ID` | Generated 6-character host ID (displayed to clients) |
| `STORAGE_KEYS.CLIENT_NAME` | Player's name (saved across sessions) |
| `STORAGE_KEYS.TEAMS` | Array of team objects with scores |

## Routing

| Route | Component | URL |
|-------|-----------|------|
| Host | `HostView` | `/` or `#/` |
| Mobile | `MobileView` | `#/mobile` |

## Type Definitions

```typescript
// types.ts
interface Team {
  id: string;
  name: string;
  createdAt: number;
  lastUsedAt: number;
  score?: number;  // Added during active game
}
```

## Future Extensions

### Host (to implement)
- [ ] Team management screen
- [ ] Game pack selector
- [ ] Scoreboard
- [ ] Settings modal

### Mobile (to implement)
- [ ] Team selection screen
- [ ] Game buzzer button
- [ ] Score display
- [ ] Super game betting screen
- [ ] Super game answers screen
