/**
 * MobileSetup Component
 * Initial screen for entering player name and connecting to host
 */

import React, { memo, useCallback, useState, useEffect } from 'react';
import { Wifi, AlertTriangle, Loader2, ArrowRight } from 'lucide-react';
import { Button } from '../Button';
import { ConnectionStatus } from '../../types';
import { STORAGE_KEYS } from '../../config';

interface MobileSetupProps {
  status: ConnectionStatus;
  isOnline: boolean;
  ipInput: string;
  isIpLocked: boolean;
  isIpFromQr: boolean;
  onNameSubmit: (name: string) => void;
  onConnect: (ip: string) => void;
  onUnlockIp: () => void;
}

export const MobileSetup = memo(({
  status,
  isOnline,
  ipInput,
  isIpLocked,
  isIpFromQr,
  onNameSubmit,
  onConnect,
  onUnlockIp,
}: MobileSetupProps) => {
  const [name, setName] = useState(() => localStorage.getItem(STORAGE_KEYS.CLIENT_NAME) || '');
  const [isNameFilled, setIsNameFilled] = useState(() => localStorage.getItem(STORAGE_KEYS.CLIENT_NAME) !== null);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.CLIENT_NAME, name);
  }, [name]);

  const handleNameSubmit = useCallback(() => {
    if (name.trim()) {
      setIsNameFilled(true);
      onNameSubmit(name.trim());
    }
  }, [name, onNameSubmit]);

  const handleConnect = useCallback(() => {
    if (ipInput.trim()) {
      onConnect(ipInput.trim());
    }
  }, [ipInput, onConnect]);

  if (!isNameFilled) {
    return (
      <div className="h-full flex flex-col p-6 bg-gray-950 relative overflow-hidden">
        {/* Background decoration */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-40 -right-40 w-80 h-80 bg-blue-500/10 rounded-full blur-3xl"></div>
          <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-violet-500/10 rounded-full blur-3xl"></div>
        </div>

        {/* Header with connection status */}
        <div className="absolute top-4 left-4 right-4 flex justify-between items-center z-10">
          <div className={`flex items-center space-x-2 px-3 py-1 rounded-full border ${isOnline ? 'bg-green-500/20 text-green-400 border-green-500/20' : 'bg-red-500/20 text-red-400 border-red-500/20'}`}>
            <Wifi className="w-3 h-3" />
            <span className="text-xs font-semibold uppercase">{isOnline ? 'Online' : 'Offline'}</span>
          </div>
        </div>

        <div className="max-w-md mx-auto w-full flex flex-col h-full justify-center">
          <div className="text-center mb-8 mt-4">
            <h1 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-violet-400 mb-2">
              Welcome!
            </h1>
            <p className="text-gray-400 text-sm">Enter your name to join the game</p>
          </div>

          <div className="bg-gray-900/80 backdrop-blur border border-gray-800 rounded-2xl p-6 shadow-xl">
            <label className="block text-sm font-medium text-gray-300 mb-2">Your Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleNameSubmit()}
              placeholder="Enter your name"
              className="w-full bg-gray-950 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:outline-none transition-all"
              maxLength={20}
              autoFocus
            />
            <Button
              size="lg"
              className="w-full mt-4"
              onClick={handleNameSubmit}
              disabled={!name.trim()}
            >
              Continue <ArrowRight className="ml-2 w-5 h-5" />
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col p-6 bg-gray-950 relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-blue-500/10 rounded-full blur-3xl"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-violet-500/10 rounded-full blur-3xl"></div>
      </div>

      {/* Header with connection status */}
      <div className="absolute top-4 left-4 right-4 flex justify-between items-center z-10">
        <div className={`flex items-center space-x-2 px-3 py-1 rounded-full border ${isOnline ? 'bg-green-500/20 text-green-400 border-green-500/20' : 'bg-red-500/20 text-red-400 border-red-500/20'}`}>
          <Wifi className="w-3 h-3" />
          <span className="text-xs font-semibold uppercase">{isOnline ? 'Online' : 'Offline'}</span>
        </div>
        <button
          onClick={() => {
            setName('');
            setIsNameFilled(false);
            localStorage.removeItem(STORAGE_KEYS.CLIENT_NAME);
          }}
          className="text-xs text-gray-500 hover:text-white transition-colors"
        >
          Change Name
        </button>
      </div>

      <div className="max-w-md mx-auto w-full flex flex-col h-full justify-center">
        <div className="text-center mb-8 mt-4">
          <h1 className="text-2xl font-bold text-white mb-2">Connect to Host</h1>
          <p className="text-gray-400 text-sm">Enter the IP address or scan QR code</p>
        </div>

        {/* Status indicator */}
        {status === ConnectionStatus.CONNECTING && (
          <div className="mb-6 flex items-center justify-center gap-2 text-blue-400">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm">Connecting...</span>
          </div>
        )}

        {status === ConnectionStatus.ERROR && (
          <div className="mb-6 flex items-center justify-center gap-2 text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-3">
            <AlertTriangle className="w-5 h-5" />
            <span className="text-sm">Connection failed. Please check the IP and try again.</span>
          </div>
        )}

        <div className="bg-gray-900/80 backdrop-blur border border-gray-800 rounded-2xl p-6 shadow-xl">
          <label className="block text-sm font-medium text-gray-300 mb-2">Host IP Address</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={ipInput}
              onChange={(e) => {
                // Only allow valid IP characters
                const value = e.target.value.replace(/[^0-9.:\[\]]/g, '');
                onConnect(value);
              }}
              placeholder="192.168.1.x or host.local"
              className={`flex-1 bg-gray-950 border rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:outline-none transition-all ${
                isIpLocked ? 'border-green-500/50 text-green-400' : 'border-gray-700'
              }`}
              disabled={isIpLocked}
            />
            {isIpLocked && !isIpFromQr && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onUnlockIp}
                className="px-3 text-red-400 hover:text-red-300"
              >
                ✕
              </Button>
            )}
          </div>

          {isIpLocked && isIpFromQr && (
            <div className="mt-3 flex items-center gap-2 text-xs text-green-400">
              <div className="w-2 h-2 rounded-full bg-green-500"></div>
              Connected from QR code
            </div>
          )}

          <Button
            size="lg"
            className="w-full mt-4"
            onClick={handleConnect}
            disabled={!ipInput.trim() || status === ConnectionStatus.CONNECTING}
          >
            {status === ConnectionStatus.CONNECTING ? (
              <>
                <Loader2 className="mr-2 w-5 h-5 animate-spin" />
                Connecting...
              </>
            ) : (
              <>
                Connect <ArrowRight className="ml-2 w-5 h-5" />
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
});

MobileSetup.displayName = 'MobileSetup';
