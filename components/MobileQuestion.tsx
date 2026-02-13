/**
 * MobileQuestion Component
 * Displays question and answer options for mobile clients
 */

import React, { memo, useState, useCallback, useEffect } from 'react';
import type { Question } from './host/PackEditor';

interface MobileQuestionProps {
  question: Question;
  points: number;
  showAnswer?: boolean;
  onAnswer?: (index: number) => void;
  timeRemaining?: number;
  isActive?: boolean;
}

export const MobileQuestion = memo(({
  question,
  points,
  showAnswer = false,
  onAnswer,
  timeRemaining,
  isActive = true
}: MobileQuestionProps) => {
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [revealedAnswers, setRevealedAnswers] = useState<Set<number>>(new Set());

  // Handle answer selection
  const handleAnswerSelect = useCallback((index: number) => {
    if (revealedAnswers.has(index)) {
      return; // Already revealed
    }
    setSelectedAnswer(index);
  }, [revealedAnswers]);

  // Confirm and send answer
  const handleConfirm = useCallback(() => {
    if (selectedAnswer === null || revealedAnswers.has(selectedAnswer)) {
      return;
    }
    onAnswer?.(selectedAnswer);
    setSelectedAnswer(null);
    setRevealedAnswers(prev => new Set([...prev, selectedAnswer!]));
  }, [selectedAnswer, revealedAnswers, onAnswer]);

  // Auto-confirm on timeout
  useEffect(() => {
    if (selectedAnswer !== null && isActive) {
      const timer = setTimeout(() => {
        handleConfirm();
      }, 3000); // 3 second auto-confirm
      return () => clearTimeout(timer);
    };
  }, [selectedAnswer, isActive, handleConfirm]);

  // Reset on question change
  useEffect(() => {
    setSelectedAnswer(null);
    setRevealedAnswers(new Set());
  }, [question]);

  if (!question.answers || question.answers.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6">
        <p className="text-white text-xl text-center">{question.text}</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col p-6">
      {/* Question header */}
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-2">
          <span className="bg-blue-600 text-white px-3 py-1 rounded-full text-sm font-bold">
            {points}
          </span>
          {timeRemaining !== undefined && timeRemaining >= 0 && (
            <span className={`text-sm font-mono ${timeRemaining < 10000 ? 'text-red-400' : 'text-gray-400'}`}>
              {Math.ceil(timeRemaining / 1000)}s
            </span>
          )}
        </div>
      </div>

      {/* Question text */}
      <div className="flex-1 flex items-center justify-center mb-6">
        <p className="text-white text-2xl leading-relaxed text-center px-4">
          {question.text}
        </p>
      </div>

      {/* Answers grid */}
      {question.answers && (
        <div className="grid grid-cols-2 gap-3">
          {question.answers.map((answer, index) => {
            const isRevealed = revealedAnswers.has(index);
            const isSelected = selectedAnswer === index;

            return (
              <button
                key={index}
                onClick={() => handleAnswerSelect(index)}
                disabled={!isActive || isRevealed}
                className={`
                  relative aspect-square bg-gray-800 rounded-xl border-2
                  transition-all duration-200
                  ${!isActive ? 'opacity-70' : 'hover:scale-105'}
                  ${isRevealed
                    ? 'border-green-500 bg-green-500/20'
                    : isSelected
                    ? 'border-blue-500 bg-blue-500/20'
                    : 'border-gray-700'}
                  }
                `}
              >
                {/* Answer number badge */}
                {isRevealed && (
                  <div className="absolute -top-2 -right-2 w-6 h-6 bg-green-500 rounded-full flex items-center justify-center text-white text-sm font-bold">
                    {index + 1}
                  </div>
                )}

                {/* Answer text */}
                <span className={`text-lg font-semibold ${isRevealed ? 'text-white' : isSelected ? 'text-blue-300' : 'text-gray-300'}`}>
                  {isRevealed ? answer : (isSelected ? '?' : '')}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Confirm button */}
      {selectedAnswer !== null && isActive && (
        <div className="mt-auto">
          <button
            onClick={handleConfirm}
            className="w-full py-4 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold text-lg"
          >
            Подтвердить ответ ({selectedAnswer + 1})
          </button>
        </div>
      )}

      {/* Instructions */}
      {!isActive && (
        <p className="text-gray-500 text-sm text-center">
          {revealedAnswers.size > 0
            ? `${revealedAnswers.size} из ${question.answers.length} ответов открыто`
            : 'Выберите ответ'}
        </p>
      )}
    </div>
  );
});

MobileQuestion.displayName = 'MobileQuestion';
