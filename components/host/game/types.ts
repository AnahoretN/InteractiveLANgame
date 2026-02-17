/**
 * Type definitions for game components
 */

// Screens for intro sequence
export type GameScreen =
  | 'cover'
  | 'themes'
  | 'round'
  | 'board'
  | 'selectSuperThemes'
  | 'placeBets'
  | 'superQuestion'
  | 'superAnswers'
  | 'showWinner';

// TeamScore is imported from main types.ts
import type { TeamScore } from '../../../types';

// Super Game state
export interface SuperGameBet {
  teamId: string;
  bet: number;
  ready: boolean;
}

export interface SuperGameAnswer {
  teamId: string;
  answer: string;
  revealed: boolean;
  submitted?: boolean;  // Whether the answer has been submitted (for host tracking)
  isCorrect?: boolean;
  isWrong?: boolean;
}

export interface BuzzerState {
  active: boolean;
  timerPhase: 'reading' | 'response' | 'complete' | 'inactive';
  readingTimerRemaining: number;
  responseTimerRemaining: number;
  handicapActive: boolean;
  handicapTeamId?: string; // Team that has handicap (leader)
}

export interface GamePlayProps {
  pack: import('../GameSelectorModal').GamePack;
  teams: import('../../../types').Team[];
  onBackToLobby?: () => void;
  onBuzzerStateChange: (state: BuzzerState) => void;
  onBuzzTriggered: (teamId: string | null) => void;
  onClearBuzzes?: () => void;  // Clear buzzed clients when transitioning to response phase
  buzzedTeamId: string | null;
  buzzedTeamIds?: Set<string>;  // Teams that recently buzzed (for white flash effect)
  answeringTeamId?: string | null;  // Team that gets to answer question
  onAnsweringTeamChange?: (teamId: string | null) => void;  // Callback to reset answering team
  // Super Game props (optional for backward compatibility)
  onBroadcastMessage?: (message: unknown) => void;  // Broadcast message to all clients (no-op without network)
  superGameBets?: SuperGameBet[];  // Bets received from mobile clients
  superGameAnswers?: SuperGameAnswer[];  // Answers received from mobile clients
  onSuperGamePhaseChange?: (phase: 'idle' | 'placeBets' | 'showQuestion' | 'showWinner') => void;  // Track super game phase
  onSuperGameMaxBetChange?: (maxBet: number) => void;  // Track max bet for super game
}
