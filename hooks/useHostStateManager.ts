/**
 * useHostStateManager Hook
 * Manages complex state and side effects for HostView
 * Extracted to reduce HostView component size
 */

import { useCallback, useEffect, useState, useRef } from 'react';
import { P2PSMessage, Team } from '../types';
import type { P2PHostResult } from './useP2PHost';

export interface SuperGameBet {
  teamId: string;
  bet: number;
  ready: boolean;
}

export interface SuperGameAnswer {
  teamId: string;
  answer: string;
  revealed: boolean;
  submitted: boolean;
}

interface UseHostStateManagerProps {
  teams: Team[];
  setTeams: React.Dispatch<React.SetStateAction<Team[]>>;
  clients: Map<string, any>;
  setClients: React.Dispatch<React.SetStateAction<Map<string, any>>>;
  p2pHost?: P2PHostResult;
  onBroadcastMessage?: (message: unknown) => void;
  onBroadcastTeamsList?: () => void;
}

export const useHostStateManager = ({
  teams,
  setTeams,
  clients,
  setClients,
  p2pHost,
  onBroadcastMessage,
  onBroadcastTeamsList,
}: UseHostStateManagerProps) => {

  // Team management
  const deleteTeam = useCallback((teamId: string) => {
    setTeams(prev => {
      const updated = prev.filter(t => t.id !== teamId);
      // Remove team from all clients
      setClients((clientsPrev: Map<string, any>) => {
        const updated = new Map(clientsPrev);
        updated.forEach((client, clientId) => {
          if (client?.teamId === teamId) {
            client.teamId = undefined;
          }
        });
        return updated;
      });
      return updated;
    });
    return updated;
  }, [setClients]);

  const renameTeam = useCallback((teamId: string, newName: string) => {
    setTeams(prev => prev.map(t => t.id === teamId ? { ...t, name: newName } : t));
  }, []);

  // Commands management
  const [commands, setCommands] = useState<Array<{ id: string; name: string }>>([]);

  const handleCreateCommand = useCallback((name: string) => {
    const newCommand = {
      id: 'cmd_' + Math.random().toString(36).substring(2, 10),
      name
    };
    setCommands(prev => [...prev, newCommand]);
  }, []);

  const handleRenameCommand = useCallback((commandId: string, newName: string) => {
    setCommands(prev => prev.map(c => c.id === commandId ? { ...c, name: newName } : c));
  }, []);

  const handleDeleteCommand = useCallback((commandId: string) => {
    setCommands(prev => prev.filter(c => c.id !== commandId));
  }, []);

  // P2P Message handling
  const [superGameBets, setSuperGameBets] = useState<SuperGameBet[]>([]);
  const [superGameAnswers, setSuperGameAnswers] = useState<SuperGameAnswer[]>([]);
  const [buzzedClients, setBuzzedClients] = useState<Map<string, number>>(new Map());

  // Pending confirmations and commands requests
  const [pendingConfirmations, setPendingConfirmations] = useState<Map<string, string>>(new Map());
  const [pendingCommandsRequest, setPendingCommandsRequest] = useState<string | null>(null);

  const handleMessage = useCallback((message: P2PSMessage, peerId: string) => {
    console.log('[useHostStateManager] Received message from', peerId, message.type);

    switch (message.type) {
      case 'BUZZ': {
        const buzzMsg = message as any; // BuzzEventMessage
        setBuzzedClients((prev: Map<string, number>) => new Map(prev).set(peerId, buzzMsg.payload.buzzTime));
        break;
      }
      case 'JOIN_TEAM': {
        const { clientName, teamId } = message.payload;
        updateClients((prev: Map<string, any>) => {
          const existingClient = prev.get(peerId);
          if (existingClient) {
            existingClient.teamId = teamId;
            existingClient.name = clientName;
          } else {
            const newClient = {
              id: peerId,
              peerId: peerId,
              name: clientName,
              joinedAt: Date.now(),
              lastSeen: Date.now(),
              teamId: teamId,
            };
            prev.set(peerId, newClient);
          }
          return prev;
        });
        setPendingConfirmations((prev: Map<string, string>) => new Map(prev).set(peerId, teamId || ''));
        break;
      }
      case 'TEAM_UPDATE': {
        const { teamId, teamName } = message.payload;
        const existingTeam = teams.find(t => t.name === teamName);
        if (!existingTeam) {
          const newTeam: Team = {
            id: teamId,
            name: teamName,
            createdAt: Date.now(),
            lastUsedAt: Date.now()
          };
          setTeams(prev => [...prev, newTeam]);
        }
        break;
      }
      case 'GET_COMMANDS': {
        setPendingCommandsRequest(peerId);
        break;
      }
      case 'SUPER_GAME_BET': {
        const existingIndex = superGameBets.findIndex(b => b.teamId === message.payload.teamId);
        if (existingIndex >= 0) {
          setSuperGameBets(prev => prev.map((b, i) =>
            i === existingIndex ? { ...b, bet: message.payload.bet, ready: true } : b
          ));
        } else {
          setSuperGameBets(prev => [...prev, { teamId: message.payload.teamId, bet: message.payload.bet, ready: true }]);
        }
        break;
      }
      case 'SUPER_GAME_ANSWER': {
        const existingIndex = superGameAnswers.findIndex(a => a.teamId === message.payload.teamId);
        if (existingIndex >= 0) {
          setSuperGameAnswers(prev => prev.map((a, i) =>
            i === existingIndex ? { ...a, answer: message.payload.answer, submitted: true } : a
          ));
        } else {
          setSuperGameAnswers(prev => [...prev, {
            teamId: message.payload.teamId,
            answer: message.payload.answer,
            revealed: false,
            submitted: true
          }]);
        }
        break;
      }
      default:
        console.log('[useHostStateManager] Unhandled message type:', message.type);
    }
  }, [teams, superGameBets, superGameAnswers]);

  // Wrapper to update clients - MUTATES existing Map in-place
  const updateClients = useCallback((updater: (prev: Map<string, any>) => Map<string, any>) => {
    setClients(prev => {
      const updated = updater(prev);
      return updated;
    });
  }, []);

  // Broadcast teams list to all clients
  const broadcastTeamsList = useCallback(() => {
    if (p2pHost?.isReady && teams.length > 0) {
      const teamsSync = {
        category: 'SYNC',
        type: 'TEAMS_SYNC',
        payload: {
          teams: teams.map(t => ({ id: t.id, name: t.name }))
        }
      };
      p2pHost.broadcast(teamsSync);
    }
  }, [teams, p2pHost?.isReady, p2pHost?.broadcast]);

  // Broadcast commands to all clients
  const broadcastCommandsList = useCallback(() => {
    if (p2pHost?.isReady && commands.length > 0) {
      const commandsSync = {
        category: 'SYNC',
        type: 'COMMANDS_LIST',
        payload: {
          commands: commands
        }
      };
      p2pHost.broadcast(commandsSync);
    }
  }, [commands, p2pHost?.isReady, p2pHost?.broadcast]);

  // Send pending TEAM_CONFIRMED messages when p2pHost is ready
  useEffect(() => {
    if (p2pHost?.isReady && pendingConfirmations.size > 0) {
      pendingConfirmations.forEach((teamId: string, clientId: string) => {
        const conn = p2pHost?.connectedClients.find(id => id === clientId);
        console.log('[useHostStateManager] Sending TEAM_CONFIRMED to', clientId, 'connection open:', !!conn);
        if (conn && p2pHost.sendToClient) {
          p2pHost.sendToClient(clientId, {
            category: 'STATE',
            type: 'TEAM_CONFIRMED',
            payload: {
              clientId: clientId
            }
          });
        }
      });
      // Clear the queue after sending
      setPendingConfirmations(new Map());
    }
  }, [p2pHost?.isReady, p2pHost?.sendToClient, pendingConfirmations]);

  // Handle pending GET_COMMANDS requests
  useEffect(() => {
    if (p2pHost?.isReady && pendingCommandsRequest && commands.length > 0) {
      const commandsSync = {
        category: 'SYNC',
        type: 'COMMANDS_LIST',
        payload: {
          commands: commands
        }
      };
      if (p2pHost.sendToClient) {
        p2pHost.sendToClient(pendingCommandsRequest, commandsSync);
      }
      setPendingCommandsRequest(null);
    } else if (p2pHost?.isReady && pendingCommandsRequest && commands.length === 0) {
      // Send empty commands list
      const commandsSync = {
        category: 'SYNC',
        type: 'COMMANDS_LIST',
        payload: {
          commands: []
        }
      };
      if (p2pHost.sendToClient) {
        p2pHost.sendToClient(pendingCommandsRequest, commandsSync);
      }
      setPendingCommandsRequest(null);
    }
  }, [p2pHost?.isReady, p2pHost?.sendToClient, commands, pendingCommandsRequest]);

  // Clean up buzzed clients after 3 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      const BUZZ_DURATION = 3000; // 3 seconds
      setBuzzedClients(prev => {
        const updated = new Map(prev);
        for (const [clientId, timestamp] of prev.entries()) {
          if (now - timestamp > BUZZ_DURATION) {
            updated.delete(clientId);
          }
        }
        return updated;
      });
    }, 500); // Check every 500ms

    return () => clearInterval(interval);
  }, []);

  // Auto-cleanup empty teams after 5 minutes
  useEffect(() => {
    const EMPTY_TEAM_TIMEOUT = 5 * 60 * 1000; // 5 minutes

    const cleanupInterval = setInterval(() => {
      const now = Date.now();
      const clientTeamIds = new Set(Array.from(clients.values()).map(c => c.teamId).filter(Boolean) as string[]);

      setTeams(prev => {
        const filtered = prev.filter(team => {
          const hasPlayers = clientTeamIds.has(team.id);
          const isRecent = (now - team.lastUsedAt) < EMPTY_TEAM_TIMEOUT;
          return hasPlayers || isRecent;
        });
        return filtered;
      });
    }, 60000); // Check every minute

    return () => clearInterval(cleanupInterval);
  }, [clients, setTeams]);

  // Save teams to storage when changed
  useEffect(() => {
    // Storage save would happen in parent component
  }, [teams]);

  return {
    // Team management
    deleteTeam,
    renameTeam,
    // Commands management
    commands,
    setCommands,
    handleCreateCommand,
    handleRenameCommand,
    handleDeleteCommand,
    // State
    buzzedClients,
    setBuzzedClients,
    pendingConfirmations,
    setPendingConfirmations,
    pendingCommandsRequest,
    setPendingCommandsRequest,
    superGameBets,
    setSuperGameBets,
    superGameAnswers,
    setSuperGameAnswers,
    // P2P handlers
    handleMessage,
    updateClients,
    broadcastTeamsList,
    broadcastCommandsList,
    // Cleanup refs for component unmount
    cleanupIntervals: () => {
      // Clear all intervals when component unmounts
    },
  };
};
