/**
 * HostSetupPanel Component
 * Panel for host configuration (IP, LAN mode, QR code)
 * Extracted from HostView for better modularity
 */

import React from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Lock, Unlock, RefreshCw, Wifi } from 'lucide-react';

interface HostSetupPanelProps {
  hostId: string;
  sessionId: string;
  ipInput: string;
  setIpInput: (value: string) => void;
  isIpLocked: boolean;
  onToggleIpLock: () => void;
  isLanMode: boolean;
  onToggleLanMode: () => void;
  finalQrUrl: string;
  onUpdateSessionId?: () => void;
}

export const HostSetupPanel: React.FC<HostSetupPanelProps> = ({
  hostId,
  sessionId,
  ipInput,
  setIpInput,
  isIpLocked,
  onToggleIpLock,
  isLanMode,
  onToggleLanMode,
  finalQrUrl,
  onUpdateSessionId,
}) => {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = () => {
    if (finalQrUrl) {
      navigator.clipboard.writeText(finalQrUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleRegenerateSessionId = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
    const newSessionId = Array.from({ length: 5 }, () =>
      chars.charAt(Math.floor(Math.random() * chars.length))
    ).join('');
    if (onUpdateSessionId) {
      onUpdateSessionId();
    }
  };

  return (
    <div className="flex flex-col space-y-4">
      {/* IP Configuration */}
      <div className="bg-gray-900 border border-gray-800 p-4 rounded-lg shadow-lg">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={ipInput}
            onChange={(e) => setIpInput(e.target.value)}
            placeholder="192.168.1.x"
            disabled={!isLanMode || isIpLocked}
            className="flex-1 bg-gray-950 border border-gray-700 rounded-lg px-4 py-2.5 text-white text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none transition-all placeholder:text-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
          />
          <button
            onClick={onToggleLanMode}
            className={`h-11 px-4 rounded-lg border text-sm font-medium transition-colors ${
              isLanMode
                ? 'bg-blue-600 hover:bg-blue-700 text-white border-blue-500'
                : 'bg-gray-800 hover:bg-gray-700 text-gray-400 border-gray-700'
            }`}
          >
            LAN
          </button>
          <button
            onClick={onToggleIpLock}
            disabled={(!isIpLocked && !ipInput.trim()) || !isLanMode}
            className={`h-11 px-4 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 ${
              isIpLocked
                ? 'bg-gray-600 hover:bg-gray-700 text-white'
                : 'bg-blue-600 hover:bg-blue-700 text-white'
            }`}
          >
            {isIpLocked ? <Unlock className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
            {isIpLocked ? 'Unlock IP' : 'Lock IP'}
          </button>
        </div>
      </div>

      {/* Session ID */}
      <div className="bg-gray-900 border border-gray-800 p-4 rounded-lg shadow-lg">
        <div className="flex items-center gap-3">
          <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Session ID</label>
          <input
            type="text"
            value={sessionId}
            className="flex-1 bg-gray-950 border border-gray-700 rounded-lg px-4 py-2 text-white text-sm text-center font-mono text-xl tracking-widest"
            readOnly
          />
          <button
            onClick={handleRegenerateSessionId}
            className="p-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg transition-colors"
            title="Regenerate Session ID"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* QR Code */}
      <div className="relative aspect-square w-full bg-gray-900 border border-gray-800 rounded-lg shadow-2xl overflow-hidden flex flex-col items-center justify-center p-4">
        {!isIpLocked ? (
          <div className="w-[280px] h-[280px] bg-gray-100 rounded-lg flex flex-col items-center justify-center text-center p-6 space-y-3">
            <Wifi className="w-16 h-16 text-gray-400" />
            <p className="text-gray-600 font-medium">Configure IP</p>
            <p className="text-gray-400 text-sm">Enter IP address and lock to generate QR code</p>
          </div>
        ) : (
          <>
            <div className="relative">
              <QRCodeSVG value={finalQrUrl} size={280} level="H" includeMargin={true} />
            </div>
            <div className="mt-4 flex justify-center">
              <button
                onClick={handleCopy}
                disabled={!finalQrUrl}
                className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
              >
                {copied ? 'Copied!' : 'Copy Link'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

HostSetupPanel.displayName = 'HostSetupPanel';
