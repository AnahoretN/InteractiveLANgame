/**
 * Host components exports
 */

export { HostModals } from './HostModals';
export { SessionDashboard } from './SessionDashboard';
export { GameSession } from './GameSession';
// GamePlay is lazy-loaded in GameSession - not exported here for code-splitting
// export { GamePlay } from './GamePlay';
export { OptimizedGameSelectorModal as GameSelectorModal } from './OptimizedGameSelectorModal';
// PackEditor is lazy-loaded in GameSelectorModal - not exported here for code-splitting
// export { PackEditor } from './PackEditor';

// Message handlers
export { BuzzerHandler } from './messageHandlers/BuzzerHandler';
export { CommandsHandler } from './messageHandlers/CommandsHandler';

// Export optimized list items (backward compatible aliases)
export type { ConnectedClient } from './OptimizedListItems';
export {
  SimpleClientItem,
  TeamListItem,
  NoTeamSection,
  VirtualizedClientList,
  VirtualizedSimpleClientList,
  VirtualizedTeamList
} from './OptimizedListItems';

export type { SessionSettings } from '../../hooks/useSessionSettings';
export type { GamePack, Question, GameType } from './OptimizedGameSelectorModal';
export type { GamePack as PackGamePack, Round, Theme } from './PackEditor';
export type { TimerSettings } from './packeditor/types';
// Re-export game types
export type { BuzzerState, GameScreen, SuperGameBet, SuperGameAnswer } from './game';
