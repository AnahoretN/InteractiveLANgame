/**
 * PackManager Component
 * Manages game packs - create, edit, delete, import, export
 */

import React, { memo, useState, useCallback } from 'react';
import { FolderOpen, Trash2, Edit2, Download, Upload, Plus, FileText } from 'lucide-react';
import type { GamePack } from './types';
import { fileToBase64 } from './utils';

interface PackManagerProps {
  packs: GamePack[];
  selectedPackIds: string[];
  onSelectPack: (packId: string) => void;
  onCreatePack: () => void;
  onEditPack: (packId: string) => void;
  onDeletePack: (packId: string) => void;
  onImportPack: (pack: GamePack) => void;
}

export const PackManager = memo(({
  packs,
  selectedPackIds,
  onSelectPack,
  onCreatePack,
  onEditPack,
  onDeletePack,
  onImportPack
}: PackManagerProps) => {
  const [draggedId, setDraggedId] = useState<string | null>(null);

  const handleDragStart = useCallback((e: React.DragEvent, id: string) => {
    setDraggedId(id);
    e.dataTransfer.effectAllowed = 'move';
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!draggedId) return;

    // In a real implementation, this would reorder packs
    setDraggedId(null);
  }, [draggedId]);

  const handleFileImport = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const pack = JSON.parse(ev.target?.result as string) as GamePack;
        onImportPack(pack);
      } catch (err) {
        console.error('Failed to parse pack:', err);
      }
    };
    reader.readAsText(file);
  }, [onImportPack]);

  const handleExport = useCallback((pack: GamePack) => {
    const dataStr = JSON.stringify(pack, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${pack.name}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-white">Игровые пакеты</h2>
        <div className="flex gap-3">
          {/* Import button */}
          <label className="cursor-pointer px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg font-semibold transition-colors flex items-center gap-2">
            <Upload className="w-4 h-4" />
            Импорт
            <input
              type="file"
              accept=".json"
              onChange={handleFileImport}
              className="hidden"
            />
          </label>

          {/* Create button */}
          <button
            onClick={onCreatePack}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-semibold transition-colors flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Создать
          </button>
        </div>
      </div>

      {/* Packs list */}
      <div className="space-y-3">
        {packs.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <FileText className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>Нет пакетов. Создайте новый или импортируйте существующий.</p>
          </div>
        ) : (
          packs.map((pack) => {
            const questionCount = pack.rounds?.reduce((sum, r) => {
              return sum + (r.themes?.reduce((tSum, t) => tSum + (t.questions?.length || 0), 0) || 0);
            }, 0) || 0;

            const isSelected = selectedPackIds.includes(pack.id);

            return (
              <div
                key={pack.id}
                draggable
                onDragStart={(e) => handleDragStart(e, pack.id)}
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, pack.id)}
                className={`bg-gray-900 rounded-xl p-4 border-2 transition-all group ${
                  isSelected ? 'border-blue-500' : 'border-gray-700 hover:border-gray-600'
                }`}
              >
                <div className="flex items-start gap-4">
                  {/* Drag handle */}
                  <div className="text-gray-600 cursor-grab active:cursor-grabbing pt-1">
                    ⋮⋮
                  </div>

                  {/* Pack icon/image */}
                  <div className="w-16 h-16 bg-gray-800 rounded-lg flex items-center justify-center flex-shrink-0">
                    {pack.cover?.type === 'url' ? (
                      <img
                        src={pack.cover.value}
                        alt={pack.name}
                        className="w-full h-full object-cover rounded-lg"
                      />
                    ) : (
                      <FolderOpen className="w-8 h-8 text-blue-400" />
                    )}
                  </div>

                  {/* Pack info */}
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-bold text-white truncate">{pack.name}</h3>
                    <p className="text-sm text-gray-400">{questionCount} вопросов</p>
                    {pack.updatedAt && (
                      <p className="text-xs text-gray-500">
                        {new Date(pack.updatedAt).toLocaleDateString('ru-RU')}
                      </p>
                    )}
                  </div>

                  {/* Selection checkbox */}
                  <button
                    onClick={() => onSelectPack(pack.id)}
                    className={`flex-shrink-0 w-6 h-6 rounded border-2 transition-colors ${
                      isSelected
                        ? 'bg-blue-500 border-blue-500 text-white'
                        : 'border-gray-600 hover:border-blue-500'
                    }`}
                  >
                    {isSelected && '✓'}
                  </button>

                  {/* Actions */}
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => onEditPack(pack.id)}
                      className="p-2 text-gray-400 hover:text-blue-400 transition-colors"
                      title="Редактировать"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleExport(pack)}
                      className="p-2 text-gray-400 hover:text-green-400 transition-colors"
                      title="Экспортировать"
                    >
                      <Download className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => onDeletePack(pack.id)}
                      className="p-2 text-gray-400 hover:text-red-400 transition-colors"
                      title="Удалить"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Help text */}
      <div className="text-gray-500 text-sm">
        <p>💡 Перетащите пакеты для изменения порядка</p>
        <p>💡 Нажмите на пакет для выбора (выберите несколько для игры)</p>
      </div>
    </div>
  );
});

PackManager.displayName = 'PackManager';
