/**
 * QuestionModal Component (PackEditor version)
 * Modal for editing individual questions
 */

import React, { memo, useState, useCallback, useEffect } from 'react';
import { Trash2, Plus } from 'lucide-react';
import { BaseModal, FileUpload } from './Modals';
import type { Question } from './types';
import { Button } from '../../Button';

interface QuestionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: Partial<Question>) => void;
  question?: Question;
}

export const QuestionModal = memo(({ isOpen, onClose, onSave, question }: QuestionModalProps) => {
  const [text, setText] = useState(question?.text || '');
  const [hasAnswers, setHasAnswers] = useState(question?.answers !== undefined);
  const [answers, setAnswers] = useState<string[]>(question?.answers || ['', '', '', '']);
  const [correctAnswer, setCorrectAnswer] = useState(question?.correctAnswer ?? 0);
  const [points, setPoints] = useState(question?.points ?? 100);
  const [mediaUrl, setMediaUrl] = useState(question?.media?.url || '');

  // Answer fields
  const [answerText, setAnswerText] = useState(question?.answerText || '');
  const [answerMediaUrl, setAnswerMediaUrl] = useState(question?.answerMedia?.url || '');

  // Reset form when question changes or modal opens
  useEffect(() => {
    if (isOpen) {
      setText(question?.text || '');
      setHasAnswers(question?.answers !== undefined);
      setAnswers(question?.answers || ['', '', '', '']);
      setCorrectAnswer(question?.correctAnswer ?? 0);
      setPoints(question?.points ?? 100);
      setMediaUrl(question?.media?.url || '');
      setAnswerText(question?.answerText || '');
      setAnswerMediaUrl(question?.answerMedia?.url || '');
    }
  }, [isOpen, question]);

  const handleSave = useCallback(() => {
    onSave({
      text,
      ...(hasAnswers ? {
        answers: answers.filter(a => a.trim() !== ''),
        correctAnswer,
      } : {}),
      points,
      ...(mediaUrl ? { media: { type: 'image', url: mediaUrl } } : {}),
      // Save answer fields
      ...(answerText ? { answerText } : {}),
      ...(answerMediaUrl ? { answerMedia: { type: 'image', url: answerMediaUrl } } : {}),
    });
    onClose();
  }, [text, hasAnswers, answers, correctAnswer, points, mediaUrl, answerText, answerMediaUrl, onSave, onClose]);

  if (!isOpen) return null;

  return (
    <BaseModal isOpen={isOpen} onClose={onClose} title={question ? 'Edit Question' : 'Add Question'} maxWidth="max-w-4xl">
      <div className="space-y-4">
        {/* Question Text */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1.5">Question</label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Enter your question..."
            rows={3}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500 resize-none"
          />
        </div>

        {/* Points */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1.5">Points</label>
          <input
            type="number"
            min="0"
            value={points}
            onChange={(e) => setPoints(parseInt(e.target.value) || 0)}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500"
          />
        </div>

        {/* Question Media (Image Only) */}
        <FileUpload
          value={mediaUrl}
          onChange={setMediaUrl}
          accept="image/*"
          placeholder="https://example.com/image.jpg"
          label="Question Image (optional)"
        />

        {/* ========== ANSWER SECTION ========== */}
        <div className="border-t border-gray-700 pt-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-0.5 h-4 bg-green-500"></div>
            <span className="text-sm font-medium text-green-400">Answer</span>
          </div>

          {/* Multiple Choice Toggle */}
          <div className="bg-gray-800/50 rounded-lg p-3 mb-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-300">Multiple Choice Mode</span>
              <button
                onClick={() => setHasAnswers(!hasAnswers)}
                className={`w-11 h-6 rounded-full transition-colors ${hasAnswers ? 'bg-blue-600' : 'bg-gray-700'}`}
              >
                <div className={`w-5 h-5 bg-white rounded-full transition-transform ${hasAnswers ? 'translate-x-6' : 'translate-x-0.5'}`} />
              </button>
            </div>
          </div>

          {/* Multiple Choice Answers */}
          {hasAnswers && (
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Answer Choices</label>
              <div className="space-y-2">
                {answers.map((answer, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <button
                      onClick={() => setCorrectAnswer(idx)}
                      className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${
                        correctAnswer === idx ? 'bg-green-500 border-green-500' : 'border-gray-600 hover:border-gray-500'
                      }`}
                    >
                      {correctAnswer === idx && <div className="w-2 h-2 bg-white rounded-full" />}
                    </button>
                    <input
                      type="text"
                      value={answer}
                      onChange={(e) => {
                        const newAnswers = [...answers];
                        newAnswers[idx] = e.target.value;
                        setAnswers(newAnswers);
                      }}
                      placeholder={`Answer ${idx + 1}`}
                      className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                    />
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-500 mt-1">Select circle next to correct answer</p>
            </div>
          )}

          {/* Text Answer (for non-multiple choice) */}
          {!hasAnswers && (
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">Answer Text</label>
              <textarea
                value={answerText}
                onChange={(e) => setAnswerText(e.target.value)}
                placeholder="Enter correct answer..."
                rows={2}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-green-500 resize-none"
              />
            </div>
          )}

          {/* Answer Image (always available) */}
          <FileUpload
            value={answerMediaUrl}
            onChange={setAnswerMediaUrl}
            accept="image/*"
            placeholder="https://example.com/answer.jpg"
            label="Answer Image (optional)"
          />
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-2">
          <Button variant="secondary" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button className="flex-1" onClick={handleSave}>Save</Button>
        </div>
      </div>
    </BaseModal>
  );
});

QuestionModal.displayName = 'QuestionModal';
