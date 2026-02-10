/**
 * MobileGame Component
 * Main game screen with the Buzz button
 */

import React, { memo, useMemo } from 'react';
import { User, Wifi, LogOut, Loader2, RefreshCw, Trash2 } from 'lucide-react';
import { Button } from '../Button';
import { ConnectionStatus, ConnectionQuality } from '../../types';
import { getHealthColor, getHealthBgColor } from '../../hooks/useConnectionQuality';

// Reconnecting state sub-component
interface ReconnectingStateProps {
  retryCount: number;
  status: ConnectionStatus;
  onForceReconnect: () => void;
  onReset: () => void;
}

const ReconnectingState = memo(({ retryCount, status, onForceReconnect, onReset }: ReconnectingStateProps) => (
  <div className="flex flex-col items-center space-y-6 text-center">
    <div className="relative">
      <Loader2 className="w-16 h-16 text-blue-500 animate-spin" />
      {retryCount > 0 && (
        <div className="absolute -bottom-2 left-1/2 transform -translate-x-1/2 bg-gray-800 text-xs px-2 py-1 rounded-full text-gray-400">
          Attempt {retryCount + 1}
        </div>
      )}
    </div>
    <p className="text-xl font-medium text-gray-400">
      {status === ConnectionStatus.RECONNECTING ? 'Reconnecting...' : 'Connection lost'}
    </p>
    <div className="flex gap-3">
      {retryCount > 2 && (
        <Button
          size="sm"
          variant="secondary"
          onClick={onForceReconnect}
        >
          <RefreshCw className="w-4 h-4 mr-2" /> Force Reconnect
        </Button>
      )}
      <button
        onClick={onReset}
        className="px-4 py-2 text-sm text-gray-600 hover:text-red-400 transition-colors flex items-center gap-2"
      >
        <Trash2 className="w-4 h-4" /> Reset
      </button>
    </div>
  </div>
));

ReconnectingState.displayName = 'ReconnectingState';

interface MobileGameProps {
  userName: string;
  currentTeam: string | null;
  status: ConnectionStatus;
  connectionQuality: ConnectionQuality;
  retryCount: number;
  hostId: string | null;
  onBuzz: () => void;
  onLeave: () => void;
  onForceReconnect: () => void;
  onReset: () => void;
}

export const MobileGame = memo(({
  userName,
  currentTeam,
  status,
  connectionQuality,
  retryCount,
  hostId,
  onBuzz,
  onLeave,
  onForceReconnect,
  onReset,
}: MobileGameProps) => {
  // Memoize health colors
  const healthColor = useMemo(() => getHealthColor(connectionQuality.healthScore), [connectionQuality.healthScore]);
  const healthBgColor = useMemo(() => getHealthBgColor(connectionQuality.healthScore), [connectionQuality.healthScore]);

  return (
    <div className="h-full flex flex-col relative bg-gray-950">
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-center z-10 bg-gradient-to-b from-gray-900/80 to-transparent backdrop-blur-sm">
        <button
          onClick={onLeave}
          className="p-2 bg-red-600/20 hover:bg-red-600/30 rounded-full border border-red-600/30 text-red-400 transition-colors"
          title="Leave session"
        >
          <LogOut className="w-4 h-4" />
        </button>

        <div className="flex items-center space-x-2 bg-gray-800/50 rounded-full pl-3 pr-4 py-1 border border-white/10">
          <User className="w-4 h-4 text-blue-400" />
          <div className="flex flex-col text-left leading-none">
            <span className="font-semibold text-gray-200 text-xs">{userName}</span>
            {currentTeam && <span className="text-[10px] text-indigo-400">{currentTeam}</span>}
          </div>
        </div>

        <div className={`flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase border ${healthBgColor}`}>
          <Wifi className={`w-3 h-3 ${healthColor}`} />
          <span className={healthColor}>{status === ConnectionStatus.CONNECTED ? 'Connected' : status}</span>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 w-full max-w-md mx-auto">
        {status === ConnectionStatus.CONNECTED ? (
          <div className="flex flex-col items-center w-full mt-12 animate-in zoom-in duration-300">
            <button
              onClick={onBuzz}
              className="group relative w-full aspect-square max-h-[40vh] rounded-full flex flex-col items-center justify-center transition-all duration-200 active:scale-95 focus:outline-none touch-manipulation"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-full shadow-[0_0_60px_-15px_rgba(37,99,235,0.5)] group-hover:shadow-[0_0_80px_-10px_rgba(37,99,235,0.7)] transition-all duration-500"></div>
              <div className="absolute inset-4 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full border-t border-white/20"></div>
              <div className="relative flex flex-col items-center pointer-events-none">
                <span className="text-5xl font-black text-white tracking-widest uppercase drop-shadow-md">Buzz!</span>
              </div>
              <div className="absolute inset-0 rounded-full border-4 border-white/10 scale-105 animate-pulse"></div>
            </button>

            {/* Connection quality indicator */}
            {connectionQuality.rtt > 0 && (
              <div className={`mt-6 flex items-center space-x-2 px-4 py-2 rounded-full border ${healthBgColor}`}>
                <Wifi className={`w-4 h-4 ${healthColor}`} />
                <span className={`text-sm font-medium ${healthColor}`}>{connectionQuality.rtt}ms</span>
                <span className="text-gray-500">|</span>
                <span className={`text-sm font-medium ${healthColor}`}>{connectionQuality.healthScore}%</span>
              </div>
            )}

            <p className="mt-4 text-gray-500 text-sm animate-pulse">Waiting for host...</p>
          </div>
        ) : (
          <ReconnectingState
            retryCount={retryCount}
            status={status}
            onForceReconnect={onForceReconnect}
            onReset={onReset}
          />
        )}
      </div>

      {/* Footer */}
      <div className="p-6 text-center text-gray-600 text-xs flex justify-between items-center">
        <span>{hostId?.substring(0, 8)}...</span>
        {connectionQuality.rtt > 0 && (
          <span className={healthColor}>{connectionQuality.healthScore}% health</span>
        )}
      </div>
    </div>
  );
});

MobileGame.displayName = 'MobileGame';
