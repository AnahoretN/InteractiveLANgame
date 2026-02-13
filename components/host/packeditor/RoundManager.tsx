/**
 * RoundManager Component
 * Manages game rounds - add, remove, reorder, edit
 */

import React, { memo, useState } from 'react';
import { Plus, GripVertical, Trash2, Edit2, ChevronRight } from 'lucide-react';
import type { Round } from '../packeditor/types';

interface RoundManagerProps {
  rounds: Round[];
  currentRoundIndex: number;
  onSelectRound: (index: number) => void;
  onAddRound: () => void;
  onEditRound: (index: number) => void;
  onDeleteRound: (index: number) => void;
  onMoveRound: (fromIndex: number, toIndex: number) => void;
}

export const RoundManager = memo(({
  rounds,
  currentRoundIndex,
  onSelectRound,
  onAddRound,
  onEditRound,
  onDeleteRound,
  onMoveRound
}: RoundManagerProps) => {
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (dropIndex: number) => {
    if (draggedIndex === null || draggedIndex === dropIndex) return;
    onMoveRound(draggedIndex, dropIndex);
    setDraggedIndex(null);
  };

  return (
    <div className="bg-gray-900 rounded-xl p-6 border border-gray-700">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-white">Раунды ({rounds.length})</h2>
        <button
          onClick={onAddRound}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-semibold transition-colors"
        >
          <Plus className="w-5 h-5" />
          Добавить раунд
        </button>
      </div>

      {/* Rounds list */}
      <div className="space-y-2">
        {rounds.map((round, index) => {
          const isActive = index === currentRoundIndex;
          const isSuper = round.type === 'super';
          const questionCount = round.themes?.reduce((sum, t) =>
            sum + (t.questions?.length || 0), 0) || 0;

          return (
            <div
              key={round.id}
              draggable
              onDragStart={() => handleDragStart(index)}
              onDragOver={handleDragOver}
              onDrop={() => handleDrop(index)}
              onClick={() => onSelectRound(index)}
              className={`flex items-center gap-4 p-4 rounded-lg border-2 transition-all cursor-pointer group ${
                isActive
                  ? 'bg-blue-600 border-blue-500 shadow-lg'
                  : 'bg-gray-800 border-gray-700 hover:border-gray-600'
              }`}
            >
              {/* Drag handle */}
              <div className="text-gray-600 cursor-grab active:cursor-grabbing">
                <GripVertical className="w-5 h-5" />
              </div>

              {/* Round indicator */}
              <div className="flex-1">
                <div className="flex items-center gap-3">
                  <span className={`text-sm font-semibold px-2 py-1 rounded ${
                    isSuper
                      ? 'bg-yellow-500/20 text-yellow-400'
                      : 'bg-gray-700 text-gray-300'
                  }`}>
                    {isSuper ? '★' : (index + 1)}
                  </span>
                  <span className="text-white font-medium">
                    {round.name || `Раунд ${index + 1}`}
                  </span>
                </div>
                <p className="text-sm text-gray-400">
                  {questionCount} вопросов • {round.themes?.length || 0} тем
                </p>
              </div>

              {/* Actions */}
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onEditRound(index);
                  }}
                  className="p-2 text-gray-400 hover:text-blue-400 transition-colors"
                  title="Редактировать"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteRound(index);
                  }}
                  className="p-2 text-gray-400 hover:text-red-400 transition-colors"
                  title="Удалить"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Scroll indicator for more rounds */}
      {rounds.length > 5 && (
        <div className="text-center text-gray-500 text-sm pt-2">
          Прокрутите для дополнительных раундов
        </div>
      )}
    </div>
  );
});

RoundManager.displayName = 'RoundManager';
