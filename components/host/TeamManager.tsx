/**
 * TeamManager Component
 * Displays teams, commands, and clients with drag-and-drop support
 */
import React, { memo, useCallback } from 'react';
import { Users, Settings, Trash2, GripVertical } from 'lucide-react';
import { Team, ConnectionQuality } from '../../types';
import { isStale } from '../../hooks';

// Command type (same structure as Team for quick rooms)
export interface Command {
  id: string;
  name: string;
}

// Local health color function (since useConnectionQuality hook was removed)
const getHealthBgColor = (score: number): string => {
  if (score >= 80) return 'bg-green-500/20 text-green-400 border-green-500/20';
  if (score >= 50) return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/20';
  return 'bg-red-500/20 text-red-400 border-red-500/20';
};

interface Client {
  id: string;
  name: string;
  teamId?: string;
  lastSeen: number;
  connectionQuality: ConnectionQuality;
}

interface TeamManagerProps {
  teams: Team[];
  commands: Command[];
  clients: Map<string, Client>;
  buzzedClients: Map<string, number>;
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
  onDeleteCommand: (commandId: string) => void;
}

export const TeamManager = memo(({
  teams,
  commands,
  clients,
  buzzedClients,
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
  onDeleteCommand,
}: TeamManagerProps) => {
  const handleRenameSubmit = useCallback((teamId: string) => {
    if (editingTeamName.trim()) {
      onRenameTeam(teamId, editingTeamName);
    }
    onSetEditingTeamId(null);
  }, [editingTeamName, onRenameTeam, onSetEditingTeamId]);

  const isDraggingOver = draggedClientId !== null;

  return (
    <div className="flex-1 overflow-y-auto space-y-2 pr-2 scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent">
      {clients.size === 0 && teams.length === 0 ? (
        <div className="h-full flex flex-col items-center justify-center text-gray-600 opacity-60">
          <Users className="w-12 h-12 mb-2" />
          <p>No devices connected</p>
        </div>
      ) : (
        <>
          {/* Show all teams (even empty ones) */}
          {teams.map(team => {
            const teamClients = Array.from(clients.values()).filter(c => c.teamId === team.id);
            const isEditing = editingTeamId === team.id;

            return (
              <div
                key={team.id}
                className="animate-in slide-in-from-bottom-2 duration-300"
                onDragOver={onDragOver}
                onDrop={() => onDropOnTeam(team.id)}
              >
                {/* Team header with edit/delete controls */}
                <div className={`flex items-center gap-2 p-2 rounded-lg border ${isDraggingOver ? 'bg-blue-500/20 border-blue-500/50' : 'bg-gray-800/50 border-gray-700/50'} group`}>
                  <div className="w-6 h-6 rounded-full bg-violet-500 flex items-center justify-center text-[10px] font-bold text-white">
                    {team.name.charAt(0).toUpperCase()}
                  </div>
                  {isEditing ? (
                    <input
                      type="text"
                      value={editingTeamName}
                      onChange={(e) => onSetEditingTeamName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          handleRenameSubmit(team.id);
                        } else if (e.key === 'Escape') {
                          onSetEditingTeamId(null);
                        }
                      }}
                      onBlur={() => handleRenameSubmit(team.id)}
                      className="flex-1 bg-gray-900 border border-blue-500 rounded px-2 py-0.5 text-sm text-white focus:outline-none"
                      autoFocus
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <>
                      <span className="font-medium text-gray-200 text-sm">{team.name}</span>
                      <span className={`text-xs ${teamClients.length === 0 ? 'text-gray-600' : 'text-gray-500'}`}>({teamClients.length})</span>
                      <div className="ml-auto flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => {
                            onSetEditingTeamId(team.id);
                            onSetEditingTeamName(team.name);
                          }}
                          className="text-gray-500 hover:text-blue-400 p-1 hover:bg-gray-700 rounded transition-colors"
                          title="Rename team"
                        >
                          <Settings className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => {
                            if (confirm(`Delete team "${team.name}"?`)) {
                              onDeleteTeam(team.id);
                            }
                          }}
                          className="text-gray-500 hover:text-red-400 p-1 hover:bg-gray-700 rounded transition-colors"
                          title="Delete team"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </>
                  )}
                </div>

                {/* Team players (if any) */}
                {teamClients.length > 0 && (
                  <div className="ml-6 mt-1 space-y-1">
                    {teamClients.map(client => (
                      <ClientItem
                        key={client.id}
                        client={client}
                        buzzed={buzzedClients.has(client.id)}
                        isDragging={draggedClientId === client.id}
                        onDragStart={onDragStart}
                        onDragEnd={onDragEnd}
                        onRemove={onRemoveClient}
                        teamColor="blue"
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {/* Players without team - always visible */}
          <NoTeamSection
            clients={clients}
            buzzedClients={buzzedClients}
            draggedClientId={draggedClientId}
            isDraggingOver={isDraggingOver}
            onDragOver={onDragOver}
            onDropOnTeam={onDropOnTeam}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            onRemoveClient={onRemoveClient}
          />
        </>
      )}
    </div>
  );
});

// Export main component for use in HostView
export const TeamList = TeamManager;

TeamManager.displayName = 'TeamManager';

// Client item sub-component
interface ClientItemProps {
  client: Client;
  buzzed: boolean;
  isDragging: boolean;
  onDragStart: (clientId: string) => void;
  onDragEnd: () => void;
  onRemove: (clientId: string) => void;
  teamColor?: 'blue' | 'gray';
}

const ClientItem = memo(({ client, buzzed, isDragging, onDragStart, onDragEnd, onRemove, teamColor = 'blue' }: ClientItemProps) => {
  const clientStale = isStale(client.lastSeen);
  const bgColor = teamColor === 'blue' ? 'bg-blue-500/80' : 'bg-gray-600';

  return (
    <div
      className={`flex items-center justify-between p-2 rounded-lg cursor-move ${
        clientStale ? 'bg-yellow-500/10 opacity-60' : 'bg-gray-900/50'
      } ${buzzed ? 'ring-2 ring-blue-400/50' : ''} ${isDragging ? 'opacity-50 ring-2 ring-blue-400' : ''}`}
      draggable
      onDragStart={() => onDragStart(client.id)}
      onDragEnd={onDragEnd}
    >
      <div className="flex items-center gap-2">
        <GripVertical className="w-4 h-4 text-gray-600" />
        <div className={`w-5 h-5 rounded-full ${bgColor} flex items-center justify-center text-[9px] font-bold text-white`}>
          {client.name.charAt(0).toUpperCase()}
        </div>
        <span className={`text-sm ${teamColor === 'blue' ? 'text-gray-300' : 'text-gray-400'}`}>{client.name}</span>
        {client.connectionQuality.rtt > 0 && (
          <span className={`text-[10px] px-1.5 py-0.5 rounded ${getHealthBgColor(client.connectionQuality.healthScore)}`}>
            {client.connectionQuality.rtt}ms
          </span>
        )}
        {/* Buzz indicator - blinking blue circle */}
        {buzzed && (
          <div className="ml-1">
            <div className="w-3 h-3 rounded-full bg-blue-500 animate-pulse shadow-[0_0_10px_rgba(59,130,246,0.8)]"></div>
          </div>
        )}
      </div>
      <button onClick={() => onRemove(client.id)} className="text-gray-500 hover:text-red-400 p-1 hover:bg-gray-700 rounded transition-colors">
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
});

ClientItem.displayName = 'ClientItem';

// No Team section sub-component
interface NoTeamSectionProps {
  clients: Map<string, Client>;
  buzzedClients: Map<string, number>;
  draggedClientId: string | null;
  isDraggingOver: boolean;
  onDragOver: (e: React.DragEvent) => void;
  onDropOnTeam: (teamId: undefined) => void;
  onDragStart: (clientId: string) => void;
  onDragEnd: () => void;
  onRemoveClient: (clientId: string) => void;
}

const NoTeamSection = memo(({
  clients,
  buzzedClients,
  draggedClientId,
  isDraggingOver,
  onDragOver,
  onDropOnTeam,
  onDragStart,
  onDragEnd,
  onRemoveClient,
}: NoTeamSectionProps) => {
  const noTeamClients = Array.from(clients.values()).filter(c => !c.teamId);

  return (
    <div
      className="animate-in slide-in-from-bottom-2 duration-300"
      onDragOver={onDragOver}
      onDrop={() => onDropOnTeam(undefined)}
    >
      <div className={`flex items-center gap-2 p-2 rounded-lg border ${
        isDraggingOver ? 'bg-blue-500/20 border-blue-500/50' : 'bg-gray-800/30 border-gray-700/30'
      }`}>
        <Users className="w-4 h-4 text-gray-500" />
        <span className="text-sm text-gray-500">No Team ({noTeamClients.length})</span>
      </div>
      {noTeamClients.length > 0 && (
        <div className="ml-6 mt-1 space-y-1">
          {noTeamClients.map(client => (
            <ClientItem
              key={client.id}
              client={client}
              buzzed={buzzedClients.has(client.id)}
              isDragging={draggedClientId === client.id}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              onRemove={onRemoveClient}
              teamColor="gray"
            />
          ))}
        </div>
      )}
    </div>
  );
});

NoTeamSection.displayName = 'NoTeamSection';
