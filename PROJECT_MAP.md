# Interactive LAN Game - Project Map

> **Last updated**: 2026-10-11
> Structure below reflects the actual source tree after the 2026-10 sync/dead-code cleanup
> (see `docs/SYNC_FIX_PLAN.md`). The Graphify graph in `graphify-out/` predates that
> cleanup — re-run graphify before relying on its communities/god-nodes.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         HostView                                 │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  useP2PHost → P2PConnectionPool → WebRTC Connections      │  │
│  └───────────────────────────────────────────────────────────┘  │
│         │                    │                                   │
│         ▼                    ▼                                   │
│  ┌─────────────┐    ┌───────────────┐                           │
│  │ GamePlay    │    │ PackEditor    │                           │
│  │ (timer &    │    │ (pack editor) │                           │
│  │  clash      │    └───────────────┘                           │
│  │  authority) │                                                │
│  └─────────────┘                                                │
└─────────────────────────────────────────────────────────────────┘
         │                    │
         ▼                    ▼
┌─────────────────┐  ┌─────────────┐
│  ScreenView     │  │ MobileView  │
│  (Demo Screen)  │  │ (Players)   │
└─────────────────┘  └─────────────┘
```

## Project Structure

```
InteractiveLANgame/
├── components/
│   ├── Button.tsx                 # Reusable button component
│   ├── HostView.tsx               # Main host view (lobby, P2P message routing)
│   ├── MobileView.tsx             # Mobile client view (buzzer, team, bets)
│   ├── ScreenView.tsx             # Demo/audience screen (timer renderer, team cards)
│   ├── host/                      # Host-specific components
│   │   ├── GamePlay.tsx           # Game engine: timers (deadline-based), clash,
│   │   │                          #   scoring, game-state broadcasts
│   │   ├── GameSession.tsx        # Session panel; lazy-loads GamePlay
│   │   ├── HostModals.tsx         # Host dialogs (incl. SettingsModal)
│   │   ├── OptimizedGameSelectorModal.tsx  # Pack selection modal
│   │   ├── OptimizedListItems.tsx # Virtualized client/team list items
│   │   ├── PackEditor.tsx         # Pack editor shell (lazy-loaded)
│   │   ├── SessionDashboard.tsx   # Session dashboard
│   │   ├── SettingsModal.tsx      # Settings modal
│   │   ├── game/                  # Game play components
│   │   │   ├── GameBoard.tsx / GameBoardExtended.tsx   # Boards
│   │   │   ├── EnhancedMediaStreamer.tsx               # Lazy media component
│   │   │   ├── MediaTransferProgress.tsx               # Transfer progress UI
│   │   │   ├── SuperGameModals.tsx                     # Super game screens
│   │   │   ├── fontUtils.ts                            # Font size calculations
│   │   │   ├── modals/QuestionModal.tsx                # Question display + timer UI
│   │   │   ├── modals/ShowWinnerScreen.tsx             # Winner display
│   │   │   └── types.ts                                # Game-specific types
│   │   ├── messageHandlers/       # Buzzer/Commands handler components
│   │   ├── packeditor/            # Pack editor: rounds, themes, questions, modals
│   │   └── index.ts               # Host components barrel
│   ├── ScreenView/                # (media display helpers kept minimal)
│   ├── shared/                    # AlertDialog, ConfirmDialog, BaseModal,
│   │                              #   DraggableQRCode, Skeleton, VirtualList,
│   │                              #   TeamCardContextMenu
│   └── index barrels as noted
│
├── hooks/
│   ├── useP2PHost.ts             # Host P2P (PeerJS, pool, config ref for callbacks)
│   ├── useP2PClient.ts           # Client P2P (backoff reconnect, heartbeat)
│   ├── useTeamStatusManager.ts   # SINGLE SOURCE OF TRUTH for team card states,
│   │                             #   clash resolution, buzzer gating
│   ├── useLocalStorage.ts        # Storage utilities + keys
│   ├── useSessionSettings.ts     # Session settings (clash, handicap, ...)
│   ├── useDemoScreenMedia.ts     # Demo screen media handling
│   ├── useBuzz.ts / useBuzzerDebounce.ts        # Buzzer state/debounce
│   ├── useHostModals.ts / useHostStateManager.tsx / useSyncEffects.tsx
│   ├── useInterval.ts / useURLParams.ts
│   └── index.ts                  # Hooks barrel
│
├── utils/
│   ├── p2pConnectionPool.ts      # Connection pool (broadcast to ALL clients)
│   ├── messageQueue.ts           # Adaptive batching sender (plain JSON)
│   ├── connectionQualityMonitor.ts / p2p/  # Health monitoring
│   ├── syncMediaStreamer.ts      # Synchronous media streaming (host → screens)
│   ├── mediaManager.ts / mediaUtils.ts / mediaStream.ts / zipPackManager.ts
│   ├── media/                    # MediaFileCache, MediaStorage, MediaPrefetch, ...
│   ├── backgroundMediaPreloader.ts / demoScreenMediaHandler.ts
│   ├── mediaReadinessVerification.ts
│   ├── fileSystemManager.ts / lazyLoad.tsx / memoUtils.tsx
│   ├── uuid.ts / healthColor.ts / network.ts / errorHandler.ts
│   └── index.ts                  # Utils barrel
│
├── server/signalling-server.cjs  # PeerServer (port 9000) + health HTTP (9001)
├── types.ts                      # P2P message types (TIMER_STATE, STATE_SYNC, ...)
├── config.ts                     # SESSION_CONFIG / UI_CONFIG constants
├── App.tsx / index.tsx           # Hash router (#/  #/mobile  #/screen) + entry
└── docs/                         # NETWORKING.md, SYNC_FIX_PLAN.md, MEDIA_STREAMING.md
```

## Synchronization Architecture (2026-10)

**Timers** — the host is the single source of truth:
- `GamePlay.tsx` computes remaining time from wall-clock **deadlines** (never fixed
  decrements); pausing shifts deadlines, so countdown and hard-cap backstop stay correct.
- Every timer snapshot (`TIMER_STATE` and `buzzerState` inside `GAME_STATE_UPDATE`)
  carries `{ phaseId, hostNowMs, phaseEndsAtHostMs }`. `phaseId` is monotonic per phase
  transition — receivers discard stale/out-of-order snapshots.
- `ScreenView` renders a smooth local countdown **anchored** to those snapshots
  (`adoptHostTimerSnapshot`); it no longer recomputes reading durations from question text.
- The demo screen still sends `TIMER_PHASE_SWITCH` when reading ends; the host has a
  1.5 s fallback if that signal is lost.

**Team statuses** — one engine: `useTeamStatusManager` owns team card states and clash
resolution (single random winner). HostView only gates, feeds buzzes, and flashes cards;
`answeringTeamId`/`activeTeamIds` flow back through the manager's callbacks.

**P2P messaging** — plain JSON over PeerJS data channels; host callbacks are invoked via
refs (always fresh closures). Broadcasts reach ALL clients (no truncation). Throttled
game-state broadcasts defer (never drop). Clients reconnect with exponential backoff.

**Message handler types are intentionally loose** (`message: any` at handler boundaries) —
the wire payloads are richer than the `P2PSMessage` member types. Tightening them is
future work (see types.ts comment on `MessageHandler`).

## Communication

### Message Types

| Type | Category | Purpose |
|------|----------|---------|
| `BROADCAST` → `GAME_STATE_UPDATE` | EVENT | Full game state (screen, question, teamStates, scores, buzzerState) |
| `BROADCAST` → `MEDIA_TRANSFER` etc. | EVENT | Media file transfer / chunks / progress |
| `BROADCAST` → `SUPER_GAME_STATE_SYNC` | EVENT | Super game state |
| `TIMER_STATE` | STATE | Timer snapshot (`phaseId`, `hostNowMs`, `phaseEndsAtHostMs`, pause, handicap) |
| `TIMER_PHASE_SWITCH` | EVENT | Demo screen → host: reading phase finished |
| `BUZZ` / `BUZZ_EVENT` | EVENT | Player buzz → host → screens |
| `STATE_SYNC` / `STATE_SYNC_REQUEST` | SYNC | Full/lobby state on connect & reconnect |
| `TEAM_CONFIRMED`, `TEAMS_SYNC`, `COMMANDS_LIST`, `TEAM_UPDATE` | STATE | Team/join flow |
| `QR_CODE_STATE` | STATE | QR code visibility on demo screen |
| `HANDSHAKE` / `HANDSHAKE_RESPONSE` / `PING` / `PONG` | CONTROL | Connection lifecycle |

## Type System

- `types.ts` — `P2PSMessage` union (see note above on loose handler types), `Team`,
  `ConnectionStatus`, `MessageCategory`, message interfaces incl. `TimerStateMessage`.
- `components/host/game/types.ts` — game screen/timer types.
- `components/host/packeditor/types.ts` — `GamePack`, `Round`, `Theme`, `Question`,
  `TimerSettings`.

## Routing

| Route | Component | URL |
|-------|-----------|------|
| Host | `HostView` | `/` or `#/` |
| Mobile | `MobileView` | `#/mobile` |
| Screen | `ScreenView` | `#/screen` |

## State Management

Team card states: `useTeamStatusManager` (`Map<teamId, TeamState>` with statuses
`inactive | active | answering | penalty | clash`). Scores: `GamePlay` `teamScores` +
`teamScoresRef`. Timer: `GamePlay` refs/state (see above). Storage keys via
`hooks/useLocalStorage.ts` (`HOST_ID`, `LAST_HOST`, `USER_NAME`, `LOCKED_IP`, `QR_URL`, ...).

Session: timestamp-based `session` id in URLs; client data has a 5-hour TTL with automatic
cleanup; stale clients (no traffic for 60 s) are reaped host-side.

## Implemented Features

- [x] Team management, join by QR, persistent client identity across reconnects
- [x] Pack editor (rounds/themes/questions, media, ZIP import)
- [x] Scoreboard with handicap and penalties
- [x] Buzzer with clash window and single random winner
- [x] Deadline-based synchronized timers (host authority)
- [x] Demo/audience screen with media streaming
- [x] Super game (bets + written answers)
- [x] LAN and Internet modes, reconnect backoff, stale-client reaping
