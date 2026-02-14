/**
 * GameBoard Component
 * Displays the main game board with themes and point cards
 */

import React, { memo } from 'react';
import type { Round, Theme, Question } from '../PackEditor';
import { calculateThemeGrid, calculateThemeCardFontSize } from './fontUtils';

interface GameBoardProps {
  round: Round;
  onThemeSelect?: (themeId: string) => void;
  onQuestionSelect: (question: Question, themeId: string) => void;
  selectedThemeId?: string | null;
}

export const GameBoard = memo(({
  round,
  onThemeSelect,
  onQuestionSelect,
  selectedThemeId
}: GameBoardProps) => {
  const themes = round.themes || [];
  const gridConfig = calculateThemeGrid(themes.length);

  // Get point values from first theme (all themes have same point values)
  const pointValues = themes[0]?.questions?.map((_, i) => {
    const points = [100, 200, 300, 400, 500];
    return points[i] || (i + 1) * 100;
  }) || [];

  return (
    <div
      className="flex items-center justify-center p-8"
      style={{ minHeight: '100vh' }}
    >
      <div
        className="bg-gray-900 rounded-lg shadow-2xl border-2 border-blue-500/50"
        style={{
          width: `${gridConfig.width}px`,
          height: `${gridConfig.height}px`,
        }}
      >
        {/* Header row with point values */}
        <div className="grid border-b border-blue-500/30" style={{ gridTemplateColumns: `200px repeat(${gridConfig.columns}, 1fr)` }}>
          <div className="bg-gray-800 p-3 flex items-center justify-center">
            <span className="text-blue-400 font-bold text-sm">ТЕМЫ</span>
          </div>
          {pointValues.map((points, index) => (
            <div
              key={`points-${index}`}
              className="bg-gray-800 p-3 flex items-center justify-center border-l border-blue-500/20"
            >
              <span className="text-yellow-400 font-bold">{points}</span>
            </div>
          ))}
        </div>

        {/* Theme rows */}
        {themes.map((theme) => (
          <div
            key={theme.id}
            className="contents"
            style={{
              display: 'grid',
              gridTemplateColumns: `200px repeat(${gridConfig.columns}, 1fr)`,
              gridTemplateRows: `${100 / gridConfig.rows}%`
            }}
          >
            {/* Theme name cell */}
            <div
              className="bg-gradient-to-br from-blue-600 to-blue-800 p-3 flex items-center justify-center border-r border-blue-500/30"
              onClick={() => onThemeSelect?.(theme.id)}
              style={{ cursor: onThemeSelect ? 'pointer' : 'default' }}
            >
              <span
                className="text-white font-bold text-center leading-tight"
                style={{
                  fontSize: `${calculateThemeCardFontSize(theme.name, gridConfig.cardSizeFactor)}px`
                }}
              >
                {theme.name}
              </span>
            </div>

            {/* Question cards */}
            {theme.questions?.map((question, qIndex) => (
              <div
                key={`${theme.id}-${qIndex}`}
                className="bg-gray-800 border border-blue-500/20 p-3 flex items-center justify-center hover:bg-gray-700 transition-colors cursor-pointer"
                onClick={() => onQuestionSelect(question, theme.id)}
              >
                <span className="text-blue-400 font-bold text-2xl">
                  {question.points || pointValues[qIndex]}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
});

GameBoard.displayName = 'GameBoard';
