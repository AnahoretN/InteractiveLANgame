/**
 * ConnectionPanel Component
 * Panel displaying connection info and QR code
 */

import React, { memo, useCallback, useMemo, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Wifi, Users, Copy, RefreshCw, Lock } from 'lucide-react';

interface ConnectionPanelProps {
  hostId: string;
  sessionId: string;
  isOnline: boolean;
  connectedClients: number;
  onCopyLink?: () => void;
  onUnlockIp?: () => void;
  isIpLocked?: boolean;
}

export const ConnectionPanel = memo(({
  hostId,
  sessionId,
  isOnline,
  connectedClients,
  onCopyLink,
  onUnlockIp,
  isIpLocked
}: ConnectionPanelProps) => {
  // Link copy animation state
  const [linkCopied, setLinkCopied] = useState<boolean>(false);

  // Generate QR code URL
  const qrUrl = useMemo(() => {
    const url = new URL(window.location.href);
    url.searchParams.set('host', hostId);
    url.searchParams.set('session', sessionId);
    return url.toString();
  }, [hostId, sessionId]);

  // Handle copy link with animation
  const handleCopyLink = useCallback(() => {
    onCopyLink?.();
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  }, [onCopyLink]);

  return (
    <div className="bg-gray-900 rounded-xl p-6 border border-gray-700">
      <div className="flex items-center gap-3 mb-4">
        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full ${
          isOnline
            ? 'bg-green-500/20 text-green-400 border border-green-500/30'
            : 'bg-red-500/20 text-red-400 border border-red-500/30'
        }`}>
          <Wifi className="w-4 h-4" />
          <span className="text-xs font-bold uppercase">
            {isOnline ? 'Online' : 'Offline'}
          </span>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30">
          <Users className="w-4 h-4" />
          <span className="text-xs font-bold">{connectedClients}</span>
        </div>

        {isIpLocked && onUnlockIp && (
          <button
            onClick={onUnlockIp}
            className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 hover:bg-yellow-500/30 transition-colors"
          >
            <Lock className="w-3 h-3" />
            <span className="text-xs font-bold">IP locked</span>
          </button>
        )}
      </div>

      {/* Session ID display */}
      <div className="bg-gray-800 rounded-lg p-4 mb-4 text-center">
        <p className="text-gray-400 text-sm mb-1">Код сессии для игроков:</p>
        <p className="text-4xl font-black text-white tracking-widest">{sessionId}</p>
      </div>

      {/* QR Code */}
      <div className="bg-white rounded-xl p-4 mb-4 flex justify-center">
        <QRCodeSVG
          value={qrUrl}
          size={180}
          level="L"
          includeMargin={false}
        />
      </div>

      {/* Copy link button */}
      {onCopyLink && (
        <button
          onClick={handleCopyLink}
          className={`relative w-full flex items-center justify-center px-4 py-3 rounded-lg font-semibold transition-all duration-200 pl-10 ${
            linkCopied
              ? 'bg-white text-blue-600'
              : 'bg-blue-600 hover:bg-blue-500 text-white active:scale-95'
          }`}
          style={{ minWidth: '210px' }}
        >
          <Copy className="absolute left-3 w-5 h-5" />
          <span className="font-medium">{linkCopied ? 'Link copied!' : 'Copy invitation link'}</span>
        </button>
      )}

      {/* Refresh indicator */}
      <p className="text-gray-500 text-xs text-center mt-3 flex items-center justify-center gap-2">
        <RefreshCw className="w-3 h-3 animate-spin-slow" />
        Сервер активен
      </p>
    </div>
  );
});

ConnectionPanel.displayName = 'ConnectionPanel';
