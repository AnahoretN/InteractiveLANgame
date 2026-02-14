/**
 * SuperGameRound Component
 * Handles the super game final round with theme selection, betting, and answers
 */

import React, { memo, useState, useCallback, useMemo } from 'react';
import type { Round, Theme } from '../PackEditor';
import type { SuperGameBet, SuperGameAnswer } from './types';
import type { ExtendedRound } from '../packeditor/types';

interface SuperGameRoundProps {
  round: ExtendedRound;
  superGameBets?: SuperGameBet[];
  superGameAnswers?: SuperGameAnswer[];
  onThemeSelect: (themeId: string) => void;
  onPlaceBet: (teamId: string, bet: number) => void;
  onSubmitAnswer: (teamId: string, answer: string) => void;
  onRevealAnswer?: (teamId: string) => void;
  onAdvance: () => void;
  maxBet?: number;
}

export const SuperGameRound = memo(({
  round,
  superGameBets = [],
  superGameAnswers = [],
  onThemeSelect,
  onPlaceBet,
  onSubmitAnswer,
  onRevealAnswer,
  onAdvance,
  maxBet
}: SuperGameRoundProps) => {
  // Determine which screen to show
  const availableThemes = round.themes?.filter(t => !t.disabled) || [];
  const selectedThemeId = useMemo(() => {
    return round.selectedSuperThemeId || null;
  }, [round.selectedSuperThemeId]);

  const allBetsPlaced = superGameBets.length > 0 &&
    superGameBets.every(bet => bet.ready);

  const selectedTheme = availableThemes.find(t => t.id === selectedThemeId);

  return (
    <div className="h-full flex flex-col items-center justify-center bg-gradient-to-br from-purple-900 via-blue-900 to-gray-950 text-white p-8">
      <div className="max-w-6xl w-full">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 via-orange-400 to-red-400 mb-2">
            СУПЕР-ИГРА
          </h1>
          <p className="text-xl text-gray-300">
            {maxBet ? `Максимальная ставка: ${maxBet}` : 'Сделайте ставку'}
          </p>
        </div>

        {/* Theme selection or question display */}
        {selectedTheme ? (
          <div className="bg-gray-900/80 backdrop-blur rounded-2xl p-8 border border-yellow-500/30">
            <h2 className="text-3xl font-bold text-yellow-400 mb-6 text-center">
              {selectedTheme.name}
            </h2>

            {/* Question */}
            {selectedTheme.questions?.[0] && (
              <div className="text-center">
                <p className="text-4xl font-bold mb-8 leading-relaxed">
                  {selectedTheme.questions[0].text}
                </p>

                {/* Answers grid */}
                {superGameAnswers.length > 0 && (
                  <div className="grid grid-cols-2 gap-4 max-w-4xl mx-auto">
                    {superGameAnswers.map((answer) => (
                      <div
                        key={answer.teamId}
                        className={`p-4 rounded-xl border-2 ${
                          answer.revealed
                            ? 'bg-white text-gray-900 border-white'
                            : 'bg-gray-800 border-gray-700'
                        } transition-all`}
                        onClick={() => !answer.revealed && onRevealAnswer?.(answer.teamId)}
                      >
                        <p className="text-lg font-semibold mb-1">{answer.teamId}</p>
                        <p className="text-2xl">{answer.answer}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

          </div>
        ) : (
          /* Theme selection */
          <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
            {availableThemes.map((theme) => (
              <button
                key={theme.id}
                onClick={() => onThemeSelect(theme.id)}
                className="bg-gray-900/80 backdrop-blur rounded-xl p-6 border-2 border-yellow-500/30 hover:border-yellow-500 hover:bg-gray-800 transition-all group"
              >
                <h3 className="text-xl font-bold text-yellow-400 group-hover:text-yellow-300 transition-colors">
                  {theme.name}
                </h3>
              </button>
            ))}
          </div>
        )}

        {/* Bets display */}
        {superGameBets.length > 0 && (
          <div className="mt-8 bg-gray-900/60 rounded-xl p-6">
            <h3 className="text-lg font-semibold mb-4 text-gray-300">Ставки:</h3>
            <div className="grid grid-cols-4 gap-3">
              {superGameBets.map((bet) => (
                <div
                  key={bet.teamId}
                  className={`p-3 rounded-lg text-center ${
                    bet.ready ? 'bg-green-500/20 border border-green-500/30' : 'bg-gray-800 border border-gray-700'
                  }`}
                >
                  <p className="text-sm text-gray-400">{bet.teamId}</p>
                  <p className="text-xl font-bold">{bet.amount}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
});

SuperGameRound.displayName = 'SuperGameRound';
