/**
 * ThemeCard Component
 * Collapsible card for theme with questions list
 */

import React, { memo, useState, useCallback } from 'react';
import { ChevronDown, ChevronRight, Edit2, Trash2 } from 'lucide-react';
import type { Theme, Question } from '../PackEditor';
import { QuestionEditor } from './QuestionEditor';

interface ThemeCardProps {
  theme: Theme;
  onUpdate: (theme: Theme) => void;
  onDelete?: () => void;
}

export const ThemeCard = memo(({ theme, onUpdate, onDelete }: ThemeCardProps) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editedName, setEditedName] = useState(theme.name);

  const handleToggleExpand = useCallback(() => {
    setIsExpanded(prev => !prev);
  }, []);

  const handleToggleEdit = useCallback(() => {
    if (isEditing) {
      onUpdate({ ...theme, name: editedName });
    } else {
      setEditedName(theme.name);
    }
    setIsEditing(prev => !prev);
  }, [isEditing, editedName, theme, onUpdate]);

  const handleQuestionChange = useCallback((questionIndex: number) => {
    return (updatedQuestion: Question) => {
      const newQuestions = [...(theme.questions || [])];
      newQuestions[questionIndex] = updatedQuestion;
      onUpdate({ ...theme, questions: newQuestions });
    };
  }, [theme, onUpdate]);

  const handleDeleteQuestion = useCallback((questionIndex: number) => {
    const newQuestions = theme.questions?.filter((_, i) => i !== questionIndex) || [];
    onUpdate({ ...theme, questions: newQuestions });
  }, [theme, onUpdate]);

  const handleAddQuestion = useCallback(() => {
    const newQuestion: Question = {
      id: `q-${Date.now()}`,
      text: 'Новый вопрос',
      answers: ['', '', '', '', ''],
      correctAnswer: 0,
      points: 100
    };
    const pointValues = [100, 200, 300, 400, 500];
    const questionCount = theme.questions?.length || 0;
    newQuestion.points = pointValues[questionCount % 5];

    onUpdate({
      ...theme,
      questions: [...(theme.questions || []), newQuestion]
    });
  }, [theme, onUpdate]);

  return (
    <div className="bg-gray-900 rounded-lg border border-gray-700 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-4 p-4 bg-gray-800/50 hover:bg-gray-800 transition-colors">
        <button
          onClick={handleToggleExpand}
          className="text-blue-400 hover:text-blue-300 transition-colors flex-shrink-0"
        >
          {isExpanded ? (
            <ChevronDown className="w-5 h-5" />
          ) : (
            <ChevronRight className="w-5 h-5" />
          )}
        </button>

        {/* Theme name */}
        {isEditing ? (
          <input
            type="text"
            value={editedName}
            onChange={(e) => setEditedName(e.target.value)}
            className="flex-1 bg-gray-700 text-white px-3 py-2 rounded focus:outline-none"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleToggleEdit();
              }
            }}
          />
        ) : (
          <h3
            onClick={handleToggleExpand}
            className="flex-1 text-xl font-bold text-white cursor-pointer"
          >
            {theme.name}
          </h3>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          <button
            onClick={handleToggleEdit}
            className="p-2 text-gray-400 hover:text-blue-400 transition-colors"
            title={isEditing ? 'Сохранить' : 'Редактировать'}
          >
            <Edit2 className="w-4 h-4" />
          </button>
          {onDelete && (
            <button
              onClick={onDelete}
              className="p-2 text-gray-400 hover:text-red-400 transition-colors"
              title="Удалить тему"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Questions */}
      {isExpanded && (
        <div className="p-4 space-y-3">
          {theme.questions?.map((question, index) => (
            <QuestionEditor
              key={question.id}
              question={question}
              onChange={handleQuestionChange(index)}
              onDelete={() => handleDeleteQuestion(index)}
              points={question.points || 100}
              questionNumber={index + 1}
            />
          ))}

          {/* Add question button */}
          <button
            onClick={handleAddQuestion}
            className="w-full py-3 border-2 border-dashed border-gray-600 rounded-lg text-gray-400 hover:border-blue-500 hover:text-blue-400 transition-colors flex items-center justify-center gap-2"
          >
            <span className="text-2xl">+</span>
            Добавить вопрос
          </button>
        </div>
      )}
    </div>
  );
});

ThemeCard.displayName = 'ThemeCard';
