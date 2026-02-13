/**
 * MobileLobby Component
 * Lobby screen for mobile clients
 */

import React, { memo, useState, useCallback } from 'react';
import { Wifi, User, Smartphone } from 'lucide-react';
import { Button } from './Button';
import type { Team } from '../types';
import { useLocalStorage, STORAGE_KEYS } from '../hooks/useLocalStorage';

interface MobileLobbyProps {
  isOnline: boolean;
  isConnected: boolean;
  teams: Team[];
  userName: string;
  setUserName: (name: string) => void;
  onJoinTeam: (teamId: string, teamName: string) => void;
  onCreateTeam: (teamName: string) => void;
  onConnect: () => void;
}

export const MobileLobby = memo(({
  isOnline,
  isConnected,
  teams,
  userName,
  setUserName,
  onJoinTeam,
  onCreateTeam,
  onConnect
}: MobileLobbyProps) => {
  const [newTeamName, setNewTeamName] = useState('');
  const [showCreateTeam, setShowCreateTeam] = useState(false);

  const handleJoinTeam = useCallback((teamId: string, teamName: string) => {
    onJoinTeam(teamId, teamName);
  }, [onJoinTeam]);

  const handleCreateTeam = useCallback(() => {
    if (newTeamName.trim()) {
      onCreateTeam(newTeamName.trim());
      setNewTeamName('');
      setShowCreateTeam(false);
    }
  }, [newTeamName, onCreateTeam]);

  return (
    <div className="h-full flex flex-col p-6 bg-gray-950 relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-blue-500/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-violet-500/10 rounded-full blur-3xl" />
      </div>

      {/* Header */}
      <div className="absolute top-4 left-4 right-4 flex justify-between items-center z-10">
        <div className={`flex items-center space-x-2 px-3 py-1 rounded-full border ${
          isOnline ? 'bg-green-500/20 text-green-400 border-green-500/20' : 'bg-red-500/20 text-red-400 border-red-500/20'
        }`}>
          <Wifi className="w-3 h-3" />
          <span className="text-xs font-semibold uppercase">{isOnline ? 'Online' : 'Offline'}</span>
        </div>

        {/* User info */}
        <div className="flex items-center gap-2 bg-gray-800/50 px-3 py-1.5 rounded-full">
          <User className="w-4 h-4 text-blue-400" />
          <span className="text-sm font-medium text-white">{userName}</span>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col items-center justify-center pt-20">
        <div className="w-full max-w-md">
          {/* Connection status */}
          {!isConnected ? (
            <div className="text-center mb-8">
              <Smartphone className="w-16 h-16 text-blue-400 mx-auto mb-4" />
              <p className="text-gray-400 mb-4">Ожидание подключения...</p>
              <Button onClick={onConnect} size="lg">
                Подключиться
              </Button>
            </div>
          ) : (
            <>
              {/* Teams */}
              <div className="mb-6">
                <h2 className="text-xl font-bold text-white mb-4">Выберите команду</h2>
                <div className="space-y-2">
                  {teams.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                      <p>Нет команд. Создайте первую!</p>
                    </div>
                  ) : (
                    teams.map((team) => (
                      <button
                        key={team.id}
                        onClick={() => handleJoinTeam(team.id, team.name)}
                        className="w-full bg-gray-800 hover:bg-gray-700 text-white p-4 rounded-xl border border-gray-700 hover:border-blue-500 transition-all flex items-center gap-4"
                      >
                        <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center">
                          <User className="w-6 h-6 text-blue-400" />
                        </div>
                        <div className="text-left flex-1">
                          <p className="font-semibold text-white">{team.name}</p>
                          <p className="text-sm text-gray-400">0 очков</p>
                        </div>
                      </button>
                    ))
                  )}
                </div>

                {/* Create team button */}
                <button
                  onClick={() => setShowCreateTeam(true)}
                  className="w-full py-3 border-2 border-dashed border-gray-600 rounded-xl text-gray-400 hover:border-blue-500 hover:text-white transition-all flex items-center justify-center gap-2"
                >
                  <span className="text-2xl">+</span>
                  <span>Создать команду</span>
                </button>
              </div>

              {/* Create team modal */}
              {showCreateTeam && (
                <>
                  <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
                    <div className="bg-gray-900 rounded-xl p-6 max-w-sm w-full">
                      <h3 className="text-lg font-bold text-white mb-4">Новая команда</h3>
                      <input
                        type="text"
                        value={newTeamName}
                        onChange={(e) => setNewTeamName(e.target.value)}
                        placeholder="Название команды"
                        maxLength={20}
                        className="w-full bg-gray-800 text-white px-4 py-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4"
                        autoFocus
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => setShowCreateTeam(false)}
                          className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg"
                        >
                          Отмена
                        </button>
                        <button
                          onClick={handleCreateTeam}
                          disabled={!newTeamName.trim()}
                          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Создать
                        </button>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
});

MobileLobby.displayName = 'MobileLobby';
