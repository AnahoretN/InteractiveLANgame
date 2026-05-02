/**
 * Optimized ListItems Component
 *
 * Performance-optimized version with:
 * - Virtualized client/team lists using react-virtuoso
 * - Enhanced React.memo implementations
 * - CSS containment optimizations
 * - Optimistic updates for better UX
 */

import React, { memo, useMemo, useCallback } from 'react';
import { Virtuoso, VirtuosoGrid } from 'react-virtuoso';
import { GripVertical, Settings, Trash2, Users } from 'lucide-react';
import { Team, ConnectionQuality } from '../../types';
import { getHealthBgColor } from '../../utils';

// ConnectedClient interface
export interface ConnectedClient {
  id: string;
  peerId: string;
  name: string;
  joinedAt: number;
  teamId?: string;
  lastSeen: number;
  connectionQuality: ConnectionQuality;
}

// Optimized Client List Item with CSS containment
interface ClientListItemProps {
  client: ConnectedClient;
  isStale: (lastSeen: number) => boolean;
  hasBuzzed: boolean;
  isBuzzing?: boolean;
  isDragging: boolean;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  onRemove: (id: string) => void;
  showTeam?: boolean;
  getHealthBgColor?: (score: number) => string;
}

export const OptimizedClientListItem = memo<ClientListItemProps>(({
  client,
  isStale,
  hasBuzzed,
  isBuzzing = false,
  isDragging,
  onDragStart,
  onDragEnd,
  onRemove,
  showTeam = false,
  getHealthBgColor
}) => {
  const stale = isStale(client.lastSeen);

  const handleDragStart = useCallback(() => {
    onDragStart(client.id);
  }, [client.id, onDragStart]);

  const handleDragEnd = useCallback(() => {
    onDragEnd();
  }, [onDragEnd]);

  const handleRemove = useCallback(() => {
    onRemove(client.id);
  }, [client.id, onRemove]);

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      className={`flex items-center justify-between p-2.5 rounded-lg card-contained list-item-contained ${
        isDragging ? 'cursor-move' : ''
      } ${stale ? 'bg-yellow-500/10 opacity-60' : 'bg-gray-900/50'
      } ${isDragging ? 'opacity-50 ring-2 ring-blue-400' : ''}`}
    >
      <div className="flex items-center gap-2.5">
        {isDragging && <GripVertical className="w-5 h-5 text-gray-600" />}
        <div className={`w-6 h-6 rounded-full ${showTeam ? 'bg-gray-600' : 'bg-blue-500/80'} flex items-center justify-center text-[10px] font-bold text-white`}>
          {typeof client.name === 'string' && client.name.length > 0 ? client.name.charAt(0).toUpperCase() : '?'}
        </div>
        <span className={`text-base ${showTeam ? 'text-gray-400' : 'text-gray-300'} text-truncate`}>
          {typeof client.name === 'string' ? client.name : 'Unnamed'}
        </span>
        {client.connectionQuality.rtt > 0 && getHealthBgColor && (
          <span className={`text-[11px] px-2 py-0.5 rounded ${getHealthBgColor(client.connectionQuality.healthScore)}`}>
            {client.connectionQuality.rtt}ms
          </span>
        )}
        {isBuzzing && (
          <div className="ml-1">
            <div className="w-3.5 h-3.5 rounded-full bg-white animate-double-flash shadow-[0_0_10px_rgba(255,255,255,0.8)]"></div>
          </div>
        )}
      </div>
      <button onClick={handleRemove} className="text-gray-500 hover:text-red-400 p-1.5 hover:bg-gray-700 rounded-lg transition-colors button-hover">
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  );
}, (prevProps, nextProps) => {
  return (
    prevProps.client.id === nextProps.client.id &&
    prevProps.client.name === nextProps.client.name &&
    prevProps.client.teamId === nextProps.client.teamId &&
    prevProps.hasBuzzed === nextProps.hasBuzzed &&
    prevProps.isBuzzing === nextProps.isBuzzing &&
    prevProps.isDragging === nextProps.isDragging
  );
});

OptimizedClientListItem.displayName = 'OptimizedClientListItem';

// Simple client list item
interface SimpleClientItemProps {
  client: ConnectedClient;
  isStale: (lastSeen: number) => boolean;
  hasBuzzed: boolean;
  isBuzzing?: boolean;
  onRemove: (id: string) => void;
  getHealthBgColor: (score: number) => string;
}

