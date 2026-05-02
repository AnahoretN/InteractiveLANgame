/**
 * TeamCardContextMenu Component
 *
 * Right-click context menu for manually setting team status and score
 * Used in GamePlay for team cards
 */

import React, { useEffect, useCallback, useState } from 'react';
import { Check, X, UserX, Circle } from 'lucide-react';
import { TeamStatus, useTeamContextMenu } from '../../hooks/useTeamStatusManager';

interface TeamCardContextMenuProps {
  /** Context menu state and handlers from useTeamContextMenu hook */
  contextMenu: ReturnType<typeof useTeamContextMenu>;
  /** Team scores to get team name from ID */
  teamScores?: Array<{ teamId: string; teamName: string; score: number }>;
  /** Callback when team score is changed */
  onTeamScoreChange?: (teamId: string, newScore: number) => void;
}

const STATUS_BUTTONS = [
  { status: TeamStatus.INACTIVE, color: 'bg-gray-500', label: 'Inactive', icon: UserX },
  { status: TeamStatus.ACTIVE, color: 'bg-yellow-500', label: 'Active', icon: Check },
  { status: TeamStatus.ANSWERING, color: 'bg-green-500', label: 'Answering', icon: Circle },
  { status: TeamStatus.PENALTY, color: 'bg-red-500', label: 'Penalty', icon: X },
];

export const TeamCardContextMenu: React.FC<TeamCardContextMenuProps> = ({
  contextMenu,
  teamScores = [],
  onTeamScoreChange,
}) => {
  const {
    isContextMenuVisible,
    contextMenuPosition,
    contextMenuTeamId,
    hideContextMenu,
    handleContextStatusSelect,
  } = contextMenu;

  // State for score editing
  const [isEditingScore, setIsEditingScore] = useState(false);
  const [editedScore, setEditedScore] = useState('');

  // Find team name and score from teamId
  const team = teamScores.find(t => t.teamId === contextMenuTeamId);
  const teamName = team?.teamName || 'Unknown Team';
  const currentScore = team?.score ?? 0;

  // Reset edit state when menu opens/closes or team changes
  useEffect(() => {
    if (isContextMenuVisible && contextMenuTeamId) {
      setIsEditingScore(false);
      setEditedScore(String(currentScore));
    }
  }, [isContextMenuVisible, contextMenuTeamId, currentScore]);

  // Close context menu on Escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        hideContextMenu();
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [hideContextMenu]);

  // Close context menu when clicking outside
  useEffect(() => {
    const handleClickOutside = () => {
      hideContextMenu();
    };
    if (isContextMenuVisible) {
      setTimeout(() => {
        window.addEventListener('click', handleClickOutside);
      }, 0); // Delay to avoid immediate closing
    }
    return () => {
      window.removeEventListener('click', handleClickOutside);
    };
  }, [isContextMenuVisible, hideContextMenu]);

  // Handle score change confirmation
  const handleScoreConfirm = useCallback(() => {
    const newScore = parseInt(editedScore, 10);
    if (!isNaN(newScore) && onTeamScoreChange && contextMenuTeamId) {
      onTeamScoreChange(contextMenuTeamId, newScore);
    }
    setIsEditingScore(false);
  }, [editedScore, onTeamScoreChange, contextMenuTeamId]);

  // Handle score change cancellation
  const handleScoreCancel = useCallback(() => {
    setEditedScore(String(currentScore));
    setIsEditingScore(false);
  }, [currentScore]);

  if (!isContextMenuVisible || !contextMenuPosition || !contextMenuTeamId) {
    return null;
  }

  return (
    <div
      className="fixed z-[200] bg-gray-800 border border-gray-700 rounded-lg shadow-2xl p-3"
      style={{
        left: `${contextMenuPosition.x}px`,
        top: `${contextMenuPosition.y}px`,
      }}
      onClick={(e) => e.stopPropagation()} // Prevent click-outside when clicking menu
    >
      {/* Team name */}
      <div className="text-sm font-semibold text-gray-300 mb-3">{teamName}</div>

      {/* Status buttons - simple squares in one row */}
      <div className="flex gap-2 mb-3">
        {STATUS_BUTTONS.map((button) => {
          const Icon = button.icon;
          return (
            <button
              key={button.status}
              onClick={() => handleContextStatusSelect(button.status)}
              className={`${button.color} w-10 h-10 rounded hover:opacity-80 transition-opacity flex items-center justify-center text-white`}
              title={button.label}
            >
              <Icon className="w-5 h-5" />
            </button>
          );
        })}
      </div>

      {/* Score editor */}
      <div className="flex items-center gap-2 border-t border-gray-700 pt-3">
        {!isEditingScore ? (
          <>
            <span className="text-gray-400 text-sm">Score:</span>
            <span
              className="text-white text-lg font-mono cursor-pointer hover:bg-gray-700 px-2 rounded"
              onClick={() => setIsEditingScore(true)}
            >
              {currentScore}
            </span>
          </>
        ) : (
          <>
            <input
              type="number"
              value={editedScore}
              onChange={(e) => setEditedScore(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleScoreConfirm();
                if (e.key === 'Escape') handleScoreCancel();
              }}
              className="bg-gray-900 border border-gray-600 rounded px-2 py-1 text-white text-lg font-mono w-24 focus:outline-none focus:border-blue-500"
              autoFocus
            />
            <button
              onClick={handleScoreConfirm}
              className="p-1 bg-green-600 hover:bg-green-700 rounded text-white"
              title="Confirm"
            >
              <Check className="w-4 h-4" />
            </button>
            <button
              onClick={handleScoreCancel}
              className="p-1 bg-red-600 hover:bg-red-700 rounded text-white"
              title="Cancel"
            >
              <X className="w-4 h-4" />
            </button>
          </>
        )}
      </div>
    </div>
  );
};

