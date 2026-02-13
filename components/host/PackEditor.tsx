/**
 * PackEditor Component
 *
 * Three-column editor for creating game packs.
 * Uses modular components from packeditor/ subdirectory.
 */

import React, { memo, useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  X, Save, FolderOpen, Plus, Settings, Edit2, Trash2, Upload,
  Image as ImageIcon, Clock
} from 'lucide-react';
import { Button } from '../Button';
import { generateUUID } from '../../utils/uuid';
import type { GamePack, Round, Theme, Question, RoundType } from './packeditor/types';
import {
  BaseModal, FileUpload, RoundModal, ThemeModal, QuestionModal
} from './packeditor/index';

// ============= CARD COMPONENT =============

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

Card.displayName = 'Card';

// ============= PACK IMPORT/EXPORT UTILS =============

/**
 * Parse pack from text format
 */
function parsePackFromText(content: string): GamePack {
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

  // Build pack structure
  const roundsMap = new Map<number, Round>();

  // Initialize rounds from settings
  for (const [roundNum, settings] of roundSettings) {
    roundsMap.set(roundNum, {
      id: generateUUID(),
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
        id: generateUUID(),
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
        id: generateUUID(),
        name: q.themeName,
        color: themeSettingsData.color,
        textColor: themeSettingsData.textColor,
        questions: [],
      };
      round.themes.push(theme);
    }

    const question: Question = {
      id: generateUUID(),
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
    id: generateUUID(),
    name: packName,
    cover: packCover,
    gameType: 'custom' as const,
    rounds,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

/**
 * Convert pack to text format
 */
function packToTextFormat(pack: GamePack): string {
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
    lines.push(`cover: ${pack.cover.type}:${pack.cover.value};`);
    lines.push('');
  }

  return lines.join('\n');
}

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
          // New text format
          pack = parsePackFromText(content);
        }

        setPackName(pack.name || 'Loaded Pack');
        setPackCoverType(pack.cover ? pack.cover.type : 'none');
        setPackCoverValue(pack.cover?.value || '');
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

  // Handlers
  const handleSavePack = useCallback(() => {
    const pack: GamePack = {
      id: initialPack?.id || generateUUID(),
      name: packName,
      ...(packCoverType !== 'none' && packCoverValue ? { cover: { type: packCoverType, value: packCoverValue } } : {}),
      gameType: 'custom',
      rounds,
      createdAt: initialPack?.createdAt || Date.now(),
      updatedAt: Date.now(),
    };

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
  }, [packName, packCoverType, packCoverValue, rounds, initialPack]);

  const handleAddRound = useCallback((data: Partial<Round>) => {
    if (editingRound) {
      setRounds(prev => prev.map(r => r.id === editingRound.id ? { ...r, ...data } : r));
      setEditingRound(undefined);
    } else {
      const newRound: Round = {
        id: generateUUID(),
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
        id: generateUUID(),
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
        id: generateUUID(),
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
                  {round.readingTimePerLetter !== undefined && round.readingTimePerLetter > 0 && (
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
                if (val && (packCoverType === 'none' || !packCoverType)) {
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

PackEditor.displayName = 'PackEditor';

// Re-export types for compatibility
export type { GamePack, Round, Theme, Question, RoundType } from './packeditor/types';
