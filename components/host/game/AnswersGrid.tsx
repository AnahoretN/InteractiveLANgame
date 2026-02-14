/**
 * AnswersGrid Component
 * Grid display for super game answers
 */

import React, { memo } from 'react';
import type { SuperGameAnswer } from './types';

interface AnswersGridProps {
  answers: SuperGameAnswer[];
  onReveal: (teamId: string) => void;
}

export const AnswersGrid = memo(({ answers, onReveal }: AnswersGridProps) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {answers.map((answer) => (
        <div
          key={answer.teamId}
          onClick={() => !answer.revealed && onReveal(answer.teamId)}
          className={`bg-gray-800 rounded-xl p-6 border-2 transition-all cursor-pointer ${
            answer.revealed
              ? 'border-white bg-white'
              : 'border-gray-700 hover:border-blue-500 hover:bg-gray-750'
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="font-bold text-gray-300">{answer.teamId}</span>
            {answer.revealed && (
              <span className="text-green-400">✓</span>
            )}
          </div>
          <p className={`text-xl font-medium ${answer.revealed ? 'text-gray-900' : 'text-gray-500'}`}>
            {answer.revealed ? answer.answer : '???'}
          </p>
        </div>
      ))}
    </div>
  );
});

AnswersGrid.displayName = 'AnswersGrid';
