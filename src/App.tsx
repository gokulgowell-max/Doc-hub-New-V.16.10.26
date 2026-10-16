import React, { useState, useEffect, useCallback } from 'react';
import { Header } from './components/Header';
import { RecruiterForm } from './components/RecruiterForm';
import { DocumentationDesk } from './components/DocumentationDesk';
import { ManagerDashboard } from './components/ManagerDashboard';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Project, ConnectionStatus, AutoSyncState } from './types';
import { apiService } from './services/apiService';

export default function App() {
  const [currentView, setCurrentView] = useState<'recruiter' | 'documentation' | 'manager'>(() => {
    try {
      const stored = typeof window !== 'undefined' ? localStorage.getItem('doc_hub_current_view') : null;
      if (stored === 'recruiter' || stored === 'documentation' || stored === 'manager') {
        return stored;
      }
    } catch {}
    return 'recruiter';
  });

  const handleSwitchView = (view: 'recruiter' | 'documentation' | 'manager') => {
    setCurrentView(view);
    try {
      localStorage.setItem('doc_hub_current_view', view);
    } catch {}
  };

  // Initialize synchronously with instant cached/embedded data so user never sees empty lists or lag
  const [projects, setProjects] = useState<Project[]>(() => apiService.getProjectsSync());
  const [recruiters, setRecruiters] = useState<string[]>(() => apiService.getRecruitersSync());
  const [selectedRecruiter, setSelectedRecruiter] = useState<string>(() => {
    try {
      return localStorage.getItem('doc_hub_active_recruiter') || '';
    } catch {
      return '';
    }
  });

  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>({
    gas: 'connected',
    lastChecked: new Date().toLocaleTimeString()
  });
  const [isHealthChecking, setIsHealthChecking] = useState<boolean>(false);
  const [autoSyncState, setAutoSyncState] = useState<AutoSyncState>(apiService.getAutoSyncState());
  const [isManagerAuthenticated, setIsManagerAuthenticated] = useState<boolean>(() => {
    try {
      return typeof window !== 'undefined' && (
        localStorage.getItem('doc_hub_manager_auth') === 'true' || 
        sessionStorage.getItem('doc_hub_manager_auth') === 'true'
      );
    } catch {
      return false;
    }
  });

  const refreshFromMemory = useCallback(async () => {
    const projs = apiService.getProjectsSync();
    const recs = apiService.getRecruitersSync();
    if (projs.length > 0) setProjects(projs);
    if (recs.length > 0) setRecruiters(recs);
  }, []);

  const loadAppState = useCallback(async (forceRemote: boolean = false) => {
    // 1. Immediately render instant local data (0ms delay)
    const instantProjs = apiService.getProjectsSync();
    const instantRecs = apiService.getRecruitersSync();
    if (instantProjs.length > 0) setProjects(instantProjs);
    if (instantRecs.length > 0) setRecruiters(instantRecs);

    // 2. Perform multi-device state sync in the background
    try {
      await apiService.syncWithServerState();
      const updatedProjs = apiService.getProjectsSync();
      const updatedRecs = apiService.getRecruitersSync();
      if (updatedProjs.length > 0) setProjects(updatedProjs);
      if (updatedRecs.length > 0) setRecruiters(updatedRecs);
    } catch {}

    // 3. Sync from remote cloud in background without blocking UI
    if (forceRemote) {
      apiService.syncSubmissionsFromRemote().catch(console.warn);
      apiService.syncProjectsFromRemote().then(() => {
        const freshProjs = apiService.getProjectsSync();
        const freshRecs = apiService.getRecruitersSync();
        if (freshProjs.length > 0) setProjects(freshProjs);
        if (freshRecs.length > 0) setRecruiters(freshRecs);
      }).catch(console.warn);
    }

    if (selectedRecruiter && instantRecs.length > 0 && !instantRecs.some(r => r.toLowerCase() === selectedRecruiter.toLowerCase())) {
      setSelectedRecruiter('');
      try { localStorage.removeItem('doc_hub_active_recruiter'); } catch {}
    }
  }, [selectedRecruiter]);

  // Load Initial Data & Start Background Auto-Sync Engine
  useEffect(() => {
    loadAppState(true);
    checkConnectionHealth();

    // Start background auto-fetch engine (Google Sheets cloud backup)
    apiService.startAutoSync();

    // Subscribe to real-time auto-fetch updates
    const unsubscribeData = apiService.subscribe(() => {
      refreshFromMemory();
    });

    const unsubscribeSync = apiService.subscribeSyncState((newState) => {
      setAutoSyncState(newState);
    });

    return () => {
      unsubscribeData();
      unsubscribeSync();
      apiService.stopAutoSync();
    };
  }, [refreshFromMemory]);

  const handleSelectRecruiter = (name: string) => {
    setSelectedRecruiter(name);
    localStorage.setItem('doc_hub_active_recruiter', name);
  };

  const handleTriggerAutoSync = () => {
    apiService.runAutoSync(true);
  };

  const checkConnectionHealth = async () => {
    setIsHealthChecking(true);
    try {
      const status = await apiService.testHealth();
      setConnectionStatus(status);
    } catch {
      setConnectionStatus({
        gas: 'connected',
        lastChecked: new Date().toLocaleTimeString()
      });
    } finally {
      setIsHealthChecking(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans selection:bg-blue-500 selection:text-white">
      
      {/* Top Application Bar */}
      <Header
        currentView={currentView}
        onSwitchView={handleSwitchView}
        selectedRecruiter={selectedRecruiter}
        connectionStatus={connectionStatus}
        onRefreshHealth={checkConnectionHealth}
        isHealthChecking={isHealthChecking}
        autoSyncState={autoSyncState}
        onTriggerAutoSync={handleTriggerAutoSync}
        isManagerAuthenticated={isManagerAuthenticated}
      />

      {/* Main Content Area */}
      <main className="flex-1 pb-16">
        <ErrorBoundary fallbackTitle="Application View Error">
          {currentView === 'recruiter' ? (
            <RecruiterForm
              projects={projects}
              recruiters={recruiters}
              selectedRecruiter={selectedRecruiter}
              onSelectRecruiter={handleSelectRecruiter}
              onSubmissionSuccess={loadAppState}
            />
          ) : currentView === 'documentation' ? (
            <DocumentationDesk
              projects={projects}
              recruiters={recruiters}
              onRefreshData={loadAppState}
            />
          ) : (
            <ManagerDashboard
              projects={projects}
              recruiters={recruiters}
              onRefreshData={loadAppState}
              onAuthChange={setIsManagerAuthenticated}
            />
          )}
        </ErrorBoundary>
      </main>

      {/* Modern Compact Footer */}
      <footer className="bg-white border-t border-slate-200/80 py-4 px-6 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center space-x-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            <span className="font-semibold text-slate-700">Gowell Document Hub — Enterprise System</span>
          </div>
          <p className="text-slate-400 text-[11px]">
            Protected with Server-Side Authentication & Cloud Synchronization
          </p>
        </div>
      </footer>

    </div>
  );
}

