/**
 * GameSelectorCard Component
 * Individual card for game pack selection
 */

import React, { memo, useState, useCallback } from 'react';
import { Check } from 'lucide-react';
import type { GamePack } from './GameSelectorModal';

interface GameSelectorCardProps {
  pack: GamePack;
  isSelected: boolean;
  onClick: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}

export const GameSelectorCard = memo(({
  pack,
  isSelected,
  onClick,
  onEdit,
  onDelete
}: GameSelectorCardProps) => {
  const questionCount = pack.rounds?.reduce((sum, r) =>
    sum + (r.themes?.reduce((tSum, t) => tSum + (t.questions?.length || 0), 0) || 0), 0
  ) || 0;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      onClick();
    }
  };

  return (
    <div
      onClick={onClick}
      onKeyDown={handleKeyDown}
      className={`relative bg-gray-900 rounded-xl p-6 border-2 transition-all cursor-pointer group hover:shadow-xl ${
        isSelected
          ? 'border-blue-500 shadow-blue-500/20'
          : 'border-gray-700 hover:border-gray-600'
      }`}
    >
      {/* Selection indicator */}
      {isSelected && (
        <div className="absolute top-3 right-3 w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center text-white">
          <Check className="w-4 h-4" />
        </div>
      )}

      {/* Cover image */}
      {pack.cover && (
        <div className="mb-4 aspect-video rounded-lg overflow-hidden bg-gray-800">
          <img
            src={pack.cover.value}
            alt={pack.name}
            className="w-full h-full object-cover"
          />
        </div>
      )}

      {/* Pack info */}
      <div className="flex-1">
        <h3 className="text-xl font-bold text-white mb-2 group-hover:text-blue-400 transition-colors">
          {pack.name}
        </h3>
        <p className="text-gray-400 text-sm">{questionCount} вопросов</p>
        {pack.updatedAt && (
          <p className="text-gray-500 text-xs">
            {new Date(pack.updatedAt).toLocaleDateString('ru-RU')}
          </p>
        )}
      </div>

      {/* Actions on hover */}
      <div className="absolute top-3 left-3 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
        {onEdit && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
            }}
            className="p-2 bg-gray-700 hover:bg-blue-600 rounded-lg transition-colors"
            title="Редактировать"
          >
            ✏️
          </button>
        )}

        {onDelete && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="p-2 bg-gray-700 hover:bg-red-600 rounded-lg transition-colors"
            title="Удалить"
          >
            🗑️
          </button>
        )}

      </div>
    </div>
  );
});

GameSelectorCard.displayName = 'GameSelectorCard';
