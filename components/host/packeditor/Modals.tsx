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
  maxWidth?: 'max-w-sm' | 'max-w-md' | 'max-w-lg' | 'max-w-xl' | 'max-w-2xl' | 'max-w-4xl';
  customSize?: boolean; // If true, uses 2x width and reduced height
}

export const BaseModal = memo(({ isOpen, onClose, title, children, maxWidth = 'max-w-md', customSize = false }: BaseModalProps) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className={`bg-gray-900 rounded-lg shadow-2xl border border-gray-700 w-full ${maxWidth} ${customSize ? 'max-h-[60vh]' : 'max-h-[90vh]'} overflow-hidden flex flex-col`}>
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
  onFileDetected?: (type: 'image' | 'video' | 'audio') => void; // Callback when file type is detected
  onLocalFile?: (file: File, blobUrl: string) => void; // Callback when local file is selected
}

export const FileUpload = memo(({ value, onChange, accept = 'image/*', placeholder = 'https://example.com/image.jpg', label = 'Media', onFileDetected, onLocalFile }: FileUploadProps) => {
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Detect file type from MIME type (more reliable than accept attribute)
    const mimeType = file.type;
    let detectedType: 'image' | 'video' | 'audio' | null = null;

    if (mimeType.startsWith('image/')) {
      detectedType = 'image';
    } else if (mimeType.startsWith('video/')) {
      detectedType = 'video';
    } else if (mimeType.startsWith('audio/')) {
      detectedType = 'audio';
    }

    // Also check file extension as backup
    if (!detectedType) {
      const fileName = file.name.toLowerCase();
      if (fileName.match(/\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i)) {
        detectedType = 'image';
      } else if (fileName.match(/\.(mp4|webm|mov|avi|mkv)$/i)) {
        detectedType = 'video';
      } else if (fileName.match(/\.(mp3|wav|ogg|m4a|aac)$/i)) {
        detectedType = 'audio';
      }
    }

    console.log('📁 File upload detected:', {
      fileName: file.name,
      mimeType: mimeType,
      detectedType: detectedType,
      size: file.size
    });

    // Notify parent component of detected file type
    if (detectedType && onFileDetected) {
      onFileDetected(detectedType);
    }

    // Создаем простой blob URL (ZIP система обработает сохранение)
    const blobUrl = URL.createObjectURL(file);
    console.log('🔗 Created blob URL:', blobUrl.slice(0, 50) + '...');
    onChange(blobUrl);

    // Notify parent component about local file (для отслеживания)
    if (onLocalFile) {
      onLocalFile(file, blobUrl);
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
      {value && value.startsWith('blob:') && (
        <p className="text-xs text-green-400 mt-1">
          ✅ Локальный файл загружен. Информация о файле сохранена для автоматического восстановления.
        </p>
      )}
      {!value && (
        <p className="text-xs text-gray-500 mt-1">
          💡 Введите URL или путь к файлу (например: https://youtu.be/... или ./media/audio.mp3)
        </p>
      )}
    </div>
  );
});

FileUpload.displayName = 'FileUpload';
