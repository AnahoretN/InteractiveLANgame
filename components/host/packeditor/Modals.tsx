/**
 * Base Modal Components for PackEditor
 * Reusable modal wrappers
 */

import React, { memo, ReactNode } from 'react';
import { X } from 'lucide-react';

export interface BaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  maxWidth?: 'max-w-sm' | 'max-w-md' | 'max-w-lg' | 'max-w-xl' | 'max-w-2xl';
}

export const BaseModal = memo(({ isOpen, onClose, title, children, maxWidth = 'max-w-md' }: BaseModalProps) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className={`bg-gray-900 rounded-xl shadow-2xl border border-gray-700 w-full ${maxWidth} max-h-[90vh] overflow-hidden flex flex-col`}>
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b border-gray-700">
          <h2 className="text-xl font-bold text-white">{title}</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {children}
        </div>
      </div>
    </div>
  );
});

BaseModal.displayName = 'BaseModal';

export interface FileUploadProps {
  value?: string;
  onChange: (url: string) => void;
  accept?: string;
  placeholder?: string;
  label?: string;
}

export const FileUpload = memo(({ value, onChange, accept = 'image/*', placeholder = 'https://example.com/image.jpg', label = 'Media' }: FileUploadProps) => {
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Convert to base64 or create object URL
    if (file.size < 500 * 1024) { // < 500KB - use base64
      const reader = new FileReader();
      reader.onload = (ev) => {
        onChange(ev.target?.result as string);
      };
      reader.readAsDataURL(file);
    } else { // Large files - use object URL
      const url = URL.createObjectURL(file);
      onChange(url);
    }
  };

  return (
    <div className="space-y-2">
      <label className="text-sm text-gray-400 block">{label}</label>
      <div className="flex gap-3">
        <input
          type="file"
          accept={accept}
          onChange={handleFileChange}
          className="flex-1 text-sm text-gray-300 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-gray-800 file:text-white hover:file:bg-gray-700 cursor-pointer"
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="flex-1 bg-gray-800 text-white px-4 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
    </div>
  );
});

FileUpload.displayName = 'FileUpload';
