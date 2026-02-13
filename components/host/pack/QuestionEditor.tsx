/**
 * QuestionEditor Component
 * Inline editor for question text and answers
 */

import React, { memo, useState, useCallback, useEffect } from 'react';

interface QuestionEditorProps {
  question: {
    text: string;
    answers?: string[];
    correctAnswer?: number;
    points?: number;
    media?: {
      type: 'image' | 'video' | 'audio';
      url?: string;
    };
  };
  onChange: (question: QuestionEditorProps['question']) => void;
  onDelete?: () => void;
  points: number;
  questionNumber: number;
}

export const QuestionEditor = memo(({
  question,
  onChange,
  onDelete,
  points,
  questionNumber
}: QuestionEditorProps) => {
  const [isEditing, setIsEditing] = useState(false);

  const handleTextChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    onChange({ ...question, text: e.target.value });
  }, [question, onChange]);

  const handleAnswerChange = useCallback((index: number, value: string) => {
    const newAnswers = [...(question.answers || [])];
    newAnswers[index] = value;
    onChange({ ...question, answers: newAnswers });
  }, [question, onChange]);

  const handleCorrectAnswerChange = useCallback((index: number) => {
    onChange({ ...question, correctAnswer: index });
  }, [question, onChange]);

  const toggleEditing = useCallback(() => {
    setIsEditing(prev => !prev);
  }, []);

  // Auto-focus input when editing starts
  const inputRef = React.useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  return (
    <div className="bg-gray-900 rounded-lg p-4 border border-gray-700 hover:border-blue-500/50 transition-colors">
      <div className="flex items-start gap-4">
        {/* Question number and points */}
        <div className="flex-shrink-0 flex flex-col items-center gap-2">
          <div className="w-12 h-12 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold">
            {questionNumber}
          </div>
          <div className="text-yellow-400 font-bold text-lg">{points}</div>
        </div>

        {/* Question content */}
        <div className="flex-1 min-w-0">
          {!isEditing ? (
            <div
              onClick={toggleEditing}
              className="cursor-pointer py-2 px-3 rounded hover:bg-gray-800 transition-colors"
            >
              <p className="text-white text-lg">{question.text || 'Нажмите для редактирования'}</p>
            </div>
          ) : (
            <input
              ref={inputRef}
              type="text"
              value={question.text}
              onChange={handleTextChange}
              onBlur={toggleEditing}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  toggleEditing();
                }
              }}
              className="w-full bg-gray-800 text-white px-3 py-2 rounded border border-blue-500 focus:outline-none"
              placeholder="Введите вопрос..."
            />
          )}

          {/* Answers */}
          {question.answers && question.answers.length > 0 && (
            <div className="mt-3 space-y-2">
              {question.answers.map((answer, index) => (
                <div
                  key={index}
                  className="flex items-center gap-2"
                >
                  <button
                    onClick={() => handleCorrectAnswerChange(index)}
                    className={`w-6 h-6 rounded-full border-2 flex-shrink-0 ${
                      question.correctAnswer === index
                        ? 'bg-green-500 border-green-500'
                        : 'border-gray-600 hover:border-gray-500'
                    } transition-colors`}
                  >
                    {question.correctAnswer === index && (
                      <span className="text-white text-xs">✓</span>
                    )}
                  </button>
                  <input
                    type="text"
                    value={answer}
                    onChange={(e) => handleAnswerChange(index, e.target.value)}
                    className="flex-1 bg-gray-800 text-white px-3 py-1 rounded text-sm focus:outline-none"
                    placeholder={`Ответ ${index + 1}`}
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Delete button */}
        {onDelete && (
          <button
            onClick={onDelete}
            className="flex-shrink-0 p-2 text-gray-500 hover:text-red-400 transition-colors"
            title="Удалить вопрос"
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
});

QuestionEditor.displayName = 'QuestionEditor';