export const OptimizedSimpleClientItem = memo<SimpleClientItemProps>(({
  client,
  isStale,
  hasBuzzed,
  isBuzzing = false,
  onRemove,
  getHealthBgColor
}) => {
  const stale = isStale(client.lastSeen);

  const handleRemove = useCallback(() => {
    onRemove(client.id);
  }, [client.id, onRemove]);

  return (
    <div className={`flex items-center justify-between p-2.5 rounded-lg card-contained list-item-contained ${
      stale ? 'bg-yellow-500/10 opacity-60' : 'bg-gray-900/50'
    }`}>
      <div className="flex items-center gap-2.5">
        <div className="w-6 h-6 rounded-full bg-blue-500/80 flex items-center justify-center text-[10px] font-bold text-white">
          {typeof client.name === 'string' && client.name.length > 0 ? client.name.charAt(0).toUpperCase() : '?'}
        </div>
        <span className="text-base text-gray-300 text-truncate">
          {typeof client.name === 'string' ? client.name : 'Unnamed'}
        </span>
        {client.connectionQuality.rtt > 0 && (
          <span className={`text-[11px] px-2 py-0.5 rounded ${getHealthBgColor(client.connectionQuality.healthScore)}`}>
            {client.connectionQuality.rtt}ms
          </span>
        )}
        {isBuzzing && (
          <div className="ml-1">
            <div className="w-3.5 h-3.5 rounded-full bg-white animate-double-flash shadow-[0_0_10px_rgba(255,255,255,0.8)]"></div>
          </div>
        )}
      </div>
      <button onClick={handleRemove} className="text-gray-500 hover:text-red-400 p-1.5 hover:bg-gray-700 rounded-lg transition-colors button-hover">
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  );
}, (prevProps, nextProps) => {
  return (
    prevProps.client.id === nextProps.client.id &&
    prevProps.client.name === nextProps.client.name &&
    prevProps.hasBuzzed === nextProps.hasBuzzed &&
    prevProps.isBuzzing === nextProps.isBuzzing
  );
});

OptimizedSimpleClientItem.displayName = 'OptimizedSimpleClientItem';

// Virtualized Client List Component
interface VirtualizedClientListProps {
  clients: ConnectedClient[];
  isStale: (lastSeen: number) => boolean;
  buzzedClients: Set<string>;
  buzzingClientIds: Set<string>;
  draggedClientId: string | null;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  onRemove: (id: string) => void;
  getHealthBgColor?: (score: number) => string;
  showTeam?: boolean;
  height?: number;
}

export const VirtualizedClientList = memo<VirtualizedClientListProps>(({
  clients,
  isStale,
  buzzedClients,
  buzzingClientIds,
  draggedClientId,
  onDragStart,
  onDragEnd,
  onRemove,
  getHealthBgColor,
  showTeam = false,
  height = 400
}) => {
  return (
    <div className="virtualized-list" style={{ height }}>
      <Virtuoso
        style={{ height: '100%' }}
        data={clients}
        itemContent={(index, client) => (
          <OptimizedClientListItem
            key={client.id}
            client={client}
            isStale={isStale}
            hasBuzzed={buzzedClients.has(client.id)}
            isBuzzing={buzzingClientIds.has(client.peerId)}
            isDragging={draggedClientId === client.id}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            onRemove={onRemove}
            showTeam={showTeam}
            getHealthBgColor={getHealthBgColor}
          />
        )}
      />
    </div>
  );
});

VirtualizedClientList.displayName = 'VirtualizedClientList';

// Virtualized Simple Client List
interface VirtualizedSimpleClientListProps {
  clients: ConnectedClient[];
  isStale: (lastSeen: number) => boolean;
  buzzedClients: Set<string>;
  buzzingClientIds: Set<string>;
  onRemove: (id: string) => void;
  getHealthBgColor: (score: number) => string;
  height?: number;
}

export const VirtualizedSimpleClientList = memo<VirtualizedSimpleClientListProps>(({
  clients,
  isStale,
  buzzedClients,
  buzzingClientIds,
  onRemove,
  getHealthBgColor,
  height = 400
}) => {
  return (
    <div className="virtualized-list" style={{ height }}>
      <Virtuoso
        style={{ height: '100%' }}
        data={clients}
        itemContent={(index, client) => (
          <OptimizedSimpleClientItem
            key={client.id}
            client={client}
            isStale={isStale}
            hasBuzzed={buzzedClients.has(client.id)}
            isBuzzing={buzzingClientIds.has(client.peerId)}
            onRemove={onRemove}
            getHealthBgColor={getHealthBgColor}
          />
        )}
      />
    </div>
  );
});

