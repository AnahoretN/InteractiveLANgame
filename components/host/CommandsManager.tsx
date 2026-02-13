/**
 * CommandsManager Component
 * Manages team creation for host
 * Extracted from HostView for better modularity
 */

import React, { useState, useCallback, memo } from 'react';
import { Plus } from 'lucide-react';

export interface Command {
  id: string;
  name: string;
}

interface CommandsManagerProps {
  commands: Command[];
  onCreateCommand: (name: string) => void;
  onRenameCommand: (commandId: string, newName: string) => void;
  onDeleteCommand: (commandId: string) => void;
}

export const CommandsManager = memo(({
  commands,
  onCreateCommand,
  onRenameCommand,
  onDeleteCommand,
}: CommandsManagerProps) => {
  const [showCreateInput, setShowCreateInput] = useState(false);
  const [newCommandName, setNewCommandName] = useState('');

  const handleCreateCommand = useCallback(() => {
    if (newCommandName.trim()) {
      onCreateCommand(newCommandName.trim());
      setNewCommandName('');
      setShowCreateInput(false);
    }
  }, [newCommandName, onCreateCommand]);

  const handleCancelEdit = useCallback(() => {
    setShowCreateInput(false);
    setNewCommandName('');
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      handleCancelEdit();
    } else if (e.key === 'Enter' && showCreateInput) {
      handleCreateCommand();
    }
  }, [showCreateInput, handleCreateCommand, handleCancelEdit]);

  return (
    <div className="bg-gray-900/50 backdrop-blur-sm rounded-lg p-4">
      {!showCreateInput ? (
        <button
          onClick={() => setShowCreateInput(true)}
          className="w-full p-2 border-2 border-dashed border-gray-700 rounded-lg text-gray-500 text-sm hover:bg-gray-800/50 hover:text-gray-300 transition-colors flex items-center justify-center gap-2"
        >
          <Plus className="w-4 h-4 text-gray-400" />
          <span>Create Team</span>
        </button>
      ) : (
        <div className="flex items-center gap-2 p-2 bg-gray-800/50 rounded-lg border-2 border-blue-500/30">
          <Plus className="w-4 h-4 text-blue-400" />
          <input
            type="text"
            value={newCommandName}
            onChange={(e) => setNewCommandName(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Team name..."
            className="flex-1 bg-transparent text-white text-sm font-medium focus:outline-none"
            autoFocus
          />
          <button
            onClick={handleCancelEdit}
            className="p-1.5 hover:bg-gray-700 rounded text-gray-400"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
});

CommandsManager.displayName = 'CommandsManager';
