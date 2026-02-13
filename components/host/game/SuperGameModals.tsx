/**
 * SuperGameModals Component
 * Modals for super game: question display and answers grid
 */

import React, { memo, useState, useCallback, useEffect } from 'react';
import { Volume2, X } from 'lucide-react';
import type { Round, Theme, Question } from '../packeditor/types';
import type { SuperGameBet, SuperGameAnswer } from './types';
import { calculateQuestionFontSize } from './fontUtils';

// ============= SUPER GAME QUESTION MODAL =============

interface SuperGameQuestionModalProps {
  round: Round;
  selectedSuperThemeId: string | null;
  teamScores: { teamId: string; teamName: string; score: number }[];
  superGameBets: SuperGameBet[];
  superGameAnswers: SuperGameAnswer[];
  onClose: () => void;
}

export const SuperGameQuestionModal = memo(({
  round,
  selectedSuperThemeId,
  teamScores,
  superGameBets,
  superGameAnswers,
  onClose,
}: SuperGameQuestionModalProps) => {
  const [timerRemaining, setTimerRemaining] = useState(0);
  const [timerActive, setTimerActive] = useState(false);

  // Get the selected theme and question
  const selectedTheme = round.themes?.find(t => t.id === selectedSuperThemeId);
  const question = selectedTheme?.questions?.[0];

  // Auto-start timer when question opens
  useEffect(() => {
    setTimerActive(true);
    const QUESTION_TIME = 60; // 60 seconds for super game question
    setTimerRemaining(QUESTION_TIME);

    const interval = setInterval(() => {
      setTimerRemaining(prev => {
        if (prev <= 0.1) {
          clearInterval(interval);
          setTimerActive(false);
          return 0;
        }
        return Math.max(0, prev - 0.1);
      });
    }, 100);

    return () => clearInterval(interval);
  }, []);

  const handleClose = useCallback(() => {
    onClose();
    setTimerActive(false);
  }, [onClose]);

  if (!selectedTheme || !question) {
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm">
        <div className="text-white text-2xl">No question available</div>
      </div>
    );
  }

  const mediaUrl = question.media?.url;
  const mediaType = question.media?.type;

  // Calculate dynamic font size
  const questionText = question.text || '';
  const questionFontSizeMobile = calculateQuestionFontSize(questionText, 3);
  const questionFontSizeDesktop = calculateQuestionFontSize(questionText, 5);

  // Calculate timer progress
  const QUESTION_TIME = 60;
  const timerProgress = ((QUESTION_TIME - timerRemaining) / QUESTION_TIME) * 100;

  return (
    <div className="fixed inset-0 z-[60] flex bg-black/80 backdrop-blur-sm animate-in fade-in duration-200 cursor-default"
      style={{ paddingTop: '100px', paddingBottom: '20px' }}
    >
      <style>{`
        @media (min-width: 768px) {
          [data-sg-sgq="true"] { font-size: ${questionFontSizeDesktop}rem !important; }
        }
      `}</style>
      <div
        className="w-[90vw] mx-auto bg-gray-900 border-2 border-purple-500 rounded-2xl shadow-2xl flex flex-col overflow-hidden cursor-default"
        style={{ maxHeight: 'calc(100vh - 140px)', minHeight: '48vh' }}
      >
        {/* Question Section */}
        <div className="flex-1 flex flex-col border-b border-gray-700 min-h-0">
          {/* Header - Theme name, Super Game label and Timer */}
          <div className="bg-gradient-to-r from-purple-600 to-pink-600 px-6 py-3 flex items-center justify-between">
            <div className="flex items-center gap-6">
              <div className="text-xl font-bold text-white">{selectedTheme.name}</div>
              {timerActive && (
                <div className="text-xl font-bold text-white">
                  <span className="text-purple-200">{timerRemaining.toFixed(1)}s</span>
                </div>
              )}
            </div>
            <div className="text-2xl font-black text-white">SUPER GAME</div>
          </div>

          {/* Timer bar */}
          <div className="bg-gray-700 w-full overflow-hidden" style={{ height: '16px' }}>
            {timerActive ? (
              <div
                className="h-full transition-all duration-100 ease-linear bg-gradient-to-r from-purple-500 to-pink-500"
                style={{ width: `${timerProgress}%` }}
              />
            ) : null}
          </div>

          {/* Question content */}
          <div className="flex-1 flex items-center justify-center p-6 overflow-auto">
            <div className={`w-full h-full flex ${
              mediaUrl ? 'items-center justify-start' : 'items-center justify-center'
            }`}>
              {/* Media container on left - 50% width when media exists */}
              {mediaUrl ? (
                <div className="w-1/2 h-full flex items-center justify-center p-4">
                  {mediaType === 'image' && (
                    <img
                      src={mediaUrl}
                      alt="Question media"
                      className="w-full h-auto object-contain rounded-lg shadow-xl"
                    />
                  )}
                  {mediaType === 'video' && (
                    <video
                      src={mediaUrl}
                      controls
                      className="w-full h-auto object-contain rounded-lg shadow-xl"
                    />
                  )}
                  {mediaType === 'audio' && (
                    <div className="w-full flex items-center justify-center gap-4 bg-gray-800 rounded-lg p-4">
                      <Volume2 className="w-16 h-16 text-purple-400" />
                      <audio src={mediaUrl} controls className="flex-1" />
                    </div>
                  )}
                </div>
              ) : null}

              {/* Question text */}
              {mediaUrl ? (
                <div className="w-1/2 h-full flex items-center justify-center p-4">
                  <h2
                    className="font-bold text-white leading-[1.1] text-center"
                    style={{ fontSize: `${questionFontSizeMobile}rem` }}
                    data-sg-sgq="true"
                  >
                    {questionText}
                  </h2>
                </div>
              ) : (
                <div className="w-3/4 h-full flex items-center justify-center p-4">
                  <h2
                    className="font-bold text-white leading-[1.1] text-center"
                    style={{ fontSize: `${questionFontSizeMobile}rem` }}
                    data-sg-sgq="true"
                  >
                    {questionText}
                  </h2>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Status bar - simple status message */}
        <div className="h-16 bg-gray-800/50 flex items-center justify-center px-6">
          <div className="text-center text-white text-lg">
            {superGameAnswers.length > 0 && superGameAnswers.length === teamScores.length ? (
              <span className="text-green-400 animate-pulse">All teams answered! Press Space to reveal answers</span>
            ) : (
              <span className="text-gray-400">Waiting for teams to answer... ({superGameAnswers.length}/{teamScores.length})</span>
            )}
          </div>
        </div>

        {/* Close button */}
        <div className="h-16 bg-gray-900 flex items-center justify-center px-6 border-t border-gray-700">
          <button
            onClick={handleClose}
            className="px-6 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg"
          >
            Close (Esc)
          </button>
        </div>
      </div>
    </div>
  );
});

