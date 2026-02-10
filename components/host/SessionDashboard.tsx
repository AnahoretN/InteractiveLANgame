/**
 * SessionDashboard Component
 * Displays the active game session with live feed and stats
 */

import React, { memo, useMemo } from 'react';
import { Smartphone, Monitor, ArrowRight, Wifi, Clock, Users, Trash2, Activity, Shield, StopCircle, Flag } from 'lucide-react';
import { format, isValid } from 'date-fns';
import { Button } from '../Button';
import { TimeLog, ConnectionStatus } from '../../types';
import { getHealthColor, getHealthBgColor } from '../../hooks';

interface ClientStats {
  active: number;
  total: number;
  avgQuality: number;
}

interface SessionDashboardProps {
  clients: Map<string, unknown>;
  logs: TimeLog[];
  clientStats: ClientStats;
  avgLatency: number;
  status: ConnectionStatus;
  isOnline: boolean;
  onBackToLobby: () => void;
  onClearLogs: () => void;
}

export const SessionDashboard = memo(({
  clients,
  logs,
  clientStats,
  avgLatency,
  status,
  isOnline,
  onBackToLobby,
  onClearLogs,
}: SessionDashboardProps) => {
  // Memoize latency color calculation
  const latencyColor = useMemo(() => {
    if (avgLatency < 50) return 'text-green-400';
    if (avgLatency < 150) return 'text-yellow-400';
    return 'text-red-400';
  }, [avgLatency]);

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 flex flex-col p-6 transition-all duration-500">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-4">
          <Button variant="secondary" size="sm" onClick={onBackToLobby}>
            <StopCircle className="w-4 h-4 mr-2 text-red-400" /> Back to Lobby
          </Button>
          <div className="h-6 w-px bg-gray-800"></div>
          <div className="flex items-center gap-2 text-sm text-gray-400">
            <Users className="w-4 h-4" /><span>{clients.size} Devices</span>
          </div>
          {clients.size > 0 && (
            <>
              <div className="h-6 w-px bg-gray-800"></div>
              <div className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-bold uppercase ${getHealthBgColor(clientStats.avgQuality)}`}>
                <Activity className="w-3 h-3" /> {clientStats.avgQuality}%
              </div>
            </>
          )}
        </div>
        <div className="flex items-center gap-3">
          <div className={`flex items-center space-x-1.5 px-2 py-1 rounded-full text-xs font-bold uppercase ${isOnline ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
            <Wifi className="w-3 h-3" /> <span>{isOnline ? 'Online' : 'Offline'}</span>
          </div>
          <div className={`flex items-center space-x-2 px-3 py-1 rounded-full ${status === ConnectionStatus.CONNECTED ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
            <span className={`w-2 h-2 rounded-full ${status === ConnectionStatus.CONNECTED ? 'bg-green-500' : 'bg-red-500'}`}></span>
            <span className="text-xs font-bold uppercase">{status}</span>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto w-full grid lg:grid-cols-12 gap-8 flex-1">
        {/* Stats Cards */}
        <div className="lg:col-span-12 grid grid-cols-2 md:grid-cols-4 gap-4 h-fit">
          <StatCard
            icon={<Smartphone className="w-6 h-6" />}
            bgColor="bg-green-500/10"
            iconColor="text-green-400"
            label="Active"
            value={`${clientStats.active} / ${clientStats.total}`}
          />
          <StatCard
            icon={<Clock className="w-6 h-6" />}
            bgColor="bg-blue-500/10"
            iconColor="text-blue-400"
            label="Total Pings"
            value={logs.length.toString()}
          />
          <StatCard
            icon={<Activity className="w-6 h-6" />}
            bgColor="bg-purple-500/10"
            iconColor="text-purple-400"
            label="Avg Latency"
            value={avgLatency > 0 ? `${avgLatency} ms` : '-'}
            valueColor={latencyColor}
          />
          <StatCard
            icon={<Shield className="w-6 h-6" />}
            bgColor={getHealthBgColor(clientStats.avgQuality).split(' ')[0] as string}
            iconColor={getHealthColor(clientStats.avgQuality)}
            label="Health Score"
            value={`${clientStats.avgQuality}%`}
            valueColor={getHealthColor(clientStats.avgQuality)}
          />
        </div>

        {/* Live Feed */}
        <div className="lg:col-span-12 flex flex-col min-h-[500px] bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden shadow-xl">
          <div className="p-4 border-b border-gray-800 bg-gray-900/50 flex justify-between items-center backdrop-blur">
            <h3 className="font-semibold text-gray-200 flex items-center gap-2">
              <Monitor className="w-4 h-4 text-blue-400" /> Live Feed
            </h3>
            <Button
              size="sm"
              variant="ghost"
              className="text-red-400 hover:text-red-300"
              onClick={onClearLogs}
              disabled={logs.length === 0}
            >
              <Trash2 className="w-4 h-4 mr-2" /> Clear
            </Button>
          </div>

          <LiveFeed logs={logs} />
        </div>
      </div>
    </div>
  );
});

SessionDashboard.displayName = 'SessionDashboard';

// Stat Card sub-component
interface StatCardProps {
  icon: React.ReactNode;
  bgColor: string;
  iconColor: string;
  label: string;
  value: string;
  valueColor?: string;
}

const StatCard = memo(({ icon, bgColor, iconColor, label, value, valueColor }: StatCardProps) => (
  <div className="bg-gray-900 border border-gray-800 p-4 rounded-2xl flex items-center space-x-4">
    <div className={`p-3 ${bgColor} rounded-xl ${iconColor}`}>{icon}</div>
    <div>
      <div className="text-xs text-gray-500 uppercase font-bold">{label}</div>
      <div className={`font-semibold text-white ${valueColor || ''}`}>{value}</div>
    </div>
  </div>
));

StatCard.displayName = 'StatCard';

// Live Feed sub-component
interface LiveFeedProps {
  logs: TimeLog[];
}

const LiveFeed = memo(({ logs }: LiveFeedProps) => {
  if (logs.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-gray-600 space-y-3 opacity-50">
        <div className="w-16 h-16 border-2 border-dashed border-gray-700 rounded-full flex items-center justify-center">
          <Wifi className="w-8 h-8" />
        </div>
        <p className="text-sm">Waiting for incoming replies...</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-3">
      {logs.map((log, index) => {
        const isLatest = index === 0;
        const logLatencyColor = log.latency < 50 ? 'text-green-400' : log.latency < 150 ? 'text-yellow-400' : 'text-red-400';
        const logLatencyBg = log.latency < 50 ? 'bg-green-500/10 border-green-500/40' : log.latency < 150 ? 'bg-yellow-500/10 border-yellow-500/40' : 'bg-red-500/10 border-red-500/40';

        return (
          <LogEntry
            key={log.id}
            log={log}
            isLatest={isLatest}
            latencyColor={logLatencyColor}
            latencyBg={logLatencyBg}
          />
        );
      })}
    </div>
  );
});

LiveFeed.displayName = 'LiveFeed';

// Log Entry sub-component
interface LogEntryProps {
  log: TimeLog;
  isLatest: boolean;
  latencyColor: string;
  latencyBg: string;
}

const LogEntry = memo(({ log, isLatest, latencyColor, latencyBg }: LogEntryProps) => {
  // Using a simple user icon instead of User which doesn't exist in lucide-react
  return (
    <div className={`flex justify-between items-center p-4 rounded-xl border transition-all duration-300 ${
      isLatest ? latencyBg + ' shadow-[0_0_15px_-5px_rgba(59,130,246,0.3)] scale-[1.01]' : 'bg-gray-800/20 border-gray-800'
    }`}>
      <div className="flex items-center space-x-3">
        <div className={`p-2 rounded-lg ${isLatest ? 'bg-blue-500/20 text-blue-400' : 'bg-gray-700/50 text-gray-500'}`}>
          <Users className="w-4 h-4" />
        </div>
        <div>
          <div className={`text-sm font-bold ${isLatest ? 'text-white' : 'text-gray-400'}`}>{log.userName}</div>
          {log.teamName && (
            <div className="text-[10px] text-indigo-400 flex items-center gap-1">
              <Flag className="w-3 h-3" /> {log.teamName}
            </div>
          )}
        </div>
      </div>
      <div className="flex items-center gap-8">
        <div className="hidden sm:block text-right">
          <div className="text-[10px] text-gray-500 uppercase font-bold tracking-wider">Sent</div>
          <div className="font-mono text-xs text-gray-300">
            {isValid(log.sentAt) ? format(log.sentAt, 'HH:mm:ss.SSS') : '--'}
          </div>
        </div>
        <div className="hidden sm:flex flex-col items-center px-4">
          <ArrowRight className={`w-4 h-4 ${isLatest ? 'text-blue-500' : 'text-gray-700'}`} />
        </div>
        <div className="hidden sm:block text-right">
          <div className="text-[10px] text-gray-500 uppercase font-bold tracking-wider">Received</div>
          <div className="font-mono text-xs text-gray-300">
            {isValid(log.receivedAt) ? format(log.receivedAt, 'HH:mm:ss.SSS') : '--'}
          </div>
        </div>
      </div>
      <div className="text-right pl-6 border-l border-gray-800 ml-4 w-24">
        <div className={`text-xl font-black font-mono ${latencyColor}`}>
          {log.latency}<span className="text-xs ml-1 font-normal opacity-70">ms</span>
        </div>
      </div>
    </div>
  );
});

LogEntry.displayName = 'LogEntry';
