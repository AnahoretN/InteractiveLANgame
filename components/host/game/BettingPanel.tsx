/**
 * BettingPanel Component
 * Displays betting interface for super game
 */

import React, { memo, useState } from 'react';
import type { Team } from '../../../types';
import type { SuperGameBet } from './types';

interface BettingPanelProps {
  teams: Team[];
  bets: SuperGameBet[];
  maxBet: number;
  onPlaceBet: (teamId: string, bet: number) => void;
}

export const BettingPanel = memo(({ teams, bets, maxBet, onPlaceBet }: BettingPanelProps) => {
  const [editingBet, setEditingBet] = useState<string | null>(null);
  const [betAmount, setBetAmount] = useState<string>('');

  // Get bet for a team
  const getTeamBet = (teamId: string) => {
    return bets.find(b => b.teamId === teamId)?.bet || 0;
  };

  // Handle bet submission
  const handleSubmit = (teamId: string) => {
    const amount = parseInt(betAmount) || 0;
    if (amount > 0 && (!maxBet || amount <= maxBet)) {
      onPlaceBet(teamId, amount);
      setEditingBet(null);
      setBetAmount('');
    }
  };

  const startEditing = (teamId: string, currentBet: number) => {
    setEditingBet(teamId);
    setBetAmount(currentBet.toString());
  };

  const cancelEditing = () => {
    setEditingBet(null);
    setBetAmount('');
  };

  return (
    <div className="bg-gray-900/50 backdrop-blur rounded-xl p-6 border border-yellow-500/30">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-yellow-400">Ставки</h2>
        {maxBet > 0 && (
          <div className="text-gray-400">Макс: {maxBet}</div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {teams.map((team) => {
          const currentBet = getTeamBet(team.id);
          const isEditing = editingBet === team.id;
          const hasBet = bets.some(b => b.teamId === team.id);

          return (
            <div
              key={team.id}
              className={`bg-gray-800 rounded-lg p-4 border-2 transition-all ${
                hasBet ? 'border-green-500/30' : 'border-gray-700'
              }`}
            >
              <div className="flex items-center justify-between mb-3">
                <span className="font-semibold text-white">{team.name}</span>
                {hasBet && (
                  <span className="text-green-400 text-sm">✓</span>
                )}
              </div>

              {/* Current bet display or edit */}
              {!isEditing ? (
                <div
                  onClick={() => !hasBet && startEditing(team.id, currentBet || 0)}
                  className={`text-2xl font-bold ${hasBet ? 'text-white' : 'text-gray-400 cursor-pointer hover:text-white'}`}
                >
                  {currentBet > 0 ? `${currentBet}` : '—'}
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={betAmount}
                    onChange={(e) => setBetAmount(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleSubmit(team.id);
                      } else if (e.key === 'Escape') {
                        cancelEditing();
                      }
                    }}
                    onBlur={() => handleSubmit(team.id)}
                    autoFocus
                    min="1"
                  />
                  <span className="text-gray-400">очков</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Instructions */}
      <div className="text-gray-500 text-sm text-center mt-4">
        💡 Нажмите на ставку для изменения • Enter для подтверждения • Esc для отмены
      </div>
    </div>
  );
});

BettingPanel.displayName = 'BettingPanel';
