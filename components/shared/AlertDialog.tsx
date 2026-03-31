/**
 * AlertDialog Component
 * Современная замена для alert() с использованием модального окна
 */

import React from 'react';
import { AlertCircle, Info, CheckCircle, X } from 'lucide-react';
import { BaseModal } from './BaseModal';

export interface AlertDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  type?: 'error' | 'warning' | 'info' | 'success';
  buttonText?: string;
  onClose: () => void;
}

export const AlertDialog: React.FC<AlertDialogProps> = ({
  isOpen,
  title,
  message,
  type = 'info',
  buttonText = 'OK',
  onClose,
}) => {
  if (!isOpen) return null;

  const getIcon = () => {
    switch (type) {
      case 'error':
        return <AlertCircle className="w-6 h-6 text-red-400" />;
      case 'warning':
        return <AlertCircle className="w-6 h-6 text-yellow-400" />;
      case 'success':
        return <CheckCircle className="w-6 h-6 text-green-400" />;
      default:
        return <Info className="w-6 h-6 text-blue-400" />;
    }
  };

  const getBorderColor = () => {
    switch (type) {
      case 'error':
        return 'border-red-500';
      case 'warning':
        return 'border-yellow-500';
      case 'success':
        return 'border-green-500';
      default:
        return 'border-blue-500';
    }
  };

  return (
    <BaseModal isOpen={isOpen} onClose={onClose}>
      <div className={`flex items-start gap-4 p-4 border-l-4 ${getBorderColor()} bg-gray-800/50 rounded-r-lg`}>
        <div className="flex-shrink-0 mt-1">
          {getIcon()}
        </div>

        <div className="flex-1">
          <h3 className="text-lg font-semibold text-white mb-2">
            {title}
          </h3>
          <p className="text-gray-300 text-sm mb-4">
            {message}
          </p>

          <div className="flex justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
            >
              {buttonText}
            </button>
          </div>
        </div>

        <button
          onClick={onClose}
          className="flex-shrink-0 text-gray-400 hover:text-white transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>
    </BaseModal>
  );
};

AlertDialog.displayName = 'AlertDialog';
