/**
 * ConfirmDialog Component
 * Современная замена для confirm() с использованием модального окна
 */

import React from 'react';
import { AlertCircle, Info, CheckCircle, X } from 'lucide-react';
import { BaseModal } from './BaseModal';

export interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  type?: 'danger' | 'warning' | 'info' | 'success';
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  title,
  message,
  type = 'danger',
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  onConfirm,
  onCancel,
}) => {
  if (!isOpen) return null;

  const getIcon = () => {
    switch (type) {
      case 'danger':
        return <AlertCircle className="w-6 h-6 text-red-400" />;
      case 'warning':
        return <AlertCircle className="w-6 h-6 text-yellow-400" />;
      case 'success':
        return <CheckCircle className="w-6 h-6 text-green-400" />;
      default:
        return <Info className="w-6 h-6 text-blue-400" />;
    }
  };

  const getButtonClass = () => {
    switch (type) {
      case 'danger':
        return 'bg-red-600 hover:bg-red-500 text-white';
      case 'warning':
        return 'bg-yellow-600 hover:bg-yellow-500 text-white';
      case 'success':
        return 'bg-green-600 hover:bg-green-500 text-white';
      default:
        return 'bg-blue-600 hover:bg-blue-500 text-white';
    }
  };

  return (
    <BaseModal isOpen={isOpen} onClose={onCancel}>
      <div className="flex items-start gap-4">
        <div className="flex-shrink-0 mt-1">
          {getIcon()}
        </div>

        <div className="flex-1">
          <h3 className="text-lg font-semibold text-white mb-2">
            {title}
          </h3>
          <p className="text-gray-300 text-sm mb-6">
            {message}
          </p>

          <div className="flex gap-3 justify-end">
            <button
              onClick={onCancel}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
            >
              {cancelText}
            </button>
            <button
              onClick={onConfirm}
              className={`px-4 py-2 ${getButtonClass()} rounded-lg transition-colors`}
            >
              {confirmText}
            </button>
          </div>
        </div>

        <button
          onClick={onCancel}
          className="flex-shrink-0 text-gray-400 hover:text-white transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>
    </BaseModal>
  );
};

ConfirmDialog.displayName = 'ConfirmDialog';
