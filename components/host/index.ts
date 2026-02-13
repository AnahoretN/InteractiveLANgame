/**
 * Host components exports
 */

export { SettingsModal } from './SettingsModal';
export { TeamList } from './TeamManager';
export { CommandsSection } from './CommandsSection';
export { SessionDashboard } from './SessionDashboard';
export { GameSession } from './GameSession';
// GamePlay is lazy-loaded in GameSession - not exported here for code-splitting
// export { GamePlay } from './GamePlay';
export { GameSelectorModal } from './GameSelectorModal';
// PackEditor is lazy-loaded in GameSelectorModal - not exported here for code-splitting
// export { PackEditor } from './PackEditor';

// New modular components
export { ConnectionPanel } from './ConnectionPanel';
export { LobbyPanel } from './LobbyPanel';
export { HostSetupPanel } from './HostSetupPanel';
export { CommandsManager } from './CommandsManager';

// Message handlers
export { BuzzerHandler } from './messageHandlers/BuzzerHandler';
export { CommandsHandler } from './messageHandlers/CommandsHandler';

// Pack editor components
export { QuestionEditor, ThemeCard } from './pack';

export type { SessionSettings } from '../../hooks/useSessionSettings';
export type { GamePack, Question, GameType } from './GameSelectorModal';
export type { GamePack as PackGamePack, Round, Theme } from './PackEditor';
export type { TimerSettings } from './packeditor/types';
// Re-export game types
export type { BuzzerState, GameScreen, SuperGameBet, SuperGameAnswer } from './game';
