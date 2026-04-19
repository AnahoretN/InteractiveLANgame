# Timer Synchronization between Host and Demo Screen

## Overview
This document describes the timer synchronization feature between the host and demo screen (ScreenView).

## Features

### 1. Complete Timer State Synchronization
- The host now controls all timer states on the demo screen
- Demo screen timers are fully synchronized with host timers
- No autonomous timer operation on demo screen

### 2. Pause/Resume Functionality
- **Host Control**: Press `P` key to pause/resume timers during active questions
- **Visual Indication**: 
  - Paused timers show red color instead of yellow/green
  - "(PAUSED)" text appears next to timer display
  - Timer bar changes to red when paused

### 3. Timer State Management
- **Reading Timer**: Yellow when active, red when paused
- **Response Timer**: Green when active, red when paused
- **Inactive**: No timer display

### 4. Automatic State Broadcasting
- Timer state is automatically broadcast to demo screen every 10ms
- State includes:
  - Current phase (reading/response/complete/inactive)
  - Remaining time for each timer
  - Pause status
  - Handicap state

## Technical Implementation

### Data Flow
1. **Host (GamePlay.tsx)**:
   - Maintains timer state in `buzzerStateRef`
   - Handles P key for pause/resume
   - Broadcasts state via `broadcastGameState()`

2. **Demo Screen (ScreenView.tsx)**:
   - Receives state via P2P messages
   - Updates local timer display based on host state
   - Respects pause flag from host

### Message Types
- `BuzzerStateMessage`: State changes (including pause status)
- `TIMER_CONTROL`: Explicit timer control commands (start/pause/resume/stop/switch)

## Usage

### For Host
1. Start a question as normal
2. Press `P` to pause the timer
3. Press `P` again to resume
4. Timer state is automatically synchronized to demo screen

### For Demo Screen
- No action required - automatically follows host state
- Displays same timer as host
- Shows pause indicator when host pauses timer

## State Synchronization

### Timer States
```typescript
interface BuzzerState {
  active: boolean;
  timerPhase: 'reading' | 'response' | 'complete' | 'inactive';
  readingTimerRemaining: number;
  responseTimerRemaining: number;
  handicapActive: boolean;
  handicapTeamId?: string;
  isPaused: boolean; // NEW: Pause state
}
```

### Visual Feedback
- **Reading Timer (Active)**: Yellow color
- **Reading Timer (Paused)**: Red color + "(PAUSED)" text
- **Response Timer (Active)**: Green color  
- **Response Timer (Paused)**: Red color + "(PAUSED)" text

## Benefits

1. **Complete Control**: Host has full control over all timers
2. **Visual Clarity**: Clear indication of timer states
3. **Synchronization**: Perfect sync between host and demo screens
4. **Flexibility**: Can pause/resume timers as needed during gameplay

## Future Enhancements

Potential improvements:
- Separate pause controls for reading and response timers
- Audio feedback when pausing/resuming
- Visual countdown animation when paused
- Remote pause control from moderator devices
