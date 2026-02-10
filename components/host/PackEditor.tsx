/**
 * PackEditor Component
 *
 * Three-column editor for creating game packs:
 * - Column 1: Rounds (with timer settings)
 * - Column 2: Themes (per round)
 * - Column 3: Questions (per theme)
 */

import React, { memo, useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  X, Save, FolderOpen, Plus, Settings, Edit2, Trash2, Upload,
  Image as ImageIcon, Clock, Shield, ChevronRight
} from 'lucide-react';
import { Button } from '../Button';

// ============= HELPER FUNCTIONS =============

/**
 * Convert a file to base64 data URL
 */
const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

/**
 * Get file extension from mime type
 */
const getExtensionFromMime = (mime: string): string => {
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/svg+xml': 'svg',
    'video/mp4': 'mp4',
    'video/webm': 'webm',
    'audio/mpeg': 'mp3',
    'audio/wav': 'wav',
    'audio/ogg': 'ogg',
  };
  return map[mime] || 'bin';
};

// ============= TYPE DEFINITIONS =============

export interface GamePack {
  id: string;
  name: string;
  cover?: {
    type: 'url' | 'file';
    value: string;
  };
  gameType: 'custom' | 'quiz' | 'trivia';
  rounds: Round[];
  createdAt: number;
  updatedAt: number;
}

export type RoundType = 'normal' | 'super';

export interface Round {
  id: string;
  number: number;
  name: string;
  type?: RoundType; // 'normal' (обычный раунд) or 'super' (суперигра)
  cover?: {
    type: 'url' | 'file';
    value: string; // URL or base64
  };
  // Timer settings
  readingTimePerLetter?: number; // seconds per letter for reading (0.01 - 0.5)
  responseWindow?: number; // seconds players have to press buzzer
  handicapEnabled?: boolean; // enable timeout for leaders
  handicapDelay?: number; // extra seconds for leaders (0.25 - 5)
  themes: Theme[];
}

export interface Theme {
  id: string;
  name: string;
  color?: string; // Hex color for theme display (e.g., "#3b82f6")
  textColor?: string; // Hex color for text on theme/question cards (e.g., "#ffffff")
  questions: Question[];
}

export interface Question {
  id: string;
  text: string;
  answers?: string[];
  correctAnswer?: number;
  answerText?: string; // Text of the correct answer (for non-multiple choice)
  answerMedia?: { // Media for the answer
    type: 'image' | 'video' | 'audio';
    url?: string;
  };
  media?: {
    type: 'image' | 'video' | 'audio';
    url?: string;
    file?: File;
  };
  points?: number;
  timeLimit?: number; // individual question time limit
}

export interface TimerSettings {
  readingTimePerLetter: number; // seconds per letter for reading (0.01 - 0.5)
  responseWindow: number; // seconds players have to press buzzer
  handicapEnabled: boolean;
  handicapDelay: number; // extra seconds for leaders (0.25 - 5)
}

const DEFAULT_TIMER_SETTINGS: TimerSettings = {
  readingTimePerLetter: 0.05,
  responseWindow: 30,
  handicapEnabled: false,
  handicapDelay: 1,
};

// ============= MODAL COMPONENTS =============

interface BaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  maxWidth?: string; // Optional max-width for the modal
}

const BaseModal = memo(({ isOpen, onClose, title, children, maxWidth = 'max-w-md' }: BaseModalProps) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className={`relative bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-full ${maxWidth} mx-4 max-h-[90vh] overflow-hidden flex flex-col`}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
          <h3 className="text-lg font-bold text-white">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 overflow-y-auto flex-1">
          {children}
        </div>
      </div>
    </div>
  );
});

// File Upload Component
interface FileUploadProps {
  value: string; // URL or base64
  onChange: (value: string) => void;
  accept?: string; // e.g., 'image/*', 'video/*', 'audio/*'
  placeholder?: string;
  label?: string;
}

const FileUpload = memo(({ value, onChange, accept = 'image/*', placeholder = 'https://example.com/image.jpg', label = 'Media' }: FileUploadProps) => {
  const [uploadType, setUploadType] = useState<'url' | 'file'>(
    value.startsWith('data:') ? 'file' : 'url'
  );
  const [previewUrl, setPreviewUrl] = useState<string>(value);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    setPreviewUrl(value);
    setUploadType(value.startsWith('data:') ? 'file' : 'url');
  }, [value]);

  const handleFileSelect = useCallback(async (file: File) => {
    try {
      const base64 = await fileToBase64(file);
      onChange(base64);
      setPreviewUrl(base64);
    } catch (error) {
      console.error('Failed to convert file to base64:', error);
    }
  }, [onChange]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) {
      handleFileSelect(file);
    }
  }, [handleFileSelect]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const isImage = previewUrl && (previewUrl.startsWith('data:image') || previewUrl.match(/\.(jpg|jpeg|png|gif|webp|svg)$/i));
  const isVideo = previewUrl && (previewUrl.startsWith('data:video') || previewUrl.match(/\.(mp4|webm|mov)$/i));
  const isAudio = previewUrl && (previewUrl.startsWith('data:audio') || previewUrl.match(/\.(mp3|wav|ogg)$/i));

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-gray-300">{label}</label>
      <div className="flex gap-2 mb-2">
        <button
          type="button"
          onClick={() => setUploadType('url')}
          className={`flex-1 px-3 py-1.5 rounded text-xs font-medium transition-colors ${
            uploadType === 'url'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
          }`}
        >
          URL
        </button>
        <button
          type="button"
          onClick={() => setUploadType('file')}
          className={`flex-1 px-3 py-1.5 rounded text-xs font-medium transition-colors ${
            uploadType === 'file'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
          }`}
        >
          Upload
        </button>
      </div>

      {uploadType === 'url' ? (
        <input
          type="text"
          value={value.startsWith('data:') ? '' : value}
          onChange={(e) => {
            onChange(e.target.value);
            setPreviewUrl(e.target.value);
          }}
          placeholder={placeholder}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500"
        />
      ) : (
        <div>
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            className={`border-2 border-dashed rounded-lg p-4 text-center transition-colors ${
              isDragging
                ? 'border-blue-500 bg-blue-500/10'
                : 'border-gray-700 hover:border-gray-600'
            }`}
          >
            <input
              type="file"
              accept={accept}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFileSelect(file);
              }}
              className="hidden"
              id="file-upload"
            />
            <label
              htmlFor="file-upload"
              className="cursor-pointer flex flex-col items-center gap-2"
            >
              <Upload className="w-6 h-6 text-gray-500" />
              <span className="text-sm text-gray-400">
                {previewUrl ? 'Change file' : 'Drop file here or click to upload'}
              </span>
              <span className="text-xs text-gray-600">
                {accept.replace('*', 'files')}
              </span>
            </label>
          </div>
        </div>
      )}

      {/* Preview */}
      {previewUrl && (
        <div className="mt-2 bg-gray-800 rounded-lg overflow-hidden">
          {isImage ? (
            <img src={previewUrl} alt="Preview" className="w-full h-32 object-cover" />
          ) : isVideo ? (
            <video src={previewUrl} className="w-full h-32 object-cover" controls />
          ) : isAudio ? (
            <audio src={previewUrl} className="w-full" controls />
          ) : (
            <div className="p-2 text-xs text-gray-500 truncate">{previewUrl}</div>
          )}
          <button
            type="button"
            onClick={() => {
              onChange('');
              setPreviewUrl('');
            }}
            className="w-full py-1 text-xs text-red-400 hover:bg-red-900/20 transition-colors"
          >
            Remove
          </button>
        </div>
      )}
    </div>
  );
});

