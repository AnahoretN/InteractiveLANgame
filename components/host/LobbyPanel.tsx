/**
 * LobbyPanel Component
 * Main lobby panel for game setup and team management
 */

import React, { memo } from 'react';
import { Smartphone, Users, Settings, Gamepad2, Plus } from 'lucide-react';
import { Button } from '../Button';

interface LobbyPanelProps {
  teamsCount: number;
  connectedClients: number;
  onCreateGame: () => void;
  onSelectGame: () => void;
  onOpenSettings: () => void;
}

export const LobbyPanel = memo(({
  teamsCount,
  connectedClients,
  onCreateGame,
  onSelectGame,
  onOpenSettings
}: LobbyPanelProps) => {
  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 flex flex-col p-6">
      {/* Header */}
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-violet-400">
          Панель ведущего
        </h1>
        <div className="flex gap-3">
          <Button
            variant="secondary"
            size="sm"
            onClick={onOpenSettings}
          >
            <Settings className="w-4 h-4 mr-2" />
            Настройки
          </Button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left column - Connection info */}
        <div className="space-y-6">
          {/* Connection stats */}
          <div className="bg-gray-900 rounded-xl p-6 border border-gray-700">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-3 bg-blue-500/20 rounded-lg">
                <Smartphone className="w-6 h-6 text-blue-400" />
              </div>
              <div>
                <p className="text-gray-400 text-sm">Подключено клиентов</p>
                <p className="text-3xl font-bold text-white">{connectedClients}</p>
              </div>
            </div>
          </div>

          {/* Teams */}
          <div className="bg-gray-900 rounded-xl p-6 border border-gray-700">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-3 bg-violet-500/20 rounded-lg">
                <Users className="w-6 h-6 text-violet-400" />
              </div>
              <div>
                <p className="text-gray-400 text-sm">Команд создано</p>
                <p className="text-3xl font-bold text-white">{teamsCount}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Right column - Game selection */}
        <div className="space-y-6">
          {/* Create game button */}
          <button
            onClick={onCreateGame}
            className="w-full bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-500 hover:to-violet-500 text-white rounded-xl p-8 flex items-center justify-center gap-4 transition-all hover:scale-[1.02] active:scale-[0.98]"
          >
            <div className="p-4 bg-white/20 rounded-lg">
              <Plus className="w-8 h-8" />
            </div>
            <div className="text-left">
              <p className="text-2xl font-bold">Создать игру</p>
              <p className="text-blue-100 text-sm">Начать новую игру с нуля</p>
            </div>
          </button>

          {/* Select game button */}
          <button
            onClick={onSelectGame}
            className="w-full bg-gray-800 hover:bg-gray-700 text-white rounded-xl p-6 flex items-center gap-4 transition-all hover:scale-[1.02] active:scale-[0.98]"
          >
            <div className="p-3 bg-blue-500/20 rounded-lg">
              <Gamepad2 className="w-6 h-6 text-blue-400" />
            </div>
            <div className="text-left flex-1">
              <p className="text-lg font-bold">Выбрать пакет</p>
              <p className="text-gray-400 text-sm">Загрузить сохранённый игровой пакет</p>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
});

LobbyPanel.displayName = 'LobbyPanel';
