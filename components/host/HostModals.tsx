import React, { lazy, Suspense } from 'react';
import { ConfirmDialog } from '../shared';
import { SkeletonCard, SkeletonPackList } from '../shared/Skeleton';
import type { SessionSettings } from '../../hooks/useSessionSettings';
import type { GamePack, GameType } from './OptimizedGameSelectorModal';

// Lazy load only SettingsModal (GameSelectorModal is used frequently)
import { OptimizedGameSelectorModal } from './OptimizedGameSelectorModal';
const SettingsModalLazy = lazy(() => import('./SettingsModal').then(m => ({ default: m.SettingsModal })));

export interface ConfirmDialogState {
  isOpen: boolean;
  title: string;
  message: string;
  type: 'info' | 'warning' | 'danger';
  onConfirm: () => void;
}

export interface HostModalsProps {
  // Settings Modal
  showSettingsModal: boolean;
  onCloseSettingsModal: () => void;
  settings: SessionSettings;
  onSaveSettings: (settings: Partial<SessionSettings>) => void;
  onClearCache: () => void;

  // Game Selector Modal
  showGameSelector: boolean;
  onCloseGameSelector: () => void;
  onSaveGameSelection: (gameType: GameType, packIds: string[], packs: GamePack[]) => void;
  selectedGame: GameType;
  selectedPackIds: string[];
  selectedPacks: GamePack[];

  // Confirm Dialog
  confirmDialog: ConfirmDialogState;
  onCloseConfirmDialog: () => void;
}

export const HostModals: React.FC<HostModalsProps> = ({
  showSettingsModal,
  onCloseSettingsModal,
  settings,
  onSaveSettings,
  onClearCache,
  showGameSelector,
  onCloseGameSelector,
  onSaveGameSelection,
  selectedGame,
  selectedPackIds,
  selectedPacks,
  confirmDialog,
  onCloseConfirmDialog,
}) => {
  return (
    <>
      {/* Settings Modal - Lazy Loaded */}
      <Suspense fallback={<SkeletonCard />}>
        <SettingsModalLazy
          isOpen={showSettingsModal}
          onClose={onCloseSettingsModal}
          settings={settings}
          onSave={onSaveSettings}
          onClearCache={onClearCache}
        />
      </Suspense>

      {/* Game Selector Modal - Not lazy loaded for instant opening */}
      <OptimizedGameSelectorModal
        isOpen={showGameSelector}
        onClose={onCloseGameSelector}
        onSave={onSaveGameSelection}
        initialGameType={selectedGame}
        initialSelectedPackIds={selectedPackIds}
        initialPacks={selectedPacks}
      />

      {/* Confirm Dialog */}
      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        title={confirmDialog.title}
        message={confirmDialog.message}
        type={confirmDialog.type}
        onConfirm={confirmDialog.onConfirm}
        onCancel={onCloseConfirmDialog}
      />
    </>
  );
};
