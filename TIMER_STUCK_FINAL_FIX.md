# Timer Stuck Fix - Demo Screen Timer Not Updating

## Problem
The demo screen timer was **stuck** at incorrect values and not counting down properly.

### Symptoms
- Timer stuck at **6.9 seconds** for long periods
- Timer suddenly jumping to **0.2 seconds**
- `active` state flipping between `true` and `false`
- Timer not progressing smoothly

### Root Cause
**GamePlay was broadcasting old timer values** even after QuestionModal took over timer management.

The issue occurred because:
1. GamePlay stored `readingTimerRemaining: 6.9s` in `buzzerStateRef.current`
2. QuestionModal opened and started counting down: 6.9 → 6.8 → ... → 0.2
3. GamePlay's **timer interval stopped** (previous fix)
4. **BUT GamePlay's `broadcastGameState()` kept running**
5. It kept broadcasting the old 6.9s value from `buzzerStateRef.current`
6. Demo screen received conflicting updates:
   - **QuestionModal**: 0.2s (correct)
   - **GamePlay**: 6.9s (wrong - old cached value)

## Solution

### Approach
**Completely stop GamePlay from broadcasting when QuestionModal is active.**

When QuestionModal is open, GamePlay should:
1. ✅ Stop timer interval updates
2. ✅ Stop broadcasting game state
3. ✅ Let QuestionModal be the sole authority for both timer values AND broadcasts

### Implementation

#### 1. Stop Broadcast Function When Modal Active
**GamePlay.tsx** (lines 264-275):
```typescript
const broadcastGameState = useCallback(() => {
  if (!onBroadcastMessage) {
    console.log('[GamePlay] broadcastGameState called but onBroadcastMessage is null');
    return;
  }

  // DON'T broadcast when QuestionModal is active - QuestionModal manages its own state
  if (questionModalActiveRef.current) {
    return; // QuestionModal is handling all broadcasts
  }

  // ... rest of broadcast logic
```

#### 2. Update Flow When QuestionModal Active
**GamePlay.tsx** (lines 460-478):
```typescript
// When QuestionModal sends update:
// 1. Update buzzerStateRef.current with QuestionModal's values (correct)
buzzerStateRef.current.readingTimerRemaining = state.readingTimerRemaining;
buzzerStateRef.current.responseTimerRemaining = state.responseTimerRemaining;

// 2. Send to demo screen via onBuzzerStateChange (correct)
onBuzzerStateChange(buzzerStateRef.current);

// 3. Try to broadcast (but returns early because QuestionModal is active)
broadcastGameState(); // Returns immediately - doesn't send old values
```

## Result
Now the timer displays **correct, real-time values** without getting stuck:
- ✅ GamePlay completely stops broadcasting when QuestionModal is active
- ✅ Only QuestionModal sends updates when modal is open
- ✅ No more conflicting timer values
- ✅ Smooth timer progression without jumping or sticking
- ✅ Demo screen shows accurate, up-to-date timer values

## Timer Authority Flow

### Question Modal Closed
- **GamePlay** is the timer AND broadcast authority
- Manages timer countdown
- Sends both BUZZER_STATE and BROADCAST messages
- Full control over game state

### Question Modal Open
- **QuestionModal** is the timer AND broadcast authority
- GamePlay completely stops all timer and broadcast operations
- QuestionModal sends all updates (BUZZER_STATE and BROADCAST)
- Clean separation - no conflicts, no stale data

## Complete Fix Chain
This fix builds on the previous timer fixes:

1. **TIMER_SYNC_DEMO_SCREEN_FIX.md** - Fixed calculation inconsistencies (0.5x media multiplier)
2. **TIMER_JUMP_FIX.md** - Stopped GamePlay timer interval when QuestionModal active
3. **THIS FIX** - Stopped GamePlay broadcasts when QuestionModal active

Together, these fixes ensure:
- ✅ Both components calculate identical timer values
- ✅ Only one component sends updates at any time
- ✅ No conflicting or stale timer values
- ✅ Smooth, accurate timer display on demo screen

## Testing
1. Open a question without media
2. Verify timer counts down smoothly (e.g., 6.9 → 6.8 → 6.7 → ...)
3. Check demo screen shows same values as host
4. Open a question with media
5. Verify timer starts paused, counts down when resumed
6. Check demo screen shows real-time values, not stuck values
7. Test multiple questions in succession
8. Verify no timer jumping or sticking

## Files Modified
- `components/host/GamePlay.tsx` (2 locations updated)
  - Added check in `broadcastGameState()` to stop broadcasting when QuestionModal is active
  - Ensures clean separation between GamePlay and QuestionModal authority

## Technical Details
The key insight was that stopping the **timer interval** wasn't enough - we also needed to stop the **broadcast function**. The broadcast function was sending cached values from `buzzerStateRef.current` that were outdated as soon as QuestionModal started counting down.

By adding the `questionModalActiveRef.current` check in `broadcastGameState()`, we ensure that GamePlay completely hands over control to QuestionModal when the modal is open, preventing any stale data from being broadcast.
