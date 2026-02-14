/**
 * Game Intro Screens Component
 * Displays pack cover, themes list, and round intro screens
 */

import React, { memo } from 'react';
import type { Round, Theme } from '../PackEditor';
import type { GamePack } from '../GameSelectorModal';
import { calculateThemeCardFontSize } from './fontUtils';

interface CoverScreenProps {
  pack: GamePack;
  onNext: () => void;
}

export const CoverScreen = memo(({ pack, onNext }: CoverScreenProps) => {
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.code === 'Space' || e.code === 'Enter') {
      onNext();
    }
  };

  return (
    <div
      className="h-full flex flex-col items-center justify-center bg-gray-950 text-white p-8 cursor-pointer"
      onClick={onNext}
      tabIndex={0}
      onKeyDown={handleKeyPress}
    >
      <div className="max-w-4xl w-full text-center">
        {pack.cover && (
          <div className="mb-12">
            {pack.cover.type === 'url' ? (
              <img
                src={pack.cover.value}
                alt={pack.name}
                className="max-h-[50vh] mx-auto rounded-xl shadow-2xl"
              />
            ) : null}
          </div>
        )}
        <h1 className="text-7xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 mb-4">
          {pack.name}
        </h1>
        <p className="text-gray-500 text-xl mt-8">Нажмите Space или кликните, чтобы продолжить</p>
      </div>
    </div>
  );
});

CoverScreen.displayName = 'CoverScreen';

interface ThemesScreenProps {
  round: Round;
  onNext: () => void;
}

export const ThemesScreen = memo(({ round, onNext }: ThemesScreenProps) => {
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.code === 'Space' || e.code === 'Enter') {
      onNext();
    }
  };

  return (
    <div
      className="h-full flex flex-col items-center justify-center bg-gray-950 text-white p-8 cursor-pointer"
      onClick={onNext}
      tabIndex={0}
      onKeyDown={handleKeyPress}
    >
      <div className="max-w-5xl w-full">
        <h2 className="text-4xl font-bold text-blue-400 mb-12 text-center">Темы раунда</h2>
        <div className="grid grid-cols-3 gap-8">
          {round.themes?.map((theme) => (
            <div
              key={theme.id}
              className="bg-gray-900 border-2 border-blue-500/30 rounded-xl p-8 shadow-xl"
            >
              <h3
                className="text-white font-bold text-center"
                style={{
                  fontSize: `${calculateThemeCardFontSize(theme.name)}px`
                }}
              >
                {theme.name}
              </h3>
            </div>
          ))}
        </div>
        <p className="text-gray-500 text-xl mt-12 text-center">Нажмите Space или кликните, чтобы продолжить</p>
      </div>
    </div>
  );
});

ThemesScreen.displayName = 'ThemesScreen';

interface RoundScreenProps {
  round: Round;
  roundIndex: number;
  totalRounds: number;
  onNext: () => void;
}

export const RoundScreen = memo(({ round, roundIndex, totalRounds, onNext }: RoundScreenProps) => {
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.code === 'Space' || e.code === 'Enter') {
      onNext();
    }
  };

  return (
    <div
      className="h-full flex flex-col items-center justify-center bg-gray-950 text-white p-8 cursor-pointer"
      onClick={onNext}
      tabIndex={0}
      onKeyDown={handleKeyPress}
    >
      <div className="max-w-4xl w-full text-center">
        <div className="inline-block bg-blue-600 text-white px-6 py-2 rounded-full text-lg font-bold mb-8">
          Раунд {roundIndex + 1} из {totalRounds}
        </div>

        {round.cover && (
          <div className="mb-12">
            {round.cover.type === 'url' ? (
              <img
                src={round.cover.value}
                alt={round.name || `Round ${roundIndex + 1}`}
                className="max-h-[40vh] mx-auto rounded-xl shadow-2xl"
              />
            ) : null}
          </div>
        )}

        {round.name && (
          <h1 className="text-6xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-400 mb-4">
            {round.name}
          </h1>
        )}

        <p className="text-gray-500 text-xl mt-12">Нажмите Space или кликните, чтобы продолжить</p>
      </div>
    </div>
  );
});

RoundScreen.displayName = 'RoundScreen';