// Round Edit Modal
interface RoundModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: Partial<Round>) => void;
  round?: Round;
  roundNumber?: number;
}

const RoundModal = memo(({ isOpen, onClose, onSave, round, roundNumber }: RoundModalProps) => {
  const [name, setName] = useState(round?.name || '');
  const [type, setType] = useState<RoundType>(round?.type || 'normal');
  const [coverType, setCoverType] = useState<'url' | 'file' | 'none'>(
    round?.cover ? round.cover.type : 'none'
  );
  const [coverUrl, setCoverUrl] = useState(round?.cover?.value || '');
  const [timerSettings, setTimerSettings] = useState<TimerSettings>(
    round ? {
      readingTimePerLetter: round.readingTimePerLetter ?? DEFAULT_TIMER_SETTINGS.readingTimePerLetter,
      responseWindow: round.responseWindow ?? DEFAULT_TIMER_SETTINGS.responseWindow,
      handicapEnabled: round.handicapEnabled ?? DEFAULT_TIMER_SETTINGS.handicapEnabled,
      handicapDelay: round.handicapDelay ?? DEFAULT_TIMER_SETTINGS.handicapDelay,
    } : DEFAULT_TIMER_SETTINGS
  );

  // Reset form when round changes or modal opens
  useEffect(() => {
    if (isOpen) {
      setName(round?.name || '');
      setType(round?.type || 'normal');
      setCoverType(round?.cover ? round.cover.type : 'none');
      setCoverUrl(round?.cover?.value || '');
      setTimerSettings(round ? {
        readingTimePerLetter: round.readingTimePerLetter ?? DEFAULT_TIMER_SETTINGS.readingTimePerLetter,
        responseWindow: round.responseWindow ?? DEFAULT_TIMER_SETTINGS.responseWindow,
        handicapEnabled: round.handicapEnabled ?? DEFAULT_TIMER_SETTINGS.handicapEnabled,
        handicapDelay: round.handicapDelay ?? DEFAULT_TIMER_SETTINGS.handicapDelay,
      } : DEFAULT_TIMER_SETTINGS);
    }
  }, [isOpen, round]);

  const handleSave = useCallback(() => {
    onSave({
      name,
      type,
      ...(coverType !== 'none' && coverUrl ? { cover: { type: coverType, value: coverUrl } } : {}),
      ...timerSettings,
    });
    onClose();
  }, [name, type, coverType, coverUrl, timerSettings, onSave, onClose]);

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
        {coverType !== 'none' ? (
          <FileUpload
            value={coverUrl}
            onChange={(val) => {
              setCoverUrl(val);
              if (val && !coverType) setCoverType(val.startsWith('data:') ? 'file' : 'url');
            }}
            accept="image/*"
            label="Cover Image"
          />
        ) : (
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">Cover Image</label>
            <button
              type="button"
              onClick={() => setCoverType('url')}
              className="w-full py-3 border-2 border-dashed border-gray-700 rounded-lg text-gray-500 hover:border-gray-600 hover:text-gray-400 transition-colors"
            >
              + Add Cover Image
            </button>
          </div>
        )}
        {coverType !== 'none' && (
          <button
            type="button"
            onClick={() => {
              setCoverType('none');
              setCoverUrl('');
            }}
            className="text-xs text-red-400 hover:text-red-300"
          >
            Remove cover
          </button>
        )}

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
          <Button variant="secondary" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button className="flex-1" onClick={handleSave}>Save</Button>
        </div>
      </div>
    </BaseModal>
  );
});

// Theme Edit Modal
interface ThemeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: Partial<Theme>) => void;
  theme?: Theme;
}

const ThemeModal = memo(({ isOpen, onClose, onSave, theme }: ThemeModalProps) => {
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

// Question Edit Modal
interface QuestionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: Partial<Question>) => void;
  question?: Question;
}

