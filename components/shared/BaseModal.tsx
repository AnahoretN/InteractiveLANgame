/**
 * BaseModal Component
 * Reusable modal wrapper with consistent styling
 */

import React, { memo } from 'react';
import { X } from 'lucide-react';

export interface BaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  maxWidth?: string;
  showCloseButton?: boolean;
  className?: string;
}

export const BaseModal = memo(({
  isOpen,
  onClose,
  title,
  icon,
  children,
  maxWidth = 'max-w-md',
  showCloseButton = true,
  className = '',
}: BaseModalProps) => {
  if (!isOpen) return null;

  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200 cursor-default ${className}`}>
      <div className={`bg-gray-900 border border-gray-700 rounded-lg shadow-2xl p-6 w-full ${maxWidth} animate-in zoom-in-95 duration-200 cursor-default`}>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            {icon && <span className="text-blue-400">{icon}</span>}
            {title}
          </h2>
          {showCloseButton && (
            <button
              onClick={onClose}
              className="p-1 hover:bg-gray-800 rounded-lg text-gray-400 hover:text-white transition-colors"
              aria-label={`Close ${title}`}
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
        {children}
      </div>
    </div>
  );
});

BaseModal.displayName = 'BaseModal';
