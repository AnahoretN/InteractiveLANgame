/**
 * SettingsModal Component
 * Modal for configuring session settings
 */

import React, { memo, useState, useEffect } from 'react';
import { Settings, X, Shield, Clock, Users, Trash2 } from 'lucide-react';
import { Button } from '../Button';
import { SESSION_CONFIG } from '../../config';
import type { SessionSettings } from '../../hooks/useSessionSettings';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: SessionSettings;
  onSave: (settings: SessionSettings) => void;
  onClearCache?: () => void;
}

export const SettingsModal = memo(({ isOpen, onClose, settings, onSave, onClearCache }: SettingsModalProps) => {
  // Local draft settings - only saved when user clicks Save
  const [draftSettings, setDraftSettings] = useState<SessionSettings>(settings);

  // Reset draft settings when modal opens
  useEffect(() => {
    if (isOpen) {
      setDraftSettings(settings);
    }
  }, [isOpen, settings]);

  const handleSave = () => {
    onSave(draftSettings);
    onClose();
  };

  const updateDraft = (updates: Partial<SessionSettings>) => {
    setDraftSettings(prev => ({ ...prev, ...updates }));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-gray-900 border border-gray-700 rounded-lg shadow-2xl p-6 w-full max-w-md animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Settings className="w-5 h-5 text-blue-400" />
            Session Settings
          </h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-800 rounded-lg text-gray-400 hover:text-white transition-colors"
            aria-label="Close settings"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-6">
          {/* Simultaneous Press */}
          <SettingRow
            icon={<Clock className="w-5 h-5 text-blue-400" />}
            title="Simultaneous Press"
            description="If players press the button within this time difference, it counts as simultaneous"
            enabled={draftSettings.simultaneousPressEnabled}
            onToggle={() => updateDraft({ simultaneousPressEnabled: !draftSettings.simultaneousPressEnabled })}
            colorClass="blue"
          >
            <div className="mt-4">
              <input
                type="range"
                min={SESSION_CONFIG.SIMULTANEOUS_PRESS_MIN}
                max={SESSION_CONFIG.SIMULTANEOUS_PRESS_MAX}
                step="0.05"
                value={draftSettings.simultaneousPressThreshold}
                onChange={(e) => updateDraft({
                  simultaneousPressThreshold: parseFloat(e.target.value)
                })}
                className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={!draftSettings.simultaneousPressEnabled}
              />
              <div className="flex justify-between text-xs mt-1">
                <span className={draftSettings.simultaneousPressEnabled ? 'text-gray-500' : 'text-gray-600'}>{SESSION_CONFIG.SIMULTANEOUS_PRESS_MIN}s</span>
                <span className={`font-medium ${draftSettings.simultaneousPressEnabled ? 'text-blue-400' : 'text-gray-600'}`}>{draftSettings.simultaneousPressThreshold.toFixed(2)}s</span>
                <span className={draftSettings.simultaneousPressEnabled ? 'text-gray-500' : 'text-gray-600'}>{SESSION_CONFIG.SIMULTANEOUS_PRESS_MAX}s</span>
              </div>
            </div>
          </SettingRow>

          {/* Clash */}
          <SettingRow
            icon={<Shield className="w-5 h-5 text-violet-400" />}
            title="Clash"
            description="When enabled, if players press simultaneously, a random player wins"
            enabled={draftSettings.collisionEnabled}
            onToggle={() => updateDraft({ collisionEnabled: !draftSettings.collisionEnabled })}
            colorClass="violet"
            extraButton={
              <button
                onClick={() => updateDraft({ collisionAdvantageUnderdog: !draftSettings.collisionAdvantageUnderdog })}
                disabled={!draftSettings.collisionEnabled}
                className={`px-4 py-1.5 rounded-lg border text-sm font-medium transition-colors flex-shrink-0 ${
                  draftSettings.collisionAdvantageUnderdog && draftSettings.collisionEnabled
                    ? 'bg-violet-500 text-white border-violet-500'
                    : !draftSettings.collisionEnabled
                      ? 'bg-gray-800 text-gray-400 border-gray-700 cursor-not-allowed opacity-50'
                      : 'bg-gray-800 text-gray-400 border-gray-700'
                }`}
              >
                +20%
              </button>
            }
          >
            <div className="h-4"></div>
          </SettingRow>

          {/* No Teams Mode */}
          <SettingRow
            icon={<Users className="w-5 h-5 text-green-400" />}
            title="No Teams"
            description="Ignore teams and show players individually"
            enabled={draftSettings.noTeamsMode}
            onToggle={() => updateDraft({ noTeamsMode: !draftSettings.noTeamsMode })}
            colorClass="blue"
          >
            <div className="h-4"></div>
          </SettingRow>
        </div>

        {/* Danger Zone */}
        <div className="border-t border-red-900/30 pt-6 mt-6">
          <h3 className="text-sm font-semibold text-red-400 mb-3 flex items-center gap-2">
            <Trash2 className="w-4 h-4" />
            Danger Zone
          </h3>
          <div className="bg-red-950/20 border border-red-900/30 rounded-lg p-4">
            <p className="text-sm text-gray-400 mb-3">
              Clear all cached data for you and all connected players. Everyone will need to re-enter their name and choose a team.
            </p>
            <Button
              variant="danger"
              className="w-full"
              onClick={() => {
                if (onClearCache) {
                  onClearCache();
                  onClose();
                }
              }}
            >
              Clear All Cache
            </Button>
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-800">
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
          <Button onClick={handleSave}>
            Save
          </Button>
        </div>
      </div>
    </div>
  );
});

SettingsModal.displayName = 'SettingsModal';

// Setting row sub-component
interface SettingRowProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  enabled: boolean;
  onToggle: () => void;
  colorClass: 'violet' | 'amber' | 'blue';
  extraButton?: React.ReactNode;
  children: React.ReactNode;
}

const SettingRow = memo(({ icon, title, description, enabled, onToggle, colorClass, extraButton, children }: SettingRowProps) => {
  const colorClasses = {
    violet: {
      checked: 'bg-violet-500 text-white border-violet-500',
      unchecked: 'bg-gray-800 text-gray-400 border-gray-700',
    },
    amber: {
      checked: 'bg-amber-500 text-white border-amber-500',
      unchecked: 'bg-gray-800 text-gray-400 border-gray-700',
    },
    blue: {
      checked: 'bg-blue-500 text-white border-blue-500',
      unchecked: 'bg-gray-800 text-gray-400 border-gray-700',
    },
  };

  const colors = colorClasses[colorClass];
  const buttonClass = enabled ? colors.checked : colors.unchecked;

  return (
    <div className="flex items-start gap-4 py-2">
      <div className="mt-1">{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-white">{title}</h3>
            <p className="text-xs text-gray-500 mt-0.5">{description}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onToggle}
              className={`px-4 py-1.5 rounded-lg border text-sm font-medium transition-colors flex-shrink-0 ${buttonClass}`}
            >
              {enabled ? 'On' : 'Off'}
            </button>
            {extraButton}
          </div>
        </div>
        {children}
      </div>
    </div>
  );
});

SettingRow.displayName = 'SettingRow';