SuperGameQuestionModal.displayName = 'SuperGameQuestionModal';

// ============= SUPER GAME ANSWERS MODAL =============

interface SuperGameAnswersModalProps {
  round: Round;
  selectedSuperThemeId: string | null;
  teamScores: { teamId: string; teamName: string; score: number }[];
  superGameBets: SuperGameBet[];
  superGameAnswers: SuperGameAnswer[];
  selectedSuperAnswerTeam: string | null;
  onTeamSelect: (teamId: string) => void;
  onScoreChange: (teamId: string, correct: boolean) => void;
  onClose: () => void;
}

export const SuperGameAnswersModal = memo(({
  round,
  selectedSuperThemeId,
  teamScores,
  superGameBets,
  superGameAnswers,
  selectedSuperAnswerTeam,
  onTeamSelect,
  onScoreChange,
  onClose,
}: SuperGameAnswersModalProps) => {
  // Get the selected theme and question
  const selectedTheme = round.themes?.find(t => t.id === selectedSuperThemeId);
  const question = selectedTheme?.questions?.[0];

  // Handle keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === '=') {
        // Correct answer
        if (selectedSuperAnswerTeam) {
          onScoreChange(selectedSuperAnswerTeam, true);
        }
      } else if (e.key === '-') {
        // Wrong answer
        if (selectedSuperAnswerTeam) {
          onScoreChange(selectedSuperAnswerTeam, false);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedSuperAnswerTeam, onScoreChange]);

  if (!selectedTheme || !question) {
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm">
        <div className="text-white text-2xl">No question available</div>
      </div>
    );
  }

  const mediaUrl = question.media?.url;
  const mediaType = question.media?.type;

  // Calculate dynamic font size for question
  const questionText = question.text || '';
  const questionFontSize = calculateQuestionFontSize(questionText, 4);

  return (
    <div className="fixed inset-0 z-[60] flex bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
      style={{ paddingTop: '100px', paddingBottom: '20px' }}
    >
      <style>{`
        @media (min-width: 768px) {
          [data-sg-sga="true"] { font-size: ${questionFontSize}rem !important; }
        }
      `}</style>
      <div
        className="w-[90vw] mx-auto bg-gray-900 border-2 border-purple-500 rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        style={{ maxHeight: 'calc(100vh - 140px)', minHeight: '40vh' }}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-600 to-pink-600 px-6 py-3">
          <div className="flex items-center justify-between">
            <div className="text-xl font-bold text-white">{selectedTheme.name}</div>
            <button
              onClick={onClose}
              className="text-white hover:text-purple-200 transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Question content */}
        <div className="flex-1 flex flex-col p-6 overflow-auto">
          {/* Media */}
          {mediaUrl && (
            <div className="mb-6 flex items-center justify-center">
              {mediaType === 'image' && (
                <img
                  src={mediaUrl}
                  alt="Question"
                  className="max-h-64 object-contain rounded-lg"
                />
              )}
              {mediaType === 'video' && (
                <video
                  src={mediaUrl}
                  controls
                  className="max-h-64 object-contain rounded-lg"
                />
              )}
              {mediaType === 'audio' && (
                <div className="flex items-center justify-center gap-4 bg-gray-800 rounded-lg p-4">
                  <Volume2 className="w-12 h-12 text-purple-400" />
                  <audio src={mediaUrl} controls />
                </div>
              )}
            </div>
          )}

          {/* Question text */}
          <h2
            className="font-bold text-white text-center mb-6 leading-[1.1]"
            style={{ fontSize: `${questionFontSize}rem` }}
            data-sg-sga="true"
          >
            {questionText}
          </h2>

          {/* Answers grid */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {teamScores.map((team) => {
              const bet = superGameBets.find(b => b.teamId === team.teamId);
              const answer = superGameAnswers.find(a => a.teamId === team.teamId);
              const isSelected = selectedSuperAnswerTeam === team.teamId;
              const isCorrect = answer?.isCorrect ?? false;
              const isWrong = answer?.isWrong ?? false;

              return (
                <button
                  key={team.teamId}
                  onClick={() => onTeamSelect(team.teamId)}
                  disabled={!!answer}
                  className={`relative p-4 rounded-xl border-2 transition-all ${
                    isSelected
                      ? 'border-blue-500 bg-blue-500/20 scale-105'
                      : answer
                      ? isCorrect
                        ? 'border-green-500 bg-green-500/20'
                        : isWrong
                        ? 'border-red-500 bg-red-500/20'
                        : 'border-gray-600 bg-gray-800'
                      : 'border-gray-700 bg-gray-900 hover:border-gray-600'
                  } ${answer ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                >
                  {/* Team name */}
                  <div className="text-center mb-2">
                    <div className="text-lg font-bold text-white">{team.teamName}</div>
                  </div>

                  {/* Answer or status */}
                  <div className="text-center">
                    {isCorrect && (
                      <div className="text-green-400 font-bold">✓ Правильно!</div>
                    )}
                    {isWrong && (
                      <div className="text-red-400 font-bold">✗ Неправильно</div>
                    )}
                    {!answer && (
                      <div className="text-gray-400">Ожидает...</div>
                    )}
                  </div>

                  {/* Result indicator */}
                  {(isCorrect || isWrong) && (
                    <div className="absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center text-white text-sm font-bold">
                      {isCorrect ? '+' : '-'}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Instructions */}
        <div className="bg-gray-800 px-6 py-3 border-t border-gray-700">
          <div className="text-center text-gray-400 text-sm">
            <p className="mb-1">Нажмите на команду для выбора ответа</p>
            <p>= ✓ (правильно) &nbsp;&nbsp;&nbsp; - ✓ (неправильно) &nbsp;&nbsp;&nbsp; Esc - закрыть</p>
          </div>
        </div>
      </div>
    </div>
  );
});

SuperGameAnswersModal.displayName = 'SuperGameAnswersModal';