const QuestionModal = memo(({ isOpen, onClose, onSave, question }: QuestionModalProps) => {
  const [text, setText] = useState(question?.text || '');
  const [hasAnswers, setHasAnswers] = useState(question?.answers !== undefined);
  const [answers, setAnswers] = useState<string[]>(question?.answers || ['', '', '', '']);
  const [correctAnswer, setCorrectAnswer] = useState(question?.correctAnswer ?? 0);
  const [points, setPoints] = useState(question?.points ?? 100);
  const [mediaUrl, setMediaUrl] = useState(question?.media?.url || '');

  // Answer fields
  const [answerText, setAnswerText] = useState(question?.answerText || '');
  const [answerMediaUrl, setAnswerMediaUrl] = useState(question?.answerMedia?.url || '');

  // Reset form when question changes or modal opens
  useEffect(() => {
    if (isOpen) {
      setText(question?.text || '');
      setHasAnswers(question?.answers !== undefined);
      setAnswers(question?.answers || ['', '', '', '']);
      setCorrectAnswer(question?.correctAnswer ?? 0);
      setPoints(question?.points ?? 100);
      setMediaUrl(question?.media?.url || '');
      setAnswerText(question?.answerText || '');
      setAnswerMediaUrl(question?.answerMedia?.url || '');
    }
  }, [isOpen, question]);

  const handleSave = useCallback(() => {
    onSave({
      text,
      ...(hasAnswers ? {
        answers: answers.filter(a => a.trim() !== ''),
        correctAnswer,
      } : {}),
      points,
      ...(mediaUrl ? { media: { type: 'image', url: mediaUrl } } : {}),
      // Save answer fields
      ...(answerText ? { answerText } : {}),
      ...(answerMediaUrl ? { answerMedia: { type: 'image', url: answerMediaUrl } } : {}),
    });
    onClose();
  }, [text, hasAnswers, answers, correctAnswer, points, mediaUrl, answerText, answerMediaUrl, onSave, onClose]);

  if (!isOpen) return null;

  return (
    <BaseModal isOpen={isOpen} onClose={onClose} title={question ? 'Edit Question' : 'Add Question'} maxWidth="max-w-4xl">
      <div className="space-y-4">
        {/* Question Text */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1.5">Question</label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Enter your question..."
            rows={3}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500 resize-none"
          />
        </div>

        {/* Points */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1.5">Points</label>
          <input
            type="number"
            min="0"
            value={points}
            onChange={(e) => setPoints(parseInt(e.target.value) || 0)}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500"
          />
        </div>

        {/* Question Media (Image Only) */}
        <FileUpload
          value={mediaUrl}
          onChange={setMediaUrl}
          accept="image/*"
          placeholder="https://example.com/image.jpg"
          label="Question Image (optional)"
        />

        {/* ========== ANSWER SECTION ========== */}
        <div className="border-t border-gray-700 pt-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-0.5 h-4 bg-green-500"></div>
            <span className="text-sm font-medium text-green-400">Answer</span>
          </div>

          {/* Multiple Choice Toggle */}
          <div className="bg-gray-800/50 rounded-lg p-3 mb-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-300">Multiple Choice Mode</span>
              <button
                onClick={() => setHasAnswers(!hasAnswers)}
                className={`w-11 h-6 rounded-full transition-colors ${hasAnswers ? 'bg-blue-600' : 'bg-gray-700'}`}
              >
                <div className={`w-5 h-5 bg-white rounded-full transition-transform ${hasAnswers ? 'translate-x-6' : 'translate-x-0.5'}`} />
              </button>
            </div>
          </div>

          {/* Multiple Choice Answers */}
          {hasAnswers && (
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Answer Choices</label>
              <div className="space-y-2">
                {answers.map((answer, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <button
                      onClick={() => setCorrectAnswer(idx)}
                      className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${
                        correctAnswer === idx ? 'bg-green-500 border-green-500' : 'border-gray-600 hover:border-gray-500'
                      }`}
                    >
                      {correctAnswer === idx && <div className="w-2 h-2 bg-white rounded-full" />}
                    </button>
                    <input
                      type="text"
                      value={answer}
                      onChange={(e) => {
                        const newAnswers = [...answers];
                        newAnswers[idx] = e.target.value;
                        setAnswers(newAnswers);
                      }}
                      placeholder={`Answer ${idx + 1}`}
                      className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                    />
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-500 mt-1">Select the circle next to correct answer</p>
            </div>
          )}

          {/* Text Answer (for non-multiple choice) */}
          {!hasAnswers && (
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">Answer Text</label>
              <textarea
                value={answerText}
                onChange={(e) => setAnswerText(e.target.value)}
                placeholder="Enter the correct answer..."
                rows={2}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-green-500 resize-none"
              />
            </div>
          )}

          {/* Answer Image (always available) */}
          <FileUpload
            value={answerMediaUrl}
            onChange={setAnswerMediaUrl}
            accept="image/*"
            placeholder="https://example.com/answer.jpg"
            label="Answer Image (optional)"
          />
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-2">
          <Button variant="secondary" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button className="flex-1" onClick={handleSave}>Save</Button>
        </div>
      </div>
    </BaseModal>
  );
});

// ============= CARD COMPONENTS =============

interface CardProps {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  onClick?: () => void;
  onEdit?: () => void;
  isActive?: boolean;
}

const Card = memo(({ title, subtitle, icon, onClick, onEdit, isActive }: CardProps) => (
  <div
    className={`relative bg-gray-800/80 border rounded-lg p-3 transition-all cursor-pointer group h-full flex items-center ${
      isActive ? 'border-blue-500 bg-blue-500/10' : 'border-gray-700 hover:border-gray-600'
    } ${onClick ? 'hover:bg-gray-750' : ''}`}
    onClick={onClick}
  >
    {icon && (
      <div className="absolute top-3 right-3 opacity-50 group-hover:opacity-100 transition-opacity" onClick={(e) => { e.stopPropagation(); onEdit?.(); }}>
        {icon}
      </div>
    )}
    <div className="pr-8">
      <div className="text-sm font-medium text-white truncate">{title}</div>
      {subtitle && <div className="text-xs text-gray-500 mt-0.5">{subtitle}</div>}
    </div>
  </div>
));

// ============= MAIN EDITOR =============

interface PackEditorProps {
  isOpen: boolean;
  onClose: () => void;
  onSavePack: (pack: GamePack) => void;
  initialPack?: GamePack;
}

export const PackEditor = memo(({ isOpen, onClose, onSavePack, initialPack }: PackEditorProps) => {
  const [packName, setPackName] = useState(initialPack?.name || '');
  const [packCoverType, setPackCoverType] = useState<'url' | 'file' | 'none'>(
    initialPack?.cover ? initialPack.cover.type : 'none'
  );
  const [packCoverValue, setPackCoverValue] = useState(initialPack?.cover?.value || '');
  const [rounds, setRounds] = useState<Round[]>(initialPack?.rounds || []);
  const [selectedRoundId, setSelectedRoundId] = useState<string | null>(null);
  const [selectedThemeId, setSelectedThemeId] = useState<string | null>(null);
  const [showPackSettings, setShowPackSettings] = useState(false);

  // Sync with initialPack when it changes
  React.useEffect(() => {
    if (initialPack) {
      setPackName(initialPack.name);
      setPackCoverType(initialPack.cover ? initialPack.cover.type : 'none');
      setPackCoverValue(initialPack.cover?.value || '');
      setRounds(initialPack.rounds || []);
      setSelectedRoundId(null);
      setSelectedThemeId(null);
    }
  }, [initialPack]);

  // Modal states
  const [showRoundModal, setShowRoundModal] = useState(false);
  const [showThemeModal, setShowThemeModal] = useState(false);
  const [showQuestionModal, setShowQuestionModal] = useState(false);
  const [editingRound, setEditingRound] = useState<Round | undefined>();
  const [editingTheme, setEditingTheme] = useState<Theme | undefined>();
  const [editingQuestion, setEditingQuestion] = useState<Question | undefined>();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectedRound = useMemo(() => rounds.find(r => r.id === selectedRoundId), [rounds, selectedRoundId]);
  const selectedTheme = useMemo(() => selectedRound?.themes.find(t => t.id === selectedThemeId), [selectedRound, selectedThemeId]);

  // Handle load pack from file (supports both .txt and .json formats)
  const handleLoadPack = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        let pack: GamePack;

        // Try to detect format and parse accordingly
        if (file.name.endsWith('.json') || content.trim().startsWith('{')) {
          // Old JSON format
          pack = JSON.parse(content) as GamePack;
        } else {
          // New text format - parse inline to avoid circular dependency
          pack = (() => {
            const lines = content.split('\n');
            let currentSection: 'questions' | 'rounds' | 'themes' | 'cover' | null = null;
            let packName = 'Imported Pack';
            const questions: Array<{
              roundNum: number;
              themeName: string;
              text: string;
              points?: number;
              answerText?: string;
              mediaUrl?: string;
              mediaType?: 'image' | 'video' | 'audio';
              answers?: string[];
              correctAnswer?: number;
            }> = [];
            const roundSettings: Map<number, Partial<Round>> = new Map();
            const themeSettings: Map<string, { roundNum: number; data: Partial<Theme> }> = new Map();
            let packCover: { type: 'url' | 'file'; value: string } | undefined;

            let currentQuestion: Partial<typeof questions[0]> | null = null;
            let currentRoundNum: number | null = null;
            let currentThemeName: string | null = null;

            const parseValue = (str: string): string => {
              const match = str.match(/^([^:]+):\s*(.*?);$/);
              return match ? match[2].trim() : '';
            };

            for (const line of lines) {
              const trimmed = line.trim();

              // Parse pack name from header
              if (trimmed.startsWith('=== ') && trimmed.endsWith(' ===')) {
                packName = trimmed.slice(4, -4).trim();
                continue;
              }

              // Section headers
              if (trimmed === '--- QUESTIONS ---') {
                currentSection = 'questions';
                continue;
              }
              if (trimmed === '--- ROUND SETTINGS ---') {
                currentSection = 'rounds';
                continue;
              }
              if (trimmed === '--- THEME SETTINGS ---') {
                currentSection = 'themes';
                continue;
              }
              if (trimmed === '--- PACK COVER ---') {
                currentSection = 'cover';
                continue;
              }

              // Skip empty lines and comments
              if (!trimmed || trimmed.startsWith('//')) continue;

              // Parse key-value pairs
              if (trimmed.includes(':') && trimmed.endsWith(';')) {
                const key = trimmed.substring(0, trimmed.indexOf(':')).trim();
                const value = parseValue(trimmed);

                if (currentSection === 'questions') {
                  if (key === 'round') {
                    if (currentQuestion && currentQuestion.roundNum && currentQuestion.themeName && currentQuestion.text) {
                      questions.push({ ...currentQuestion } as typeof questions[0]);
                    }
                    currentQuestion = { roundNum: parseInt(value) || 1 };
                  } else if (key === 'theme') {
                    currentThemeName = value;
                    if (currentQuestion) currentQuestion.themeName = value;
                  } else if (key === 'text' && currentQuestion) {
                    currentQuestion.text = value;
                  } else if (key === 'points' && currentQuestion) {
                    currentQuestion.points = value === 'auto' ? undefined : parseInt(value);
                  } else if (key === 'answerText' && currentQuestion) {
                    currentQuestion.answerText = value;
                  } else if (key === 'url' && currentQuestion) {
                    currentQuestion.mediaUrl = value;
                    if (value.match(/\.(jpg|jpeg|png|gif|webp)$/i)) {
                      currentQuestion.mediaType = 'image';
                    } else if (value.match(/\.(mp4|webm|mov)$/i)) {
                      currentQuestion.mediaType = 'video';
                    } else if (value.match(/\.(mp3|wav|ogg)$/i)) {
                      currentQuestion.mediaType = 'audio';
                    }
                  } else if (key === 'answers' && currentQuestion) {
                    currentQuestion.answers = value.split('|');
                  } else if (key === 'correctAnswer' && currentQuestion) {
                    currentQuestion.correctAnswer = parseInt(value);
                  }
                } else if (currentSection === 'rounds') {
                  if (key === 'round') {
                    currentRoundNum = parseInt(value) || 1;
                    if (!roundSettings.has(currentRoundNum)) {
                      roundSettings.set(currentRoundNum, {});
                    }
                  } else if (currentRoundNum !== null && roundSettings.has(currentRoundNum)) {
                    const settings = roundSettings.get(currentRoundNum)!;
                    if (key === 'name') {
                      settings.name = value;
                    } else if (key === 'type') {
                      settings.type = (value === 'super' ? 'super' : 'normal') as RoundType;
                    } else if (key === 'cover' && value !== '-') {
                      const [type, url] = value.split(':');
                      if (type && url) {
                        settings.cover = { type: type as 'url' | 'file', value: url };
                      }
                    } else if (key === 'readingTimePerLetter') {
                      settings.readingTimePerLetter = parseFloat(value);
                    } else if (key === 'buzzerActivationDelay') {
                      // Legacy support
                      settings.readingTimePerLetter = parseFloat(value);
                    } else if (key === 'responseWindow') {
                      settings.responseWindow = parseInt(value);
                    } else if (key === 'handicapEnabled') {
                      settings.handicapEnabled = value === 'true';
                    } else if (key === 'handicapDelay') {
                      settings.handicapDelay = parseFloat(value);
                    }
                  }
                } else if (currentSection === 'themes') {
                  if (key === 'round') {
                    currentRoundNum = parseInt(value) || 1;
                  } else if (key === 'theme') {
                    currentThemeName = value;
                  } else if (currentRoundNum !== null && currentThemeName) {
                    const key2 = `${currentRoundNum}|${currentThemeName}`;
                    if (!themeSettings.has(key2)) {
                      themeSettings.set(key2, { roundNum: currentRoundNum, data: {} });
                    }
                    const settings = themeSettings.get(key2)!;
                    if (key === 'color' && value !== '-') {
                      settings.data.color = value;
                    }
                    if (key === 'textColor' && value !== '-') {
                      settings.data.textColor = value;
                    }
                  }
                } else if (currentSection === 'cover') {
                  if (key === 'cover' && value !== '-') {
                    const [type, url] = value.split(':');
                    if (type && url) {
                      packCover = { type: type as 'url' | 'file', value: url };
                    }
                  }
                }
              }
            }

            // Don't forget the last question
            if (currentQuestion && currentQuestion.roundNum && currentQuestion.themeName && currentQuestion.text) {
              questions.push({ ...currentQuestion } as typeof questions[0]);
            }

            // Build the pack structure
            const roundsMap = new Map<number, Round>();

            // Initialize rounds from settings
            for (const [roundNum, settings] of roundSettings) {
              roundsMap.set(roundNum, {
                id: crypto.randomUUID(),
                number: roundNum,
                name: settings.name || `Round ${roundNum}`,
                cover: settings.cover,
                readingTimePerLetter: settings.readingTimePerLetter,
                responseWindow: settings.responseWindow,
                handicapEnabled: settings.handicapEnabled,
                handicapDelay: settings.handicapDelay,
                themes: [],
              });
            }

            // Group questions by round and theme, create themes
            for (const q of questions) {
              let round = roundsMap.get(q.roundNum);
              if (!round) {
                round = {
                  id: crypto.randomUUID(),
                  number: q.roundNum,
                  name: `Round ${q.roundNum}`,
                  themes: [],
                };
                roundsMap.set(q.roundNum, round);
              }

              let theme = round.themes.find(t => t.name === q.themeName);
              if (!theme) {
                const themeKey = `${q.roundNum}|${q.themeName}`;
                const themeSettingsData = themeSettings.get(themeKey)?.data || {};

                theme = {
                  id: crypto.randomUUID(),
                  name: q.themeName,
                  color: themeSettingsData.color,
                  textColor: themeSettingsData.textColor,
                  questions: [],
                };
                round.themes.push(theme);
              }

              const question: Question = {
                id: crypto.randomUUID(),
                text: q.text,
                points: q.points,
                answerText: q.answerText,
              };

              if (q.mediaUrl && q.mediaType) {
                question.media = { type: q.mediaType, url: q.mediaUrl };
              }
              if (q.answers) {
                question.answers = q.answers;
              }
              if (q.correctAnswer !== undefined) {
                question.correctAnswer = q.correctAnswer;
              }

              theme.questions.push(question);
            }

            // Sort rounds by number and themes alphabetically
            const rounds = Array.from(roundsMap.values()).sort((a, b) => a.number - b.number);
            for (const round of rounds) {
              round.themes.sort((a, b) => a.name.localeCompare(b.name));
            }

            return {
              id: crypto.randomUUID(),
              name: packName,
              cover: packCover,
              gameType: 'custom' as const,
              rounds,
              createdAt: Date.now(),
              updatedAt: Date.now(),
            };
          })();
        }

        setPackName(pack.name || 'Loaded Pack');
        setPackCoverType(pack.cover ? pack.cover.type : 'none');
        setPackCoverValue(pack.cover?.value || '');
        console.log('[PackEditor] Loaded pack cover:', pack.cover, '-> packCoverType:', pack.cover ? pack.cover.type : 'none', 'packCoverValue:', pack.cover?.value || '');
        setRounds(pack.rounds || []);
        setSelectedRoundId(null);
        setSelectedThemeId(null);
      } catch (error) {
        console.error('Failed to parse pack file:', error);
      }
    };
    reader.readAsText(file);
    // Reset input so same file can be loaded again
    e.target.value = '';
  }, []);

  // Convert pack to text format
  const packToTextFormat = useCallback((pack: GamePack): string => {
    const lines: string[] = [];

    // Header
    lines.push(`=== ${pack.name} ===`);
    lines.push('');

    // Collect all questions with round/theme info
    const questionsList: Array<{
      roundNum: number;
      roundName: string;
      themeName: string;
      text: string;
      points?: number;
      answerText?: string;
      mediaUrl?: string;
      mediaType?: 'image' | 'video' | 'audio';
      answers?: string[];
      correctAnswer?: number;
    }> = [];

    for (const round of pack.rounds) {
      for (const theme of round.themes) {
        for (const question of theme.questions) {
          questionsList.push({
            roundNum: round.number,
            roundName: round.name,
            themeName: theme.name,
            text: question.text,
            points: question.points,
            answerText: question.answerText,
            mediaUrl: question.media?.url,
            mediaType: question.media?.type,
            answers: question.answers,
            correctAnswer: question.correctAnswer,
          });
        }
      }
    }

    // Questions section
    lines.push('--- QUESTIONS ---');
    lines.push('');
    for (const q of questionsList) {
      lines.push(`round: ${q.roundNum};`);
      lines.push(`theme: ${q.themeName};`);
      lines.push(`text: ${q.text};`);
      lines.push(`points: ${q.points ?? 'auto'};`);
      if (q.answerText) {
        lines.push(`answerText: ${q.answerText};`);
      }
      if (q.mediaUrl) {
        lines.push(`url: ${q.mediaUrl};`);
      } else {
        lines.push(`file: - ;`);
      }
      if (q.answers && q.answers.length > 0) {
        lines.push(`answers: ${q.answers.join('|')};`);
        if (q.correctAnswer !== undefined) {
          lines.push(`correctAnswer: ${q.correctAnswer};`);
        }
      }
      lines.push('');
    }

    // Round settings section
    lines.push('--- ROUND SETTINGS ---');
    lines.push('');
    for (const round of pack.rounds) {
      lines.push(`round: ${round.number};`);
      lines.push(`name: ${round.name};`);
      lines.push(`type: ${round.type ?? 'normal'};`);
      if (round.cover?.value) {
        lines.push(`cover: url:${round.cover.value};`);
      } else {
        lines.push(`cover: -;`);
      }
      lines.push(`readingTimePerLetter: ${round.readingTimePerLetter ?? 0.05};`);
      lines.push(`responseWindow: ${round.responseWindow ?? 30};`);
      lines.push(`handicapEnabled: ${round.handicapEnabled ? 'true' : 'false'};`);
      lines.push(`handicapDelay: ${round.handicapDelay ?? 1};`);
      lines.push('');
    }

    // Theme settings section
    lines.push('--- THEME SETTINGS ---');
    lines.push('');
    for (const round of pack.rounds) {
      for (const theme of round.themes) {
        lines.push(`round: ${round.number};`);
        lines.push(`theme: ${theme.name};`);
        if (theme.color) {
          lines.push(`color: ${theme.color};`);
        } else {
          lines.push(`color: -;`);
        }
        if (theme.textColor) {
          lines.push(`textColor: ${theme.textColor};`);
        } else {
          lines.push(`textColor: -;`);
        }
        lines.push('');
      }
    }

    // Pack cover
    if (pack.cover?.value) {
      lines.push('--- PACK COVER ---');
      lines.push('');
      const coverLine = `cover: ${pack.cover.type}:${pack.cover.value};`;
      lines.push(coverLine);
      console.log('[PackEditor] Saving pack cover:', coverLine);
      lines.push('');
    } else {
      console.log('[PackEditor] No pack cover to save, cover:', pack.cover);
    }

    return lines.join('\n');
  }, []);

  // Handlers
  const handleSavePack = useCallback(() => {
    const pack: GamePack = {
      id: initialPack?.id || crypto.randomUUID(),
      name: packName,
      ...(packCoverType !== 'none' && packCoverValue ? { cover: { type: packCoverType, value: packCoverValue } } : {}),
      gameType: 'custom',
      rounds,
      createdAt: initialPack?.createdAt || Date.now(),
      updatedAt: Date.now(),
    };

    console.log('[PackEditor] Saving pack with cover:', pack.cover, 'packCoverType:', packCoverType, 'packCoverValue:', packCoverValue);

    // Check if pack contains base64 data (images/videos uploaded as files)
    const hasBase64Data = (
      (pack.cover?.value?.startsWith('data:')) ||
      pack.rounds.some(round =>
        (round.cover?.value?.startsWith('data:')) ||
        round.themes.some(theme =>
          theme.questions.some(q =>
            (q.media?.url?.startsWith('data:')) ||
            (q.answerMedia?.url?.startsWith('data:'))
          )
        )
      )
    );

    let dataStr: string;
    let fileName: string;
    let mimeType: string;

    if (hasBase64Data) {
      // Use JSON format for packs with base64 data
      dataStr = JSON.stringify(pack, null, 2);
      fileName = `${pack.name.replace(/[^a-z0-9]/gi, '_')}.json`;
      mimeType = 'application/json';
    } else {
      // Use text format for packs without base64 data (more human-readable)
      dataStr = packToTextFormat(pack);
      fileName = `${pack.name.replace(/[^a-z0-9]/gi, '_')}.txt`;
      mimeType = 'text/plain';
    }

    const dataBlob = new Blob([dataStr], { type: mimeType });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [packName, packCoverType, packCoverValue, rounds, initialPack, packToTextFormat]);

  const handleAddRound = useCallback((data: Partial<Round>) => {
    if (editingRound) {
      setRounds(prev => prev.map(r => r.id === editingRound.id ? { ...r, ...data } : r));
      setEditingRound(undefined);
    } else {
      const newRound: Round = {
        id: crypto.randomUUID(),
        number: rounds.length + 1,
        name: data.name || `Round ${rounds.length + 1}`,
        themes: [],
        ...data,
      };
      setRounds(prev => [...prev, newRound]);
    }
    setShowRoundModal(false);
  }, [rounds.length, editingRound]);

  const handleAddTheme = useCallback((data: Partial<Theme>) => {
    if (!selectedRound) return;
    if (editingTheme) {
      setRounds(prev => prev.map(r => r.id === selectedRound.id
        ? { ...r, themes: r.themes.map(t => t.id === editingTheme.id ? { ...t, ...data } : t) }
        : r
      ));
      setEditingTheme(undefined);
    } else {
      const newTheme: Theme = {
        id: crypto.randomUUID(),
        name: data.name || 'New Theme',
        questions: [],
        ...data,
      };
      setRounds(prev => prev.map(r => r.id === selectedRound.id ? { ...r, themes: [...r.themes, newTheme] } : r));
    }
    setShowThemeModal(false);
  }, [selectedRound, editingTheme]);

  const handleAddQuestion = useCallback((data: Partial<Question>) => {
    if (!selectedTheme || !selectedRound) return;
    if (editingQuestion) {
      setRounds(prev => prev.map(r => r.id === selectedRound.id
        ? {
            ...r,
            themes: r.themes.map(t => t.id === selectedTheme.id
              ? { ...t, questions: t.questions.map(q => q.id === editingQuestion.id ? { ...q, ...data } : q) }
              : t
            )
          }
        : r
      ));
      setEditingQuestion(undefined);
    } else {
      const newQuestion: Question = {
        id: crypto.randomUUID(),
        text: data.text || '',
        answers: data.answers,
        correctAnswer: data.correctAnswer,
        points: data.points,
        media: data.media,
        ...data,
      };
      setRounds(prev => prev.map(r => r.id === selectedRound.id
        ? {
            ...r,
            themes: r.themes.map(t => t.id === selectedTheme.id
              ? { ...t, questions: [...t.questions, newQuestion] }
              : t
            )
          }
        : r
      ));
    }
    setShowQuestionModal(false);
  }, [selectedTheme, selectedRound, editingQuestion]);

  const handleDeleteRound = useCallback((roundId: string) => {
    setRounds(prev => prev.filter(r => r.id !== roundId));
    if (selectedRoundId === roundId) setSelectedRoundId(null);
  }, [selectedRoundId]);

  const handleDeleteTheme = useCallback((themeId: string) => {
    if (!selectedRound) return;
    setRounds(prev => prev.map(r => r.id === selectedRound.id
      ? { ...r, themes: r.themes.filter(t => t.id !== themeId) }
      : r
    ));
    if (selectedThemeId === themeId) setSelectedThemeId(null);
  }, [selectedRound, selectedThemeId]);

  const handleDeleteQuestion = useCallback((questionId: string) => {
    if (!selectedRound || !selectedTheme) return;
    setRounds(prev => prev.map(r => r.id === selectedRound.id
      ? {
          ...r,
          themes: r.themes.map(t => t.id === selectedTheme.id
            ? { ...t, questions: t.questions.filter(q => q.id !== questionId) }
            : t
          )
        }
      : r
    ));
  }, [selectedRound, selectedTheme]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />

      {/* Main Editor */}
      <div className="relative w-full h-full bg-gray-950 flex flex-col">
        {/* Top Menu */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800 bg-gray-900/50">
          <h2 className="text-xl font-bold text-white">Pack Editor</h2>

          {/* Pack Name with Settings Button */}
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={packName}
              onChange={(e) => setPackName(e.target.value)}
              placeholder="Pack Name"
              className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white text-sm w-64 focus:outline-none focus:border-blue-500"
            />
            <button
              onClick={() => setShowPackSettings(true)}
              className="p-2 hover:bg-gray-700 rounded-lg text-gray-400 hover:text-white transition-colors"
              title="Pack Settings"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>

          <div className="flex gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept=".txt,.json"
              onChange={handleLoadPack}
              className="hidden"
            />
            <Button variant="secondary" onClick={onClose}>
              <FolderOpen className="w-4 h-4 mr-2" /> Back to Lobby
            </Button>
            <Button variant="secondary" onClick={() => fileInputRef.current?.click()}>
              <Upload className="w-4 h-4 mr-2" /> Load Pack
            </Button>
            <Button onClick={handleSavePack}>
              <Save className="w-4 h-4 mr-2" /> Save Pack
            </Button>
          </div>
        </div>

        {/* Three Columns */}
        <div className="flex-1 grid grid-cols-3 gap-0 divide-x divide-gray-800 overflow-hidden">
          {/* Column 1: Rounds */}
          <div className="flex flex-col bg-gray-900/30">
            <div className="px-4 py-3 border-b border-gray-800">
              <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wide">Rounds ({rounds.length})</h3>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {rounds.map(round => (
                <div key={round.id} className="relative group">
                  <Card
                    title={`${round.number}. ${round.name}`}
                    subtitle={`${round.themes.length} themes • ${round.themes.reduce((acc, t) => acc + t.questions.length, 0)} questions`}
                    isActive={selectedRoundId === round.id}
                    onClick={() => setSelectedRoundId(round.id)}
                    icon={
                      <div className="flex gap-1">
                        <button
                          onClick={(e) => { e.stopPropagation(); setEditingRound(round); setShowRoundModal(true); }}
                          className="p-1 hover:bg-gray-700 rounded"
                        >
                          <Edit2 className="w-3.5 h-3.5 text-gray-400" />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDeleteRound(round.id); }}
                          className="p-1 hover:bg-red-900/50 rounded"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-red-400" />
                        </button>
                      </div>
                    }
                  />
                  {round.buzzerActivationDelay !== undefined && (
                    <div className="absolute bottom-2 right-2 flex items-center gap-1 text-xs text-blue-400">
                      <Clock className="w-3 h-3" />
                    </div>
                  )}
                </div>
              ))}
              <Button
                variant="secondary"
                className="w-full"
                onClick={() => { setEditingRound(undefined); setShowRoundModal(true); }}
              >
                <Plus className="w-4 h-4 mr-2" /> Add Round
              </Button>
            </div>
          </div>

          {/* Column 2: Themes */}
          <div className={`flex flex-col bg-gray-900/30 ${!selectedRound ? 'opacity-50 pointer-events-none' : ''}`}>
            <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wide">Themes ({selectedRound?.themes.length || 0})</h3>
              {selectedRound && (
                <div className="text-xs text-gray-500 truncate ml-2">{selectedRound.name}</div>
              )}
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {selectedRound?.themes.map(theme => (
                <div key={theme.id} className="relative group h-14">
                  <Card
                    title={theme.name}
                    subtitle={`${theme.questions.length} questions`}
                    isActive={selectedThemeId === theme.id}
                    onClick={() => setSelectedThemeId(theme.id)}
                    icon={
                      <div className="flex gap-1">
                        <button
                          onClick={(e) => { e.stopPropagation(); setEditingTheme(theme); setShowThemeModal(true); }}
                          className="p-1 hover:bg-gray-700 rounded"
                        >
                          <Edit2 className="w-3.5 h-3.5 text-gray-400" />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDeleteTheme(theme.id); }}
                          className="p-1 hover:bg-red-900/50 rounded"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-red-400" />
                        </button>
                      </div>
                    }
                  />
                </div>
              ))}
              <Button
                variant="secondary"
                className="w-full"
                disabled={!selectedRound}
                onClick={() => { setEditingTheme(undefined); setShowThemeModal(true); }}
              >
                <Plus className="w-4 h-4 mr-2" /> Add Theme
              </Button>
            </div>
          </div>

          {/* Column 3: Questions */}
          <div className={`flex flex-col bg-gray-900/30 ${!selectedTheme ? 'opacity-50 pointer-events-none' : ''}`}>
            <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wide">Questions ({selectedTheme?.questions.length || 0})</h3>
              {selectedTheme && (
                <div className="text-xs text-gray-500 truncate ml-2">{selectedTheme.name}</div>
              )}
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {selectedTheme?.questions.map((question, idx) => (
                <div key={question.id} className="relative group">
                  <Card
                    title={`Q${idx + 1}: ${question.text.slice(0, 50)}${question.text.length > 50 ? '...' : ''}`}
                    subtitle={`${question.points || 100} pts`}
                    icon={
                      <div className="flex gap-1">
                        <button
                          onClick={(e) => { e.stopPropagation(); setEditingQuestion(question); setShowQuestionModal(true); }}
                          className="p-1 hover:bg-gray-700 rounded"
                        >
                          <Edit2 className="w-3.5 h-3.5 text-gray-400" />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDeleteQuestion(question.id); }}
                          className="p-1 hover:bg-red-900/50 rounded"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-red-400" />
                        </button>
                      </div>
                    }
                  />
                  {question.media && (
                    <div className="absolute bottom-2 right-10">
                      <ImageIcon className="w-3.5 h-3.5 text-purple-400" />
                    </div>
                  )}
                </div>
              ))}
              <Button
                variant="secondary"
                className="w-full"
                disabled={!selectedTheme}
                onClick={() => { setEditingQuestion(undefined); setShowQuestionModal(true); }}
              >
                <Plus className="w-4 h-4 mr-2" /> Add Question
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Modals */}
      <RoundModal
        isOpen={showRoundModal}
        onClose={() => setShowRoundModal(false)}
        onSave={handleAddRound}
        round={editingRound}
        roundNumber={rounds.length + 1}
      />
      <ThemeModal
        isOpen={showThemeModal}
        onClose={() => setShowThemeModal(false)}
        onSave={handleAddTheme}
        theme={editingTheme}
      />
      <QuestionModal
        isOpen={showQuestionModal}
        onClose={() => setShowQuestionModal(false)}
        onSave={handleAddQuestion}
        question={editingQuestion}
      />

      {/* Pack Settings Modal */}
      <BaseModal isOpen={showPackSettings} onClose={() => setShowPackSettings(false)} title="Pack Settings">
        <div className="space-y-4">
          {/* Cover Image */}
          {packCoverType !== 'none' ? (
            <FileUpload
              value={packCoverValue}
              onChange={(val) => {
                setPackCoverValue(val);
                if (val && !packCoverType || packCoverType === 'none') {
                  setPackCoverType(val.startsWith('data:') ? 'file' : 'url');
                }
              }}
              accept="image/*"
              label="Pack Cover"
            />
          ) : (
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Pack Cover</label>
              <button
                type="button"
                onClick={() => setPackCoverType('url')}
                className="w-full py-3 border-2 border-dashed border-gray-700 rounded-lg text-gray-500 hover:border-gray-600 hover:text-gray-400 transition-colors"
              >
                + Add Pack Cover
              </button>
            </div>
          )}
          {packCoverType !== 'none' && (
            <button
              type="button"
              onClick={() => {
                setPackCoverType('none');
                setPackCoverValue('');
              }}
              className="text-xs text-red-400 hover:text-red-300"
            >
              Remove cover
            </button>
          )}

          <div className="flex justify-end pt-4">
            <Button onClick={() => setShowPackSettings(false)}>Done</Button>
          </div>
        </div>
      </BaseModal>
    </div>
  );
});
