/**
 * CommandsSection Component
 * Displays commands list for selection with long-press to rename
 */

import React, { memo, useState, useCallback } from 'react';
import { Users, Plus, Trash2 } from 'lucide-react';

export interface Command {
  id: string;
  name: string;
}

interface CommandsSectionProps {
  commands: Command[];
  onCreateCommand: (name: string) => void;
  onRenameCommand: (commandId: string, newName: string) => void;
  onDeleteCommand?: (commandId: string) => void;
}

const CommandsSection = memo(({ commands, onCreateCommand, onRenameCommand, onDeleteCommand }: CommandsSectionProps) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState<string>('');
  const [showCreateInput, setShowCreateInput] = useState(false);
  const [newCommandName, setNewCommandName] = useState('');

  const handleStartEdit = useCallback((commandId: string, commandName: string) => {
    setEditingId(commandId);
    setEditingName(commandName);
  }, []);

  const handleSaveEdit = useCallback(() => {
    if (editingId && editingName.trim()) {
      onRenameCommand(editingId, editingName.trim());
      setEditingId(null);
      setEditingName('');
    }
  }, [editingId, editingName, onRenameCommand]);

  const handleKeyPress = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSaveEdit();
    } else if (e.key === 'Escape') {
      setEditingId(null);
      setEditingName('');
    }
  }, [handleSaveEdit]);

  const handleCreateCommand = useCallback(() => {
    if (newCommandName.trim()) {
      onCreateCommand(newCommandName.trim());
      setNewCommandName('');
      setShowCreateInput(false);
    }
  }, [newCommandName, onCreateCommand]);

  const handleCreateKeyPress = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleCreateCommand();
    } else if (e.key === 'Escape') {
      setShowCreateInput(false);
      setNewCommandName('');
    }
  }, [handleCreateCommand]);

  return (
    <div className="animate-in slide-in-from-bottom-2 duration-300">
      {/* Header */}
      <div className="flex items-center justify-between px-2 py-1 bg-gray-900/80 border-b border-gray-700">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Rooms</h2>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">{commands.length} available</span>
          <button
            onClick={() => setShowCreateInput(!showCreateInput)}
            className="w-6 h-6 rounded-full bg-blue-500 hover:bg-blue-600 flex items-center justify-center text-white transition-colors"
            title="Create room"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Create command input */}
      {showCreateInput && (
        <div className="p-2 bg-gray-800/50 border-b border-gray-700">
          <input
            type="text"
            value={newCommandName}
            onChange={(e) => setNewCommandName(e.target.value)}
            onKeyDown={handleCreateKeyPress}
            onBlur={handleCreateCommand}
            placeholder="Room name..."
            className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
            autoFocus
            maxLength={20}
          />
        </div>
      )}

      {/* Commands list */}
      {commands.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <Users className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>No rooms yet</p>
          <p className="text-xs mt-2">Host can create rooms for quick join</p>
        </div>
      ) : (
        <div className="space-y-2 p-2">
          {commands.map(command => (
            <div
              key={command.id}
              className="flex items-center gap-2 p-2 rounded-lg bg-gray-800/50 border border-gray-700/50 group"
              onDoubleClick={() => {
                handleStartEdit(command.id, command.name);
              }}
            >
              <div className="w-8 h-8 rounded-full bg-orange-500 flex items-center justify-center text-[10px] font-bold text-white shrink-0">
                {command.name.charAt(0).toUpperCase()}
              </div>

              {editingId === command.id ? (
                <input
                  type="text"
                  value={editingName}
                  onChange={(e) => setEditingName(e.target.value)}
                  onKeyDown={handleKeyPress}
                  onBlur={handleSaveEdit}
                  className="flex-1 bg-gray-900 border border-blue-500 rounded px-2 py-1 text-sm text-white placeholder-gray-500 focus:outline-none"
                  autoFocus
                  maxLength={20}
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <>
                  <div className="flex-1 min-w-0">
                    <span className="font-medium text-sm text-gray-200">{command.name}</span>
                    <span className="text-xs text-gray-500">double-click to rename</span>
                  </div>
                  <Users className="w-4 h-4 text-blue-400 shrink-0" />
                </>
              )}

              {/* Delete button - shown on hover */}
              {onDeleteCommand && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm(`Delete room "${command.name}"?`)) {
                      onDeleteCommand(command.id);
                    }
                  }}
                  className="text-gray-500 hover:text-red-400 p-1 hover:bg-gray-700 rounded transition-colors opacity-0 group-hover:opacity-100"
                  title="Delete room"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
});

export { CommandsSection };
CommandsSection.displayName = 'CommandsSection';
