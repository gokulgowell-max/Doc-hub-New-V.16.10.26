import React from 'react';
import { Layers, ShieldCheck, UserCheck, Activity, Database, CheckCircle2, AlertCircle, RefreshCw, KeyRound, Sparkles, Search, FileCheck, Cloud, CloudOff } from 'lucide-react';
import { ConnectionStatus, AutoSyncState } from '../types';
import { formatTimeAgo } from '../utils/dateUtils';

interface HeaderProps {
  currentView: 'recruiter' | 'documentation' | 'manager';
  onSwitchView: (view: 'recruiter' | 'documentation' | 'manager') => void;
  selectedRecruiter: string;
  onOpenRecruiterSelect?: () => void;
  connectionStatus: ConnectionStatus;
  onRefreshHealth: () => void;
  isHealthChecking: boolean;
  autoSyncState?: AutoSyncState;
  onTriggerAutoSync?: () => void;
  isManagerAuthenticated?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  currentView,
  onSwitchView,
  selectedRecruiter,
  connectionStatus,
  onRefreshHealth,
  isHealthChecking,
  autoSyncState,
  onTriggerAutoSync,
  isManagerAuthenticated
}) => {
  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200/80 shadow-2xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 sm:h-18">
          
          {/* Logo & Brand */}
          <div className="flex items-center space-x-3 cursor-pointer" onClick={() => onSwitchView('recruiter')}>
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center shadow-md shadow-blue-500/20">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-slate-900 text-lg sm:text-xl tracking-tight">
                  Gowell Document Hub
                </span>
                <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200 uppercase tracking-wide">
                  v2.4 Pro
                </span>
              </div>
              <p className="text-xs text-slate-500 hidden sm:block">
                Recruitment Document & Intake Automation
              </p>
            </div>
          </div>

          {/* Center / Right controls */}
          <div className="flex items-center space-x-2 sm:space-x-3">
            
            {/* Auto-Sync Live Status Indicator & Rotation - Visible ONLY when Manager is Logged In */}
            {isManagerAuthenticated && currentView === 'manager' && autoSyncState && (
              <button
                type="button"
                onClick={onTriggerAutoSync}
                title={
                  autoSyncState.isSyncing 
                    ? 'Fetching live records from Google Sheets backup...' 
                    : `Auto-fetch is active (${autoSyncState.syncSource || 'Google Sheets'}). Click to force sync now.`
                }
                className={`hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium transition-all ${
                  autoSyncState.isSyncing
                    ? 'bg-blue-50 border-blue-200 text-blue-700 ring-2 ring-blue-400/20'
                    : autoSyncState.status === 'error'
                    ? 'bg-amber-50 border-amber-200 text-amber-800 hover:bg-amber-100'
                    : 'bg-slate-50 hover:bg-slate-100 border-slate-200/80 text-slate-700'
                }`}
              >
                {autoSyncState.isSyncing ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 text-blue-600 animate-spin" />
                    <span className="font-semibold text-blue-800">Auto-Fetching...</span>
                  </>
                ) : (
                  <>
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                    </span>
                    <span className="font-medium text-slate-700 flex items-center gap-1">
                      Auto-Sync
                      {autoSyncState.lastSyncTime && (
                        <span className="text-slate-400 text-[11px] font-normal">
                          • {formatTimeAgo(autoSyncState.lastSyncTime)}
                        </span>
                      )}
                    </span>
                  </>
                )}
              </button>
            )}

            {/* Recruiter Active Profile Pill (if on recruiter view) */}
            {currentView === 'recruiter' && selectedRecruiter && (
              <div className="hidden xl:flex items-center space-x-2 px-3 py-1.5 rounded-full bg-indigo-50 border border-indigo-200/80 text-indigo-900 text-xs font-medium">
                <UserCheck className="w-3.5 h-3.5 text-indigo-600" />
                <span>Recruiter: <strong className="font-semibold">{selectedRecruiter}</strong></span>
              </div>
            )}

            {/* 3-Mode View Switcher Buttons */}
            <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200">
              <button
                id="tab-recruiter-btn"
                onClick={() => onSwitchView('recruiter')}
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  currentView === 'recruiter'
                    ? 'bg-white text-blue-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <UserCheck className="w-3.5 h-3.5" />
                <span className="hidden xs:inline">Recruiter</span>
                <span className="xs:hidden">Recruiter</span>
              </button>

              <button
                id="tab-documentation-btn"
                onClick={() => onSwitchView('documentation')}
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  currentView === 'documentation'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Search className="w-3.5 h-3.5" />
                <span>Documentation</span>
              </button>

              <button
                id="tab-manager-btn"
                onClick={() => onSwitchView('manager')}
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  currentView === 'manager'
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <KeyRound className="w-3.5 h-3.5 text-amber-400" />
                <span className="hidden xs:inline">Manager</span>
                <span className="xs:hidden">Manager</span>
              </button>
            </div>

          </div>

        </div>
      </div>
    </header>
  );
};

