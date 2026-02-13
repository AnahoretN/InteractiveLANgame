/**
 * GameSession Component
 *
 * Routes between different game types:
 * - 'custom': Jeopardy-style game with GamePlay component
 * - 'quiz'/'trivia': Placeholder for future game types
 *
 * Also handles the buzzer tracking and displays waiting screen when no active game
 */

import React, { memo, useState, useCallback, lazy, Suspense } from 'react';
import { Wifi, Gamepad2 } from 'lucide-react';
import { Team } from '../../types';
import type { GamePack } from './GameSelectorModal';
import type { Round, Theme } from './PackEditor';
import type { BuzzerState } from './game';
// Lazy load GamePlay to reduce initial bundle size
const GamePlay = lazy(() => import('./GamePlay').then(m => ({ default: m.GamePlay })));

// TeamPlayer interface - used internally for client data structure
interface TeamPlayer {
  id: string;
  name: string;
  teamId: string;
  joinedAt: number;
}

interface GameSessionProps {
  teams: Team[];
  clients: Map<string, TeamPlayer>;
  buzzedClients: Map<string, number>;
  buzzedTeamIds: Set<string>;  // Teams that recently buzzed (for visual flash)
  status: import('../../types').ConnectionStatus;
  isOnline: boolean;
  onBackToLobby: () => void;
  onClearBuzz: () => void;
  gameType?: 'custom' | 'quiz' | 'trivia';
  mergedPack?: GamePack;
  noTeamsMode?: boolean;
  sessionSettings?: { noTeamsMode?: boolean };
  onBuzzerStateChange?: (state: BuzzerState) => void;
  buzzerState?: BuzzerState;  // Add buzzer state to track timer phase
  answeringTeamId?: string | null;  // Team that gets to answer the question
  onAnsweringTeamChange?: (teamId: string | null) => void;  // Callback to reset answering team
  onBroadcastMessage?: (message: unknown) => void;  // Broadcast message to all clients (no-op without network)
  superGameBets?: Array<{ teamId: string; bet: number; ready: boolean }>;  // Bets from mobile clients
  superGameAnswers?: Array<{ teamId: string; answer: string; revealed: boolean }>;  // Answers from mobile clients
  onSuperGamePhaseChange?: (phase: 'idle' | 'placeBets' | 'showQuestion' | 'showWinner') => void;  // Track super game phase
  onSuperGameMaxBetChange?: (maxBet: number) => void;  // Track max bet for super game
}

export const GameSession = memo(({
  teams,
  clients,
  buzzedClients,
  buzzedTeamIds,
  noTeamsMode = false,
  sessionSettings,
  onBackToLobby,
  onClearBuzz,
  gameType = 'custom',
  mergedPack,
  onBuzzerStateChange,
  buzzerState,
  answeringTeamId,
  onAnsweringTeamChange,
  onBroadcastMessage,
  superGameBets,
  superGameAnswers,
  onSuperGamePhaseChange,
  onSuperGameMaxBetChange
}: GameSessionProps) => {
  const isNoTeamsMode = noTeamsMode || sessionSettings?.noTeamsMode || false;

  // Track which team triggered the buzzer first (for score handling in GamePlay)
  const [triggeredTeamId, setTriggeredTeamId] = useState<string | null>(null);

  // Handle back to lobby - clear buzz state
  const handleBackToLobby = useCallback(() => {
    onClearBuzz();
    onBackToLobby();
  }, [onClearBuzz, onBackToLobby]);

  // Handle buzzer state changes from GamePlay
  // Also reset triggered team when entering inactive phase (question closed)
  const handleBuzzerStateChange = useCallback((state: BuzzerState) => {
    if (onBuzzerStateChange) {
      onBuzzerStateChange(state);
    }

    // Clear triggered team when entering inactive phase
    const newPhase = state.timerPhase || 'inactive';
    if (newPhase === 'inactive' && triggeredTeamId) {
      setTriggeredTeamId(null);
    }
  }, [onBuzzerStateChange, triggeredTeamId]);

  // If no pack available, show waiting screen
  if (!mergedPack || gameType !== 'custom') {
    return (
      <div className="h-screen bg-gray-950 text-gray-100 flex flex-col items-center justify-center p-8">
        <div className="text-center max-w-md">
          <div className="w-32 h-32 mx-auto mb-8 rounded-full bg-gray-900 border-2 border-dashed border-gray-700 flex items-center justify-center">
            {gameType === 'custom' ? (
              <Wifi className="w-14 h-14 text-gray-600" />
            ) : (
              <Gamepad2 className="w-14 h-14 text-gray-600" />
            )}
          </div>
          <h2 className="text-3xl font-semibold text-gray-500 mb-3">
            {gameType === 'custom' ? 'No game pack selected' : `${gameType} mode coming soon`}
          </h2>
          <p className="text-gray-600 mb-8">
            {gameType === 'custom'
              ? 'Please select a game pack before starting the session.'
              : 'This game mode is not yet implemented.'}
          </p>
          <button
            onClick={handleBackToLobby}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-semibold transition-colors"
          >
            Back to Lobby
          </button>
        </div>
      </div>
    );
  }

  // Render the appropriate game based on type
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center h-full">
        <Gamepad2 className="w-8 h-8 text-blue-500 animate-pulse" />
      </div>
    }>
      <GamePlay
        pack={mergedPack}
        teams={teams}
        onBackToLobby={handleBackToLobby}
        onBuzzerStateChange={handleBuzzerStateChange}
        onBuzzTriggered={setTriggeredTeamId}
        onClearBuzzes={onClearBuzz}
        buzzedTeamId={triggeredTeamId}
        buzzedTeamIds={buzzedTeamIds}
        answeringTeamId={answeringTeamId}
        onAnsweringTeamChange={onAnsweringTeamChange}
        onBroadcastMessage={onBroadcastMessage}
        // Super Game props
        superGameBets={superGameBets || []}
        superGameAnswers={superGameAnswers || []}
        onSuperGamePhaseChange={onSuperGamePhaseChange}
        onSuperGameMaxBetChange={onSuperGameMaxBetChange}
      />
    </Suspense>
  );
});

GameSession.displayName = 'GameSession';
