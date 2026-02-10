/**
 * GameSelectorModal Component
 *
 * Modal for selecting game type and managing game packs:
 * - Dropdown to select game type
 * - Load pack from local file
 * - Create new pack with built-in editor
 * - Multi-pack selection (up to 10)
 * - Rounds are merged by number across selected packs
 */

import React, { memo, useState, useCallback, useRef, useMemo, lazy, Suspense } from 'react';
import { X, Upload, Plus, FolderOpen, FileText, Gamepad2, Check, ChevronDown, Layers } from 'lucide-react';
import { Button } from '../Button';
// Lazy load PackEditor to reduce initial bundle size
const PackEditor = lazy(() => import('./PackEditor').then(m => ({ default: m.PackEditor })));
// Import types only (no code execution)
import type { GamePack as PackGamePack, Round, Theme, Question as PackQuestion, RoundType } from './PackEditor';

export type GameType = 'custom' | 'quiz' | 'trivia';

// Combined pack interface that supports both old and new formats
export interface GamePack {
  id: string;
  name: string;
  cover?: {
    type: 'url' | 'file';
    value: string;
  };
  gameType: GameType;
  questions?: Question[];
  rounds?: Round[];
  themes?: Theme[];
  createdAt: number;
  updatedAt?: number;
}

export interface Question {
  id: string;
  text: string;
  answers?: string[];
  correctAnswer?: number;
  media?: {
    type: 'image' | 'video' | 'audio';
    url?: string;
    file?: File;
  };
  timeLimit?: number;
  points?: number;
}

interface GameSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (gameType: GameType, selectedPackIds: string[], packs: GamePack[]) => void;
  initialGameType?: GameType;
  initialSelectedPackIds?: string[];
  initialPacks?: GamePack[];
}

const GAMES: { id: GameType; name: string; icon: React.ReactNode; enabled: boolean }[] = [
  { id: 'custom', name: 'Своя игра', icon: <Gamepad2 className="w-4 h-4" />, enabled: true },
  { id: 'quiz', name: 'Квиз', icon: <Gamepad2 className="w-4 h-4" />, enabled: false },
  { id: 'trivia', name: 'Викторина', icon: <Gamepad2 className="w-4 h-4" />, enabled: false },
];

const MAX_SELECTED_PACKS = 10;

// Helper to count questions in a pack (handles both old and new formats)
const getQuestionCount = (pack: GamePack | PackGamePack): number => {
  if ('rounds' in pack && pack.rounds) {
    return pack.rounds.reduce((acc, r) =>
      acc + (r.themes?.reduce((tAcc, t) => tAcc + (t.questions?.length || 0), 0) || 0), 0
    );
  }
  if ('questions' in pack && pack.questions) {
    return pack.questions.length;
  }
  return 0;
};

// Helper to get round count
const getRoundCount = (pack: GamePack | PackGamePack): number => {
  if ('rounds' in pack && pack.rounds) {
    return pack.rounds.length;
  }
  return 0;
};

// Helper to get theme count in a pack
const getThemeCount = (pack: GamePack | PackGamePack): number => {
  if ('rounds' in pack && pack.rounds) {
    return pack.rounds.reduce((acc, r) => acc + (r.themes?.length || 0), 0);
  }
  return 0;
};

