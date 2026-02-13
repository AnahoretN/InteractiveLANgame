/**
 * RoundModal Component
 * Modal for editing round settings
 */

import React, { memo, useState, useCallback, useEffect } from 'react';
import { Clock, Shield } from 'lucide-react';
import { BaseModal, FileUpload } from './Modals';
import type { Round, RoundType, TimerSettings } from './types';

const DEFAULT_SETTINGS: TimerSettings = {
  readingTimePerLetter: 0.05,
  responseWindow: 30,
  handicapEnabled: false,
  handicapDelay: 1,
};

interface RoundModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: Partial<Round>) => void;
  round?: Round;
  roundNumber?: number;
}

export const RoundModal = memo(({ isOpen, onClose, onSave, round, roundNumber }: RoundModalProps) => {
  const [name, setName] = useState(round?.name || '');
  const [type, setType] = useState<RoundType>(round?.type || 'normal');
  const [coverUrl, setCoverUrl] = useState(round?.cover?.value || '');
  const [timerSettings, setTimerSettings] = useState<TimerSettings>(
    round ? {
      readingTimePerLetter: round.readingTimePerLetter ?? DEFAULT_SETTINGS.readingTimePerLetter,
      responseWindow: round.responseWindow ?? DEFAULT_SETTINGS.responseWindow,
      handicapEnabled: round.handicapEnabled ?? DEFAULT_SETTINGS.handicapEnabled,
      handicapDelay: round.handicapDelay ?? DEFAULT_SETTINGS.handicapDelay,
    } : DEFAULT_SETTINGS
  );

  // Reset form when round changes or modal opens
  useEffect(() => {
    if (isOpen) {
      setName(round?.name || '');
      setType(round?.type || 'normal');
      setCoverUrl(round?.cover?.value || '');
      setTimerSettings(round ? {
        readingTimePerLetter: round.readingTimePerLetter ?? DEFAULT_SETTINGS.readingTimePerLetter,
        responseWindow: round.responseWindow ?? DEFAULT_SETTINGS.responseWindow,
        handicapEnabled: round.handicapEnabled ?? DEFAULT_SETTINGS.handicapEnabled,
        handicapDelay: round.handicapDelay ?? DEFAULT_SETTINGS.handicapDelay,
      } : DEFAULT_SETTINGS);
    }
  }, [isOpen, round]);

  const handleSave = useCallback(() => {
    onSave({
      name,
      type,
      ...(coverUrl ? { cover: { type: 'url', value: coverUrl } } : {}),
      ...timerSettings,
    });
    onClose();
  }, [name, type, coverUrl, timerSettings, onSave, onClose]);

  if (!isOpen) return null;

  return (
    <BaseModal isOpen={isOpen} onClose={onClose} title={round ? 'Edit Round' : 'Add Round'} maxWidth="max-w-4xl">
      <div className="space-y-4">
        {/* Round Type */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1.5">Round Type</label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setType('normal')}
              className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                type === 'normal'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
              }`}
            >
              Normal Round
            </button>
            <button
              type="button"
              onClick={() => setType('super')}
              className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                type === 'super'
                  ? 'bg-purple-600 text-white'
                  : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
              }`}
            >
              Super Game
            </button>
          </div>
        </div>

        {/* Round Name */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1.5">Round Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Round 1"
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500"
          />
        </div>

        {/* Cover Image */}
        <FileUpload
          value={coverUrl}
          onChange={setCoverUrl}
          accept="image/*"
          label="Cover Image (optional)"
          placeholder="https://example.com/image.jpg"
        />

        {/* Timer Settings */}
        <div className="border-t border-gray-700 pt-4 mt-4">
          <div className="flex items-center gap-2 mb-3">
            <Clock className="w-4 h-4 text-blue-400" />
            <span className="text-sm font-medium text-gray-300">Timer Settings</span>
          </div>

          {/* Reading Time Per Letter */}
          <div className="mb-4">
            <label className="block text-xs text-gray-400 mb-2">Reading Timer (seconds per letter)</label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={timerSettings.readingTimePerLetter}
              onChange={(e) => setTimerSettings(prev => ({ ...prev, readingTimePerLetter: parseFloat(e.target.value) }))}
              className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
            />
            <div className="flex justify-between text-xs mt-1">
              <span className="text-gray-500">0s</span>
              <span className="font-medium text-blue-400">{timerSettings.readingTimePerLetter}s</span>
              <span className="text-gray-500">1s</span>
            </div>
            <p className="text-xs text-gray-500 mt-2">Time per letter for reading before buzzers activate (0 = disabled)</p>
          </div>

          {/* Response Window */}
          <div className="mb-4">
            <label className="block text-xs text-gray-400 mb-2">Response Timer (seconds)</label>
            <input
              type="range"
              min="0"
              max="120"
              step="5"
              value={timerSettings.responseWindow}
              onChange={(e) => setTimerSettings(prev => ({ ...prev, responseWindow: parseInt(e.target.value) }))}
              className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
            />
            <div className="flex justify-between text-xs mt-1">
              <span className="text-gray-500">0s</span>
              <span className="font-medium text-blue-400">{timerSettings.responseWindow}s</span>
              <span className="text-gray-500">120s</span>
            </div>
            <p className="text-xs text-gray-500 mt-2">Time players have to press buzzer (0 = disabled)</p>
          </div>

          {/* Handicap */}
          <div className="bg-gray-800/50 rounded-lg p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-yellow-400" />
                <span className="text-sm text-gray-300">Handicap for Leaders</span>
              </div>
              <button
                onClick={() => setTimerSettings(prev => ({ ...prev, handicapEnabled: !prev.handicapEnabled }))}
                className={`w-11 h-6 rounded-full transition-colors ${timerSettings.handicapEnabled ? 'bg-blue-600' : 'bg-gray-700'}`}
              >
                <div className={`w-5 h-5 bg-white rounded-full transition-transform ${timerSettings.handicapEnabled ? 'translate-x-6' : 'translate-x-0.5'}`} />
              </button>
            </div>
            {timerSettings.handicapEnabled && (
              <div className="space-y-4 mt-3">
                <div>
                  <label className="block text-xs text-gray-400 mb-2">Extra Delay (seconds)</label>
                  <input
                    type="range"
                    min="0.25"
                    max="5"
                    step="0.25"
                    value={timerSettings.handicapDelay}
                    onChange={(e) => setTimerSettings(prev => ({ ...prev, handicapDelay: parseFloat(e.target.value) }))}
                    className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-yellow-500"
                  />
                  <div className="flex justify-between text-xs mt-1">
                    <span className="text-gray-500">0.25s</span>
                    <span className="font-medium text-yellow-400">{timerSettings.handicapDelay}s</span>
                    <span className="text-gray-500">5s</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-2">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-semibold transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="flex-1 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-semibold transition-colors"
          >
            Save
          </button>
        </div>
      </div>
    </BaseModal>
  );
});

RoundModal.displayName = 'RoundModal';
