/**
 * useP2PMessageHandlers Hook
 * Handles all P2P message processing for HostView
 * Extracted to reduce HostView component size and improve modularity
 */

import { useCallback, useEffect, useState } from 'react';
import { P2PSMessage, BuzzEventMessage } from '../types';

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

export interface Command {
  id: string;
  name: string;
}

interface UseP2PMessageHandlersOptions {
  teams: any[];
  setTeams: React.Dispatch<React.SetStateAction<any[]>>;
  clients: Map<string, any>;
  setClients: React.Dispatch<React.SetStateAction<Map<string, any>>>;
  superGameBets: SuperGameBet[];
  setSuperGameBets: React.Dispatch<React.SetStateAction<SuperGameBet[]>>;
  superGameAnswers: SuperGameAnswer[];
  setSuperGameAnswers: React.Dispatch<React.SetStateAction<SuperGameAnswer[]>>;
  commands: Command[];
  setCommands: React.Dispatch<React.SetStateAction<Command[]>>;
  buzzedClients: Map<string, number>;
  setBuzzedClients: React.Dispatch<React.SetStateAction<Map<string, number>>>;
  pendingConfirmations: Map<string, string>;
  setPendingConfirmations: React.Dispatch<React.SetStateAction<Map<string, string>>>;
  pendingCommandsRequest: string | null;
  setPendingCommandsRequest: React.Dispatch<React.SetStateAction<string | null>>;
  p2pHost?: any;
}

