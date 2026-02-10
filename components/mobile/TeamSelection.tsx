/**
 * TeamSelection Component
 * Screen for selecting or creating a team
 */

import React, { memo, useCallback, useState } from 'react';
import { Plus, Users, RefreshCw } from 'lucide-react';
import { Button } from '../Button';
import { Team } from '../../types';

interface TeamSelectionProps {
  teams: Team[];
  newTeamName: string;
  onCreateTeam: (teamName: string) => void;
  onJoinTeam: (teamId: string, teamName: string) => void;
  onRefreshTeams: () => void;
  onNewTeamNameChange: (name: string) => void;
}

export const TeamSelection = memo(({
  teams,
  newTeamName,
  onCreateTeam,
  onJoinTeam,
  onRefreshTeams,
  onNewTeamNameChange,
}: TeamSelectionProps) => {
  const [isCreating, setIsCreating] = useState(false);

  const handleCreateTeam = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (newTeamName.trim()) {
      onCreateTeam(newTeamName.trim());
      setIsCreating(false);
      onNewTeamNameChange('');
    }
  }, [newTeamName, onCreateTeam, onNewTeamNameChange]);

  const handleJoinTeam = useCallback((teamId: string, teamName: string) => {
    onJoinTeam(teamId, teamName);
  }, [onJoinTeam]);

  return (
    <div className="h-full flex flex-col p-6 bg-gray-950 relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-violet-500/10 rounded-full blur-3xl"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-indigo-500/10 rounded-full blur-3xl"></div>
      </div>

      {/* Header with connection status */}
      <div className="absolute top-4 left-4 right-4 flex justify-between items-center z-10">
        <div className="text-xs text-gray-500">
          Connected as <span className="text-white font-medium">Player</span>
        </div>
      </div>

      <div className="max-w-md mx-auto w-full flex flex-col h-full">
        <div className="text-center mb-6 mt-4">
          <h2 className="text-2xl font-bold text-white">Choose Your Team</h2>
          <p className="text-gray-400 text-sm">Create a new team or join an existing one.</p>
        </div>

        <div className="flex-1 overflow-y-auto space-y-6 pb-6 no-scrollbar">
          {/* Option A: Create New */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 shadow-lg">
            <div
              className="flex items-center gap-2 mb-3 text-violet-400 font-semibold text-sm uppercase tracking-wide cursor-pointer"
              onClick={() => setIsCreating(!isCreating)}
            >
              <Plus className="w-4 h-4" /> Create New
            </div>
            {isCreating && (
              <form onSubmit={handleCreateTeam} className="flex gap-2">
                <input
                  type="text"
                  placeholder="Team Name"
                  value={newTeamName}
                  onChange={(e) => onNewTeamNameChange(e.target.value.slice(0, 20))}
                  maxLength={20}
                  className="flex-1 bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:ring-2 focus:ring-violet-500 focus:outline-none"
                  autoFocus
                />
                <Button type="submit" size="sm" disabled={!newTeamName.trim()}>OK</Button>
              </form>
            )}
          </div>

          <div className="flex items-center gap-4">
            <div className="h-px bg-gray-800 flex-1"></div>
            <span className="text-xs text-gray-600 font-medium uppercase">OR JOIN EXISTING</span>
            <button
              onClick={onRefreshTeams}
              className="p-1.5 bg-gray-800 hover:bg-gray-700 rounded-lg text-gray-500 hover:text-blue-400 transition-colors"
              title="Refresh teams list"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
            <div className="h-px bg-gray-800 flex-1"></div>
          </div>

          {/* Option B: Join Existing */}
          <div className="space-y-2">
            {teams.length === 0 ? (
              <div className="text-center py-8 text-gray-600 bg-gray-900/50 rounded-xl border border-dashed border-gray-800">
                <Users className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No active teams yet.</p>
              </div>
            ) : (
              teams.map(team => (
                <button
                  key={team.id}
                  onClick={() => handleJoinTeam(team.id, team.name)}
                  className="w-full bg-gray-900 border border-gray-800 hover:border-violet-500 hover:bg-gray-800 p-4 rounded-xl flex items-center justify-between transition-all group disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-violet-500/20 text-violet-400 flex items-center justify-center">
                      <Users className="w-5 h-5" />
                    </div>
                    <span className="font-semibold text-gray-200 group-hover:text-white text-left">{team.name}</span>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
});

TeamSelection.displayName = 'TeamSelection';
