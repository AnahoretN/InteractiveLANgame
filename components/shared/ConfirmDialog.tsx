/**
 * ConfirmDialog Component
 * Современная замена для confirm() с использованием модального окна
 */

import React, { useMemo, useCallback } from 'react';
import { AlertCircle, Info, CheckCircle } from 'lucide-react';
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

export const ConfirmDialog: React.FC<ConfirmDialogProps> = React.memo(({
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

  const icon = useMemo(() => {
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
  }, [type]);

  const buttonClass = useMemo(() => {
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
  }, [type]);

  const handleCancel = useCallback(() => {
    onCancel();
  }, [onCancel]);

  const handleConfirm = useCallback(() => {
    onConfirm();
  }, [onConfirm]);

  return (
    <BaseModal isOpen={isOpen} onClose={handleCancel}>
      <div className="flex items-start gap-4">
        <div className="flex-shrink-0 mt-1">
          {icon}
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
              onClick={handleCancel}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
            >
              {cancelText}
            </button>
            <button
              onClick={handleConfirm}
              className={`px-4 py-2 ${buttonClass} rounded-lg transition-colors`}
            >
              {confirmText}
            </button>
          </div>
        </div>
      </div>
    </BaseModal>
  );
});

ConfirmDialog.displayName = 'ConfirmDialog';
