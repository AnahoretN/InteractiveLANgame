/**
 * QuestionsList Component
 * Оптимизированный список вопросов с виртуальным скроллингом
 */

import React, { memo, useMemo } from 'react';
import { Edit2, Trash2, ImageIcon } from 'lucide-react';
import { VirtualList } from '../../shared';
import type { Question } from '../types';

interface QuestionsListProps {
  questions: Question[];
  selectedQuestionId: string | null;
  onSelectQuestion: (questionId: string) => void;
  onEditQuestion: (question: Question) => void;
  onDeleteQuestion: (questionId: string) => void;
  maxHeight?: number;
}

export const QuestionsList = memo(({
  questions,
  selectedQuestionId,
  onSelectQuestion,
  onEditQuestion,
  onDeleteQuestion,
  maxHeight = 400
}: QuestionsListProps) => {
  const ITEM_HEIGHT = 60; // Высота одного вопроса

  // Используем виртуальный скроллинг только для больших списков
  const useVirtualScroll = questions.length > 20;

  const renderItem = useMemo(() => {
    return (question: Question, index: number) => (
      <div
        key={question.id}
        className={`relative group bg-gray-800/80 border rounded-lg p-3 transition-all cursor-pointer ${
          selectedQuestionId === question.id
            ? 'border-blue-500 bg-blue-500/10'
            : 'border-gray-700 hover:border-gray-600'
        }`}
        onClick={() => onSelectQuestion(question.id)}
      >
        <div className="flex items-center justify-between">
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-white truncate">
              Q{index + 1}: {question.text?.slice(0, 40)}
              {question.text && question.text.length > 40 && '...'}
            </div>
            <div className="text-xs text-gray-500">
              {question.points || 100} pts
            </div>
          </div>

          <div className="flex items-center gap-2">
            {question.media && (
              <ImageIcon className="w-4 h-4 text-purple-400" />
            )}
            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onEditQuestion(question);
                }}
                className="p-1 hover:bg-gray-700 rounded"
                title="Edit question"
              >
                <Edit2 className="w-3.5 h-3.5 text-gray-400" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteQuestion(question.id);
                }}
                className="p-1 hover:bg-red-900/50 rounded"
                title="Delete question"
              >
                <Trash2 className="w-3.5 h-3.5 text-red-400" />
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }, [selectedQuestionId, onSelectQuestion, onEditQuestion, onDeleteQuestion]);

  if (useVirtualScroll) {
    return (
      <VirtualList
        items={questions}
        renderItem={renderItem}
        itemHeight={ITEM_HEIGHT}
        containerHeight={maxHeight}
        overscan={3}
        className="space-y-2"
      />
    );
  }

  // Для маленьких списков используем обычный рендеринг
  return (
    <div className="space-y-2" style={{ maxHeight: `${maxHeight}px`, overflowY: 'auto' }}>
      {questions.map((question, index) => renderItem(question, index))}
    </div>
  );
});

QuestionsList.displayName = 'QuestionsList';