export const GameSelectorModal = memo(({
  isOpen,
  onClose,
  onSave,
  initialGameType = 'custom',
  initialSelectedPackIds = [],
  initialPacks = [],
}: GameSelectorModalProps) => {
  const [selectedGame, setSelectedGame] = useState<GameType>(initialGameType);
  const [showGameDropdown, setShowGameDropdown] = useState(false);
  const [packs, setPacks] = useState<GamePack[]>(initialPacks);
  const [selectedPackIds, setSelectedPackIds] = useState<string[]>(initialSelectedPackIds);
  const [showPackEditor, setShowPackEditor] = useState(false);
  const [editingPack, setEditingPack] = useState<PackGamePack | undefined>();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Initialize from props when modal opens
  React.useEffect(() => {
    if (isOpen) {
      setSelectedGame(initialGameType);
      setSelectedPackIds(initialSelectedPackIds);
      setPacks(initialPacks);
    }
  }, [isOpen, initialGameType, initialSelectedPackIds, initialPacks]);

  // Calculate session summary from selected packs
  const sessionSummary = useMemo(() => {
    const selectedPacks = packs.filter(p => selectedPackIds.includes(p.id));

    // Find max round count across all packs
    const maxRounds = Math.max(...selectedPacks.map(p => getRoundCount(p)), 0);

    // Count total themes and questions
    let totalThemes = 0;
    let totalQuestions = 0;

    for (let roundNum = 1; roundNum <= maxRounds; roundNum++) {
      selectedPacks.forEach(pack => {
        const round = pack.rounds?.[roundNum - 1];
        if (round) {
          totalThemes += round.themes?.length || 0;
          totalQuestions += round.themes?.reduce((acc, t) => acc + (t.questions?.length || 0), 0) || 0;
        }
      });
    }

    // Add questions from old-format packs (if no rounds)
    selectedPacks.forEach(pack => {
      if (!pack.rounds || pack.rounds.length === 0) {
        totalQuestions += pack.questions?.length || 0;
      }
    });

    return { maxRounds, totalThemes, totalQuestions };
  }, [packs, selectedPackIds]);

  // Reset state when modal opens
  const resetState = useCallback(() => {
    setSelectedGame('custom');
    setShowGameDropdown(false);
    setSelectedPackIds([]);
    setShowPackEditor(false);
    setEditingPack(undefined);
  }, []);

  // Handle game selection
  const handleSelectGame = useCallback((gameId: GameType) => {
    setSelectedGame(gameId);
    setShowGameDropdown(false);
    setSelectedPackIds([]);
  }, []);

  // Parse text format pack (same logic as in PackEditor)
  const parseTextPack = useCallback((content: string): GamePack => {
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
              // Format: url:https://... or file:data:...
              // Split only on first colon to handle data URLs and URLs with colons
              const colonIndex = value.indexOf(':');
              if (colonIndex > 0) {
                const url = value.substring(colonIndex + 1);
                // Always treat as 'url' type for simplicity
                if (url) {
                  settings.cover = { type: 'url', value: url };
                }
              } else {
                // Backward compatibility: if no colon, treat entire value as URL
                settings.cover = { type: 'url', value: value };
              }
            } else if (key === 'readingTimePerLetter') {
              settings.readingTimePerLetter = parseFloat(value);
            } else if (key === 'buzzerActivationDelay') {
              // Legacy support for old packs
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
            // Format: url:https://...
            const colonIndex = value.indexOf(':');
            if (colonIndex > 0) {
              const type = value.substring(0, colonIndex);
              const url = value.substring(colonIndex + 1);
              if (url) {
                packCover = { type: type as 'url' | 'file', value: url };
                console.log('[GameSelector] Parsed pack cover:', packCover);
              }
            } else {
              // Backward compatibility
              packCover = { type: 'url', value: value };
              console.log('[GameSelector] Parsed pack cover (backward compat):', packCover);
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
        type: settings.type,
        cover: settings.cover,
        readingTimePerLetter: settings.readingTimePerLetter ?? 0.05,
        responseWindow: settings.responseWindow ?? 30,
        handicapEnabled: settings.handicapEnabled ?? false,
        handicapDelay: settings.handicapDelay ?? 1,
        themes: [],
      });
    }

    // Group questions by round and theme, create themes
    for (const q of questions) {
      let round = roundsMap.get(q.roundNum);
      if (!round) {
        // Get round settings if they exist, otherwise use defaults
        const roundSettingsData = roundSettings.get(q.roundNum);
        round = {
          id: crypto.randomUUID(),
          number: q.roundNum,
          name: roundSettingsData?.name || `Round ${q.roundNum}`,
          type: roundSettingsData?.type,
          cover: roundSettingsData?.cover,
          readingTimePerLetter: roundSettingsData?.readingTimePerLetter ?? 0.05,
          responseWindow: roundSettingsData?.responseWindow ?? 30,
          handicapEnabled: roundSettingsData?.handicapEnabled ?? false,
          handicapDelay: roundSettingsData?.handicapDelay ?? 1,
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

      const question: PackQuestion = {
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

    const finalPack: GamePack = {
      id: crypto.randomUUID(),
      name: packName,
      cover: packCover,
      gameType: 'custom',
      rounds,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    console.log('[GameSelector] Final parsed pack cover:', finalPack.cover);
    return finalPack;
  }, []);

  // Handle file upload - supports both .json (old) and .txt (new) pack formats
  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
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
          const parsed = JSON.parse(content) as GamePack | PackGamePack;
          const packId = parsed.id || crypto.randomUUID();

          // Normalize rounds to ensure they have all required fields with defaults
          const normalizedRounds = ('rounds' in parsed ? parsed.rounds : []).map((round: any) => ({
            ...round,
            readingTimePerLetter: round.readingTimePerLetter ?? 0.05,
            responseWindow: round.responseWindow ?? 30,
            handicapEnabled: round.handicapEnabled ?? false,
            handicapDelay: round.handicapDelay ?? 1,
          }));

          // Normalize to GamePack format
          pack = {
            id: packId,
            name: parsed.name || 'Untitled Pack',
            gameType: 'gameType' in parsed ? parsed.gameType : 'custom',
            createdAt: parsed.createdAt || Date.now(),
            updatedAt: 'updatedAt' in parsed ? parsed.updatedAt : Date.now(),
            rounds: normalizedRounds,
            ...('questions' in parsed ? { questions: parsed.questions } : {}),
            ...('cover' in parsed ? { cover: parsed.cover } : {}),
          };
        } else {
          // New text format
          pack = parseTextPack(content);
        }

        setPacks(prev => {
          const newPacks = [...prev, pack];
          // Auto-select the newly loaded pack
          setSelectedPackIds(prevIds => [...prevIds, pack.id]);
          return newPacks;
        });
      } catch (error) {
        console.error('Failed to parse pack file:', error);
      }
    };
    reader.readAsText(file);
  }, [parseTextPack]);

  // Handle pack selection toggle
  const handleTogglePack = useCallback((packId: string) => {
    setSelectedPackIds(prev => {
      const isSelected = prev.includes(packId);
      if (isSelected) {
        return prev.filter(id => id !== packId);
      } else {
        if (prev.length >= MAX_SELECTED_PACKS) return prev;
        return [...prev, packId];
      }
    });
  }, []);

  // Handle save - saves selection and closes modal
  const handleSave = useCallback(() => {
    onSave(selectedGame, selectedPackIds, packs);
    onClose();
  }, [selectedGame, selectedPackIds, packs, onSave, onClose]);

  // Handle save from pack editor
  const handleSavePack = useCallback((pack: PackGamePack) => {
    const normalizedPack: GamePack = {
      id: pack.id,
      name: pack.name,
      gameType: pack.gameType,
      rounds: pack.rounds,
      createdAt: pack.createdAt,
      updatedAt: pack.updatedAt,
      cover: pack.cover,
    };

    const existingIndex = packs.findIndex(p => p.id === pack.id);
    if (existingIndex >= 0) {
      setPacks(prev => prev.map((p, idx) => idx === existingIndex ? normalizedPack : p));
    } else {
      setPacks(prev => [...prev, normalizedPack]);
    }
    setShowPackEditor(false);
    setEditingPack(undefined);
  }, [packs]);

  // Handle edit existing pack
  const handleEditPack = useCallback((packId: string) => {
    const pack = packs.find(p => p.id === packId);
    if (pack) {
      // Convert to PackEditor format
      const editorPack: PackGamePack = {
        id: pack.id,
        name: pack.name,
        gameType: pack.gameType,
        rounds: pack.rounds || [],
        createdAt: pack.createdAt,
        updatedAt: pack.updatedAt || Date.now(),
        cover: pack.cover,
      };
      console.log('[GameSelector] Editing pack with cover:', pack.cover);
      setEditingPack(editorPack);
      setShowPackEditor(true);
    }
  }, [packs]);

  // Delete pack
  const handleDeletePack = useCallback((packId: string) => {
    setPacks(prev => prev.filter(p => p.id !== packId));
    setSelectedPackIds(prev => prev.filter(id => id !== packId));
  }, []);

  // Close dropdown when clicking outside
  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (showGameDropdown && !target.closest('.game-dropdown-container')) {
        setShowGameDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showGameDropdown]);

  // Reset state when modal opens/closes
  React.useEffect(() => {
    if (isOpen) {
      resetState();
    }
  }, [isOpen, resetState]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl w-full max-w-2xl h-[80vh] max-h-[80vh] flex flex-col animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-800">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Gamepad2 className="w-5 h-5 text-blue-400" />
            Select Game
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-800 rounded-lg text-gray-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Game Type Selection */}
          <div className="game-dropdown-container">
            <label className="text-sm font-medium text-gray-400 mb-2 block">Game Type</label>
            <div className="relative">
              <button
                onClick={() => setShowGameDropdown(!showGameDropdown)}
                className="w-full bg-gray-950 border border-gray-700 hover:border-gray-600 rounded-lg px-4 py-3 text-white text-left flex items-center justify-between transition-colors"
              >
                <div className="flex items-center gap-2">
                  {GAMES.find(g => g.id === selectedGame)?.icon}
                  <span>{GAMES.find(g => g.id === selectedGame)?.name}</span>
                </div>
                <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${showGameDropdown ? 'rotate-180' : ''}`} />
              </button>

              {showGameDropdown && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-gray-800 border border-gray-700 rounded-lg shadow-xl overflow-hidden z-10">
                  {GAMES.map(game => (
                    <button
                      key={game.id}
                      onClick={() => handleSelectGame(game.id)}
                      disabled={!game.enabled}
                      className={`w-full flex items-center gap-2 px-4 py-3 text-sm text-left transition-colors ${
                        game.id === selectedGame
                          ? 'bg-blue-500/20 text-blue-400'
                          : game.enabled
                            ? 'text-gray-300 hover:bg-gray-700'
                            : 'text-gray-600 cursor-not-allowed'
                      }`}
                    >
                      {game.icon}
                      {game.name}
                      {!game.enabled && (
                        <span className="ml-auto text-xs text-gray-600">Soon</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Pack Management */}
          {selectedGame === 'custom' ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-gray-400">
                  Question Packs ({selectedPackIds.length}/{MAX_SELECTED_PACKS})
                </label>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-2"
                  >
                    <Upload className="w-4 h-4" />
                    Load Pack
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => { setEditingPack(undefined); setShowPackEditor(true); }}
                    className="flex items-center gap-2"
                  >
                    <Plus className="w-4 h-4" />
                    Create Pack
                  </Button>
                </div>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept=".txt,.json"
                onChange={handleFileUpload}
                className="hidden"
              />

              {/* Packs List */}
              {packs.length > 0 && (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {packs.map(pack => {
                    const roundCount = getRoundCount(pack);
                    const questionCount = getQuestionCount(pack);
                    const themeCount = getThemeCount(pack);
                    const isSelected = selectedPackIds.includes(pack.id);
                    return (
                      <div
                        key={pack.id}
                        className={`flex items-center gap-2 p-3 rounded-lg border transition-colors ${
                          isSelected
                            ? 'bg-blue-500/20 border-blue-500'
                            : 'bg-gray-800/50 border-gray-700 hover:border-gray-600'
                        }`}
                      >
                        <button
                          onClick={() => handleTogglePack(pack.id)}
                          disabled={!isSelected && selectedPackIds.length >= MAX_SELECTED_PACKS}
                          className="flex-1 flex items-center justify-between text-left"
                        >
                          <div className="flex items-center gap-2">
                            <FolderOpen className={`w-4 h-4 ${isSelected ? 'text-blue-400' : 'text-gray-500'}`} />
                            <span className={`text-sm font-medium truncate ${isSelected ? 'text-blue-400' : 'text-gray-300'}`}>
                              {pack.name}
                            </span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-xs text-gray-500">
                              {roundCount > 0 ? `${roundCount}r • ` : ''}{themeCount}t • {questionCount}q
                            </span>
                            {isSelected && <Check className="w-4 h-4 text-blue-400" />}
                          </div>
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleEditPack(pack.id); }}
                          className="p-1 hover:bg-gray-700 rounded text-gray-400 hover:text-white transition-colors"
                          title="Edit pack"
                        >
                          <FileText className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDeletePack(pack.id); }}
                          className="p-1 hover:bg-red-900/50 rounded text-gray-400 hover:text-red-400 transition-colors"
                          title="Delete pack"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <div className="bg-gray-800/30 border border-dashed border-gray-700 rounded-lg p-8 text-center">
              <Gamepad2 className="w-12 h-12 mx-auto mb-3 text-gray-600" />
              <p className="text-gray-500">Coming soon for {selectedGame}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex flex-col gap-4 p-6 border-t border-gray-800">
          {/* Session Summary Preview - Always shown */}
          <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-3">
              <Layers className="w-4 h-4 text-purple-400" />
              <h4 className="text-sm font-semibold text-white">Game Session</h4>
            </div>
            <div className="grid grid-cols-3 gap-4 text-xs">
              <div>
                <div className="text-gray-500">Rounds</div>
                <div className="text-lg font-semibold text-white">{sessionSummary.maxRounds}</div>
              </div>
              <div>
                <div className="text-gray-500">Themes</div>
                <div className="text-lg font-semibold text-white">{sessionSummary.totalThemes}</div>
              </div>
              <div>
                <div className="text-gray-500">Questions</div>
                <div className="text-lg font-semibold text-white">{sessionSummary.totalQuestions}</div>
              </div>
            </div>
          </div>

          {/* Buttons */}
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-500">
              {selectedGame === 'custom' && selectedPackIds.length > 0
                ? `${selectedPackIds.length} pack${selectedPackIds.length > 1 ? 's' : ''} selected • ${sessionSummary.totalQuestions} questions`
                : selectedGame === 'custom'
                  ? 'No packs selected'
                  : `${GAMES.find(g => g.id === selectedGame)?.name} mode`
              }
            </div>
            <div className="flex gap-3">
              <Button variant="secondary" onClick={onClose}>
                Cancel
              </Button>
              <Button
                onClick={handleSave}
                className="bg-blue-600 hover:bg-blue-500 text-white"
              >
                Save
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Pack Editor - lazy loaded */}
      <Suspense fallback={null}>
        <PackEditor
          isOpen={showPackEditor}
          onClose={() => { setShowPackEditor(false); setEditingPack(undefined); }}
          onSavePack={handleSavePack}
          initialPack={editingPack}
        />
      </Suspense>
    </div>
  );
});

GameSelectorModal.displayName = 'GameSelectorModal';