VirtualizedSimpleClientList.displayName = 'VirtualizedSimpleClientList';

// Optimized Team List Item
interface TeamListItemProps {
  team: Team;
  teamClients: ConnectedClient[];
  isEditing: boolean;
  editingTeamName: string;
  isDraggingOver: boolean;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: () => void;
  onEditStart: () => void;
  onRename: (teamId: string, newName: string) => void;
  onDelete: () => void;
  onEditingNameChange: (name: string) => void;
  onEditingIdSet: (id: string | null) => void;
  buzzedClients: Set<string>;
  buzzingClientIds: Set<string>;
  isStale: (lastSeen: number) => boolean;
  draggedClientId: string | null;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  onRemoveClient: (id: string) => void;
}

export const OptimizedTeamListItem = memo<TeamListItemProps>(({
  team,
  teamClients,
  isEditing,
  editingTeamName,
  isDraggingOver,
  onDragOver,
  onDrop,
  onEditStart,
  onRename,
  onDelete,
  onEditingNameChange,
  onEditingIdSet,
  buzzedClients,
  buzzingClientIds,
  isStale,
  draggedClientId,
  onDragStart,
  onDragEnd,
  onRemoveClient
}) => {
  const hasBuzzedClient = useMemo(() => {
    return teamClients.some(client => buzzedClients.has(client.id));
  }, [teamClients, buzzedClients]);

  const hasBuzzingClient = useMemo(() => {
    return teamClients.some(client => buzzingClientIds.has(client.peerId));
  }, [teamClients, buzzingClientIds]);

  return (
    <div
      className="animate-in slide-in-from-bottom-2 duration-300"
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      {/* Team header */}
      <div className={`flex items-center gap-2.5 p-2.5 rounded-lg border card-contained layout-stable ${
        isDraggingOver ? 'bg-blue-500/20 border-blue-500/50' : 'bg-gray-800/50 border-gray-700/50'
      } group`}>
        <div className="w-7 h-7 rounded-full bg-violet-500 flex items-center justify-center text-[11px] font-bold text-white">
          {typeof team.name === 'string' && team.name.length > 0 ? team.name.charAt(0).toUpperCase() : '?'}
        </div>
        {isEditing ? (
          <input
            type="text"
            value={editingTeamName}
            onChange={(e) => onEditingNameChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                onRename(team.id, editingTeamName);
                onEditingIdSet(null);
              } else if (e.key === 'Escape') {
                onEditingIdSet(null);
              }
            }}
            onBlur={() => {
              if (editingTeamName.trim()) {
                onRename(team.id, editingTeamName);
              }
              onEditingIdSet(null);
            }}
            className="flex-1 bg-gray-900 border border-blue-500 rounded-lg px-2.5 py-1 text-base text-white focus:outline-none"
            autoFocus
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <>
            <span className="font-medium text-gray-200 text-base text-truncate">{team.name}</span>
            <span className={`text-sm ${teamClients.length === 0 ? 'text-gray-600' : 'text-gray-500'}`}>
              ({teamClients.length})
            </span>
            <div className="ml-auto flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={onEditStart}
                className="text-gray-500 hover:text-blue-400 p-1.5 hover:bg-gray-700 rounded-lg transition-colors button-hover"
                title="Rename team"
              >
                <Settings className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={onDelete}
                className="text-gray-500 hover:text-red-400 p-1.5 hover:bg-gray-700 rounded-lg transition-colors button-hover"
                title="Delete team"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </>
        )}
      </div>

      {/* Team players with virtualization */}
      {teamClients.length > 0 && (
        <div className="ml-6 mt-1">
          <VirtualizedClientList
            clients={teamClients}
            isStale={isStale}
            buzzedClients={buzzedClients}
            buzzingClientIds={buzzingClientIds}
            draggedClientId={draggedClientId}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            onRemove={onRemoveClient}
            height={Math.min(teamClients.length * 60, 300)}
          />
        </div>
      )}
    </div>
  );
}, (prevProps, nextProps) => {
  return (
    prevProps.team.id === nextProps.team.id &&
    prevProps.team.name === nextProps.team.name &&
    prevProps.isEditing === nextProps.isEditing &&
    prevProps.editingTeamName === nextProps.editingTeamName &&
    prevProps.isDraggingOver === nextProps.isDraggingOver &&
    prevProps.teamClients.length === nextProps.teamClients.length &&
    prevProps.draggedClientId === nextProps.draggedClientId &&
    prevProps.buzzedClients.size === nextProps.buzzedClients.size &&
    prevProps.buzzingClientIds.size === nextProps.buzzingClientIds.size
  );
});

