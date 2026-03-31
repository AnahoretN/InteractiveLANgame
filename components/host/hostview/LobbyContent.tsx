/**
 * LobbyContent Component
 * Основной контент лобби с командами и клиентами
 */

import React, { memo } from 'react';
import { TeamList } from '../TeamList';
import type { Team } from '../../types';
import type { Command } from '../../hooks/useHostStateManager';
import type { ConnectedClient } from '../ListItems';

interface LobbyContentProps {
  teams: Team[];
  commands: Command[];
  clients: Map<string, ConnectedClient>;
  buzzedClients: Map<string, number>;
  buzzingClientIds: Set<string>;
  draggedClientId: string | null;
  editingTeamId: string | null;
  editingTeamName: string;
  onDragStart: (clientId: string) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  onDropOnTeam: (teamId: string | undefined) => void;
  onRenameTeam: (teamId: string, newName: string) => void;
  onDeleteTeam: (teamId: string) => void;
  onRemoveClient: (clientId: string) => void;
  onSetEditingTeamId: (teamId: string | null) => void;
  onSetEditingTeamName: (name: string) => void;
  onCreateCommand: (name: string) => void;
  onRenameCommand: (commandId: string, newName: string) => void;
  onDeleteCommand: (commandId: string) => void;
}

export const LobbyContent = memo(({
  teams,
  commands,
  clients,
  buzzedClients,
  buzzingClientIds,
  draggedClientId,
  editingTeamId,
  editingTeamName,
  onDragStart,
  onDragOver,
  onDragEnd,
  onDropOnTeam,
  onRenameTeam,
  onDeleteTeam,
  onRemoveClient,
  onSetEditingTeamId,
  onSetEditingTeamName,
  onCreateCommand,
  onRenameCommand,
  onDeleteCommand,
}: LobbyContentProps) => {
  return (
    <div className="flex-1 overflow-y-auto">
      <TeamList
        teams={teams}
        commands={commands}
        clients={clients}
        buzzedClients={buzzedClients}
        buzzingClientIds={buzzingClientIds}
        draggedClientId={draggedClientId}
        editingTeamId={editingTeamId}
        editingTeamName={editingTeamName}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDropOnTeam={onDropOnTeam}
        onRenameTeam={onRenameTeam}
        onDeleteTeam={onDeleteTeam}
        onRemoveClient={onRemoveClient}
        onSetEditingTeamId={onSetEditingTeamId}
        onSetEditingTeamName={onSetEditingTeamName}
        onCreateCommand={onCreateCommand}
        onRenameCommand={onRenameCommand}
        onDeleteCommand={onDeleteCommand}
      />
    </div>
  );
});

LobbyContent.displayName = 'LobbyContent';
