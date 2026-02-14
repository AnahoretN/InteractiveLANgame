/**
 * GameBoardExtended Component
 * Displays the main game board with themes and point cards
 * Extended version with answered questions tracking
 */

import React, { memo } from 'react';
import type { Round, Theme, Question } from '../PackEditor';

interface GameBoardExtendedProps {
  round: Round;
  teamScores?: Array<{ teamId: string; teamName: string; score: number }>;
  onQuestionClick: (question: Question, theme: Theme, points: number) => void;
  isQuestionAnswered: (questionId: string, themeId: string) => boolean;
  highlightedQuestion: string | null;
}

export const GameBoardExtended = memo(({
  round,
  teamScores,
  onQuestionClick,
  isQuestionAnswered,
  highlightedQuestion
}: GameBoardExtendedProps) => {
  const themes = round.themes || [];
  const maxQuestions = Math.max(...themes.map(t => t.questions?.length || 0), 1);

  // Helper function to make color lighter (for question cards)
  const lightenColor = (hex: string, percent: number): string => {
    const num = parseInt(hex.replace(/#/g, ''), 16);
    const amt = Math.round(2.55 * percent);
    const R = (num >> 16) + amt;
    const G = (num >> 8 & 0x00FF) + amt;
    const B = (num & 0x0000FF) + amt;
    return '#' + (
      0x1000000 +
      (R < 255 ? (R < 1 ? 0 : R) : 255) * 0x10000 +
      (G < 255 ? (G < 1 ? 0 : G) : 255) * 0x100 +
      (B < 255 ? (B < 1 ? 0 : B) : 255)
    ).toString(16).slice(1);
  };

  // Calculate actual grid dimensions
  const numThemes = Math.min(themes.length, 10);
  const numQuestions = maxQuestions;

  return (
    <div className="w-full h-full animate-in fade-in duration-500 p-1 cursor-default">
      {/* Themes column (1/8 width) + Questions grid (7/8 width) */}
      <div className="flex h-full gap-1">
        {/* Left column: Themes - 1/8 of screen width */}
        <div className="w-[12.5%] flex flex-col gap-1">
          {themes.map(theme => {
            const themeColor = theme.color || '#3b82f6';
            const themeTextColor = theme.textColor || '#ffffff';
            return (
              <div
                key={theme.id}
                className="flex-1 rounded-xl p-3 flex items-center justify-center shadow-lg cursor-default"
                style={{ backgroundColor: themeColor }}
              >
                <h3 className="font-bold text-center text-2xl leading-tight" style={{ color: themeTextColor }}>
                  {theme.name}
                </h3>
              </div>
            );
          })}
        </div>

        {/* Right area: Questions grid - dynamic rows/cols based on content */}
        <div
          className="flex-1"
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${numQuestions}, 1fr)`,
            gridTemplateRows: `repeat(${numThemes}, 1fr)`,
            gap: '4px',
          }}
        >
          {themes.map(theme => (
            theme.questions?.map((question, qIndex) => {
              const questionId = `${theme.id}-${question.id}`;
              const answered = isQuestionAnswered(question.id, theme.id);
              const isHighlighted = highlightedQuestion === questionId;

              return (
                <div
                  key={questionId}
                  className={`
                    rounded-xl shadow-md flex items-center justify-center
                    ${answered
                      ? 'bg-gray-800/50 opacity-50 cursor-not-allowed'
                      : 'bg-gray-800 cursor-pointer hover:bg-gray-700 transition-all hover:scale-105'
                    }
                    ${isHighlighted ? 'ring-4 ring-yellow-400 scale-110' : ''}
                  `}
                  style={{
                    backgroundColor: answered ? undefined : lightenColor(theme.color || '#3b82f6', 40),
                  }}
                  onClick={() => !answered && onQuestionClick(question, theme, question.points || (qIndex + 1) * 100)}
                >
                  <span className={`font-bold text-3xl ${answered ? 'text-gray-500' : 'text-white'}`}>
                    {answered ? '' : question.points || (qIndex + 1) * 100}
                  </span>
                </div>
              );
            })
          ))}
        </div>
      </div>
    </div>
  );
});

GameBoardExtended.displayName = 'GameBoardExtended';