OptimizedTeamListItem.displayName = 'OptimizedTeamListItem';

// Optimized No Team Section
interface NoTeamSectionProps {
  noTeamClients: ConnectedClient[];
  isDraggingOver: boolean;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: () => void;
  buzzedClients: Set<string>;
  buzzingClientIds: Set<string>;
  isStale: (lastSeen: number) => boolean;
  draggedClientId: string | null;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  onRemoveClient: (id: string) => void;
  getHealthBgColor: (score: number) => string;
}

export const OptimizedNoTeamSection = memo<NoTeamSectionProps>(({
  noTeamClients,
  isDraggingOver,
  onDragOver,
  onDrop,
  buzzedClients,
  buzzingClientIds,
  isStale,
  draggedClientId,
  onDragStart,
  onDragEnd,
  onRemoveClient,
  getHealthBgColor
}) => {
  if (noTeamClients.length === 0) return null;

  return (
    <div
      className="animate-in slide-in-from-bottom-2 duration-300"
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <div className={`flex items-center gap-2 p-2.5 rounded-lg border card-contained layout-stable ${
        isDraggingOver ? 'bg-blue-500/20 border-blue-500/50' : 'bg-gray-800/30 border-gray-700/30'
      }`}>
        <Users className="w-5 h-5 text-gray-500" />
        <span className="text-base text-gray-500">No Team ({noTeamClients.length})</span>
      </div>
      <div className="ml-6 mt-1">
        <VirtualizedClientList
          clients={noTeamClients}
          isStale={isStale}
          buzzedClients={buzzedClients}
          buzzingClientIds={buzzingClientIds}
          draggedClientId={draggedClientId}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          onRemove={onRemoveClient}
          getHealthBgColor={getHealthBgColor}
          showTeam={true}
          height={Math.min(noTeamClients.length * 60, 300)}
        />
      </div>
    </div>
  );
});

OptimizedNoTeamSection.displayName = 'OptimizedNoTeamSection';

// Virtualized Team List Component
interface VirtualizedTeamListProps {
  teams: Team[];
  teamClientsMap: Map<string, ConnectedClient[]>;
  isEditing: boolean;
  editingTeamName: string;
  editingTeamId: string | null;
  isDraggingOver: boolean;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: () => void;
  onEditStart: () => void;
  onRename: (teamId: string, newName: string) => void;
  onDelete: () => void;
  onEditingNameChange: (name: string) => void;
  onEditingIdSet: (id: string | null) => void;
  buzzedClients: Set<string>;
  buzzingClientIds: Set<string>;
  isStale: (lastSeen: number) => boolean;
  draggedClientId: string | null;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  onRemoveClient: (id: string) => void;
  height?: number;
}

export const VirtualizedTeamList = memo<VirtualizedTeamListProps>(({
  teams,
  teamClientsMap,
  isEditing,
  editingTeamName,
  editingTeamId,
  isDraggingOver,
  onDragOver,
  onDrop,
  onEditStart,
  onRename,
  onDelete,
  onEditingNameChange,
  onEditingIdSet,
  buzzedClients,
  buzzingClientIds,
  isStale,
  draggedClientId,
  onDragStart,
  onDragEnd,
  onRemoveClient,
  height = 500
}) => {
  return (
    <div className="virtualized-list" style={{ height }}>
      <Virtuoso
        style={{ height: '100%' }}
        data={teams}
        itemContent={(index, team) => (
          <OptimizedTeamListItem
            key={team.id}
            team={team}
            teamClients={teamClientsMap.get(team.id) || []}
            isEditing={isEditing && editingTeamId === team.id}
            editingTeamName={editingTeamName}
            isDraggingOver={isDraggingOver}
            onDragOver={onDragOver}
            onDrop={onDrop}
            onEditStart={onEditStart}
            onRename={onRename}
            onDelete={onDelete}
            onEditingNameChange={onEditingNameChange}
            onEditingIdSet={onEditingIdSet}
            buzzedClients={buzzedClients}
            buzzingClientIds={buzzingClientIds}
            isStale={isStale}
            draggedClientId={draggedClientId}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            onRemoveClient={onRemoveClient}
          />
        )}
      />
    </div>
  );
});

VirtualizedTeamList.displayName = 'VirtualizedTeamList';

// Backward compatibility aliases - export optimized components with original names
export const SimpleClientItem = OptimizedSimpleClientItem;
export const TeamListItem = OptimizedTeamListItem;
export const NoTeamSection = OptimizedNoTeamSection;