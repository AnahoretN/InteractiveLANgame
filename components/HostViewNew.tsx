/**
 * HostView Component (Simplified)
 * Main host interface with improved organization
 * Uses extracted components from setup/ directory
 */

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { Button } from './Button';
import type { Team } from './types';
import { useSessionSettings } from '../hooks/useSessionSettings';
import { useP2PHost } from '../hooks/useP2PHost';
import { SettingsModal, GameSession, GameSelectorModal, type GamePack, type GameType } from './host';
import type { Round, Theme } from './host/PackEditor';
import { TeamListItem, SimpleClientItem, NoTeamSection } from './host/ListItems';
import { TeamList, CommandsSection, HostSetupPanel } from './host';
import { storage, STORAGE_KEYS } from '../hooks/useLocalStorage';
import { useSyncEffects } from '../hooks/useSyncEffects';
import { generateUUID, getHealthBgColor } from '../utils';
import { HostSetup } from './host/setup/HostSetup';
import { HostClients } from './host/setup/HostClients';
import { P2PConnection } from './host/setup/P2PConnection';

// Helper to merge selected packs into a single session pack
const mergeSessionPack = useCallback((packs: GamePack[], selectedPackIds: string[]): GamePack | undefined => {
  if (selectedPackIds.length === 0) return undefined;

  const selectedPacksList = packs.filter(p => selectedPackIds.includes(p.id));

  if (selectedPacksList.length === 0) return undefined;

  // Merge packs into single session pack
  const mergedRounds: Round[] = [];
  let roundNum = 1;
  const maxRounds = Math.max(...selectedPacksList.map(p => (p.rounds?.length || 0)), 0);

  for (let roundNum = 1; roundNum <= maxRounds; roundNum++) {
    // Collect round settings from each pack
    const roundSettings: {
      name?: string;
      type?: RoundType;
      cover?: { type: 'url' | 'file'; value: string };
      readingTimePerLetter?: number;
      responseWindow?: number;
      handicapEnabled?: boolean;
      handicapDelay?: number;
    } = {};

    selectedPacksList.forEach(pack => {
      const round = pack.rounds?.[roundNum - 1];
      if (round) {
        if (round.name) roundSettings.name = round.name;
        if (round.type) roundSettings.type = round.type;
        if (round.cover) roundSettings.cover = round.cover;
        if (round.readingTimePerLetter) roundSettings.readingTimePerLetter = round.readingTimePerLetter;
        if (round.responseWindow) roundSettings.responseWindow = round.responseWindow;
        if (round.handicapEnabled) roundSettings.handicapEnabled = round.handicapEnabled;
        if (round.handicapDelay) roundSettings.handicapDelay = round.handicapDelay;
      }
    });

    mergedRounds.push(roundSettings);
  }

  // Merge themes - for each round, collect themes from all packs
  const mergedThemes: Theme[] = [];
  selectedPacksList.forEach(pack => {
    const themes = pack.rounds || [];
    themes.forEach(theme => {
      mergedThemes.push(theme);
    });
  });

  const sessionPack: GamePack = {
    id: generateUUID(),
    name: 'Session Pack',
    gameType: 'custom',
    createdAt: Date.now(),
    rounds: mergedRounds
  };

  return sessionPack;
}, [packs, selectedPackIds]);

export const HostViewNew = () => {
  const [hostId, setHostId] = useState<string>(() => {
    const saved = storage.get(STORAGE_KEYS.HOST_ID);
    return saved || 'host_' + Math.random().toString(36).substring(2, 10);
  });

  const [sessionId, setSessionId] = useState<string>(() => {
    const saved = storage.get(STORAGE_KEYS.HOST_UNIQUE_ID);
    if (saved) {
      return saved.substring(0, 5);
    }
    const newId = generateHostUniqueId().substring(0, 5);
    storage.set(STORAGE_KEYS.HOST_UNIQUE_ID, newId);
    return newId;
  });

  // Session state
  const [isSessionActive, setIsSessionActive] = useState<boolean>(false);
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [isLanMode, setIsLanMode] = useState<boolean>(true);
  const [ipInput, setIpInput] = useState<string>(() => {
    return storage.get(STORAGE_KEYS.LOCKED_IP) || '';
  });
  const [isIpLocked, setIsIpLocked] = useState<boolean>(() => {
    const storedIp = storage.get(STORAGE_KEYS.LOCKED_IP);
    return storedIp !== null && storedIp !== '';
  });

  const sessionPack = mergeSessionPack(
    selectedPackIds || [],
    (useP2PHost((p2p) => ({
      hostId: hostId,
      isHost: true,
      signallingServer: isLanMode && isIpLocked && ipInput ? `ws://${ipInput}:9000` : undefined,
      onMessage: (message) => {
        console.log('[HostViewNew] Received message from', p2p.id, message.type);
      },
    })),
    [isSessionActive, setIsSessionActive]
  );

  // Clear storage on unmount
  useEffect(() => {
    return () => {
      storage.clearAll();
    };
  }, []);

  return (
    <div className="bg-gray-950 min-h-screen text-gray-100 p-6">
      {/* Header */}
      <div className="bg-gray-900 border-b border-gray-800 p-4 rounded-lg mb-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-white">Interactive LAN Game</h1>
        </div>
      </div>

      {/* Session Info */}
      <P2PConnection
        hostId={hostId}
        sessionId={sessionId}
        isSessionActive={isSessionActive}
        setIsSessionActive={setIsSessionActive}
      />

      {/* Host Setup */}
      <HostSetup
        hostId={hostId}
        sessionId={sessionId}
        ipInput={ipInput}
        setIpInput={setIpInput}
        isIpLocked={isIpLocked}
        setIsIpLocked={setIsIpLocked}
        isLanMode={isLanMode}
        setIsLanMode={setIsLanMode}
      />

      {/* Connected Clients */}
      <HostClients
        isLanMode={isLanMode}
        ipInput={ipInput}
        setIpInput={setIpInput}
      />

      {/* Session Management */}
      <GameSession
        hostId={hostId}
        sessionId={sessionId}
        isSessionActive={isSessionActive}
        setIsSessionActive={setIsSessionActive}
        sessionPack={sessionPack}
      />

      {/* Settings Modal */}
      <SettingsModal />
    </div>
  );
};
