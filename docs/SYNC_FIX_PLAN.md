# Sync, Connectivity & Optimization Fix Plan

Created: 2026-10-11. Status tracking: `[ ]` pending, `[x]` done, `[~]` partially done / deferred.

Findings below come from a full-codebase audit (timers, team statuses, P2P messaging).
File:line references are valid as of commit `aca12a8` + working-tree changes.

---

## P0 — Correctness bugs (small, independent diffs)

- [x] **P0-1. Stale-closure message handler in `useP2PHost`.**
  `peer.on('connection')` is registered once and forwards to `config.onMessage` captured at
  mount time (`hooks/useP2PHost.ts:199-383`), so HostView's handler is permanently the
  first-render closure. Consequences: `STATE_SYNC_REQUEST` replies with hours-old
  teams/clients, super-game bet corruption on stale arrays, session-setting changes ignored
  by buzz handling.
  **Fix:** forward via `onMessageRef.current` (and analogous refs for other config callbacks)
  so the latest handler is always called.

- [x] **P0-2. Broadcast truncated to 10 clients.**
  `broadcastLoadBalanced` does `.slice(0, maxConcurrent)` and dropped peers are not reported
  as failures (`utils/p2pConnectionPool.ts:326-337`), so the fallback resend never triggers.
  Client #11+ silently stops receiving game updates.
  **Fix:** broadcast to all connections; keep load-balancing only for point-to-point sends.

- [x] **P0-3. Throttled broadcasts are dropped, not deferred.**
  `broadcastGameState` discards calls inside the 100 ms window (`components/host/GamePlay.tsx:432-435`).
  Mutations that only change scores/answeringTeamId never reach the demo screen until an
  unrelated forced broadcast happens.
  **Fix:** trailing-edge defer — schedule one coalesced broadcast at the end of the window.

- [x] **P0-4. Handicap regression + edge-only team activation.**
  `updateGameState` activates teams only on a false→true edge of `isResponseTimerActive`
  (`hooks/useTeamStatusManager.ts:867-896`). The uncommitted handicap rework keeps the timer
  active during handicap, so the handicap-end "activate leader" call is a no-op — the leader
  stays INACTIVE for the whole question. `handicapTeamId` is also never cleared by
  `resetAllTeams` / `resetForNewQuestion` (stale skip can leak into the next question).
  **Fix:** make `updateGameState` idempotent reconciliation (recompute ACTIVE = response timer
  active AND status INACTIVE AND not the handicap team, on every call); clear
  `handicapTeamId` in resets.

- [x] **P0-5. Host hangs forever if `TIMER_PHASE_SWITCH` is lost.**
  When a demo screen is connected, the host reading timer waits for the screen's
  phase-switch signal with no timeout (`components/host/GamePlay.tsx:2023-2070`).
  **Fix:** add a ~1.5 s fallback that switches to response phase if the signal hasn't arrived.

## P1 — Timer architecture (root cause of timer desync)

- [x] **P1-1. Host timer: deadline-based, not fixed decrements.**
  GamePlay's engine now computes remaining time from wall-clock deadlines
  (`readingDeadline` / `responseDeadline`); pausing shifts both deadlines forward by the
  paused duration, and the hard-cap backstop (`armBackstop`) is re-armed on resume —
  a long pause no longer kills the host engine while clients keep counting. The engine
  also stops itself (clears its intervals) when the response timer completes.
  QuestionModal still ticks separately (see P1-4).

- [x] **P1-2. Timer snapshots carry clock anchors; ScreenView honors host values.**
  `TIMER_STATE` and the `buzzerState` of `GAME_STATE_UPDATE` now carry
  `{ phaseId, hostNowMs, phaseEndsAtHostMs }` (types.ts extended). ScreenView adopted a
  new `adoptHostTimerSnapshot()` (phaseId-guarded): it applies host phase, remaining,
  totals and pause state, and anchors a local wall-clock deadline that its smooth 50 ms
  renderer extrapolates from. The duplicated reading-duration recomputation on the demo
  screen is now only a fallback (primary source: host totals from the snapshot).
  MobileView gained transport-latency compensation on receive.
  *Done together with P1-3.*

