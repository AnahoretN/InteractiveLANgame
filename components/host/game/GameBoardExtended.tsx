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

  // Helper function to make color brighter and less saturated (for question cards)
  // 10% brighter, 5% less saturated than theme color
  const adjustColor = (hex: string): string => {
    const num = parseInt(hex.replace(/#/g, ''), 16);
    let R = num >> 16;
    let G = num >> 8 & 0x00FF;
    let B = num & 0x0000FF;

    // Convert to HSL
    const rNorm = R / 255;
    const gNorm = G / 255;
    const bNorm = B / 255;

    const max = Math.max(rNorm, gNorm, bNorm);
    const min = Math.min(rNorm, gNorm, bNorm);
    let h = 0, s = 0, l = (max + min) / 2;

    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case rNorm: h = ((gNorm - bNorm) / d + (gNorm < bNorm ? 6 : 0)) / 6; break;
        case gNorm: h = ((bNorm - rNorm) / d + 2) / 6; break;
        case bNorm: h = ((rNorm - gNorm) / d + 4) / 6; break;
      }
    }

    // Adjust: 10% brighter (increase lightness), 5% less saturated
    l = Math.min(1, l + 0.10);
    s = Math.max(0, s * 0.95);

    // Convert back to RGB
    let r, g, b;
    if (s === 0) {
      r = g = b = l;
    } else {
      const hue2rgb = (p: number, q: number, t: number) => {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1/6) return p + (q - p) * 6 * t;
        if (t < 1/2) return q;
        if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
        return p;
      };
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      r = hue2rgb(p, q, h + 1/3);
      g = hue2rgb(p, q, h);
      b = hue2rgb(p, q, h - 1/3);
    }

    return '#' + (
      Math.round(r * 255) * 0x10000 +
      Math.round(g * 255) * 0x100 +
      Math.round(b * 255)
    ).toString(16).padStart(6, '0');
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
                      ? 'cursor-not-allowed'
                      : 'cursor-pointer'
                    }
                    ${isHighlighted ? 'ring-4 ring-yellow-400 scale-110' : ''}
                  `}
                  style={{
                    backgroundColor: answered ? '#797d80' : adjustColor(theme.color || '#3b82f6'), // #797d80 = medium gray
                    opacity: answered ? 0.5 : 1,
                  }}
                  onClick={() => !answered && onQuestionClick(question, theme, question.points || (qIndex + 1) * 100)}
                >
                  <span className="font-bold text-3xl text-white">
                    {question.points || (qIndex + 1) * 100}
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
