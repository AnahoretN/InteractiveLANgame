/**
 * useHostModals Hook
 *
 * Manages modal state for HostView component
 * Handles settings modal, game selector, and confirm dialogs
 */

import { useState, useCallback } from 'react';
import type { GameType, GamePack } from '../components/host/OptimizedGameSelectorModal';

export interface ConfirmDialogState {
  isOpen: boolean;
  title: string;
  message: string;
  type: 'danger' | 'warning' | 'info' | 'success';
  onConfirm: () => void;
}

export function useHostModals(onGameSelected?: () => void) {
  // Settings modal state
  const [showSettingsModal, setShowSettingsModal] = useState<boolean>(false);

  // Game selector state
  const [showGameSelector, setShowGameSelector] = useState<boolean>(false);
  const [selectedGame, setSelectedGame] = useState<GameType>('custom');
  const [selectedPacks, setSelectedPacks] = useState<GamePack[]>([]);
  const [selectedPackIds, setSelectedPackIds] = useState<string[]>([]);

  // Confirm dialog state
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState>({
    isOpen: false,
    title: '',
    message: '',
    type: 'danger',
    onConfirm: () => {}
  });

  // Settings modal handlers
  const openSettingsModal = useCallback(() => setShowSettingsModal(true), []);
  const closeSettingsModal = useCallback(() => setShowSettingsModal(false), []);

  // Game selector handlers
  const openGameSelector = useCallback(() => setShowGameSelector(true), []);
  const closeGameSelector = useCallback(() => setShowGameSelector(false), []);

  const handleSaveGameSelection = useCallback((gameType: GameType, packIds: string[], packs: GamePack[]) => {
    setSelectedGame(gameType);
    setSelectedPackIds(packIds);
    setSelectedPacks(packs);
    // Notify parent that game was selected (session should start)
    if (onGameSelected) {
      onGameSelected();
    }
  }, [onGameSelected]);

  // Confirm dialog handlers
  const showConfirmDialog = useCallback((
    title: string,
    message: string,
    type: ConfirmDialogState['type'],
    onConfirm: () => void
  ) => {
    setConfirmDialog({
      isOpen: true,
      title,
      message,
      type,
      onConfirm
    });
  }, []);

  const closeConfirmDialog = useCallback(() => {
    setConfirmDialog(prev => ({ ...prev, isOpen: false }));
  }, []);

  const executeConfirmDialog = useCallback(() => {
    confirmDialog.onConfirm();
    closeConfirmDialog();
  }, [confirmDialog.onConfirm, closeConfirmDialog]);

  return {
    // Settings modal
    showSettingsModal,
    openSettingsModal,
    closeSettingsModal,

    // Game selector
    showGameSelector,
    openGameSelector,
    closeGameSelector,
    selectedGame,
    selectedPacks,
    selectedPackIds,
    handleSaveGameSelection,

    // Confirm dialog
    confirmDialog,
    showConfirmDialog,
    closeConfirmDialog,
    executeConfirmDialog
  };
}