- [x] **P1-3. Stale/out-of-order timer message guard.**
  Monotonic `timerPhaseIdRef` on the host bumps on every phase transition and per
  question; receivers discard snapshots with older ids. Media-delayed game-state
  broadcasts can no longer drag the demo timer back. A same-generation `reading`
  snapshot also cannot undo a phase switch the screen already performed and signaled.

- [~] **P1-4. Remove double timer engine while QuestionModal is open.**
  Still two host engines (modal + GamePlay), but both now stamp consistent
  phaseId/clock snapshots through `handleQuestionModalBuzzerStateChange`, so clients
  see one coherent timeline. Full merge (modal renders GamePlay-owned state) deferred.

## P2 — Team status architecture

- [x] **P2-1. One clash engine.**
  HostView's parallel buzz/clash resolver (own clash window, own random winner pick,
  own `setAnsweringTeamId`/`setActiveTeamIds` writes) was deleted. HostView's BUZZ handler
  now only gates (response phase / handicap / already-answering), feeds the buzz into the
  shared `buzzedTeamIds` set (→ GamePlay → `teamStatusManager.handleTeamBuzz`) and flashes
  the card. The manager resolves clash (its CLASH status + first_clash/simple_clash
  substatuses already drive the demo screen's violet cards), picks the single winner, and
  reports back via `onAnsweringTeamChange` / `onUpdateActiveTeamIds`. Clash gating
  aligned: the manager now receives
  `simultaneousBuzzEnabled = collisionEnabled && simultaneousBuzzEnabled` (same semantics
  the removed engine used). Side effect: after a correct-answer reset the manager's flow
  preserves "other ACTIVE teams can still buzz" on incorrect answers, matching the
  manager's documented behavior.

- [~] **P2-2. Reconnect restores full state.**
  `STATE_SYNC` has no `teamStates` (`HostView.tsx:853-874`) and, before P0-1, stale teams —
  a screen reloading mid-question shows default gray cards.
  **Status:** root cause (stale closure) fixed by P0-1; the existing `stateSyncTrigger`
  mechanism (HostView bumps trigger → GamePlay force-broadcasts full GAME_STATE_UPDATE with
  teamStates, `GamePlay.tsx:1338-1344`) covers the game-state replay, so no payload change
  was needed. Duplicate `STATE_SYNC_REQUEST` in ScreenView removed (kept the
  once-per-connection effect).
  Still open if needed: embedding teamStates directly in STATE_SYNC for lower latency.

- [ ] **P2-3. Single status enum/CSS map.**
  ScreenView re-implements the TeamStatus enum and card CSS map locally
  (`ScreenView.tsx:17-30, 2032-2052`) — three drifting copies.
  **Fix:** import from one shared module.

- [ ] **P2-4. Remove `key={JSON.stringify(teamStates)}` remount hack** (`ScreenView.tsx:2017-2020`)
  once ordering (P2-1/P0-3) is fixed — it destroys CSS transitions on every change.

## P3 — Connectivity

- [x] **P3-1. Host-side dead-peer detection broken.**
  HostView refreshed `lastSeen` every 5 s for anyone the pool believed connected,
  defeating the 60 s stale-reaper — zombies (half-open connections) stayed forever.
  **Fix:** PINGs are now forwarded to the app-level message handler from `useP2PHost`
  (so `lastSeen` reflects real heartbeat traffic), the 5 s refresher effect was deleted,
  and the reaper removes any client stale for 60 s regardless of pool belief,
  force-closing the zombie data connection.

- [x] **P3-2. No-backoff client reconnect hot loop.**
  Render effects call `connect()` whenever disconnected (`ScreenView.tsx:613-618`,
  `MobileView.tsx:539-543`) — battery drain and signalling hammering when host is down.
  **Fix:** exponential backoff (1 s → 30 s cap) with jitter in both reconnect effects;
  attempt counter resets on successful connect.

- [x] **P3-3. ICE diagnostics + networking docs.**
  Both `useP2PHost` and `useP2PClient` now log ICE state transitions to
  `failed`/`disconnected`/`closed` (the main symptom of AP/client isolation or missing
  TURN). New `docs/NETWORKING.md`: topology, URL formats, troubleshooting table, and
  step-by-step TURN (coturn) configuration for internet/restrictive networks.

- [x] **P3-4. MobileView auto `STATE_SYNC_REQUEST` + `GET_COMMANDS` on connect/reconnect**
  (was manual button only, `MobileView.tsx:962-966`). Added a status-transition effect that
  sends both once per connection.

## P4 — Performance & cleanup

- [x] **P4-1. Lobby STATE_SYNC effect re-ships full snapshot ~every 300 ms during timers**
  (`HostView.tsx:1302-1365` depends on `buzzerState`). Split lobby snapshot from
  timer updates.
- [x] **P4-2. Strip `_debug` blocks** from `GAME_STATE_UPDATE` payloads (`GamePlay.tsx:531-536`).
- [x] **P4-3. Remove per-message `JSON.stringify` stats** in the pool (`p2pConnectionPool.ts:149-151, 544-550`)
  and per-broadcast re-sorting of all connections.
- [x] **P4-4. Console log hygiene (full-repo pass).**
  540 `console.log` statements removed across 37 files (scripted, statement-level,
  string-aware; standalone statements only). All `console.error`/`console.warn` kept.
  Kept (testing/field-debug keep-list): `TIMER_STATE:` actions on the demo screen,
  `TIMER_PHASE_SWITCH` (both directions + the host's fallback trigger), demo-screen card
  state changes, `Connecting to host (attempt N)`, `Broadcasting game state`,
  `Sending buzzer state`, clash winner, `PeerJS opened` / `Connection opened to host`,
  client `Handshake from`, and `[ScreenView] Connection:` lifecycle. 16 logs kept in
  total.
- [x] **P4-5. Binary protocol: deleted.** Its only live path was broken (base64-in-JSON,
  +33 % size, spread-`btoa` throws on large payloads, client had no `__binary` decoder, CRC
  computed over wrong bytes). `utils/binaryProtocol.ts` deleted; `messageQueue.ts` rewritten
  to keep ONLY the live adaptive batching sender (`createOptimizedMessageSender`), sending
  plain JSON over PeerJS. `TIMER_CONTROL` message type removed from types.ts.

- [x] **P4-6. Dead code deleted (14 files, ~2,300 lines):** `utils/binaryProtocol.ts`,
  `utils/hostMessageSequencer.ts`, `utils/sequenceGenerator.ts`, `utils/logger.ts`,
  `utils/optimisticUpdates.ts`, `utils/networkCache.ts`, `utils/messageQueue.test.ts`,
  `hooks/useTeamStates.ts`, `hooks/useTeamManager.ts`, `hooks/useTeams.ts`,
  `hooks/useScoreManager.ts`, `hooks/useP2PMessageHandlers.tsx`,
  `components/ScreenView/SequencedMessageHandler.tsx` (imported a nonexistent module).
  Also removed: the `sequence` stamping in `useP2PHost` (3 sites) and GamePlay (2 counters +
  the `hostSequencer` wrapper) — two colliding counters, zero consumers; dead exports from
  `hooks/index.ts`. CLAUDE.md and PROJECT_MAP.md updated to stop documenting phantom modules
  (`useGameTimer`, `useBuzzerTimer`, `useSequencedMessages`, `sequencedMessageQueue`,
  `binaryProtocol`, `BUZZER_STATE`, ...).

  Latent issues exposed and fixed while deleting: `types.ts` union referenced an undefined
  `BuzzerStateMessage` (error-type suppressed ALL payload type-checking repo-wide — the
  union also never contained `TimerStateMessage` or the MEDIA_* messages despite the whole
  app running on them). The union is now well-formed (loose `BuzzerStateMessage` member +
  `TimerStateMessage` added) and message-handler boundaries are explicitly loosely typed
  (`MessageHandler`, `useP2PClient.onMessage`, `processMessage`, `processMediaMessage`,
  `sendQuery`/`onSendResponse` in mediaReadinessVerification) with comments — restoring the
  pre-existing compile behavior honestly. Tightening the protocol payload types is future
  work.

- [x] **P2-3. Single status CSS map.** `getTeamCardClassesForStatus()` exported from
  `useTeamStatusManager` (accepts plain strings for wire data, includes clash sub-status
  styling, fixed the nonexistent `scale-115` Tailwind class); host cards add their
  interaction classes on top. ScreenView's divergent local copy deleted.

- [x] **P2-4. Remount hacks removed.** The `key={JSON.stringify(teamStates)}` panel remount
  and the per-card `key={team.id}-{cardState}` remount are gone (they destroyed CSS
  transitions and masked the real sync bugs); per-team change logging now uses a ref
  instead of `window` storage.

Verified after the cleanup batch: `tsc` 134 errors, distribution differs from the 176-error
baseline ONLY by the deleted files (zero new errors; the dangling-union error is fixed) and
`vite build` succeeds (9.4s).

## File & docs cleanup (2026-10-11, second pass)

Deleted ~45 more provably-dead files (each verified: no static, JSX-symbol, barrel or
dynamic-`import()` consumers; build re-verified after deletion):

- Unused components: `components/Button.tsx` was NOT deleted (8 importers — initial check
  truncated the match list; restored), but these were: `MobileBuzzer`, `MobileLobby`,
  `MobileQuestion` (functionality is inline in MobileView), `ScreenView/MediaDownloadStatus`,
  `ScreenView/SafeMediaDisplay`, `shared/LoadingSpinner`, `shared/ErrorBoundary` (App does
  not mount one), `shared/TimerDisplay` (ScreenView renders via refs), `shared/PerformanceMonitor`,
  `shared/sharedComponents.ts`, `host/GameSelectorCard`, `host/ConnectionPanel`,
  `host/LobbyPanel`, `host/CommandsManager`, `host/CommandsSection`, `host/HostSetupPanel`,
  `host/TeamManager`, `host/hostview/*` (whole dir — LobbyContent even imported nonexistent
  modules), `host/pack/*`, `host/game/{ScorePanel,AnswersGrid,BettingPanel,GameNavigation,
  GameScreens,SuperGameRound,useGameState,useSuperGame}` (an abandoned "modular GamePlay"
  attempt — logic is inline in GamePlay).
- Unused hooks/utils: `useGamePlayState`, `useKeyboardNavigation`, `hooksHelper`,
  `performanceMetrics` (+test).
- Junk: `tsconfig.json.tmp` (empty), `metadata.json` (legacy latency-tester metadata),
  `P2P_SETUP.md` (superseded by `docs/NETWORKING.md`).
- `MEDIA_STREAMING_README.md` → `docs/MEDIA_STREAMING.md` (fixed stale `MediaStreamer.ts`
  reference → `syncMediaStreamer.streamMediaFilesSynchronously`).

Barrels pruned accordingly (`components/host/index.ts`, `host/game/index.ts`,
`shared/index.ts`, `hooks/index.ts`).

Docs refreshed: `README.md` rewritten for the actual quiz game (was still describing the
v0.0.1 latency tester), `PROJECT_MAP.md` regenerated from the real file tree with a
"Synchronization Architecture" section, `CLAUDE.md` architecture notes updated with a
staleness warning about the 2026-04 graph.

## Implementation log (session of 2026-10-11)

Completed: P0-1 … P0-5, P1-1 … P1-3, P2-1, P2-2 (partial — see item), P2-3, P2-4, P3-1,
P3-2, P3-3, P3-4, P4-1 … P4-6. Deferred: P1-4 (full merge of the QuestionModal and GamePlay
timer engines — both now stamp consistent snapshots, so the merge is a pure simplification).

Bugs discovered and fixed during implementation (all pre-existing):

1. **`config/performanceBudgets.ts:79` — committed syntax error** (`as Array<...>` after the
   `of` clause). This parse error made `tsc` skip most of its checking, masking ~180 latent
   type errors across the codebase. Fixed; the latent errors are pre-existing debt and do
   NOT block Vite builds (esbuild does not typecheck).
2. **`GamePlay.tsx` — `processingWrongAnswerRef` used but never declared** in the
   Space-shows-answer key handler → `ReferenceError` at runtime, which silently killed the
   buzzer deactivation, the immediate demo-screen broadcast, and team deactivation every
   time the host pressed Space. Leftover from a removed wrong-answer flow; removed.
3. Verified `tsc` before/after: 0 new errors introduced, 9 pre-existing removed
   (HostView 19→11, GamePlay 5→4).

Environment note: `vitest` is referenced by `package.json` scripts and `vitest.config.ts`
exists, but vitest is not installed (`node_modules` has no vitest), so the test suite
cannot currently run. Install dev deps (`npm i -D vitest @testing-library/react ...`) if
tests are wanted — not done here to avoid changing dependency manifests unprompted.

## Notes on the pre-existing working-tree changes (found during audit)

- `ScreenView` error handler deletes `LAST_HOST` on *any* error — breaks auto-reconnect
  after transient hiccups. Only clear on "host unreachable" class errors.
- The improved no-host-ID / error screens in ScreenView are good — keep.
- HostView/ScreenView debug `console.log`s from the diff — removed by P4-4.
- Handicap regression in the diff — fixed by P0-4.


## Typecheck error cleanup (2026-10-11, third pass)

Root causes found and fixed — `tsc --noEmit` now reports **0 errors** (was 114+):

1. **`@types/react` was never installed** — React resolved through its JS files via
   `allowJs`, suppressing JSX/props typing everywhere and producing nonsense errors
   (e.g. `Map<unknown>` inference, `this.props` missing on class components). Installed
   `@types/react` + `@types/react-dom` (devDeps), then fixed ~50 real latent errors the
   real types exposed.
2. **Test toolchain was never installed** — installed `vitest`, `@testing-library/react`,
   `@testing-library/jest-dom`, `jsdom`. The vitest suite now RUNS for the first time:
   46/46 tests pass. Fixed the setup file (spread of `performance` dropped `performance.now`),
   broken import paths, stale expectations (health-color thresholds 80/50, buzzing
   indicator prop `isBuzzing` + `.animate-double-flash`, fake-timer `waitFor` deadlock),
   and switched `useBuzz.test` from the deprecated `@testing-library/react-hooks`.
3. **Map/`unknown` inference** — `new Map(prev)` without explicit generics in
   `useTeamStatusManager`, `HostView`, `GamePlay` (also a `new Map<TeamStatus>()`
   one-arg misuse) — all given explicit `<string, T>`.
4. **Broken module paths** — `../../../types` (GamePlay, game/modals barrel),
   `../GameSelectorModal` (renamed to OptimizedGameSelectorModal), `../types`
   (packeditor/QuestionsList → `./types`).
5. **Duplicate/missing exports** — `mediaManager` self-re-exported `bulkLoadMediaFiles`
   and used an unimported `generateMediaId`; `media/index` re-exported a nonexistent
   `MediaStorageOptions`; `getGlobalCache` import removed (unused).
6. **Real code bugs**: `VirtualList` destructured `visibleRange` from itself (TDZ crash
   on render); `processMediaTransfer` was needlessly `async` and its result was stored
   as a Promise object into media URLs on the demo screen (cached local media never
   displayed) — now synchronous; `applyCachedMedia` result awaited properly; `ScreenView`
   image error handlers read a nonexistent `.error` property; `QuestionModal` sent a
   widened `timerPhase: string` to the demo screen; `signallingServerTest` results lacked
   the `error` field it read.
7. **Protocol/type alignment**: `BuzzerState` gained optional `timerPhase` + snapshot
   fields (`phaseId`/`hostNowMs`/`phaseEndsAtHostMs`/`superGamePhase`); `Team` gained
   optional `color`; `LocalFileInfo` gained optional `base64`; send-side signatures
   (`useP2PHost.broadcast/sendToClient/sendToTeam`, `useP2PClient.send`) and handler
   boundaries explicitly loosened to match the (richer) wire payloads.
8. **Prop contract fixes**: `GameSession` accepted/forwarded `onPhaseSwitchComplete` and
   used `ConnectedClient` instead of a stale `TeamPlayer`; `OptimizedListItems`
   `buzzedClients` typed structurally (`{ has(id): boolean }`); `ConfirmDialogState`
   deduplicated (HostModals now re-exports the useHostModals type); dual `GamePack`
   definitions aligned (`gameType` optional, `rounds` required in the selector modal).

Not done: ESLint toolchain is not installed (`.eslintrc.json` is legacy format, ESLint 10
needs flat config) — a separate task if desired.


## HOTFIX (2026-10-11): demo screen stuck on themes screen

**Symptom:** demo screen never left the themes screen; host console flooded with
`RangeError: Maximum call stack size exceeded` inside PeerJS chunking on every
`GAME_STATE_UPDATE` broadcast.

**Root cause:** `P2PConnectionPool.setupConnectionHandlers` wrapped `conn.send` for
statistics. PeerJS's internal chunking (`_sendChunks`) calls `this.send()` for every
chunk of a message larger than ~16 KB, so the wrapper invoked the original public
send → `_send` → `_sendChunks` → `this.send` (the wrapper) → … infinite recursion.
Any payload bigger than the chunk size — e.g. `GAME_STATE_UPDATE` carrying the full
`allThemes` pack — was never delivered.

**Fix:** removed the `conn.send` monkey-patch entirely; per-send statistics
(`lastUsed`/`messageCount`/`bytesTransferred`/health) are updated in
`P2PConnectionPool.sendTo` — the pool's single send choke point — which is not
re-entered by PeerJS chunking.

Lesson: never wrap `DataConnection.send`; PeerJS re-enters it internally.


## Session-aware reconnection (2026-10-11): clean connect to a NEW session

**Symptom:** a demo screen (or guest) that had been connected to a previous session
failed to properly join a new one; clearing the browser's site data "fixed" it.

**Root causes:**
1. URL params (`host`, `session`, `signalling`) were parsed in `useMemo(..., [])` — once
   per mount. Opening a new session's QR link in the same tab (hashchange, no reload)
   kept the PREVIOUS session's host; nothing reacted to the new link.
2. Persistent client identity (`SCREEN_ID` / `CLIENT_ID`) lived forever, so the host's
   returning-client logic restored the previous session's state (e.g. recreated the
   guest's old team in the new session).

**Fix:**
- New `useHashParams()` hook (hooks/useURLParams.ts) — hash-query params reactive to
  `hashchange`. ScreenView and MobileView now derive `host`/`session`/`signalling`
  from it.
- New-session detection: the URL's `session` id is stored as `LAST_SESSION_ID`. When it
  changes, both views start clean:
  - ScreenView: regenerates `SCREEN_ID` (fresh identity for the host) and wipes stale
    in-memory game state (board, question, teamStates, scores, super-game data).
  - MobileView: regenerates `CLIENT_ID` (host sees a NEW guest instead of restoring the
    old team), the existing `HOST_SESSION_VERSION` effect resets name/team state.
  - Same-session reload keeps identity (reconnection still works).
- Host-change handling: when `host` in the URL changes, the old connection is dropped
  and the auto-connect effect reconnects to the new host.

New storage key: `ilan_last_session_id` (LAST_SESSION_ID).
