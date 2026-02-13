/**
 * ShowWinnerScreen Component
 * Displays the winner(s) and final scores at the end of the game
 */

import React, { memo, useEffect } from 'react';

export interface TeamScore {
  teamId: string;
  teamName: string;
  score: number;
}

interface ShowWinnerScreenProps {
  teamScores: TeamScore[];
  onBroadcastMessage?: (message: unknown) => void;
}

export const ShowWinnerScreen = memo(({
  teamScores,
  onBroadcastMessage,
}: ShowWinnerScreenProps) => {
  // Find winner(s) - team with highest score
  const maxScore = Math.max(...teamScores.map(t => t.score));
  const winners = teamScores.filter(t => t.score === maxScore);

  // Broadcast winner to mobile clients
  useEffect(() => {
    if (onBroadcastMessage && winners.length > 0) {
      onBroadcastMessage({
        type: 'SUPER_GAME_SHOW_WINNER',
        winnerTeamName: winners.length === 1
          ? winners[0].teamName
          : 'Tie: ' + winners.map(w => w.teamName).join(' & '),
        finalScores: teamScores.map(t => ({ teamId: t.teamId, teamName: t.teamName, score: t.score })),
      });
    }
  }, [onBroadcastMessage, winners, teamScores]);

  return (
    <div className="fixed top-24 left-0 right-0 bottom-0 z-[60] flex items-center justify-center bg-gradient-to-br from-yellow-600 via-orange-600 to-red-600 animate-in fade-in duration-500">
      <div className="text-center">
        {/* Winner title */}
        <h1 className="text-6xl font-black text-white mb-8 animate-bounce">
          WINNER!
        </h1>

        {/* Winner name(s) */}
        <div className="mb-12">
          {winners.length === 1 ? (
            <div className="text-8xl font-black text-white drop-shadow-2xl">
              {winners[0].teamName}
            </div>
          ) : (
            <div className="text-5xl font-bold text-white">
              {winners.map(w => (
                <div key={w.teamId} className="text-6xl mt-4">{w.teamName}</div>
              ))}
            </div>
          )}
        </div>

        {/* Final scores */}
        <div className="bg-black/30 backdrop-blur-sm rounded-2xl p-8 max-w-2xl">
          <h2 className="text-3xl font-bold text-white mb-6">Final Scores</h2>
          <div className="space-y-4">
            {/* Sort by score descending */}
            {[...teamScores].sort((a, b) => b.score - a.score).map((team, index) => {
              const isWinner = winners.some(w => w.teamId === team.teamId);
              return (
                <div
                  key={team.teamId}
                  className={`flex items-center justify-between p-4 rounded-xl ${
                    isWinner
                      ? 'bg-yellow-500/30 border-2 border-yellow-400'
                      : 'bg-white/10'
                  }`}
                >
                  <div className="flex items-center gap-4">
                    {/* Position */}
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg ${
                      index === 0 ? 'bg-yellow-500 text-white' :
                      index === 1 ? 'bg-gray-400 text-white' :
                      index === 2 ? 'bg-orange-600 text-white' :
                      'bg-gray-600 text-white'
                    }`}>
                      {index + 1}
                    </div>
                    <div className="text-2xl font-bold text-white">{team.teamName}</div>
                  </div>
                  <div className="text-4xl font-black text-white">{team.score}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Trophy icon for winners */}
        {winners.length === 1 && (
          <div className="mt-8 text-9xl animate-pulse">🏆</div>
        )}
      </div>
    </div>
  );
});

ShowWinnerScreen.displayName = 'ShowWinnerScreen';