export const useP2PMessageHandlers = (options: UseP2PMessageHandlersOptions) => {
  const {
    teams,
    setTeams,
    clients,
    setClients,
    superGameBets,
    setSuperGameBets,
    superGameAnswers,
    commands,
    setCommands,
    buzzedClients,
    setBuzzedClients,
    pendingConfirmations,
    setPendingConfirmations,
    pendingCommandsRequest,
    setPendingCommandsRequest,
    p2pHost,
  } = options;

  // ============================================================
  // TEAM MANAGEMENT
  // ============================================================

  const deleteTeam = useCallback((teamId: string) => {
    setTeams((prev) => {
      const updated = prev.filter((t: any) => t.id !== teamId);
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
  }, [setClients]);

  const renameTeam = useCallback((teamId: string, newName: string) => {
    setTeams((prev) => prev.map((t: any) => t.id === teamId ? { ...t, name: newName } : t));
  }, []);

  // ============================================================
  // COMMANDS MANAGEMENT
  // ============================================================

  const handleCreateCommand = useCallback((name: string) => {
    const newCommand: Command = {
      id: 'cmd_' + Math.random().toString(36).substring(2, 10),
      name
    };
    setCommands((prev: Command[]) => [...prev, newCommand]);
  }, []);

  const handleRenameCommand = useCallback((commandId: string, newName: string) => {
    setCommands((prev: Command[]) => prev.map((c: Command) => c.id === commandId ? { ...c, name: newName } : c));
  }, []);

  const handleDeleteCommand = useCallback((commandId: string) => {
    setCommands((prev: Command[]) => prev.filter((c: Command) => c.id !== commandId));
  }, []);

  // ============================================================
  // P2P MESSAGE HANDLERS
  // ============================================================

  const handleMessage = useCallback((message: P2PSMessage, peerId: string) => {
    console.log('[useP2PMessageHandlers] Received from', peerId, message.type);

    switch (message.type) {
      case 'BUZZ': {
        const buzzMsg = message as BuzzEventMessage;
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
        const existingTeam = teams.find((t: any) => t.name === teamName);
        if (!existingTeam) {
          const newTeam = {
            id: teamId,
            name: teamName,
            createdAt: Date.now(),
            lastUsedAt: Date.now()
          };
          setTeams((prev: any[]) => [...prev, newTeam]);
        }
        break;
      }
      case 'GET_COMMANDS': {
        setPendingCommandsRequest(peerId);
        break;
      }
      case 'SUPER_GAME_BET': {
        const existingIndex = superGameBets.findIndex((b: SuperGameBet) => b.teamId === message.payload.teamId);
        if (existingIndex >= 0) {
          setSuperGameBets((prev: SuperGameBet[]) => prev.map((b: SuperGameBet, i: number) =>
            i === existingIndex ? { ...b, bet: message.payload.bet, ready: true } : b
          ));
        } else {
          setSuperGameBets((prev: SuperGameBet[]) => [...prev, { teamId: message.payload.teamId, bet: message.payload.bet, ready: true }]);
        }
        break;
      }
      case 'SUPER_GAME_ANSWER': {
        const existingIndex = superGameAnswers.findIndex((a: SuperGameAnswer) => a.teamId === message.payload.teamId);
        if (existingIndex >= 0) {
          setSuperGameAnswers((prev: SuperGameAnswer[]) => prev.map((a: SuperGameAnswer, i: number) =>
            i === existingIndex ? { ...a, answer: message.payload.answer, submitted: true } : a
          ));
        } else {
          setSuperGameAnswers((prev: SuperGameAnswer[]) => [...prev, {
            teamId: message.payload.teamId,
            answer: message.payload.answer,
            revealed: false,
            submitted: true
          }]);
        }
        break;
      }
      default:
        console.log('[useP2PMessageHandlers] Unhandled message type:', message.type);
    }
  }, [teams, superGameBets, superGameAnswers]);

  // Wrapper to update clients - MUTATES existing Map in-place
  const updateClients = useCallback((updater: (prev: Map<string, any>) => Map<string, any>) => {
    setClients(prev => {
      const updated = updater(prev);
      return updated;
    });
  }, []);

  // ============================================================
  // BROADCAST FUNCTIONS
  // ============================================================

  const broadcastTeamsList = useCallback(() => {
    if (p2pHost?.isReady && teams.length > 0) {
      const teamsSync = {
        category: 'SYNC',
        type: 'TEAMS_SYNC',
        payload: {
          teams: teams.map((t: any) => ({ id: t.id, name: t.name }))
        }
      };
      p2pHost.broadcast(teamsSync);
    }
  }, [teams, p2pHost?.isReady, p2pHost?.broadcast]);

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

  // ============================================================
  // EFFECTS
  // ============================================================

  // Send pending TEAM_CONFIRMED messages when p2pHost is ready
  useEffect(() => {
    if (p2pHost?.isReady && pendingConfirmations.size > 0) {
      pendingConfirmations.forEach((_teamId: string, clientId: string) => {
        const conn = p2pHost?.connectedClients.find((id: string) => id === clientId);
        if (conn && p2pHost.sendToClient) {
          p2pHost.sendToClient(clientId, {
            category: 'STATE',
            type: 'TEAM_CONFIRMED',
            payload: { clientId: clientId }
          });
        }
      });
      setPendingConfirmations(new Map());
    }
  }, [p2pHost?.isReady, p2pHost?.connectedClients, pendingConfirmations, p2pHost?.sendToClient]);

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
      if (p2pHost?.sendToClient) {
        p2pHost.sendToClient(pendingCommandsRequest, commandsSync);
        setPendingCommandsRequest(null);
      }
    } else if (p2pHost?.isReady && pendingCommandsRequest && commands.length === 0) {
      const commandsSync = {
        category: 'SYNC',
        type: 'COMMANDS_LIST',
        payload: {
          commands: []
        }
      };
      if (p2pHost?.sendToClient) {
        p2pHost.sendToClient(pendingCommandsRequest, commandsSync);
        setPendingCommandsRequest(null);
      }
    }
  }, [p2pHost?.isReady, pendingCommandsRequest, commands, p2pHost?.sendToClient]);

  // Broadcast teams and commands when they change
  useEffect(() => {
    if (p2pHost?.isReady) {
      broadcastCommandsList();
      broadcastTeamsList();
    }
  }, [commands, teams, p2pHost?.isReady, p2pHost?.broadcast, broadcastTeamsList]);

  // ============================================================
  // CLEANUP EFFECTS
  // ============================================================

  // Clean up buzzed clients after 3 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      const BUZZ_DURATION = 3000; // 3 seconds

      setBuzzedClients((prev) => {
        const updated = new Map(prev);
        for (const [clientId, timestamp] of prev.entries()) {
          if (now - timestamp > BUZZ_DURATION) {
            updated.delete(clientId);
          }
        }
        return updated;
      });
    }, 500);

    return () => clearInterval(interval);
  }, []);

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
    // P2P handlers
    handleMessage,
    // Broadcast functions
    broadcastTeamsList,
    broadcastCommandsList,
    // State
    buzzedClients,
    pendingConfirmations,
    setPendingConfirmations,
    pendingCommandsRequest,
    setPendingCommandsRequest,
    // Super Game state
    superGameBets,
    setSuperGameBets,
    superGameAnswers,
    // Cleanup
    cleanupIntervals: () => {
      // Clear all intervals when component unmounts
    },
  };
};
