# Message Storm Fix - Circular Dependency Resolution

## Problem Description

The ScreenView was receiving hundreds of repetitive `BUZZER_STATE` and `BROADCAST` messages from the host, causing:
- Performance issues and UI lag
- Console flooding with repetitive logs
- IndexedDB warnings for missing media files
- Excessive network traffic between host and screen clients

## Root Cause

The issue was caused by a **circular dependency** in `components/host/GamePlay.tsx` where `broadcastGameState` was included in its own dependency arrays in multiple `useEffect` hooks.

### The Circular Loop

```typescript
// Problematic pattern (BEFORE FIX):
useEffect(() => {
  broadcastGameState();
}, [currentRoundIndex, activeQuestion, showAnswer, answeringTeamId, broadcastGameState]); 
// ❌ broadcastGameState creates circular dependency
```

**How the loop worked:**
1. `useEffect` calls `broadcastGameState()`
2. `broadcastGameState` is memoized with `useCallback` 
3. Changes during broadcast cause `useCallback` to recreate the function
4. Recreated function triggers the `useEffect` again (because it's in dependencies)
5. Loop continues infinitely, creating a message storm

### Affected Code Locations

Multiple `useEffect` hooks had the same circular dependency:
- Line 733-738: Broadcast on value changes
- Line 750-758: Periodic broadcast when timer is active  
- Line 483: Timer state synchronization
- Line 514: Timer pause changes
- Line 531: Pause state sync
- Line 1084: Keyboard event handlers
- Line 1536: Round question opening

## Solution

Removed `broadcastGameState` from all `useEffect` dependency arrays since:
1. `broadcastGameState` is stable (created with `useCallback`)
2. The function already has throttling logic to prevent excessive calls
3. It doesn't need to be in dependencies for the effects to work properly

### Fixed Code Pattern

```typescript
// Fixed pattern (AFTER FIX):
useEffect(() => {
  broadcastGameState();
}, [currentRoundIndex, activeQuestion, showAnswer, answeringTeamId]); 
// ✅ Removed broadcastGameState to prevent circular dependency
```

## Changes Made

**File:** `components/host/GamePlay.tsx`

**Lines Modified:**
- Line 738: Removed `broadcastGameState` from dependency array
- Line 758: Removed `broadcastGameState` from dependency array  
- Line 483: Removed `broadcastGameState` from dependency array
- Line 514: Removed `broadcastGameState` from dependency array
- Line 531: Removed `broadcastGameState` from dependency array
- Line 1084: Removed `broadcastGameState` from dependency array
- Line 1536: Removed `broadcastGameState` from dependency array

## Benefits

✅ **Eliminates message storm** - No more repetitive broadcasts  
✅ **Reduces network traffic** - Less P2P communication overhead  
✅ **Improves performance** - Fewer re-renders and processing cycles  
✅ **Cleaner console** - No more spam of repetitive logs  
✅ **Better battery life** - Less CPU and network usage  

## Testing

After the fix:
- Build completed successfully with no errors
- No circular dependency warnings
- Broadcasts still occur when needed (state changes, timer updates)
- Throttling logic prevents excessive broadcasts

## Related Issues

This fix may also help resolve:
- Timer sync issues between host and screen
- Media loading problems (fewer state updates = fewer media restoration attempts)
- Overall application responsiveness

---

**Fix applied:** 2025-04-16  
**Status:** ✅ Resolved