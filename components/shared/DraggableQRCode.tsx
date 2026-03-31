/**
 * DraggableQRCode Component
 * Displays a draggable QR code for connecting to the host session
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { X } from 'lucide-react';

export interface DraggableQRCodeProps {
  hostId: string;
  isVisible: boolean;
  onClose: () => void;
}

export const DraggableQRCode = ({ hostId, isVisible, onClose }: DraggableQRCodeProps) => {
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartPos = useRef({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  // Center the QR code on initial mount
  useEffect(() => {
    if (isVisible && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setPosition({
        x: (window.innerWidth - rect.width) / 2,
        y: (window.innerHeight - rect.height) / 2
      });
    }
  }, [isVisible]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    // Only allow dragging from the header, not the QR code itself
    if ((e.target as HTMLElement).closest('.qr-header')) {
      setIsDragging(true);
      dragStartPos.current = {
        x: e.clientX - position.x,
        y: e.clientY - position.y
      };
    }
  }, [position]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (isDragging) {
      const newX = e.clientX - dragStartPos.current.x;
      const newY = e.clientY - dragStartPos.current.y;

      // Keep within bounds
      const boundedX = Math.max(0, Math.min(newX, window.innerWidth - 400));
      const boundedY = Math.max(0, Math.min(newY, window.innerHeight - 500));

      setPosition({ x: boundedX, y: boundedY });
    }
  }, [isDragging]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  // Listen for toggle event
  useEffect(() => {
    const handleToggle = () => {
      onClose();
    };
    window.addEventListener('toggle-qr-code', handleToggle);
    return () => window.removeEventListener('toggle-qr-code', handleToggle);
  }, [onClose]);

  // Listen for Q key press
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.key === 'q' || e.key === 'Q' || e.key === 'й' || e.key === 'Й') && isVisible) {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isVisible, onClose]);

  if (!isVisible) return null;

  // Generate connection URL
  const connectionUrl = `${window.location.origin}/?host=${hostId}`;

  return (
    <div
      ref={containerRef}
      className="fixed z-50 bg-gray-900 rounded-lg shadow-2xl border-2 border-blue-500"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        cursor: isDragging ? 'grabbing' : 'grab',
        userSelect: 'none'
      }}
      onMouseDown={handleMouseDown}
    >
      {/* Header - draggable area */}
      <div className="qr-header flex items-center justify-between px-4 py-2 bg-gradient-to-r from-blue-600 to-purple-600 rounded-t-lg">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-green-400 rounded-full animate-pulse"></div>
          <span className="text-white font-bold">Session Connection</span>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          className="text-white hover:text-red-300 transition-colors p-1 hover:bg-white/10 rounded"
        >
          <X size={20} />
        </button>
      </div>

      {/* Content */}
      <div className="p-6">
        <div className="flex flex-col items-center gap-4">
          {/* QR Code */}
          <div className="bg-white p-4 rounded-lg">
            <QRCodeSVG
              value={connectionUrl}
              size={280}
              level={"M"}
              includeMargin={true}
            />
          </div>

          {/* Connection info */}
          <div className="text-center">
            <div className="bg-gray-800 px-4 py-2 rounded border border-gray-700">
              <p className="text-blue-400 font-mono text-sm break-all">
                {hostId}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
