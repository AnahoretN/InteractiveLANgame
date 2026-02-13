/**
 * ScorePanel Component
 * Displays team scores during gameplay
 */

import React, { memo } from 'react';
import { Trophy } from 'lucide-react';

interface TeamScoreProps {
  teamId: string;
  teamName: string;
  score: number;
  isCurrent?: boolean;
}

interface ScorePanelProps {
  teams: TeamScoreProps[];
  currentTeamId?: string | null;
}

export const ScorePanel = memo(({ teams, currentTeamId }: ScorePanelProps) => {
  // Sort teams by score (descending)
  const sortedTeams = [...teams].sort((a, b) => b.score - a.score);

  return (
    <div className="bg-gray-900/80 backdrop-blur border-b border-gray-700 px-6 py-4">
      <div className="flex items-center gap-6 overflow-x-auto">
        {sortedTeams.map((team) => (
          <div
            key={team.teamId}
            className={`flex items-center gap-3 px-4 py-2 rounded-lg transition-all ${
              team.teamId === currentTeamId
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30 scale-105'
                : 'bg-gray-800 text-gray-300'
            }`}
          >
            <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
              <Trophy className={`w-5 h-5 ${
                team.teamId === currentTeamId ? 'text-blue-600' : 'text-gray-600'
              }`} />
            </div>
            <div className="min-w-0">
              <p className="font-semibold truncate">{team.teamName}</p>
              <p className="text-2xl font-bold">{team.score}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
});

ScorePanel.displayName = 'ScorePanel';
