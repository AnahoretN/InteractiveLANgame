/**
 * ThemeModal Component
 * Modal for editing theme settings
 */

import React, { memo, useState, useCallback, useEffect } from 'react';
import { BaseModal } from './Modals';
import type { Theme } from './types';
import { Button } from '../../Button';

interface ThemeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: Partial<Theme>) => void;
  theme?: Theme;
}

export const ThemeModal = memo(({ isOpen, onClose, onSave, theme }: ThemeModalProps) => {
  const [name, setName] = useState(theme?.name || '');
  const [color, setColor] = useState(theme?.color || '#3b82f6');
  const [textColor, setTextColor] = useState(theme?.textColor || '#ffffff');

  // Reset form when theme changes or modal opens
  useEffect(() => {
    if (isOpen) {
      setName(theme?.name || '');
      setColor(theme?.color || '#3b82f6');
      setTextColor(theme?.textColor || '#ffffff');
    }
  }, [isOpen, theme]);

  const predefinedColors = [
    '#ef4444', // red
    '#f97316', // orange
    '#eab308', // yellow
    '#22c55e', // green
    '#06b6d4', // cyan
    '#3b82f6', // blue
    '#8b5cf6', // violet
    '#ec4899', // pink
  ];

  const predefinedTextColors = [
    { color: '#ffffff', name: 'White' },
    { color: '#f3f4f6', name: 'Gray 100' },
    { color: '#d1d5db', name: 'Gray 300' },
    { color: '#9ca3af', name: 'Gray 400' },
    { color: '#000000', name: 'Black' },
  ];

  const handleSave = useCallback(() => {
    onSave({ name, color, textColor });
    onClose();
  }, [name, color, textColor, onSave, onClose]);

  if (!isOpen) return null;

  return (
    <BaseModal isOpen={isOpen} onClose={onClose} title={theme ? 'Edit Theme' : 'Add Theme'}>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1.5">Theme Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., History"
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1.5">Theme Color</label>
          <div className="flex gap-2 flex-wrap mb-3">
            {predefinedColors.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className={`w-10 h-10 rounded-lg border-2 transition-all ${
                  color === c ? 'border-white scale-110' : 'border-transparent hover:scale-105'
                }`}
                style={{ backgroundColor: c }}
                title={c}
              />
            ))}
          </div>
          <input
            type="text"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            placeholder="#3b82f6"
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500 font-mono"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1.5">Text Color</label>
          <div className="flex gap-2 flex-wrap mb-3">
            {predefinedTextColors.map((tc) => (
              <button
                key={tc.color}
                type="button"
                onClick={() => setTextColor(tc.color)}
                className={`w-10 h-10 rounded-lg border-2 transition-all ${
                  textColor === tc.color ? 'border-white scale-110' : 'border-transparent hover:scale-105'
                }`}
                style={{ backgroundColor: tc.color }}
                title={tc.name}
              />
            ))}
          </div>
          <input
            type="text"
            value={textColor}
            onChange={(e) => setTextColor(e.target.value)}
            placeholder="#ffffff"
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500 font-mono"
          />
        </div>
        <div className="flex gap-3 pt-2">
          <Button variant="secondary" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button className="flex-1" onClick={handleSave}>Save</Button>
        </div>
      </div>
    </BaseModal>
  );
});

ThemeModal.displayName = 'ThemeModal';
