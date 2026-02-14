/**
 * QuestionModal Component
 * Modal for displaying questions and answers with media support
 * Extended version with timer, buzzer state, and scoring
 */

import React, { memo, useState, useEffect } from 'react';
import { Volume2 } from 'lucide-react';
import type { Question, Theme } from '../../PackEditor';
import {
  calculateQuestionFontSize,
  calculateAnswerFontSizeMobile,
  calculateAnswerFontSizeDesktop
} from '../fontUtils';

export interface TeamScore {
  teamId: string;
  teamName: string;
  score: number;
}

interface QuestionModalProps {
  question: Question;
  theme: Theme;
  points: number;
  showAnswer: boolean;
  buzzedTeamId: string | null;
  teamScores: TeamScore[];
  onClose: () => void;
  onScoreChange: (change: 'wrong' | 'correct') => void;
  scoreChangeType: 'wrong' | 'correct' | null;
  // Timer settings
  readingTimePerLetter: number;
  responseWindow: number;
  handicapEnabled: boolean;
  handicapDelay: number;
  answeringTeamId?: string | null;  // Team that gets to answer question
  roundName?: string;
}

export const QuestionModal = memo(({
  question,
  theme,
  points,
  showAnswer,
  buzzedTeamId,
  teamScores,
  onClose: _onClose,
  onScoreChange,
  scoreChangeType,
  readingTimePerLetter,
  responseWindow,
  handicapEnabled,
  handicapDelay,
  answeringTeamId,
  roundName,
}: QuestionModalProps) => {
  const mediaUrl = question.media?.url;
  const mediaType = question.media?.type;

  const buzzedTeam = teamScores.find(t => t.teamId === buzzedTeamId);

  // Calculate reading time based on question text length (letters only, excluding spaces and punctuation)
  const questionTextLetters = (question.text || '').replace(/[^a-zA-Zа-яА-ЯёЁ]/g, '').length;
  const readingTime = readingTimePerLetter > 0 ? questionTextLetters * readingTimePerLetter : 0;

  // Find leading team for handicap
  const leadingTeamScore = teamScores.length > 0 ? Math.max(...teamScores.map(t => t.score)) : 0;

  // Timer states
  const [readingTimerRemaining, setReadingTimerRemaining] = useState(readingTime);
  const [responseTimerRemaining, setResponseTimerRemaining] = useState(0);
  const [handicapTimerRemaining, setHandicapTimerRemaining] = useState(0);
  const [timerPhase, setTimerPhase] = useState<'reading' | 'response' | 'complete'>('reading');

  // Reset timers when question changes
  useEffect(() => {
    const newReadingTime = readingTimePerLetter > 0 ? questionTextLetters * readingTimePerLetter : 0;
    setReadingTimerRemaining(newReadingTime);
    setResponseTimerRemaining(responseWindow);
    setHandicapTimerRemaining(0);
    setTimerPhase(newReadingTime > 0 ? 'reading' : 'response');
  }, [question.id, readingTime, questionTextLetters, readingTimePerLetter, responseWindow]);

  // Single unified timer effect
  useEffect(() => {
    // Stop timer if answer shown
    if (showAnswer) {
      setTimerPhase('complete');
      setReadingTimerRemaining(0);
      setResponseTimerRemaining(0);
      setHandicapTimerRemaining(0);
      return;
    }

    // Don't run if complete
    if (timerPhase === 'complete') return;

    // Reading phase timer
    if (timerPhase === 'reading') {
      const interval = setInterval(() => {
        setReadingTimerRemaining((prev: number) => {
          if (prev <= 0.1) {
            // Reading time done, move to response phase
            setTimerPhase('response');
            return 0;
          }
          return prev - 0.1;
        });
      }, 100);
      return () => clearInterval(interval);
    }

    // Response window timer - only runs if responseWindow > 0
    if (timerPhase === 'response' && responseWindow > 0) {
      const interval = setInterval(() => {
        setResponseTimerRemaining((prev: number) => {
          if (prev <= 0.1) {
            setTimerPhase('complete');
            setHandicapTimerRemaining(0);
            return 0;
          }
          return prev - 0.1;
        });
        // Also decrease handicap timer
        setHandicapTimerRemaining((prev: number) => {
          if (prev <= 0.1) return 0;
          return prev - 0.1;
        });
      }, 100);
      return () => clearInterval(interval);
    }
  }, [timerPhase, readingTime, responseWindow, showAnswer, handicapEnabled, handicapDelay]);

  // Calculate progress for timer visualization - each timer fills bar independently
  const timerProgress = (() => {
    if (timerPhase === 'reading') {
      // Reading Timer: from 0 to 100% based on readingTime
      if (readingTime > 0) {
        const elapsed = readingTime - readingTimerRemaining;
        return (elapsed / readingTime) * 100;
      }
      return 0;
    } else if (timerPhase === 'response') {
      // Response Timer: from 0 to 100% based on responseWindow
      if (responseWindow > 0) {
        const elapsed = responseWindow - responseTimerRemaining;
        return (elapsed / responseWindow) * 100;
      }
      return 100;
    }
    return 100;
  })();

  // Timer color based on phase
  const getTimerColor = () => {
    if (timerPhase === 'reading') return 'bg-yellow-500';
    if (timerPhase === 'response') return 'bg-green-500';
    return 'bg-gray-500';
  };

  // Modal positioned below player panel with margins
  const modalMaxHeight = 'calc(100vh - 140px)';
  const modalTop = '100px';

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === '-') {
        onScoreChange('wrong');
      } else if (e.key === '=') {
        onScoreChange('correct');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onScoreChange]);

  // Calculate dynamic font sizes
  const currentQuestionText = showAnswer && question.answerText ? question.answerText : question.text;
  const questionFontSizeMobile = calculateQuestionFontSize(currentQuestionText, 3); // 3rem base for mobile
  const questionFontSizeDesktop = calculateQuestionFontSize(currentQuestionText, 5); // 5rem base for desktop

  // Calculate answer font sizes (independent of question font size)
  const answerFontSizes = question.answers?.map((answer) => ({
    mobile: calculateAnswerFontSizeMobile(answer),
    desktop: calculateAnswerFontSizeDesktop(answer)
  })) ?? [];

  return (
    <div className="fixed inset-0 z-[60] flex bg-black/80 backdrop-blur-sm animate-in fade-in duration-200 cursor-default" style={{ paddingTop: modalTop, paddingBottom: '20px' }}>
      <style>{`
        @media (min-width: 768px) {
          [data-qm="true"] { font-size: ${questionFontSizeDesktop}rem !important; }
          ${question.answers?.map((_, idx) => `[data-am-idx="${idx}"] { font-size: ${answerFontSizes[idx]?.desktop || 3.5}rem !important; }`).join(' ')}
          ${question.answers?.map((_, idx) => `[data-am-idx-noimg="${idx}"] { font-size: ${answerFontSizes[idx]?.desktop || 3.5}rem !important; }`).join(' ')}
        }
      `}</style>
      <div
        className="w-[90vw] mx-auto bg-gray-900 border-2 border-blue-500 rounded-2xl shadow-2xl flex flex-col overflow-hidden cursor-default"
        style={{ maxHeight: modalMaxHeight, minHeight: '48vh' }}
      >
        {/* Question Section (2/3) */}
        <div className="flex-1 flex flex-col border-b border-gray-700 min-h-0">
          {/* Header - Round name, Theme name, Points and Timer */}
          <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              {roundName && (
                <>
                  <div className="text-lg font-bold text-white">{roundName}</div>
                  <div className="text-white/50">—</div>
                </>
              )}
              <div className="text-lg font-bold text-white">{theme.name}</div>
              {timerPhase !== 'complete' && ((timerPhase === 'reading' && readingTime > 0) || (timerPhase === 'response' && responseWindow > 0)) && (
                <div className="text-xl font-bold text-white">
                  {timerPhase === 'reading' && (
                    <span className="text-yellow-300">{readingTimerRemaining.toFixed(1)}s</span>
                  )}
                  {timerPhase === 'response' && (
                    <span className="text-green-300">{responseTimerRemaining.toFixed(1)}s</span>
                  )}
                </div>
              )}
            </div>
            <div className="text-2xl font-black text-white">{points > 0 ? `+${points}` : points}</div>
          </div>

          {/* Timer bar - always visible but inactive when not timing */}
          <div className="bg-gray-700 w-full overflow-hidden" style={{ height: '16px' }}>
            {timerPhase !== 'complete' && ((timerPhase === 'reading' && readingTime > 0) || (timerPhase === 'response' && responseWindow > 0)) ? (
              <div
                className={`h-full transition-all duration-100 ease-linear ${getTimerColor()}`}
                style={{ width: `${timerProgress}%` }}
              />
            ) : null}
          </div>

          {/* Question content */}
          <div className="flex-1 flex items-center justify-center p-6 overflow-auto">
            <div className={`w-full h-full flex ${
              (showAnswer ? (question.answerMedia?.url) : mediaUrl) ? 'items-center justify-start' : 'items-center justify-center'
            }`}>
              {/* Media container on left - 50% width when media exists */}
              {(showAnswer ? (question.answerMedia?.url) : mediaUrl) ? (
                <div className="w-1/2 h-full flex items-center justify-center p-4">
                  {showAnswer && question.answerMedia ? (
                    // Answer media
                    <>
                      {question.answerMedia.type === 'image' && (
                        <img
                          src={question.answerMedia.url}
                          alt="Answer media"
                          className="w-full h-auto object-contain rounded-lg shadow-xl"
                        />
                      )}
                      {question.answerMedia.type === 'video' && (
                        <video
                          src={question.answerMedia.url}
                          controls
                          className="w-full h-auto object-contain rounded-lg shadow-xl"
                        />
                      )}
                      {question.answerMedia.type === 'audio' && (
                        <div className="w-full flex items-center justify-center gap-4 bg-gray-800 rounded-lg p-4">
                          <Volume2 className="w-16 h-16 text-blue-400" />
                          <audio src={question.answerMedia.url} controls className="flex-1" />
                        </div>
                      )}
                    </>
                  ) : (
                    // Question media
                    <>
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
                        <div className="w-full h-full flex items-center justify-center gap-4 bg-gray-800 rounded-lg">
                          <Volume2 className="w-16 h-16 text-blue-400" />
                          <audio src={mediaUrl} controls className="flex-1" />
                        </div>
                      )}
                    </>
                  )}
                </div>
              ) : null}

              {/* Right side: Question text container and answer options container */}
              {/* With image: 50% width each. Without image: 75% width total, centered */}
              {(showAnswer ? (question.answerMedia?.url) : mediaUrl) ? (
                <div className="w-1/2 h-full flex flex-col p-4">
                  {/* Question text container */}
                  <div className={`flex flex-col items-center justify-center p-4 ${
                    question.answers && question.answers.length > 0 ? 'flex-[19]' : 'flex-[39]'
                  }`}>
                    <h2
                      key={showAnswer ? 'answer' : 'question'}
                      className="font-bold text-white leading-[1.1] text-center"
                      style={{ fontSize: `${questionFontSizeMobile}rem` }}
                      data-qm="true"
                    >
                      {currentQuestionText}
                    </h2>
                  </div>

                  {/* Answer options container */}
                  {question.answers && question.answers.length > 0 && (
                    <div className="flex-[19] flex items-center justify-center p-4">
                      <div className="w-full h-full flex flex-wrap items-center justify-center gap-4">
                        {question.answers.map((answer, idx) => (
                          <div
                            key={idx}
                            style={{
                              width: '45%',
                              height: '45%',
                              fontSize: `${answerFontSizes[idx]?.mobile || 2}rem`
                            }}
                            className={`rounded-xl border-4 flex items-center justify-center text-center font-semibold ${
                              showAnswer && idx === question.correctAnswer
                                ? 'bg-green-500/30 border-green-500 text-green-300'
                                : 'bg-gray-800/50 border-gray-700 text-gray-400'
                            }`}
                            data-am-idx={idx}
                          >
                            {answer}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                /* Without image: single centered container 75% width */
                <div className="w-3/4 h-full flex flex-col items-center justify-center p-4">
                  {/* Question text container */}
                  <div className={`w-full flex flex-col items-center justify-center p-4 ${
                    question.answers && question.answers.length > 0 ? 'flex-[19]' : 'flex-[39]'
                  }`}>
                    <h2
                      key={showAnswer ? 'answer' : 'question'}
                      className="font-bold text-white leading-[1.1] text-center"
                      style={{ fontSize: `${questionFontSizeMobile}rem` }}
                      data-qm="true"
                    >
                      {currentQuestionText}
                    </h2>
                  </div>

                  {/* Answer options container */}
                  {question.answers && question.answers.length > 0 && (
                    <div className="w-full flex-[19] flex items-center justify-center p-4">
                      <div className="w-full h-full flex flex-wrap items-center justify-center gap-4">
                        {question.answers.map((answer, idx) => (
                          <div
                            key={idx}
                            style={{
                              width: '45%',
                              height: '45%',
                              fontSize: `${answerFontSizes[idx]?.mobile || 2}rem`
                            }}
                            className={`rounded-xl border-4 flex items-center justify-center text-center font-semibold ${
                              showAnswer && idx === question.correctAnswer
                                ? 'bg-green-500/30 border-green-500 text-green-300'
                                : 'bg-gray-800/50 border-gray-700 text-gray-400'
                            }`}
                            data-am-idx-noimg={idx}
                          >
                            {answer}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Status bar - compact */}
        <div className="h-16 bg-gray-800/50 flex items-center justify-center px-6">
          {showAnswer && buzzedTeam && (scoreChangeType === 'correct' || scoreChangeType === 'wrong') ? (
            // Result message
            <div className="text-2xl font-bold">
              {scoreChangeType === 'correct' && (
                <span className="text-green-400">{buzzedTeam.teamName} gets {points} points!</span>
              )}
              {scoreChangeType === 'wrong' && (
                <span className="text-red-400">{buzzedTeam.teamName} loses {points} points!</span>
              )}
            </div>
          ) : buzzedTeam ? (
            // Team answering
            <div className="text-yellow-400 text-xl">{buzzedTeam.teamName} is answering...</div>
          ) : answeringTeamId ? (
            // Handicap phase - show who is answering
            <div className="text-yellow-400 font-bold text-2xl">
              Отвечает: {teamScores.find(t => t.teamId === answeringTeamId)?.teamName || 'Unknown'}
            </div>
          ) : (
            // Waiting for buzz
            <div className="text-gray-400 text-xl">Waiting for a player to buzz...</div>
          )}
        </div>
      </div>
    </div>
  );
});

QuestionModal.displayName = 'QuestionModal';