/**
 * Hook for handling team card clicks (both left and right click)
 */
export interface UseTeamCardClicksReturn {
  /** Handle left click on team card */
  onCardClick: (teamId: string, e: React.MouseEvent) => void;
  /** Handle right click on team card */
  onCardContextMenu: (teamId: string, e: React.MouseEvent) => void;
}

/**
 * Hook to handle clicks on team cards with the status manager
 *
 * Left click behavior:
 * - INACTIVE -> ANSWERING (manual override)
 * - ACTIVE -> ANSWERING (manual override - bypass buzz)
 * - ANSWERING -> INACTIVE (clear answering status)
 * - PENALTY -> INACTIVE (clear penalty)
 *
 * Right click behavior:
 * - Opens context menu with all status options
 */
export function useTeamCardClicks(
  teamStatusManager: ReturnType<typeof import('../../hooks/useTeamStatusManager').useTeamStatusManager>,
  contextMenu: ReturnType<typeof useTeamContextMenu>,
  isResponseTimerActive: () => boolean = () => false
): UseTeamCardClicksReturn {
  const { getTeamStatus, setTeamStatus, forceSetTeamStatus } = teamStatusManager;
  const { showContextMenu } = contextMenu;

  const onCardClick = useCallback((teamId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const currentStatus = getTeamStatus(teamId);

    // Left click behavior based on current status
    switch (currentStatus) {
      case TeamStatus.INACTIVE:
        forceSetTeamStatus(teamId, TeamStatus.ANSWERING);
        break;

      case TeamStatus.ACTIVE:
        forceSetTeamStatus(teamId, TeamStatus.ANSWERING);
        break;

      case TeamStatus.ANSWERING:
        setTeamStatus(teamId, TeamStatus.INACTIVE);
        break;

      case TeamStatus.PENALTY:
        setTeamStatus(teamId, TeamStatus.INACTIVE);
        break;
    }
  }, [getTeamStatus, setTeamStatus, forceSetTeamStatus]);

  const onCardContextMenu = useCallback((teamId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    // Show context menu at click position
    showContextMenu(teamId, e.clientX, e.clientY);
  }, [showContextMenu]);

  return {
    onCardClick,
    onCardContextMenu,
  };
}
