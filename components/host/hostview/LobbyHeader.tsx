/**
 * LobbyHeader Component
 * Заголовок лобби с QR кодом и настройками подключения
 */

import React, { memo, useCallback } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Smartphone, ArrowRight, RefreshCw, Copy, Check } from 'lucide-react';

interface LobbyHeaderProps {
  sessionId: string;
  finalQrUrl: string;
  isOnline: boolean;
  linkCopied: boolean;
  setLinkCopied: (copied: boolean) => void;
  onRefreshQR: () => void;
}

export const LobbyHeader = memo(({
  sessionId,
  finalQrUrl,
  isOnline,
  linkCopied,
  setLinkCopied,
  onRefreshQR,
}: LobbyHeaderProps) => {
  const handleCopyLink = useCallback(() => {
    if (finalQrUrl) {
      navigator.clipboard.writeText(finalQrUrl);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    }
  }, [finalQrUrl, setLinkCopied]);

  return (
    <div className="flex items-center justify-between mb-6">
      {/* Left: QR Code and Link */}
      <div className="flex items-center gap-6">
        {/* QR Code */}
        <div className="bg-white p-3 rounded-lg">
          {finalQrUrl ? (
            <QRCodeSVG
              value={finalQrUrl}
              size={120}
              level="M"
              includeMargin={false}
            />
          ) : (
            <div className="w-[120px] h-[120px] flex items-center justify-center bg-gray-100">
              <Smartphone className="w-12 h-12 text-gray-400" />
            </div>
          )}
        </div>

        {/* Connection Info */}
        <div className="space-y-3">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <h2 className="text-xl font-bold text-white">Session ID</h2>
              {!isOnline && (
                <span className="px-2 py-0.5 bg-red-500/20 text-red-400 text-xs rounded-lg">
                  Offline
                </span>
              )}
            </div>
            <div className="text-3xl font-mono font-bold text-blue-400">
              {sessionId}
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleCopyLink}
              className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg transition-colors"
            >
              {linkCopied ? (
                <>
                  <Check className="w-4 h-4 text-green-400" />
                  <span>Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  <span>Copy Link</span>
                </>
              )}
            </button>
            <button
              onClick={onRefreshQR}
              className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg transition-colors"
              title="Refresh QR Code"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Right: Instructions */}
      <div className="text-right text-sm text-gray-400">
        <p>Players can scan QR code or visit link</p>
        <p className="flex items-center justify-end gap-1 mt-1">
          to join this session
          <ArrowRight className="w-4 h-4" />
        </p>
      </div>
    </div>
  );
});

LobbyHeader.displayName = 'LobbyHeader';
