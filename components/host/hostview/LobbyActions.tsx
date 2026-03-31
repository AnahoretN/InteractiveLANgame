/**
 * LobbyActions Component
 * Панель действий лобби (кнопки запуска игры, настройки)
 */

import React, { memo } from 'react';
import { Settings, Plus } from 'lucide-react';
import { Button } from '../../Button';

interface LobbyActionsProps {
  teamsCount: number;
  clientsCount: number;
  onOpenSettings: () => void;
  onOpenGameSelector: () => void;
}

export const LobbyActions = memo(({
  teamsCount,
  clientsCount,
  onOpenSettings,
  onOpenGameSelector,
}: LobbyActionsProps) => {
  const canStartGame = teamsCount > 0 || clientsCount > 0;

  return (
    <div className="border-t border-gray-800 pt-4 space-y-4">
      {/* Quick Actions */}
      <div className="grid grid-cols-2 gap-3">
        <Button
          variant="secondary"
          onClick={onOpenSettings}
          className="flex items-center justify-center gap-2"
        >
          <Settings className="w-4 h-4" />
          Settings
        </Button>
        <Button
          variant="secondary"
          onClick={() => {/* TODO: Implement quick add team */}}
          className="flex items-center justify-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Add Team
        </Button>
      </div>

      {/* Start Game */}
      <Button
        onClick={onOpenGameSelector}
        disabled={!canStartGame}
        className="w-full text-lg py-4"
        variant={canStartGame ? "primary" : "secondary"}
      >
        {!canStartGame ? (
          'Waiting for players...'
        ) : (
          `Start Game (${teamsCount} teams, ${clientsCount} players)`
        )}
      </Button>
    </div>
  );
});

LobbyActions.displayName = 'LobbyActions';
