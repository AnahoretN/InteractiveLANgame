/**
 * SuperGameModals Component
 * Modals for super game: question display and answers grid
 */

import React, { memo, useState, useCallback, useEffect, useMemo } from 'react';
import { Volume2, X } from 'lucide-react';
import type { Round } from '../packeditor/types';
import type { SuperGameBet, SuperGameAnswer } from './types';
import { calculateQuestionFontSize } from './fontUtils';

// ============= CONSTANTS =============
const SUPER_GAME_QUESTION_TIME = 60; // seconds
const TIMER_UPDATE_INTERVAL = 100; // ms

// ============= SUPER GAME QUESTION MODAL =============

interface SuperGameQuestionModalProps {
  round: Round;
  selectedSuperThemeId: string | null;
  onClose: () => void;
}

export const SuperGameQuestionModal = memo(({
  round,
  selectedSuperThemeId,
  onClose,
}: SuperGameQuestionModalProps) => {
  const [timerRemaining, setTimerRemaining] = useState<number>(SUPER_GAME_QUESTION_TIME);
  const [timerActive, setTimerActive] = useState<boolean>(true);

  // Get the selected theme and question
  const selectedTheme = useMemo(
    () => round.themes?.find(t => t.id === selectedSuperThemeId),
    [round.themes, selectedSuperThemeId]
  );
  const question = selectedTheme?.questions?.[0];

  // Auto-start timer when question opens
  useEffect(() => {
    if (!timerActive) return;

    setTimerRemaining(SUPER_GAME_QUESTION_TIME);

    const interval = setInterval(() => {
      setTimerRemaining(prev => {
        if (prev <= 0.1) {
          setTimerActive(false);
          return 0;
        }
        return Math.max(0, prev - TIMER_UPDATE_INTERVAL / 1000);
      });
    }, TIMER_UPDATE_INTERVAL);

    return () => clearInterval(interval);
  }, [timerActive]);

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

  const questionMedia = question.media;
  const mediaUrl = questionMedia?.url;
  const mediaType = questionMedia?.type;

  // Calculate dynamic font size
  const questionText = question.text || '';
  const questionFontSizeMobile = calculateQuestionFontSize(questionText, 3);
  const questionFontSizeDesktop = calculateQuestionFontSize(questionText, 5);

  // Calculate timer progress
  const timerProgress = ((SUPER_GAME_QUESTION_TIME - timerRemaining) / SUPER_GAME_QUESTION_TIME) * 100;

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
          <div className="flex-1 flex items-center justify-center p-6 overflow-hidden">
            <div className={`w-full h-full flex ${
              mediaUrl ? 'items-center justify-start' : 'items-center justify-center'
            }`}>
              {/* Media container on left - 50% width when media exists */}
              {mediaUrl && (
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
              )}

              {/* Question text */}
              <div className={`${mediaUrl ? 'w-1/2' : 'w-3/4'} h-full flex items-center justify-center p-4`}>
                <h2
                  className="font-bold text-white leading-[1.1] text-center"
                  style={{ fontSize: `${questionFontSizeMobile}rem` }}
                  data-sg-sgq="true"
                >
                  {questionText}
                </h2>
              </div>
            </div>
          </div>
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
  // State for showing correct answer
  const [showCorrectAnswer, setShowCorrectAnswer] = useState<boolean>(false);

  // Get the selected theme and question
  const selectedTheme = useMemo(
    () => round.themes?.find(t => t.id === selectedSuperThemeId),
    [round.themes, selectedSuperThemeId]
  );
  const question = selectedTheme?.questions?.[0];

  // Handle keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === '=' || e.key === 'ArrowUp') {
        // Correct answer (= or ArrowUp)
        if (selectedSuperAnswerTeam) {
          onScoreChange(selectedSuperAnswerTeam, true);
        }
      } else if (e.key === '-' || e.key === 'ArrowDown') {
        // Wrong answer (- or ArrowDown)
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

  const correctAnswer = question.answerText || '';

  // Calculate dynamic font size for correct answer
  const answerFontSize = calculateQuestionFontSize(correctAnswer, 2);

  return (
    <div className="fixed inset-0 z-[60] flex bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
      style={{ paddingTop: '100px', paddingBottom: '20px' }}
    >
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

        {/* Two containers: Teams (top) and Correct Answer (bottom) */}
        <div className="flex flex-col h-full items-center justify-center gap-4 p-4">
          {/* Top container - Teams grid */}
          <div className="w-[60vw] h-[38vh] p-6 overflow-auto bg-gray-900 rounded-xl">
            {/* Calculate grid columns based on number of teams (max 25 teams)
                 - up to 6 teams: 3 cols (2 rows)
                 - 7-12 teams: 4 cols (3 rows)
                 - 13-20 teams: 5 cols (4 rows)
                 - 21-25 teams: 6 cols (4-5 rows)
            */}
            <div className={`grid gap-3 h-full ${
              teamScores.length <= 6 ? 'grid-cols-3' :
              teamScores.length <= 12 ? 'grid-cols-4' :
              teamScores.length <= 20 ? 'grid-cols-5' :
              'grid-cols-6'
            }`}>
              {teamScores.map((team) => {
                const answer = superGameAnswers.find(a => a.teamId === team.teamId);
                const bet = superGameBets.find(b => b.teamId === team.teamId);
                const isSelected = selectedSuperAnswerTeam === team.teamId;
                const isCorrect = answer?.isCorrect ?? false;
                const isWrong = answer?.isWrong ?? false;
                const hasAnswer = !!answer?.answer;

                // Adaptive font size based on number of teams (more teams = smaller cards = smaller font)
                // Base: 3 cols = 1.0x, 4 cols = 0.85x, 5 cols = 0.7x, 6 cols = 0.6x
                const fontScale = teamScores.length <= 6 ? 1.0 :
                                  teamScores.length <= 12 ? 0.85 :
                                  teamScores.length <= 20 ? 0.7 : 0.6;

                // Determine card style based on state
                const cardStyle = isCorrect
                  ? (isSelected ? 'border-white bg-green-500/20 scale-105 shadow-[0_0_10px_rgba(255,255,255,0.3)]' : 'border-green-500 bg-green-500/20')
                  : isWrong
                    ? (isSelected ? 'border-white bg-red-500/20 scale-105 shadow-[0_0_10px_rgba(255,255,255,0.3)]' : 'border-red-500 bg-red-500/20')
                    : isSelected
                      ? 'border-white bg-blue-500/20 scale-105 shadow-[0_0_10px_rgba(255,255,255,0.3)]'
                      : hasAnswer
                        ? 'border-blue-500 bg-blue-500/20'
                        : 'border-gray-700 bg-gray-900 hover:border-gray-600';

                return (
                  <button
                    key={team.teamId}
                    onClick={() => onTeamSelect(team.teamId)}
                    className={`relative rounded-xl border-[3px] transition-all flex flex-col cursor-pointer ${cardStyle}`}
                    style={{ minHeight: '140px', padding: '8px' }}
                  >
                    {/* Top: Team name */}
                    <div className="text-center" style={{ marginTop: '12px', marginBottom: '8px' }}>
                      <div
                        className="font-bold text-yellow-400 leading-tight"
                        style={{ fontSize: `${1.25 * fontScale}rem` }}
                      >
                        {team.teamName}
                      </div>
                    </div>

                    {/* Center: Answer - takes remaining space */}
                    <div className="flex-1 flex items-center justify-center text-center px-1">
                      {hasAnswer ? (
                        <div className="text-white font-medium break-words" style={{ fontSize: `${1.5 * fontScale}rem` }}>
                          {answer.answer}
                        </div>
                      ) : null}
                    </div>

                    {/* Bottom: Bet */}
                    <div className="text-center" style={{ marginTop: '8px', marginBottom: '12px' }}>
                      <div
                        className="text-yellow-400 font-semibold"
                        style={{ fontSize: `${1.25 * fontScale}rem` }}
                      >
                        {bet?.bet ?? 0}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Bottom container - Correct Answer card */}
          <div className="w-[45vw] h-[30vh] flex items-center justify-center">
            <button
              onClick={() => setShowCorrectAnswer(!showCorrectAnswer)}
              className={`relative p-3 rounded-xl border-[3px] transition-all flex flex-col items-center justify-center cursor-pointer ${
                showCorrectAnswer
                  ? 'border-purple-500 bg-purple-500/20 scale-105'
                  : 'border-gray-700 bg-gray-900 hover:border-gray-600'
              }`}
              style={{ width: '100%', height: '100%' }}
            >
              {showCorrectAnswer ? (
                <div className="text-center">
                  <div className="text-purple-400 font-bold mb-2">CORRECT ANSWER</div>
                  <div
                    className="font-bold text-white leading-[1.2] break-words"
                    style={{ fontSize: `${answerFontSize}rem` }}
                  >
                    {correctAnswer}
                  </div>
                </div>
              ) : (
                <div className="text-gray-400 text-lg">Tap to reveal correct answer</div>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
});

SuperGameAnswersModal.displayName = 'SuperGameAnswersModal';
