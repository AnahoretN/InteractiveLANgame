/**
 * QuestionModal Component
 * Modal for displaying questions and answers with media support
 */

import React, { memo, useCallback, useMemo } from 'react';
import { X, Volume2 } from 'lucide-react';
import type { Question } from '../PackEditor';
import { calculateQuestionFontSize, calculateAnswerFontSizeDesktop } from './fontUtils';

interface QuestionModalProps {
  question: Question;
  showAnswer: boolean;
  themeName?: string;
  roundName?: string;
  onClose: () => void;
  onRevealAnswer: () => void;
  onCorrect: () => void;
  onWrong: () => void;
  onNext: () => void;
  onPrev: () => void;
  teamScores?: Map<string, number>;
  currentTeamId?: string | null;
  questionIndex?: number;
  totalQuestions?: number;
}

export const QuestionModal = memo(({
  question,
  showAnswer,
  themeName,
  roundName,
  onClose,
  onRevealAnswer,
  onCorrect,
  onWrong,
  onNext,
  onPrev,
  teamScores,
  currentTeamId,
  questionIndex = 0,
  totalQuestions = 1
}: QuestionModalProps) => {
  const questionFontSize = useMemo(
    () => calculateQuestionFontSize(question.text, 7 / 1.5),
    [question.text]
  );

  const handleKeyPress = useCallback((e: KeyboardEvent) => {
    switch (e.code) {
      case 'Escape':
        onClose();
        break;
      case 'Space':
        if (!showAnswer) {
          onRevealAnswer();
        } else {
          onNext();
        }
        e.preventDefault();
        break;
      case 'KeyC':
        onCorrect();
        e.preventDefault();
        break;
      case 'KeyW':
      case 'ControlLeft':
      case 'ControlRight':
        onWrong();
        e.preventDefault();
        break;
      case 'ArrowLeft':
        onPrev();
        e.preventDefault();
        break;
    }
  }, [showAnswer, onClose, onRevealAnswer, onCorrect, onWrong, onNext, onPrev]);

  React.useEffect(() => {
    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [handleKeyPress]);

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-8">
      <div className="bg-gray-900 rounded-2xl shadow-2xl max-w-6xl w-full max-h-[90vh] overflow-hidden flex flex-col border-2 border-blue-500/30">
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b border-gray-700">
          <div className="flex items-center gap-4">
            {roundName && (
              <span className="text-white font-semibold">{roundName}</span>
            )}
            {themeName && (
              <span className="text-white font-semibold">{themeName}</span>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-8">
          {/* Question text */}
          <div className="mb-8">
            <h2
              className="text-white font-bold leading-tight"
              style={{ fontSize: `${questionFontSize}rem` }}
            >
              {question.text}
            </h2>
          </div>

          {/* Media content */}
          {question.media && (
            <div className="mb-8 flex justify-center">
              {question.media.type === 'image' && (
                <img
                  src={question.media.url}
                  alt="Question media"
                  className="max-h-[40vh] rounded-lg"
                />
              )}
              {question.media.type === 'video' && (
                <video
                  src={question.media.url}
                  controls
                  className="max-h-[40vh] rounded-lg"
                />
              )}
              {question.media.type === 'audio' && (
                <div className="flex items-center gap-4 bg-gray-800 px-6 py-4 rounded-full">
                  <Volume2 className="w-6 h-6 text-blue-400" />
                  <audio src={question.media.url} controls className="w-64" />
                </div>
              )}
            </div>
          )}

          {/* Answer */}
          {showAnswer && question.answers && question.answers.length > 0 && (
            <div className="mt-8 space-y-4">
              {question.answers.map((answer, index) => (
                <div
                  key={index}
                  className={`p-6 rounded-xl border-2 ${
                    index === question.correctAnswer
                      ? 'bg-green-500/20 border-green-500'
                      : 'bg-gray-800 border-gray-700'
                  }`}
                >
                  <span
                    className="text-white font-semibold"
                    style={{
                      fontSize: `${calculateAnswerFontSizeDesktop(answer)}rem`
                    }}
                  >
                    {answer}
                  </span>
                  {index === question.correctAnswer && (
                    <span className="ml-3 text-green-400 text-sm font-bold">✓ Правильный ответ</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer with controls */}
        <div className="p-6 border-t border-gray-700 bg-gray-800/50">
          <div className="flex justify-between items-center">
            {/* Team scores */}
            {teamScores && teamScores.size > 0 && (
              <div className="flex gap-4">
                {Array.from(teamScores.entries()).map(([teamId, score]) => (
                  <div
                    key={teamId}
                    className={`px-4 py-2 rounded-lg ${
                      teamId === currentTeamId
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-700 text-gray-300'
                    }`}
                  >
                    <span className="font-semibold">{score}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});

QuestionModal.displayName = 'QuestionModal';
