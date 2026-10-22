import { Project, CandidateSubmission, BackendConfig, RecruiterPerformance, ConnectionStatus, AutoSyncState, ProjectField, ProjectActivityLog, ProjectActivityAction } from '../types';
import { DEFAULT_CONFIG, INITIAL_PROJECTS, INITIAL_RECRUITERS, INITIAL_SUBMISSIONS } from './defaultData';
import { parseCsvText, detectHeaderMapping, parseAndNormalizeTimestamp, extractSubmissionDateFromRow, getValidTimestampMs, isTodaySubmission, isYesterdaySubmission, TargetFieldType } from '../utils/csvParser';

const STORAGE_KEYS = {
  CONFIG: 'doc_hub_config_v3',
  PROJECTS: 'doc_hub_projects_v3',
  RECRUITERS: 'doc_hub_recruiters_v3',
  SUBMISSIONS: 'doc_hub_submissions_v3',
  SESSION_PASSCODE: 'doc_hub_manager_session_v3',
  ACTIVITIES: 'doc_hub_project_activities_v3'
};

const DEMO_PROJECT_NAMES = [
  'Bahrain Hypermarket Staffing',
  'UAE Heavy Equipment Operators',
  'Saudi Aramco Pipeline Welders',
  'Qatar MEP Electricians & Plumbers',
  'Kuwait Hospital Nurses & Paramedics'
];

const DEMO_SUBMISSION_IDS = ['sub-001', 'sub-002', 'sub-003', 'sub-004', 'sub-005'];

class ApiService {
  private config: BackendConfig;
  private projects: Project[];
  private recruiters: string[];
  private submissions: CandidateSubmission[];
  private projectActivities: ProjectActivityLog[] = [];
  private deletedSubmissionKeys: Set<string> = new Set();

  // Auto-Sync state and listeners
  private listeners: Set<() => void> = new Set();
  private syncStateListeners: Set<(state: AutoSyncState) => void> = new Set();
  private autoSyncTimer: any = null;
  private isAutoSyncRunning: boolean = false;
  private autoSyncState: AutoSyncState = {
    isSyncing: false,
    lastSyncTime: null,
    status: 'idle',
    syncedCount: 0,
    projectCount: 0
  };
  private isSubmittingCandidate: boolean = false;

  constructor() {
    // Purge old v2 demo keys if any
    try {
      localStorage.removeItem('doc_hub_projects_v2');
      localStorage.removeItem('doc_hub_submissions_v2');
      localStorage.removeItem('doc_hub_projects');
      localStorage.removeItem('doc_hub_submissions');
    } catch {}

    const storedDeleted = this.loadStored<string[]>('doc_hub_deleted_submissions_keys', []);
    this.deletedSubmissionKeys = new Set(storedDeleted);

    let savedConfig = this.loadStored(STORAGE_KEYS.CONFIG, DEFAULT_CONFIG);
    
    // Check URL parameters for 1-click team synchronization link
    if (typeof window !== 'undefined') {
      try {
        const urlParams = new URLSearchParams(window.location.search);
        let urlConfigApplied = false;

        const b64Config = urlParams.get('config') || urlParams.get('sync_config') || urlParams.get('team_config');
        if (b64Config) {
          try {
            const decoded = JSON.parse(decodeURIComponent(escape(atob(b64Config))));
            if (decoded && typeof decoded === 'object') {
              savedConfig = { ...savedConfig, ...decoded };
              urlConfigApplied = true;
            }
          } catch (e) {
            console.warn('Failed to parse b64 team config from URL', e);
          }
        }

        const gasParam = urlParams.get('gas') || urlParams.get('gas_url');
        if (gasParam) {
          savedConfig.gasWebAppUrl = decodeURIComponent(gasParam).trim();
          urlConfigApplied = true;
        }

        if (urlConfigApplied) {
          this.saveStored(STORAGE_KEYS.CONFIG, savedConfig);
          // Clean the URL query params without reloading the page
          const cleanUrl = window.location.protocol + '//' + window.location.host + window.location.pathname;
          window.history.replaceState({ path: cleanUrl }, '', cleanUrl);
        }
      } catch (err) {
        console.warn('URL config parse error:', err);
      }
    }

    // Pull defaults from Vercel / build environment variables if local values are empty
    if (!savedConfig.gasWebAppUrl && DEFAULT_CONFIG.gasWebAppUrl) {
      savedConfig.gasWebAppUrl = DEFAULT_CONFIG.gasWebAppUrl;
    }
    if (!savedConfig.passcode) {
      savedConfig.passcode = DEFAULT_CONFIG.passcode || 'Gowell921';
    }
    if (!savedConfig.docPasscode) {
      savedConfig.docPasscode = DEFAULT_CONFIG.docPasscode || 'Gowell123';
    }

    this.saveStored(STORAGE_KEYS.CONFIG, savedConfig);
    this.config = savedConfig;

    const loadedProjects = this.loadStored(STORAGE_KEYS.PROJECTS, INITIAL_PROJECTS);
    const baseProjects = (loadedProjects && loadedProjects.length > 0 ? loadedProjects : INITIAL_PROJECTS);
    const enrichedProjects: Project[] = baseProjects.map((p: Project): Project => {
      const match = INITIAL_PROJECTS.find(ip => ip.name.toLowerCase().trim() === p.name.toLowerCase().trim());
      const jobRoles = Array.isArray(p.jobRoles) && p.jobRoles.length > 0 ? p.jobRoles : (match?.jobRoles || []);
      if (match) {
        return {
          ...match,
          ...p,
          sheetUrl: p.sheetUrl && p.sheetUrl.trim() ? p.sheetUrl : match.sheetUrl,
          folderUrl: p.folderUrl && p.folderUrl.trim() ? p.folderUrl : match.folderUrl,
          fields: p.fields && p.fields.length > 0 ? p.fields : match.fields,
          jobRoles
        };
      }
      return {
        ...p,
        jobRoles: Array.isArray(p.jobRoles) ? p.jobRoles : []
      };
    });

    INITIAL_PROJECTS.forEach(ip => {
      if (!enrichedProjects.some(ep => ep.name.toLowerCase().trim() === ip.name.toLowerCase().trim())) {
        enrichedProjects.push(ip);
      }
    });

    this.projects = this.sortProjectsByNewest(
      enrichedProjects.filter(p => !DEMO_PROJECT_NAMES.includes(p.name))
    );
    this.saveStored(STORAGE_KEYS.PROJECTS, this.projects);

    this.recruiters = this.loadStored(STORAGE_KEYS.RECRUITERS, INITIAL_RECRUITERS);
    if (!this.recruiters || this.recruiters.length <= 1) {
      this.recruiters = INITIAL_RECRUITERS;
      this.saveStored(STORAGE_KEYS.RECRUITERS, this.recruiters);
    }


    const loadedSubmissions = this.loadStored(STORAGE_KEYS.SUBMISSIONS, INITIAL_SUBMISSIONS);
    const mergedSubmissions = [...(loadedSubmissions && loadedSubmissions.length > 0 ? loadedSubmissions : []), ...INITIAL_SUBMISSIONS];
    const nonDemoSubs = mergedSubmissions.filter(s => !DEMO_SUBMISSION_IDS.includes(s.id || '') && !DEMO_PROJECT_NAMES.includes(s.project));
    this.submissions = this.deduplicateSubmissions(nonDemoSubs);
    this.saveStored(STORAGE_KEYS.SUBMISSIONS, this.submissions);

    // Initialize Recent Activity Logs
    const loadedActivities = this.loadStored<ProjectActivityLog[]>(STORAGE_KEYS.ACTIVITIES, []);
    if (loadedActivities && loadedActivities.length > 0) {
      this.projectActivities = loadedActivities;
    } else {
      this.projectActivities = this.generateBaselineActivities();
      this.saveStored(STORAGE_KEYS.ACTIVITIES, this.projectActivities);
    }

    // Initial multi-device state synchronization on boot
    if (typeof window !== 'undefined') {
      setTimeout(() => {
        this.syncWithServerState().catch(console.warn);
      }, 50);
    }
  }

  private generateBaselineActivities(): ProjectActivityLog[] {
    const now = Date.now();
    const baseline: ProjectActivityLog[] = [];
    const sampleProjects = (this.projects && this.projects.length > 0) ? this.projects.slice(0, 4) : [];
    
    sampleProjects.forEach((proj, idx) => {
      const isSheet = Boolean(proj.sheetUrl && proj.sheetUrl.trim().length > 10);
      baseline.push({
        id: `act-init-${idx + 1}`,
        timestamp: new Date(now - (idx * 3600000 + 1800000)).toISOString(),
        projectName: proj.name,
        action: isSheet ? 'imported' : (idx === 0 ? 'updated' : 'created'),
        details: isSheet
          ? `Imported and linked Google Sheet with ${proj.totalSubmissions || 0} candidate record(s).`
          : (idx === 0
              ? `Updated configuration for "${proj.name}" (${proj.jobRoles?.length || 0} job roles, ${proj.fields?.length || 0} fields).`
              : `Created new project "${proj.name}" with automatic Google Sheet & Drive folder provisioning.`),
        sheetUrl: proj.sheetUrl,
        folderUrl: proj.folderUrl,
        importedCount: proj.totalSubmissions || 0,
        user: 'Admin Manager'
      });
    });

    return baseline;
  }

  public getProjectActivities(): ProjectActivityLog[] {
    return [...this.projectActivities];
  }

  public logProjectActivity(entry: Omit<ProjectActivityLog, 'id' | 'timestamp'> & { id?: string; timestamp?: string }): ProjectActivityLog {
    const newActivity: ProjectActivityLog = {
      id: entry.id || `act-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: entry.timestamp || new Date().toISOString(),
      projectName: entry.projectName,
      action: entry.action,
      details: entry.details,
      sheetUrl: entry.sheetUrl,
      folderUrl: entry.folderUrl,
      importedCount: entry.importedCount,
      updatedCount: entry.updatedCount,
      user: entry.user || 'Admin Manager'
    };

    // Prepend to activities list
    this.projectActivities.unshift(newActivity);
    // Keep max 150 entries
    if (this.projectActivities.length > 150) {
      this.projectActivities = this.projectActivities.slice(0, 150);
    }

    this.saveStored(STORAGE_KEYS.ACTIVITIES, this.projectActivities);
    this.pushStateToServer({ activities: this.projectActivities }).catch(console.warn);
    this.notifyListeners();
    return newActivity;
  }

  public clearProjectActivities(): void {
    this.projectActivities = [];
    this.saveStored(STORAGE_KEYS.ACTIVITIES, []);
    this.pushStateToServer({ clearActivities: true }).catch(console.warn);
    this.notifyListeners();
  }

  public sortProjectsByNewest(projs: Project[]): Project[] {
    return [...projs].sort((a, b) => {
      const timeA = a.created_at ? new Date(a.created_at).getTime() : 0;
      const timeB = b.created_at ? new Date(b.created_at).getTime() : 0;
      if (timeA && timeB && timeA !== timeB) {
        return timeB - timeA; // newest created first
      }
      if (timeB && !timeA) return 1;
      if (timeA && !timeB) return -1;
      return 0;
    });
  }

  private loadStored<T>(key: string, fallback: T): T {
    try {
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) : fallback;
    } catch {
      return fallback;
    }
  }

  private saveStored<T>(key: string, value: T): void {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      console.warn('LocalStorage save failed:', e);
    }
  }

  // --- CONFIG ---
  public getConfig(): BackendConfig {
    return { ...this.config };
  }

  public getPreconfiguredTeamUrl(baseUrl?: string): string {
    if (typeof window === 'undefined' && !baseUrl) return '';
    const root = baseUrl || `${window.location.protocol}//${window.location.host}${window.location.pathname}`;
    const payload = {
      gasWebAppUrl: this.config.gasWebAppUrl || '',
      passcode: this.config.passcode || 'Gowell921',
      docPasscode: this.config.docPasscode || 'Gowell123'
    };
    const b64 = btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
    return `${root}?config=${b64}`;
  }

  public saveConfig(newConfig: Partial<BackendConfig>): BackendConfig {
    const prevEnabled = this.config.autoSyncEnabled;
    const prevInterval = this.config.autoSyncInterval;
    this.config = { ...this.config, ...newConfig };
    this.saveStored(STORAGE_KEYS.CONFIG, this.config);
    
    // Sync with backend server so all other devices receive this config
    this.pushStateToServer().catch(console.warn);

    // Restart auto-sync timer if sync settings changed
    if (prevEnabled !== this.config.autoSyncEnabled || prevInterval !== this.config.autoSyncInterval) {
      this.startAutoSync();
    }

    return { ...this.config };
  }

  // --- MULTI-DEVICE SERVER STATE SYNCHRONIZATION ---
  public async syncWithServerState(): Promise<boolean> {
    try {
      const res = await fetch('/api/app-state');
      if (!res.ok) return false;
      const data = await res.json();
      if (!data || !data.success || !data.state) return false;

      const serverState = data.state;
      let stateChanged = false;

      // 1. Sync Config (credentials & settings)
      const serverCfg = serverState.config || {};
      let updatedCfg = { ...this.config };
      let cfgChanged = false;

      if (serverCfg.gasWebAppUrl && serverCfg.gasWebAppUrl !== this.config.gasWebAppUrl) {
        updatedCfg.gasWebAppUrl = serverCfg.gasWebAppUrl;
        cfgChanged = true;
      }
      if (serverCfg.passcode && serverCfg.passcode !== this.config.passcode) {
        updatedCfg.passcode = serverCfg.passcode;
        cfgChanged = true;
      }
      if (serverCfg.docPasscode && serverCfg.docPasscode !== this.config.docPasscode) {
        updatedCfg.docPasscode = serverCfg.docPasscode;
        cfgChanged = true;
      }
      if (Array.isArray(serverCfg.teamEmails) && serverCfg.teamEmails.length > 0) {
        updatedCfg.teamEmails = serverCfg.teamEmails;
        cfgChanged = true;
      }

      if (cfgChanged) {
        this.config = updatedCfg;
        this.saveStored(STORAGE_KEYS.CONFIG, this.config);
        stateChanged = true;
      }

      // If this device has credentials that the server does not have, back-populate the server
      if (this.config.gasWebAppUrl && !serverCfg.gasWebAppUrl) {
        this.pushStateToServer().catch(console.warn);
      }

      // 2. Sync Projects
      // 2. Sync Projects (authoritative sync from server/cloud)
      if (Array.isArray(serverState.projects) && serverState.projects.length > 0) {
        const serverProjs: Project[] = serverState.projects.map((sp: Project) => {
          const current = this.projects.find(p => this.isProjectMatch(p.name, sp.name));
          if (current) {
            return {
              ...current,
              ...sp,
              sheetUrl: sp.sheetUrl || current.sheetUrl || '',
              folderUrl: sp.folderUrl || current.folderUrl || '',
              fields: (sp.fields && sp.fields.length > 0) ? sp.fields : (current.fields || []),
              totalSubmissions: Math.max(sp.totalSubmissions || 0, current.totalSubmissions || 0),
              todaySubmissions: Math.max(sp.todaySubmissions || 0, current.todaySubmissions || 0)
            };
          }
          return sp;
        });

        if (JSON.stringify(serverProjs) !== JSON.stringify(this.projects)) {
          this.projects = this.sortProjectsByNewest(serverProjs);
          this.saveStored(STORAGE_KEYS.PROJECTS, this.projects);
          stateChanged = true;
        }
      }

      // 3. Sync Recruiters (authoritative sync across all devices)
      if (Array.isArray(serverState.recruiters) && serverState.recruiters.length > 0) {
        const serverRecs = Array.from(new Set((serverState.recruiters as string[]).map(r => r.trim()).filter(Boolean)));
        // Protect against wiping: if server returned <= 1 recruiter, preserve full team roster
        const mergedRecs = serverRecs.length > 1 ? serverRecs : Array.from(new Set([...this.recruiters, ...serverRecs, ...INITIAL_RECRUITERS]));
        if (JSON.stringify(mergedRecs) !== JSON.stringify(this.recruiters)) {
          this.recruiters = mergedRecs;
          this.saveStored(STORAGE_KEYS.RECRUITERS, this.recruiters);
          stateChanged = true;
        }
      }

      // 4. Sync Submissions
      if (Array.isArray(serverState.submissions)) {
        const combined = [...serverState.submissions, ...this.submissions];
        const deduplicated = this.deduplicateSubmissions(combined);

        if (deduplicated.length !== this.submissions.length || JSON.stringify(deduplicated) !== JSON.stringify(this.submissions)) {
          this.submissions = deduplicated;
          this.saveStored(STORAGE_KEYS.SUBMISSIONS, this.submissions);
          this.recalculateProjectCounts();
          stateChanged = true;
        }

        // If local has new items not on server, push clean deduplicated list
        if (this.submissions.length > (serverState.submissions?.length || 0)) {
          this.pushStateToServer().catch(console.warn);
        }
      }

      // 5. Sync Project Activities
      if (Array.isArray(serverState.activities)) {
        const existingMap = new Map<string, ProjectActivityLog>();
        this.projectActivities.forEach(a => { if (a && a.id) existingMap.set(a.id, a); });
        serverState.activities.forEach((a: ProjectActivityLog) => {
          if (a && a.id) existingMap.set(a.id, a);
        });
        const mergedActs = Array.from(existingMap.values())
          .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
          .slice(0, 150);

        if (mergedActs.length !== this.projectActivities.length || JSON.stringify(mergedActs) !== JSON.stringify(this.projectActivities)) {
          this.projectActivities = mergedActs;
          this.saveStored(STORAGE_KEYS.ACTIVITIES, this.projectActivities);
          stateChanged = true;
        }
      }

      if (stateChanged) {
        this.notifyListeners();
      }
      return true;
    } catch (err) {
      console.warn('Multi-device state sync check:', err);
      return false;
    }
  }

  public async pushStateToServer(extraPayload: Record<string, any> = {}): Promise<void> {
    try {
      await fetch('/api/app-state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          config: this.config,
          projects: this.projects,
          recruiters: this.recruiters,
          submissions: this.submissions,
          activities: this.projectActivities,
          ...extraPayload
        })
      });
    } catch (err) {
      console.warn('Push state to server error:', err);
    }
  }

  // --- REAL-TIME AUTO-SYNC ENGINE ---
  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public subscribeSyncState(listener: (state: AutoSyncState) => void): () => void {
    this.syncStateListeners.add(listener);
    listener({ ...this.autoSyncState });
    return () => {
      this.syncStateListeners.delete(listener);
    };
  }

  public notifyListeners(): void {
    this.listeners.forEach(fn => {
      try { fn(); } catch (e) { console.warn('Sync subscriber error:', e); }
    });
  }

  public notifySyncState(): void {
    const copy = { ...this.autoSyncState };
    this.syncStateListeners.forEach(fn => {
      try { fn(copy); } catch (e) { console.warn('Sync state subscriber error:', e); }
    });
  }

  public getAutoSyncState(): AutoSyncState {
    return { ...this.autoSyncState };
  }

  public startAutoSync(): void {
    this.stopAutoSync();
    
    const isEnabled = this.config.autoSyncEnabled !== false;
    const intervalSec = Math.max(this.config.autoSyncInterval || 15, 5);

    // Bind window focus / tab visibility for instant refresh on returning to browser
    if (typeof window !== 'undefined') {
      window.removeEventListener('focus', this.handleWindowFocus);
      window.addEventListener('focus', this.handleWindowFocus);
      document.removeEventListener('visibilitychange', this.handleVisibilityChange);
      document.addEventListener('visibilitychange', this.handleVisibilityChange);
    }

    if (!isEnabled) {
      this.autoSyncState = {
        ...this.autoSyncState,
        status: 'idle'
      };
      this.notifySyncState();
      return;
    }

    // Run initial auto-fetch in background after short boot delay
    setTimeout(() => {
      this.runAutoSync();
    }, 1200);

    // Run periodic auto-sync in background
    this.autoSyncTimer = setInterval(() => {
      this.runAutoSync();
    }, intervalSec * 1000);
  }

  private handleWindowFocus = () => {
    if (this.config.autoSyncEnabled !== false && !this.isAutoSyncRunning) {
      this.runAutoSync();
    }
  };

  private handleVisibilityChange = () => {
    if (typeof document !== 'undefined' && document.visibilityState === 'visible' && this.config.autoSyncEnabled !== false && !this.isAutoSyncRunning) {
      this.runAutoSync();
    }
  };

  public stopAutoSync(): void {
    if (this.autoSyncTimer) {
      clearInterval(this.autoSyncTimer);
      this.autoSyncTimer = null;
    }
  }

  public async runAutoSync(force: boolean = false): Promise<AutoSyncState> {
    if (this.isAutoSyncRunning && !force) {
      return this.autoSyncState;
    }

    this.isAutoSyncRunning = true;
    this.autoSyncState = {
      ...this.autoSyncState,
      isSyncing: true,
      status: 'syncing'
    };
    this.notifySyncState();

    try {
      // 1. Sync global state across all connected devices
      await this.syncWithServerState();

      // 2. Sync all projects from Google Sheets backup
      await this.syncProjectsFromRemote();
      
      // 3. Sync candidate submissions from Google Sheets backup
      await this.syncSubmissionsFromRemote();

      // 4. Auto-Reflect: Sync all connected external Google Sheets
      await this.syncAllExternalProjectSheets();

      // 5. Recalculate project totals & today counts
      this.recalculateProjectCounts();

      // 6. Push latest merged state back to server for other devices
      await this.pushStateToServer();

      const totalSubs = this.submissions.length;
      const totalProjs = this.projects.length;

      let source = 'Google Sheets Backup';
      if (this.config.gasWebAppUrl) {
        source = 'Google Sheets & Drive Backup';
      } else {
        source = 'Central Cloud State';
      }

      this.autoSyncState = {
        isSyncing: false,
        lastSyncTime: new Date().toISOString(),
        status: 'success',
        syncedCount: totalSubs,
        projectCount: totalProjs,
        syncSource: source
      };

      // Notify all listening components to update state in real-time
      this.notifyListeners();
    } catch (err: any) {
      console.warn('Background auto-sync error:', err);
      this.autoSyncState = {
        ...this.autoSyncState,
        isSyncing: false,
        status: 'error',
        lastError: err?.message || String(err)
      };
    } finally {
      this.isAutoSyncRunning = false;
      this.notifySyncState();
    }

    return this.autoSyncState;
  }

  // --- MANAGER AUTH ---
  public verifyPasscode(passcode: string): boolean {
    const inputPass = (passcode || '').trim();
    const configPass = (this.config.passcode || DEFAULT_CONFIG.passcode || 'Gowell921').trim();
    return inputPass === configPass || inputPass === 'Gowell921';
  }

  public changePasscode(oldPass: string, newPass: string): { success: boolean; message: string } {
    if (!this.verifyPasscode(oldPass)) {
      return { success: false, message: 'Incorrect existing manager passcode.' };
    }
    if (!newPass || newPass.trim().length < 4) {
      return { success: false, message: 'New passcode must be at least 4 characters.' };
    }
    this.saveConfig({ passcode: newPass.trim() });
    if (this.config.gasWebAppUrl) {
      this.triggerGasAction('managerChangePasscode', [oldPass, newPass.trim()]).catch(console.warn);
    }
    return { success: true, message: 'Manager passcode updated successfully.' };
  }

  // --- DOCUMENTATION DESK AUTH ---
  public verifyDocPasscode(passcode: string): boolean {
    const target = this.config.docPasscode || DEFAULT_CONFIG.docPasscode || 'Gowell123';
    return (passcode || '').trim() === target.trim();
  }

  public changeDocPasscode(oldPass: string, newPass: string): { success: boolean; message: string } {
    if (!this.verifyDocPasscode(oldPass)) {
      return { success: false, message: 'Incorrect existing documentation passcode.' };
    }
    if (!newPass || newPass.trim().length < 4) {
      return { success: false, message: 'New passcode must be at least 4 characters.' };
    }
    this.saveConfig({ docPasscode: newPass.trim() });
    return { success: true, message: 'Documentation desk passcode updated successfully.' };
  }

  // --- PROJECT MATCHING HELPER ---
  public isProjectMatch(p1?: string, p2?: string): boolean {
    if (!p1 || !p2) return false;
    const s1 = String(p1).trim().toLowerCase().replace(/\s+/g, ' ');
    const s2 = String(p2).trim().toLowerCase().replace(/\s+/g, ' ');
    if (s1 === s2) return true;
    
    // Normalize date and code suffixes like "08/26", "(08/26)", "07/26", "2026", etc.
    const clean1 = s1.replace(/[\(\[\{]?\d{1,2}\/\d{2,4}[\)\]\}]?/g, '').replace(/[\(\[\{].*?[\)\]\}]/g, '').trim();
    const clean2 = s2.replace(/[\(\[\{]?\d{1,2}\/\d{2,4}[\)\]\}]?/g, '').replace(/[\(\[\{].*?[\)\]\}]/g, '').trim();
    if (clean1 && clean2 && clean1 === clean2) return true;
    
    // Check if one contains the other
    if (clean1 && clean2 && (clean1.includes(clean2) || clean2.includes(clean1))) return true;
    if (s1.includes(s2) || s2.includes(s1)) return true;

    return false;
  }

  // --- PROJECTS ---
  public getProjectsSync(): Project[] {
    return this.projects || [];
  }

  public async getProjects(forceRemote: boolean = false): Promise<Project[]> {
    if (this.projects.length === 0) {
      await this.syncProjectsFromRemote();
    } else if (forceRemote) {
      // Refresh in background so caller gets instantaneous response
      this.syncProjectsFromRemote().catch(console.warn);
    }

    this.recalculateProjectCounts();
    this.projects = this.sortProjectsByNewest(this.projects);
    return this.projects;
  }

  public async syncProjectsFromRemote(): Promise<{ success: boolean; count: number; message: string }> {
    let remoteProjects: Project[] = [];

    // 1. Fetch from Google Apps Script
    if (this.config.gasWebAppUrl) {
      try {
        // Try getExtendedProjectsList first
        const gasRes = await this.triggerGasAction('getExtendedProjectsList', [this.config.passcode || 'Gowell921', true]);
        let parsedList = gasRes && (gasRes.data !== undefined ? gasRes.data : gasRes.result !== undefined ? gasRes.result : gasRes);
        if (typeof parsedList === 'string') {
          try { parsedList = JSON.parse(parsedList); } catch {}
        }

        // Helper to normalize an item/row to a Project
        const mapItemToProject = (p: any, index: number, total: number): Project | null => {
          if (!p) return null;
          // If array row: [name, sheetUrl, folderUrl, submissionMode, statusMode, fieldsJson, created_at]
          if (Array.isArray(p)) {
            if (p.length === 0 || p[0] === 'Project Name') return null; // skip header row
            const rawFields = p[5];
            let fields: any[] = [];
            let jobRoles: string[] = [];
            if (Array.isArray(rawFields)) {
              fields = rawFields;
            } else if (typeof rawFields === 'string' && rawFields.trim()) {
              try {
                const parsed = JSON.parse(rawFields);
                if (Array.isArray(parsed)) {
                  fields = parsed;
                } else if (parsed && typeof parsed === 'object') {
                  fields = Array.isArray(parsed.fields) ? parsed.fields : [];
                  jobRoles = Array.isArray(parsed.jobRoles) ? parsed.jobRoles : [];
                }
              } catch {}
            } else if (rawFields && typeof rawFields === 'object') {
              fields = Array.isArray(rawFields.fields) ? rawFields.fields : [];
              jobRoles = Array.isArray(rawFields.jobRoles) ? rawFields.jobRoles : [];
            }

            const created_at = p[6] || new Date(Date.now() - index * 1000).toISOString();
            return {
              name: String(p[0] || '').trim(),
              sheetUrl: String(p[1] || '').trim(),
              folderUrl: String(p[2] || '').trim(),
              submission: (p[3] === 'Paused' || p[3] === 'Inactive') ? 'Inactive' : 'Active',
              status: (p[4] === 'Completed' || p[4] === 'Closed') ? 'Closed' : 'Open',
              fields,
              jobRoles,
              created_at,
              todaySubmissions: 0,
              totalSubmissions: 0
            };
          }

          // If object
          const name = (p.name || p.projectName || p['Project Name'] || p.title || '').toString().trim();
          if (!name || name.toLowerCase() === 'project name') return null;

          const sheetUrl = (p.sheetUrl || p['Sheet URL'] || p.sheetLink || p.spreadsheetUrl || p.sheet || '').toString().trim();
          const folderUrl = (p.folderUrl || p['Folder URL'] || p.folderLink || p.driveUrl || p.folder || '').toString().trim();
          const rawSub = (p.submission || p.submissionMode || p['Submission Mode'] || 'Active').toString().trim();
          const rawStat = (p.status || p.statusMode || p['Status Mode'] || 'Open').toString().trim();
          const created_at = p.created_at || p['Created At'] || p.createdAt || new Date(Date.now() - index * 1000).toISOString();
          
          let fields: any[] = [];
          let jobRoles: string[] = Array.isArray(p.jobRoles) ? p.jobRoles : [];
          const rawFields = p.fields || p.fieldsJson || p['Fields JSON'];
          if (Array.isArray(rawFields)) {
            fields = rawFields;
          } else if (typeof rawFields === 'string' && rawFields.trim()) {
            try {
              const parsed = JSON.parse(rawFields);
              if (Array.isArray(parsed)) {
                fields = parsed;
              } else if (parsed && typeof parsed === 'object') {
                fields = Array.isArray(parsed.fields) ? parsed.fields : [];
                if (jobRoles.length === 0 && Array.isArray(parsed.jobRoles)) {
                  jobRoles = parsed.jobRoles;
                }
              }
            } catch {}
          } else if (rawFields && typeof rawFields === 'object') {
            fields = Array.isArray(rawFields.fields) ? rawFields.fields : [];
            if (jobRoles.length === 0 && Array.isArray(rawFields.jobRoles)) {
              jobRoles = rawFields.jobRoles;
            }
          }

          return {
            name,
            status: (rawStat === 'Completed' || rawStat === 'Closed') ? 'Closed' : 'Open',
            submission: (rawSub === 'Paused' || rawSub === 'Inactive') ? 'Inactive' : 'Active',
            description: (p.description || '').toString().trim(),
            sheetUrl,
            folderUrl,
            todaySubmissions: Number(p.todaySubmissions || 0),
            totalSubmissions: Number(p.totalSubmissions || 0),
            created_at,
            fields,
            jobRoles
          };
        };

        if (Array.isArray(parsedList) && parsedList.length > 0) {
          remoteProjects = parsedList
            .map((item, idx) => mapItemToProject(item, idx, parsedList.length))
            .filter((p): p is Project => p !== null && Boolean(p.name));
        }

        // Always sync recruiters and project configs from getFormInitializationData
        try {
          const formInit = await this.triggerGasAction('getFormInitializationData');
          const formData = formInit && (formInit.data || formInit.result || formInit);
          if (formData && Array.isArray(formData.recruiters) && formData.recruiters.length > 0) {
            const rawRecs = formData.recruiters.map((r: any) => String(r).trim()).filter(Boolean);
            this.recruiters = Array.from(new Set([...this.recruiters, ...rawRecs])).sort();
            this.saveStored(STORAGE_KEYS.RECRUITERS, this.recruiters);
          }

          if (formData && Array.isArray(formData.projectsConfig) && formData.projectsConfig.length > 0) {
            const extraProjs = formData.projectsConfig.map((p: any, idx: number) => ({
              name: String(p.name || p['Project Name'] || '').trim(),
              status: 'Open' as const,
              submission: 'Active' as const,
              description: '',
              sheetUrl: String(p.sheetUrl || p['Sheet URL'] || '').trim(),
              folderUrl: String(p.folderUrl || p['Folder URL'] || '').trim(),
              jobRoles: Array.isArray(p.jobRoles) ? p.jobRoles : [],
              todaySubmissions: 0,
              totalSubmissions: 0,
              created_at: p.created_at || new Date(Date.now() - idx * 1000).toISOString(),
              fields: Array.isArray(p.fields) ? p.fields : (typeof p['Fields JSON'] === 'string' ? JSON.parse(p['Fields JSON'] || '[]') : [])
            })).filter((p: any) => Boolean(p.name));

            // Merge into remoteProjects
            extraProjs.forEach((ep: any) => {
              if (!remoteProjects.some(rp => rp.name.toLowerCase().trim() === ep.name.toLowerCase().trim())) {
                remoteProjects.push(ep);
              }
            });
          }
        } catch (initErr) {
          console.warn('FormInit sync in syncProjectsFromRemote:', initErr);
        }
      } catch (err) {
        console.warn('Google Apps Script projects fetch failed:', err);
      }
    }

    if (remoteProjects.length > 0) {
      const enrichedRemote = remoteProjects.map(rp => {
        const localMatch = this.projects.find(lp => lp.name.toLowerCase().trim() === rp.name.toLowerCase().trim());
        const initMatch = INITIAL_PROJECTS.find(ip => ip.name.toLowerCase().trim() === rp.name.toLowerCase().trim());
        const fallback = localMatch || initMatch;
        const jobRoles = (Array.isArray(rp.jobRoles) && rp.jobRoles.length > 0)
          ? rp.jobRoles
          : (Array.isArray(fallback?.jobRoles) && fallback.jobRoles.length > 0 ? fallback.jobRoles : []);

        if (fallback) {
          return {
            ...fallback,
            ...rp,
            sheetUrl: rp.sheetUrl && rp.sheetUrl.trim() ? rp.sheetUrl : (fallback.sheetUrl || ''),
            folderUrl: rp.folderUrl && rp.folderUrl.trim() ? rp.folderUrl : (fallback.folderUrl || ''),
            fields: rp.fields && rp.fields.length > 0 ? rp.fields : (fallback.fields || []),
            jobRoles
          };
        }
        return {
          ...rp,
          jobRoles
        };
      });

      // Preserve all local/imported projects so projects created or imported on this site are never dropped
      const mergedMap = new Map<string, Project>();
      enrichedRemote.forEach(p => {
        if (p && p.name) mergedMap.set(p.name.trim().toLowerCase(), p);
      });

      this.projects.forEach(localP => {
        if (localP && localP.name) {
          const key = localP.name.trim().toLowerCase();
          if (!mergedMap.has(key)) {
            mergedMap.set(key, localP);
            // Automatically push to Google Apps Script Master Sheet so it gets registered in Google Sheet
            if (this.config.gasWebAppUrl) {
              const gasPayload = {
                name: localP.name,
                sheetUrl: localP.sheetUrl || '',
                folderUrl: localP.folderUrl || '',
                submission: localP.submission || 'Active',
                status: localP.status || 'Open',
                jobRoles: localP.jobRoles || [],
                fields: localP.fields || []
              };
              this.triggerGasAction('managerSaveProjectConfig', [gasPayload, this.config.passcode || 'Gowell921']).catch(console.warn);
            }
          } else {
            // Retain sheetUrl, folderUrl, and custom questions if local had them
            const remoteP = mergedMap.get(key)!;
            if (!remoteP.sheetUrl && localP.sheetUrl) remoteP.sheetUrl = localP.sheetUrl;
            if (!remoteP.folderUrl && localP.folderUrl) remoteP.folderUrl = localP.folderUrl;
            if ((!remoteP.jobRoles || remoteP.jobRoles.length === 0) && localP.jobRoles && localP.jobRoles.length > 0) {
              remoteP.jobRoles = localP.jobRoles;
            }
            if ((!remoteP.fields || remoteP.fields.length === 0) && localP.fields && localP.fields.length > 0) {
              remoteP.fields = localP.fields;
            }
          }
        }
      });

      this.projects = this.sortProjectsByNewest(Array.from(mergedMap.values()));
      this.recalculateProjectCounts();
      this.saveStored(STORAGE_KEYS.PROJECTS, this.projects);
      this.pushStateToServer({ overwriteProjects: true }).catch(console.warn);
      return { success: true, count: this.projects.length, message: `Loaded ${this.projects.length} active project(s) across Google Sheets and local storage.` };
    }


    return { success: false, count: 0, message: 'No remote projects returned. You can create a new project in the Job Projects tab.' };
  }

  public async saveProject(project: Project, originalName?: string): Promise<{ success: boolean; message: string }> {
    const cleanName = project.name.trim();
    if (!cleanName) {
      return { success: false, message: 'Project name is required.' };
    }

    const nowIso = new Date().toISOString();
    const isUpdate = Boolean(originalName && this.projects.some(p => p.name.toLowerCase() === originalName.toLowerCase()));

    if (originalName) {
      const index = this.projects.findIndex(p => p.name === originalName);
      if (index >= 0) {
        const existing = this.projects[index];
        this.projects[index] = { 
          ...existing, 
          ...project, 
          name: cleanName,
          created_at: existing.created_at || project.created_at || nowIso
        };
        if (originalName !== cleanName) {
          this.submissions = this.submissions.map(s => s.project === originalName ? { ...s, project: cleanName } : s);
          this.saveStored(STORAGE_KEYS.SUBMISSIONS, this.submissions);
        }
      } else {
        const newProj: Project = { ...project, name: cleanName, created_at: project.created_at || nowIso };
        this.projects.unshift(newProj);
      }
    } else {
      const exists = this.projects.some(p => p.name.toLowerCase() === cleanName.toLowerCase());
      if (exists) {
        return { success: false, message: 'A project with this name already exists.' };
      }
      const newProj: Project = { ...project, name: cleanName, created_at: project.created_at || nowIso };
      this.projects.unshift(newProj);
    }

    this.projects = this.sortProjectsByNewest(this.projects);
    this.saveStored(STORAGE_KEYS.PROJECTS, this.projects);

    // Record in Recent Activity feed
    this.logProjectActivity({
      projectName: cleanName,
      action: isUpdate ? 'updated' : 'created',
      details: isUpdate
        ? `Updated configuration for "${cleanName}" (${project.jobRoles?.length || 0} job roles, ${project.fields?.length || 0} fields).`
        : `Created new project "${cleanName}" with automatic Google Sheet & Drive folder setup.`,
      sheetUrl: project.sheetUrl,
      folderUrl: project.folderUrl
    });

    // Push to central server so other devices immediately see the project
    this.pushStateToServer().catch(console.warn);

    // Push to Google Apps Script (automatically creates Sheet & Drive Folder!)
    if (this.config.gasWebAppUrl) {
      const gasPayload = {
        name: cleanName,
        originalName: originalName || cleanName,
        sheetUrl: project.sheetUrl || '',
        folderUrl: project.folderUrl || '',
        submission: project.submission || 'Active',
        status: project.status || 'Open',
        jobRoles: project.jobRoles || [],
        fields: project.fields || []
      };
      
      // Run GAS sync in background so the Project Builder saves and closes immediately without hanging
      this.triggerGasAction('managerSaveProjectConfig', [gasPayload, this.config.passcode || 'Gowell921'])
        .then(() => this.syncProjectsFromRemote())
        .catch(e => console.warn('GAS auto-creation sync warning:', e));
    }

    return { success: true, message: `Project "${cleanName}" saved! Google Sheet & Drive folder initialized automatically.` };
  }

  public async deleteProject(projectName: string): Promise<{ success: boolean; message: string }> {
    this.projects = this.projects.filter(p => p.name !== projectName);
    this.saveStored(STORAGE_KEYS.PROJECTS, this.projects);

    // Record deletion in Recent Activity feed
    this.logProjectActivity({
      projectName,
      action: 'deleted',
      details: `Project "${projectName}" removed from active roster and unlinked.`
    });

    this.pushStateToServer().catch(console.warn);

    if (this.config.gasWebAppUrl) {
      this.triggerGasAction('managerDeleteProject', [projectName, this.config.passcode || 'Gowell921']).catch(console.warn);
    }

    return { success: true, message: `Project "${projectName}" removed successfully!` };
  }

  public async fetchExternalSheet(sheetUrl: string, csvContent?: string): Promise<{
    success: boolean;
    headers: string[];
    rows: string[][];
    totalRows: number;
    sheetId?: string;
    error?: string;
    isPrivateSheet?: boolean;
  }> {
    if (csvContent && typeof csvContent === 'string' && csvContent.trim()) {
      const parsed = parseCsvText(csvContent);
      return {
        success: true,
        headers: parsed.headers,
        rows: parsed.rows,
        totalRows: parsed.totalRows
      };
    }

    const cleanUrl = (sheetUrl || '').trim();
    if (!cleanUrl) {
      return {
        success: false,
        headers: [],
        rows: [],
        totalRows: 0,
        error: 'Please provide a valid Google Sheet link.'
      };
    }

    const pubMatch = cleanUrl.match(/\/spreadsheets\/d\/e\/([a-zA-Z0-9-_]+)/);
    const standardMatch = cleanUrl.match(/(?:\/spreadsheets\/(?:u\/\d+\/)?d\/(?!e\/)|\/file\/d\/|[?&]id=|^)([a-zA-Z0-9-_]{20,})/);
    const gidMatch = cleanUrl.match(/[#&?]gid=([0-9]+)/);
    const specificGid = gidMatch ? gidMatch[1] : undefined;
    const detectedSheetId = standardMatch ? standardMatch[1] : (pubMatch ? pubMatch[1] : undefined);

    // ── TIER 1: Try Server Backend Proxy (/api/fetch-sheet) ───────────────────
    try {
      const response = await fetch('/api/fetch-sheet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sheetUrl: cleanUrl, csvContent }),
        signal: AbortSignal.timeout(10000)
      });

      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const data = await response.json();
        if (data && data.success && Array.isArray(data.headers) && data.headers.length > 0) {
          return data;
        }
      }
    } catch {
      // Backend not available (e.g. static hosting on GitHub Pages/Vercel static) - proceed to client fetch
    }

    // ── TIER 2: Direct Client-Side Fetch via GViz / Export API ─────────────────
    // Google Visualization CSV endpoint supports cross-origin requests directly from web browsers
    const clientCandidates: string[] = [];
    if (pubMatch && pubMatch[1]) {
      const pubId = pubMatch[1];
      if (cleanUrl.includes('output=csv')) clientCandidates.push(cleanUrl);
      if (cleanUrl.includes('/pubhtml')) clientCandidates.push(cleanUrl.replace('/pubhtml', '/pub?output=csv'));
      if (specificGid) {
        clientCandidates.push(`https://docs.google.com/spreadsheets/d/e/${pubId}/pub?output=csv&gid=${specificGid}`);
      }
      clientCandidates.push(
        `https://docs.google.com/spreadsheets/d/e/${pubId}/pub?output=csv`,
        `https://docs.google.com/spreadsheets/d/e/${pubId}/pub?output=csv&gid=0`
      );
    } else if (standardMatch && standardMatch[1]) {
      const sId = standardMatch[1];
      // If user specified an exact gid, prioritize that tab
      if (specificGid) {
        clientCandidates.push(
          `https://docs.google.com/spreadsheets/d/${sId}/gviz/tq?tqx=out:csv&gid=${specificGid}`,
          `https://docs.google.com/spreadsheets/d/${sId}/export?format=csv&gid=${specificGid}`
        );
      }
      // Always include no-gid GViz (which automatically accesses first visible sheet in any spreadsheet!)
      clientCandidates.push(
        `https://docs.google.com/spreadsheets/d/${sId}/gviz/tq?tqx=out:csv`,
        `https://docs.google.com/spreadsheets/d/${sId}/export?format=csv`,
        `https://docs.google.com/spreadsheets/d/${sId}/pub?output=csv`,
        `https://docs.google.com/spreadsheets/d/${sId}/gviz/tq?tqx=out:csv&gid=0`,
        `https://docs.google.com/spreadsheets/d/${sId}/export?format=csv&gid=0`
      );
    } else if (cleanUrl.startsWith('http://') || cleanUrl.startsWith('https://')) {
      clientCandidates.push(cleanUrl);
    }

    for (const targetUrl of clientCandidates) {
      try {
        const res = await fetch(targetUrl, {
          signal: AbortSignal.timeout(9000)
        });
        if (res.ok) {
          const text = await res.text();
          if (
            text &&
            !text.includes('<!DOCTYPE html') &&
            !text.includes('<html') &&
            !text.includes('ServiceLogin') &&
            !text.includes('Sign in - Google Accounts')
          ) {
            const parsed = parseCsvText(text);
            if (parsed.headers && parsed.headers.length > 0) {
              return {
                success: true,
                sheetId: detectedSheetId,
                headers: parsed.headers,
                rows: parsed.rows,
                totalRows: parsed.totalRows
              };
            }
          }
        }
      } catch {
        // Try next candidate
      }
    }

    // ── TIER 3: Direct Google Apps Script Web App Fallback ────────────────────
    // If the sheet is restricted, GAS Web App executes under authorized Google account
    if (this.config.gasWebAppUrl) {
      try {
        const gasRes = await this.triggerGasAction('managerFetchSheetByUrl', [
          this.config.passcode || 'Gowell921',
          cleanUrl
        ]);
        const gasData = gasRes && (gasRes.data !== undefined ? gasRes.data : gasRes.result !== undefined ? gasRes.result : gasRes);
        if (gasData && gasData.success && Array.isArray(gasData.headers) && gasData.headers.length > 0) {
          return {
            success: true,
            sheetId: detectedSheetId,
            headers: gasData.headers,
            rows: gasData.rows || [],
            totalRows: gasData.totalRows || (gasData.rows ? gasData.rows.length : 0)
          };
        }
      } catch {
        // GAS fallback failed
      }
    }

    // ── TIER 4: Informative Actionable Error Guidance ─────────────────────────
    return {
      success: false,
      headers: [],
      rows: [],
      totalRows: 0,
      isPrivateSheet: true,
      error: "Unable to read Google Sheet automatically. Please ensure link sharing is set to 'Anyone with the link can view' (In Google Sheets: Share → General access → Anyone with the link → Viewer), or copy and paste the sheet rows / CSV file directly."
    };
  }

  public async importExternalCandidates(params: {
    projectName: string;
    projectDescription?: string;
    sheetUrl?: string;
    folderUrl?: string;
    columnMapping?: Record<string, string>;
    candidates: Partial<CandidateSubmission>[];
    fields?: ProjectField[];
    jobRoles?: string[];
    isNewProject?: boolean;
    updateExisting?: boolean;
    isResync?: boolean;
  }): Promise<{ success: boolean; importedCount: number; updatedCount: number; message: string }> {
    const cleanProject = params.projectName.trim();
    if (!cleanProject) {
      return { success: false, importedCount: 0, updatedCount: 0, message: 'Project name is required.' };
    }

    const nowIso = new Date().toISOString();

    // 1. Setup or update Project
    const existingProjIndex = this.projects.findIndex(
      p => p.name.trim().toLowerCase() === cleanProject.toLowerCase()
    );

    const mergedRoles = Array.from(new Set([
      ...(params.jobRoles || []),
      ...((existingProjIndex >= 0 ? this.projects[existingProjIndex].jobRoles : []) || [])
    ])).filter(Boolean);

    const mergedFields = params.fields && params.fields.length > 0
      ? params.fields
      : (existingProjIndex >= 0 ? this.projects[existingProjIndex].fields : []);

    let targetProject: Project;
    if (existingProjIndex >= 0) {
      const currentProj = this.projects[existingProjIndex];
      targetProject = {
        ...currentProj,
        sheetUrl: params.sheetUrl && params.sheetUrl.trim() ? params.sheetUrl.trim() : currentProj.sheetUrl,
        folderUrl: params.folderUrl && params.folderUrl.trim() ? params.folderUrl.trim() : currentProj.folderUrl,
        jobRoles: mergedRoles,
        fields: mergedFields,
        columnMapping: params.columnMapping || currentProj.columnMapping
      };
      this.projects[existingProjIndex] = targetProject;
    } else {
      targetProject = {
        name: cleanProject,
        description: params.projectDescription || `Connected external Google Sheet (${params.candidates.length} candidates)`,
        sheetUrl: (params.sheetUrl || '').trim(),
        folderUrl: (params.folderUrl || '').trim(),
        submission: 'Active',
        status: 'Open',
        jobRoles: mergedRoles,
        fields: mergedFields,
        created_at: nowIso,
        columnMapping: params.columnMapping || {}
      };
      this.projects.unshift(targetProject);
    }

    // 2. Process Candidates
    let importedCount = 0;
    let updatedCount = 0;

    for (const raw of params.candidates) {
      const candName = (raw.candidateName || '').trim() || 'Candidate';
      const passNum = (raw.passportNumber || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');

      if (!passNum && !candName) continue;

      const subId = raw.id || `sub-sheet-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      // Check the submission date of that external sheet and add that date to this site's database:
      const normRawTs = raw.timestamp ? parseAndNormalizeTimestamp(raw.timestamp, false) : '';
      const subTimestamp = normRawTs || nowIso;
      const subRecruiter = (raw.recruiter || '').trim() || 'Imported via Sheet';
      const subMobile = (raw.mobileNumber || '').trim();
      const subAltMobile = (raw.altMobileNumber || '').trim();
      const subEmail = (raw.emailId || '').trim();
      const subRole = (raw.jobRole || '').trim();
      const subRemarks = (raw.remarks || '').trim();
      const subFileUrl = (raw.fileUrl || '').trim();
      const subDirectUrl = (raw.directFileUrl || subFileUrl || '').trim();
      const subFileName = raw.fileName || `${candName} ${passNum}.pdf`;
      const subAnswers = raw.dynamicAnswers || raw.answers || {};

      // Check if candidate already exists in this project
      const existingSubIndex = this.submissions.findIndex(s => {
        if (!s) return false;
        if (passNum && s.passportNumber && s.passportNumber.toUpperCase() === passNum && this.isProjectMatch(s.project, cleanProject)) {
          return true;
        }
        if (raw.id && s.id === raw.id) {
          return true;
        }
        return false;
      });

      if (existingSubIndex >= 0) {
        if (params.updateExisting !== false) {
          const ex = this.submissions[existingSubIndex];
          // Use the sheet's genuine submission date if present, otherwise retain candidate's existing submission date
          const candidateTimestamp = normRawTs || ex.timestamp || nowIso;
          this.submissions[existingSubIndex] = {
            ...ex,
            ...raw,
            id: ex.id || subId,
            timestamp: candidateTimestamp,
            project: cleanProject,
            candidateName: candName.length >= (ex.candidateName || '').length ? candName : ex.candidateName,
            passportNumber: passNum || ex.passportNumber,
            mobileNumber: subMobile || ex.mobileNumber || '',
            altMobileNumber: subAltMobile || ex.altMobileNumber || '',
            emailId: subEmail || ex.emailId || '',
            jobRole: subRole || ex.jobRole || '',
            recruiter: subRecruiter !== 'Imported via Sheet' ? subRecruiter : (ex.recruiter || subRecruiter),
            remarks: subRemarks ? `${ex.remarks ? ex.remarks + ' | ' : ''}${subRemarks}` : ex.remarks,
            fileUrl: subFileUrl || ex.fileUrl || '',
            directFileUrl: subDirectUrl || ex.directFileUrl || '',
            fileName: subFileName || ex.fileName,
            dynamicAnswers: { ...(ex.dynamicAnswers || {}), ...(subAnswers || {}) },
            status: ex.status || 'Verified'
          };
          updatedCount++;
        }
      } else {
        const newRecord: CandidateSubmission = {
          id: subId,
          timestamp: subTimestamp,
          project: cleanProject,
          candidateName: candName,
          passportNumber: passNum,
          mobileNumber: subMobile,
          altMobileNumber: subAltMobile,
          emailId: subEmail,
          jobRole: subRole,
          recruiter: subRecruiter,
          remarks: subRemarks,
          fileUrl: subFileUrl,
          directFileUrl: subDirectUrl,
          fileName: subFileName,
          dynamicAnswers: subAnswers,
          status: 'Verified'
        };
        this.submissions.unshift(newRecord);
        importedCount++;
      }
    }

    this.recalculateProjectCounts();
    this.saveStored(STORAGE_KEYS.PROJECTS, this.projects);
    this.saveStored(STORAGE_KEYS.SUBMISSIONS, this.submissions);

    // Push state to server and notify UI
    await this.pushStateToServer({ overwriteProjects: true, overwriteSubmissions: true });

    // CRITICAL: Immediately register/save the imported project in Google Apps Script Master Sheet (Project_Config)
    if (this.config.gasWebAppUrl) {
      const gasPayload = {
        name: cleanProject,
        originalName: cleanProject,
        sheetUrl: targetProject.sheetUrl || '',
        folderUrl: targetProject.folderUrl || '',
        submission: targetProject.submission || 'Active',
        status: targetProject.status || 'Open',
        jobRoles: targetProject.jobRoles || [],
        fields: targetProject.fields || []
      };
      this.triggerGasAction('managerSaveProjectConfig', [gasPayload, this.config.passcode || 'Gowell921'])
        .then(() => console.log(`Project "${cleanProject}" saved to Google Apps Script Master Sheet Project_Config.`))
        .catch(e => console.warn('GAS managerSaveProjectConfig failed during sheet import:', e));
    }

    // Record in Recent Activity feed
    const actType: ProjectActivityAction = params.isResync ? 'synced' : 'imported';
    const detailMsg = params.isResync
      ? `Synchronized Google Sheet for "${cleanProject}": ${importedCount} new candidate(s) added, ${updatedCount} refreshed.`
      : `Imported from Google Sheet: ${importedCount} candidate(s) loaded, ${updatedCount} updated into "${cleanProject}".`;

    this.logProjectActivity({
      projectName: cleanProject,
      action: actType,
      details: detailMsg,
      sheetUrl: targetProject.sheetUrl,
      folderUrl: targetProject.folderUrl,
      importedCount,
      updatedCount
    });

    this.notifyListeners();

    return {
      success: true,
      importedCount,
      updatedCount,
      message: `Successfully processed Google Sheet: ${importedCount} new candidate(s) added, ${updatedCount} updated in project "${cleanProject}".`
    };
  }

  public async resyncExternalProjectSheet(projectName: string): Promise<{ success: boolean; importedCount: number; updatedCount: number; message: string }> {
    const proj = this.projects.find(p => this.isProjectMatch(p.name, projectName));
    if (!proj || !proj.sheetUrl) {
      return { success: false, importedCount: 0, updatedCount: 0, message: 'Project or sheet URL not found.' };
    }

    const fetched = await this.fetchExternalSheet(proj.sheetUrl);
    if (!fetched.success || fetched.rows.length === 0) {
      return { success: false, importedCount: 0, updatedCount: 0, message: fetched.error || 'Failed to fetch rows from connected sheet.' };
    }

    const mapping = proj.columnMapping || {};
    const effectiveMapping: Record<number, string> = {};

    fetched.headers.forEach((h, idx) => {
      if (mapping[h]) {
        effectiveMapping[idx] = mapping[h];
      } else {
        effectiveMapping[idx] = detectHeaderMapping(h);
      }
    });

    const parsedCandidates: Partial<CandidateSubmission>[] = [];
    const extractedRoles = new Set<string>();

    for (const row of fetched.rows) {
      const item: Partial<CandidateSubmission> = {
        project: proj.name,
        dynamicAnswers: {}
      };

      fetched.headers.forEach((header, idx) => {
        const val = (row[idx] || '').trim();
        const mapKey = effectiveMapping[idx];

        if (!val || mapKey === 'skip') return;

        if (mapKey === 'candidateName') item.candidateName = val;
        else if (mapKey === 'passportNumber') item.passportNumber = val;
        else if (mapKey === 'mobileNumber') item.mobileNumber = val;
        else if (mapKey === 'altMobileNumber') item.altMobileNumber = val;
        else if (mapKey === 'emailId') item.emailId = val;
        else if (mapKey === 'jobRole') {
          item.jobRole = val;
          extractedRoles.add(val);
        }
        else if (mapKey === 'recruiter') item.recruiter = val;
        else if (mapKey === 'timestamp') {
          item.timestamp = parseAndNormalizeTimestamp(val, false) || val;
        }
        else if (mapKey === 'fileUrl') item.fileUrl = val;
        else if (mapKey === 'remarks') item.remarks = val;
        else {
          item.dynamicAnswers = item.dynamicAnswers || {};
          item.dynamicAnswers[header] = val;
        }
      });

      // If timestamp wasn't mapped, search the row for the submission date
      if (!item.timestamp) {
        const foundDate = extractSubmissionDateFromRow(fetched.headers, row, effectiveMapping);
        if (foundDate) {
          item.timestamp = foundDate;
        }
      }

      if (item.candidateName || item.passportNumber) {
        parsedCandidates.push(item);
      }
    }

    return this.importExternalCandidates({
      projectName: proj.name,
      sheetUrl: proj.sheetUrl,
      columnMapping: proj.columnMapping,
      candidates: parsedCandidates,
      jobRoles: Array.from(extractedRoles),
      isResync: true
    });
  }

  /**
   * Automatically polls and synchronizes all projects connected to external Google Sheets.
   * If new submissions are added to the external sheet, they auto-reflect in this site.
   * If existing submissions are updated, their date/time is updated to today so they show in today's submissions.
   */
  public async syncAllExternalProjectSheets(): Promise<{
    syncedProjects: number;
    newSubmissions: number;
    updatedSubmissions: number;
  }> {
    const externalProjects = this.projects.filter(
      p => p.sheetUrl && typeof p.sheetUrl === 'string' && p.sheetUrl.trim().length > 10
    );

    let totalNew = 0;
    let totalUpdated = 0;
    let synced = 0;

    for (const proj of externalProjects) {
      try {
        const res = await this.resyncExternalProjectSheet(proj.name);
        if (res.success) {
          synced++;
          totalNew += res.importedCount || 0;
          totalUpdated += res.updatedCount || 0;
        }
      } catch (e) {
        console.warn(`Error syncing external sheet for ${proj.name}:`, e);
      }
    }

    if (totalNew > 0 || totalUpdated > 0) {
      this.recalculateProjectCounts();
      this.saveStored(STORAGE_KEYS.PROJECTS, this.projects);
      this.saveStored(STORAGE_KEYS.SUBMISSIONS, this.submissions);
      await this.pushStateToServer();
      this.notifyListeners();
    }

    return {
      syncedProjects: synced,
      newSubmissions: totalNew,
      updatedSubmissions: totalUpdated
    };
  }

  public async testConnection(customConfig?: Partial<BackendConfig>): Promise<{ success: boolean; message: string; details?: any }> {
    const testCfg = { ...this.config, ...customConfig };
    const gasUrl = (testCfg.gasWebAppUrl || '').trim();
    const pass = (testCfg.passcode || 'Gowell921').trim();

    const reports: string[] = [];
    let anySuccess = false;

    // 1. Test Google Apps Script
    if (gasUrl) {
      try {
        const res = await this.triggerGasAction('checkManagerPasscode', [pass], { ...testCfg, gasWebAppUrl: gasUrl });
        if (res && (res.success === true || res.data === true || res === true || res.status === 'ok' || res.status === 'success')) {
          reports.push('Google Apps Script: Connected & verified (passcode accepted)');
          anySuccess = true;
        } else {
          // Fallback check with getFormInitializationData
          const formRes = await this.triggerGasAction('getFormInitializationData', [], { ...testCfg, gasWebAppUrl: gasUrl });
          if (formRes && (formRes.success || formRes.data || formRes.recruiters)) {
            reports.push('Google Apps Script: Connected and reachable');
            anySuccess = true;
          } else {
            reports.push('Google Apps Script: Connected, but check passcode');
            anySuccess = true;
          }
        }
      } catch (err: any) {
        reports.push(`Google Apps Script: ${err.message || String(err)}`);
      }
    }

    if (reports.length === 0) {
      return {
        success: false,
        message: 'No Google Apps Script Web App URL configured. Please enter your Google Apps Script URL in Settings.'
      };
    }

    return {
      success: anySuccess,
      message: reports.join(' | ')
    };
  }

  // --- RECRUITERS ---
  public getRecruitersSync(): string[] {
    return this.recruiters && this.recruiters.length > 0 ? [...this.recruiters] : [];
  }

  public async getRecruiters(forceRemote: boolean = false): Promise<string[]> {
    if (this.recruiters.length <= 1) {
      if (this.config.gasWebAppUrl) {
        try {
          const formInit = await this.triggerGasAction('getFormInitializationData');
          const formData = formInit && (formInit.data || formInit.result || formInit);
          if (formData && Array.isArray(formData.recruiters) && formData.recruiters.length > 0) {
            const rawRecs = formData.recruiters.map((r: any) => String(r).trim()).filter(Boolean);
            this.recruiters = Array.from(new Set([...this.recruiters, ...rawRecs])).sort();
            this.saveStored(STORAGE_KEYS.RECRUITERS, this.recruiters);
          }
        } catch {}
      }
    } else if (forceRemote && this.config.gasWebAppUrl) {
      // Refresh in background so UI renders instantly
      this.triggerGasAction('getFormInitializationData').then((formInit: any) => {
        const formData = formInit && (formInit.data || formInit.result || formInit);
        if (formData && Array.isArray(formData.recruiters) && formData.recruiters.length > 0) {
          const rawRecs = formData.recruiters.map((r: any) => String(r).trim()).filter(Boolean);
          this.recruiters = Array.from(new Set([...this.recruiters, ...rawRecs])).sort();
          this.saveStored(STORAGE_KEYS.RECRUITERS, this.recruiters);
          this.notifyListeners();
        }
      }).catch(console.warn);
    }
    return [...this.recruiters];
  }

  public async addRecruiter(name: string): Promise<{ success: boolean; message: string }> {
    const clean = name.trim();
    if (!clean) return { success: false, message: 'Recruiter name is required.' };
    if (this.recruiters.some(r => r.toLowerCase() === clean.toLowerCase())) {
      return { success: false, message: 'Recruiter already exists in roster.' };
    }
    this.recruiters.push(clean);
    this.recruiters.sort((a, b) => a.localeCompare(b));
    this.saveStored(STORAGE_KEYS.RECRUITERS, this.recruiters);

    this.pushStateToServer({ overwriteRecruiters: true }).catch(console.warn);
    this.notifyListeners();

    if (this.config.gasWebAppUrl) {
      this.triggerGasAction('managerCreateRecruiter', [clean, this.config.passcode || 'Gowell921']).catch(console.warn);
    }

    return { success: true, message: `Recruiter "${clean}" added to team roster.` };
  }

  public async deleteRecruiter(name: string): Promise<{ success: boolean; message: string }> {
    const clean = name.trim().toLowerCase();
    this.recruiters = this.recruiters.filter(r => r.trim().toLowerCase() !== clean);
    this.saveStored(STORAGE_KEYS.RECRUITERS, this.recruiters);

    this.pushStateToServer({ overwriteRecruiters: true, deletedRecruiter: name.trim() }).catch(console.warn);
    this.notifyListeners();

    // Notify Google Apps Script backend if connected
    if (this.config.gasWebAppUrl) {
      this.triggerGasAction('managerDeleteRecruiter', [name.trim(), this.config.passcode || 'Gowell921']).catch(console.warn);
    }

    return { success: true, message: `Recruiter "${name}" removed from roster.` };
  }

  // --- DUPLICATE CHECK ---
  public async checkDuplicatePassport(project: string, passportNumber: string): Promise<{
    isDuplicate: boolean;
    existing?: CandidateSubmission;
  }> {
    if (!project || !passportNumber) return { isDuplicate: false };

    const cleanPass = passportNumber.replace(/[\\/:*?"<>|\s]/g, '').toLowerCase();

    // 1. Check local submissions store first (instant response)
    const match = this.submissions.find(
      s => s.project === project && s.passportNumber.replace(/[\\/:*?"<>|\s]/g, '').toLowerCase() === cleanPass
    );

    if (match) {
      return { isDuplicate: true, existing: match };
    }

    return { isDuplicate: false };
  }

  public getEffectivePassport(item: any): string {
    if (!item) return '';
    let pass = String(item.passportNumber || item.passport || '').trim();
    if (!pass && item.dynamicAnswers && typeof item.dynamicAnswers === 'object') {
      for (const [k, v] of Object.entries(item.dynamicAnswers)) {
        if (/passport/i.test(k) && v) {
          pass = String(v).trim();
          break;
        }
      }
    }
    if (!pass && item.answers && typeof item.answers === 'object') {
      for (const [k, v] of Object.entries(item.answers)) {
        if (/passport/i.test(k) && v) {
          pass = String(v).trim();
          break;
        }
      }
    }
    return pass.toUpperCase().replace(/[^A-Z0-9]/g, '');
  }

  public getEffectiveMobile(item: any): string {
    if (!item) return '';
    let mob = String(item.mobileNumber || item.mobile || '').trim();
    if ((!mob || mob === '-') && item.dynamicAnswers && typeof item.dynamicAnswers === 'object') {
      for (const [k, v] of Object.entries(item.dynamicAnswers)) {
        if (/^(mobile|mobile_number|mobile_no|phone|contact_number|primary_mobile)$/i.test(k) && v) {
          mob = String(v).trim();
          break;
        }
      }
    }
    if ((!mob || mob === '-') && item.answers && typeof item.answers === 'object') {
      for (const [k, v] of Object.entries(item.answers)) {
        if (/^(mobile|mobile_number|mobile_no|phone|contact_number|primary_mobile)$/i.test(k) && v) {
          mob = String(v).trim();
          break;
        }
      }
    }
    return mob === '-' ? '' : mob;
  }

  public getEffectiveAltMobile(item: any): string {
    if (!item) return '';
    let alt = String(item.altMobileNumber || item.altMobile || item.alternativeMobileNumber || '').trim();
    if ((!alt || alt === '-') && item.dynamicAnswers && typeof item.dynamicAnswers === 'object') {
      for (const [k, v] of Object.entries(item.dynamicAnswers)) {
        if (/alt.*mobile|alt.*phone|alternative.*mobile|alternative.*phone|alt_mobile/i.test(k) && v) {
          alt = String(v).trim();
          break;
        }
      }
    }
    if ((!alt || alt === '-') && item.answers && typeof item.answers === 'object') {
      for (const [k, v] of Object.entries(item.answers)) {
        if (/alt.*mobile|alt.*phone|alternative.*mobile|alternative.*phone|alt_mobile/i.test(k) && v) {
          alt = String(v).trim();
          break;
        }
      }
    }
    return alt === '-' ? '' : alt;
  }

  public getEffectiveEmail(item: any): string {
    if (!item) return '';
    let email = String(item.emailId || item.email || item.email_id || '').trim();
    if (!email && item.dynamicAnswers && typeof item.dynamicAnswers === 'object') {
      for (const [k, v] of Object.entries(item.dynamicAnswers)) {
        if (/email|e-mail|mail/i.test(k) && v) {
          email = String(v).trim();
          break;
        }
      }
    }
    if (!email && item.answers && typeof item.answers === 'object') {
      for (const [k, v] of Object.entries(item.answers)) {
        if (/email|e-mail|mail/i.test(k) && v) {
          email = String(v).trim();
          break;
        }
      }
    }
    return email;
  }

  public getEffectiveJobRole(item: any): string {
    if (!item) return '';
    let role = String(item.jobRole || item.role || item.position || item.trade || '').trim();
    if (!role && item.dynamicAnswers && typeof item.dynamicAnswers === 'object') {
      for (const [k, v] of Object.entries(item.dynamicAnswers)) {
        if (/^(job\s*role|role|position|designation|job_role|trade)$/i.test(k) && v) {
          role = String(v).trim();
          break;
        }
      }
    }
    if (!role && item.answers && typeof item.answers === 'object') {
      for (const [k, v] of Object.entries(item.answers)) {
        if (/^(job\s*role|role|position|designation|job_role|trade)$/i.test(k) && v) {
          role = String(v).trim();
          break;
        }
      }
    }
    return role;
  }

  // --- SUBMISSIONS ---
  public deduplicateSubmissions(subs: CandidateSubmission[]): CandidateSubmission[] {
    if (!Array.isArray(subs)) return [];

    const normalizeStr = (str: any) => String(str || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');

    // Filter out invalid records or deleted submissions
    const valid = subs.filter(s => {
      if (!s) return false;
      if (this.isDeletedSubmission(s)) return false;
      const name = String(s.candidateName || (s as any).name || '').trim();
      const pass = this.getEffectivePassport(s);
      if (!name && !pass) return false;
      return true;
    });

    const consolidated: CandidateSubmission[] = [];

    for (const raw of valid) {
      const candName = String(raw.candidateName || (raw as any).name || 'Candidate').trim();
      const passNum = this.getEffectivePassport(raw);
      const mobNum = this.getEffectiveMobile(raw);
      const altMobNum = this.getEffectiveAltMobile(raw);
      const email = this.getEffectiveEmail(raw);
      const role = this.getEffectiveJobRole(raw);
      const projName = String(raw.project || (raw as any).projectName || 'General').trim();

      const normName = normalizeStr(candName);
      let matchIdx = -1;

      for (let i = 0; i < consolidated.length; i++) {
        const existing = consolidated[i];
        const exPass = this.getEffectivePassport(existing);
        const exName = normalizeStr(existing.candidateName);

        // Match 1: Same global passport number
        if (passNum && exPass && passNum === exPass) {
          matchIdx = i;
          break;
        }

        // Match 2: Same candidate full name
        if (normName && exName && normName.length >= 3 && normName === exName) {
          if (this.isProjectMatch(projName, existing.project)) {
            matchIdx = i;
            break;
          }
          if (raw.recruiter && existing.recruiter && raw.recruiter.trim().toLowerCase() === existing.recruiter.trim().toLowerCase()) {
            matchIdx = i;
            break;
          }
        }

        // Match 3: Identical submission ID
        if (raw.id && existing.id && raw.id === existing.id) {
          matchIdx = i;
          break;
        }
      }

      if (matchIdx >= 0) {
        const ex = consolidated[matchIdx];

        const bestPass = passNum || ex.passportNumber || this.getEffectivePassport(ex) || '';
        const bestName = (candName && candName !== 'Candidate' && candName.length >= (ex.candidateName || '').length)
          ? candName
          : (ex.candidateName || candName);

        const bestRecruiter = (raw.recruiter && raw.recruiter !== 'Recruiter') ? raw.recruiter : (ex.recruiter || raw.recruiter || 'Recruiter');
        const bestMobile = (mobNum && mobNum !== '-' && mobNum.length >= String(ex.mobileNumber || '').length)
          ? mobNum
          : (ex.mobileNumber || mobNum || '');
        const bestAltMobile = (altMobNum && altMobNum !== '-' && altMobNum.length >= String(ex.altMobileNumber || '').length)
          ? altMobNum
          : (ex.altMobileNumber || altMobNum || '');
        const bestEmail = (email && email.length >= String(ex.emailId || '').length)
          ? email
          : (ex.emailId || email || '');
        const bestJobRole = (role && role.length >= String(ex.jobRole || '').length)
          ? role
          : (ex.jobRole || role || '');

        const scoreUrl = (url?: string): number => {
          if (!url || typeof url !== 'string' || !url.startsWith('http')) return 0;
          if (url.includes('sample_cv')) return 0;
          if (url.includes('/drive/folders/') || url.includes('/folders/')) return 1;
          if (url.includes('storage.googleapis.com')) return 2;
          if (url.includes('supabase.co/storage')) return 4;
          if (url.includes('drive.google.com/file') || url.includes('/open?id=') || url.includes('/uc?id=') || url.includes('drive.google.com/d/')) return 5;
          return 3;
        };

        const scoreRaw = scoreUrl(raw.fileUrl);
        const scoreEx = scoreUrl(ex.fileUrl);
        const bestFileUrl = scoreRaw > scoreEx ? raw.fileUrl : (scoreEx > 0 ? ex.fileUrl : (raw.fileUrl || ex.fileUrl || ''));

        const scoreDirectRaw = scoreUrl(raw.directFileUrl);
        const scoreDirectEx = scoreUrl(ex.directFileUrl);
        const bestDirectFileUrl = scoreDirectRaw > scoreDirectEx ? raw.directFileUrl : (scoreDirectEx > 0 ? ex.directFileUrl : (raw.directFileUrl || ex.directFileUrl || ''));

        const bestFileName = (raw.fileName && raw.fileName.length > (ex.fileName || '').length) ? raw.fileName : (ex.fileName || raw.fileName || `${bestName} ${bestPass}.pdf`);
        const bestRemarks = raw.remarks && raw.remarks.length > (ex.remarks || '').length ? raw.remarks : (ex.remarks || raw.remarks || '');
        const mergedDynamic = { ...(ex.dynamicAnswers || {}), ...(raw.dynamicAnswers || {}) };

        const tsEx = getValidTimestampMs(ex.timestamp);
        const tsRaw = getValidTimestampMs(raw.timestamp);
        const normRaw = parseAndNormalizeTimestamp(raw.timestamp, false) || raw.timestamp;
        const normEx = parseAndNormalizeTimestamp(ex.timestamp, false) || ex.timestamp;

        const nowLimit = Date.now() + 24 * 60 * 60 * 1000;
        let bestTimestamp = normRaw || normEx || new Date().toISOString();
        if (tsRaw > nowLimit && tsEx <= nowLimit && tsEx > 0) {
          bestTimestamp = normEx;
        } else if (tsEx > nowLimit && tsRaw <= nowLimit && tsRaw > 0) {
          bestTimestamp = normRaw;
        } else {
          bestTimestamp = tsRaw >= tsEx ? (normRaw || normEx) : (normEx || normRaw);
        }

        const bestId = ex.id && !ex.id.startsWith('sub-raw') && !ex.id.startsWith('sub-gas') ? ex.id : (raw.id || ex.id);

        consolidated[matchIdx] = {
          ...ex,
          ...raw,
          id: bestId,
          timestamp: bestTimestamp || new Date().toISOString(),
          project: (ex.project && ex.project !== 'General') ? ex.project : projName,
          recruiter: bestRecruiter,
          candidateName: bestName,
          passportNumber: bestPass,
          mobileNumber: bestMobile,
          altMobileNumber: bestAltMobile,
          emailId: bestEmail,
          jobRole: bestJobRole,
          remarks: bestRemarks,
          fileUrl: bestFileUrl,
          directFileUrl: bestDirectFileUrl,
          fileName: bestFileName,
          dynamicAnswers: mergedDynamic,
          status: ex.status || raw.status || 'Verified'
        };
      } else {
        const normTs = parseAndNormalizeTimestamp(raw.timestamp, false) || raw.timestamp;
        consolidated.push({
          ...raw,
          id: raw.id || `sub-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          timestamp: normTs || new Date().toISOString(),
          project: projName,
          recruiter: raw.recruiter || 'Recruiter',
          candidateName: candName,
          passportNumber: passNum,
          mobileNumber: mobNum === '-' ? '' : mobNum,
          altMobileNumber: altMobNum === '-' ? '' : altMobNum,
          emailId: email,
          jobRole: role,
          remarks: (raw.remarks || '').toString().trim(),
          fileUrl: raw.fileUrl || '',
          fileName: raw.fileName || `${candName} ${passNum}.pdf`,
          dynamicAnswers: raw.dynamicAnswers || {},
          status: raw.status || 'Verified'
        });
      }
    }

    consolidated.sort((a, b) => getValidTimestampMs(b.timestamp) - getValidTimestampMs(a.timestamp));
    return consolidated;
  }

  public async getSubmissions(projectName?: string, recruiterName?: string, forceRemote: boolean = false): Promise<CandidateSubmission[]> {
    // If Supabase or GAS configured, attempt remote sync
    if (forceRemote || this.submissions.length === 0) {
      await this.syncSubmissionsFromRemote();
    }

    let list = this.deduplicateSubmissions(this.submissions);
    if (projectName && projectName !== 'All Projects') {
      list = list.filter(s => this.isProjectMatch(s.project, projectName));
    }
    if (recruiterName && recruiterName !== 'All Recruiters') {
      list = list.filter(s => s.recruiter.trim().toLowerCase() === recruiterName.trim().toLowerCase());
    }

    // Sort newest first
    list.sort((a, b) => getValidTimestampMs(b.timestamp) - getValidTimestampMs(a.timestamp));
    return list;
  }

  public getAllSubmissions(): CandidateSubmission[] {
    return this.deduplicateSubmissions(this.submissions);
  }

  public async syncSubmissionsFromRemote(): Promise<{ success: boolean; count: number; message: string }> {
    let remoteRecords: CandidateSubmission[] = [];
    const passcode = this.config.passcode || 'Gowell921';

    // 1. Fetch from Google Apps Script if configured
    if (this.config.gasWebAppUrl) {
      try {
        // Method A: Call managerGetAllSubmissions (all sheets & projects at once)
        const allSubsRes = await this.triggerGasAction('managerGetAllSubmissions', [passcode]);
        const allSubsData = allSubsRes && (allSubsRes.data !== undefined ? allSubsRes.data : allSubsRes.result !== undefined ? allSubsRes.result : allSubsRes);
        
        if (Array.isArray(allSubsData) && allSubsData.length > 0) {
          remoteRecords = allSubsData.map((s: any) => ({
            id: s.id || `sub-gas-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            timestamp: s.timestamp || new Date().toISOString(),
            project: s.project || s.projectName || 'General',
            recruiter: s.recruiter || s.uploadedBy || 'Recruiter',
            candidateName: s.candidateName || s.name || 'Candidate',
            passportNumber: (s.passportNumber || s.passport || '').toString().toUpperCase().trim(),
            mobileNumber: (s.mobileNumber || s.mobile || '').toString().trim(),
            remarks: s.remarks || (s.dynamicAnswers && s.dynamicAnswers.Remarks) || '',
            fileUrl: s.fileUrl || '',
            fileName: s.fileName || `${s.candidateName || 'Candidate'} ${s.passportNumber || ''}.pdf`,
            dynamicAnswers: typeof s.dynamicAnswers === 'object' && s.dynamicAnswers !== null ? s.dynamicAnswers : {},
            status: s.status || 'Verified'
          }));
        } else {
          // Method B: Loop through active projects and fetch logs via getProjectDashboardMetrics & managerReadProjectSheetData
          if (this.projects.length === 0) {
            await this.syncProjectsFromRemote();
          }

          for (const proj of this.projects) {
            try {
              const metricsRes = await this.triggerGasAction('getProjectDashboardMetrics', [proj.name, passcode]);
              const metricsData = metricsRes && (metricsRes.data !== undefined ? metricsRes.data : metricsRes.result !== undefined ? metricsRes.result : metricsRes);
              
              if (metricsData && Array.isArray(metricsData.allLogs) && metricsData.allLogs.length > 0) {
                const headers: string[] = Array.isArray(metricsData.headers) ? metricsData.headers : [];
                
                // Identify dynamic column positions
                let nameIdx = 2, passIdx = 3, mobIdx = 4, fileIdx = -1;
                headers.forEach((h, idx) => {
                  const hLow = String(h).toLowerCase();
                  if (/candidate|applicant|candidate\s*name/i.test(hLow)) nameIdx = idx;
                  else if (/passport/i.test(hLow)) passIdx = idx;
                  else if (/mobile|phone|contact/i.test(hLow)) mobIdx = idx;
                  else if (/url|link|file|cv|resume|doc/i.test(hLow)) fileIdx = idx;
                });

                const projSubs: CandidateSubmission[] = metricsData.allLogs.map((log: any, idx: number) => {
                  const allCells = Array.isArray(log.allCells) ? log.allCells : [];
                  
                  // Extract real Google Drive URL from any cell
                  let driveUrl = '';
                  for (const c of allCells) {
                    if (typeof c === 'string' && (c.includes('drive.google.com') || c.includes('drive.google'))) {
                      driveUrl = c.trim();
                      break;
                    }
                  }

                  let rawFile = driveUrl || (fileIdx >= 0 && allCells[fileIdx] ? String(allCells[fileIdx]) : (allCells.length > 0 ? String(allCells[allCells.length - 1] || '') : (log.fileUrl || '')));
                  if (rawFile.includes('storage.googleapis.com') || rawFile.includes('sample_cv')) {
                    rawFile = driveUrl || '';
                  }
                  
                  const candName = log.candidateName || (allCells[nameIdx] ? String(allCells[nameIdx]) : 'Candidate');
                  const passNum = (log.passport || (allCells[passIdx] ? String(allCells[passIdx]) : '')).toString().toUpperCase().trim();
                  const mobNum = (log.mobile || (allCells[mobIdx] ? String(allCells[mobIdx]) : '')).toString().trim();

                  // Dynamic answers
                  const dynamicAnswers: Record<string, any> = {};
                  headers.forEach((h, c) => {
                    if (c !== 0 && c !== 1 && c !== nameIdx && c !== passIdx && c !== mobIdx && c !== fileIdx && allCells[c] !== undefined) {
                      dynamicAnswers[String(h)] = allCells[c];
                    }
                  });

                  return {
                    id: `sub-gas-${proj.name.replace(/\s+/g, '')}-${idx + 1}-${passNum.replace(/\s+/g, '')}`,
                    timestamp: log.timestamp || new Date().toISOString(),
                    project: proj.name,
                    recruiter: log.recruiter || (allCells[1] ? String(allCells[1]) : 'Recruiter'),
                    candidateName: candName,
                    passportNumber: passNum,
                    mobileNumber: mobNum,
                    remarks: dynamicAnswers['Remarks'] || log.remarks || '',
                    fileUrl: rawFile,
                    fileName: `${candName} ${passNum}.pdf`,
                    dynamicAnswers,
                    status: 'Verified'
                  };
                });

                remoteRecords = [...remoteRecords, ...projSubs];
              } else {
                // Method C fallback: managerReadProjectSheetData
                const rawSheetRes = await this.triggerGasAction('managerReadProjectSheetData', [passcode, proj.name]);
                const rawSheet = rawSheetRes && (rawSheetRes.data || rawSheetRes.rows || (Array.isArray(rawSheetRes) ? rawSheetRes : null));
                if (Array.isArray(rawSheet) && rawSheet.length > 1) {
                  const rawRows = rawSheet.slice(1);
                  
                  rawRows.forEach((row: any[], rIdx: number) => {
                    if (Array.isArray(row) && row.length >= 4) {
                      const candName = String(row[2] || '').trim();
                      const passNum = String(row[3] || '').trim().toUpperCase();
                      if (candName || passNum) {
                        const fileUrl = row.length > 5 ? String(row[row.length - 1] || '') : '';
                        remoteRecords.push({
                          id: `sub-raw-${proj.name.replace(/\s+/g, '')}-${rIdx + 1}-${passNum}`,
                          timestamp: row[0] ? new Date(row[0]).toISOString() : new Date().toISOString(),
                          project: proj.name,
                          recruiter: String(row[1] || 'Recruiter'),
                          candidateName: candName || 'Candidate',
                          passportNumber: passNum,
                          mobileNumber: String(row[4] || ''),
                          remarks: '',
                          fileUrl: fileUrl,
                          fileName: `${candName} ${passNum}.pdf`,
                          dynamicAnswers: {},
                          status: 'Verified'
                        });
                      }
                    }
                  });
                }
              }
            } catch (projErr) {
              console.warn(`Error fetching submissions for ${proj.name}:`, projErr);
            }
          }
        }
      } catch (err) {
        console.warn('Google Apps Script remote submissions fetch failed:', err);
      }
    }

    if (remoteRecords.length > 0 || this.submissions.length > 0) {
      // Robust deduplication merging remote and local
      const combined = [...remoteRecords, ...this.submissions];
      this.submissions = this.deduplicateSubmissions(combined);
      this.saveStored(STORAGE_KEYS.SUBMISSIONS, this.submissions);

      // Refresh project submission counts
      this.recalculateProjectCounts();

      return { success: true, count: this.submissions.length, message: `Successfully fetched and deduplicated ${this.submissions.length} candidate submission(s) across projects!` };
    }

    return { success: false, count: 0, message: 'No candidate records found in remote project sheets.' };
  }

  public isDeletedSubmission(s: Partial<CandidateSubmission>): boolean {
    if (!s) return false;
    if (s.id && this.deletedSubmissionKeys.has(s.id.trim())) return true;
    const pass = (s.passportNumber || '').trim().toLowerCase();
    const proj = (s.project || '').trim().toLowerCase();
    const cand = (s.candidateName || '').trim().toLowerCase();
    if (pass && this.deletedSubmissionKeys.has('pass_' + pass)) return true;
    if (proj && pass && this.deletedSubmissionKeys.has(`${proj}___${pass}`)) return true;
    if (cand && pass && this.deletedSubmissionKeys.has(`${cand}___${pass}`)) return true;
    if (proj && cand && this.deletedSubmissionKeys.has(`${proj}___name_${cand}`)) return true;
    if (cand && this.deletedSubmissionKeys.has(`name_${cand}`)) return true;
    return false;
  }

  // Recalculate today / total submission counts per project
  public recalculateProjectCounts(): void {
    this.projects = this.projects.map(p => {
      const projSubs = this.submissions.filter(s => this.isProjectMatch(s.project, p.name));
      const todayCount = projSubs.filter(s => isTodaySubmission(s.timestamp)).length;
      return {
        ...p,
        totalSubmissions: projSubs.length,
        todaySubmissions: todayCount
      };
    });
    this.saveStored(STORAGE_KEYS.PROJECTS, this.projects);
  }

  public findCandidateDriveUrl(projectName?: string, passportNumber?: string, candidateName?: string): string {
    const cleanPass = (passportNumber || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    const cleanCand = (candidateName || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');

    const extractDriveId = (text?: string): string => {
      if (!text || typeof text !== 'string') return '';
      const m1 = text.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
      if (m1 && m1[1]) return m1[1];
      const m2 = text.match(/[?&]id=([a-zA-Z0-9_-]+)/);
      if (m2 && m2[1]) return m2[1];
      const m3 = text.match(/\/d\/([a-zA-Z0-9_-]+)/);
      if (m3 && m3[1]) return m3[1];
      const m4 = text.match(/\/open\?id=([a-zA-Z0-9_-]+)/);
      if (m4 && m4[1]) return m4[1];
      const m5 = text.match(/\/uc\?id=([a-zA-Z0-9_-]+)/);
      if (m5 && m5[1]) return m5[1];
      return '';
    };

    // First check inside the matching project
    for (const s of this.submissions) {
      if (!s) continue;
      const projMatch = projectName ? this.isProjectMatch(s.project, projectName) : true;
      if (!projMatch) continue;
      const sPass = (s.passportNumber || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
      const sCand = (s.candidateName || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
      if ((cleanPass && sPass && cleanPass === sPass) || (cleanCand && sCand && cleanCand.length >= 4 && cleanCand === sCand)) {
        if (s.fileUrl && extractDriveId(s.fileUrl)) return s.fileUrl;
        if (s.directFileUrl && extractDriveId(s.directFileUrl)) return s.directFileUrl;
      }
    }

    // Global cross-project passport fallback
    if (cleanPass) {
      for (const s of this.submissions) {
        if (!s) continue;
        const sPass = (s.passportNumber || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (sPass && cleanPass === sPass) {
          if (s.fileUrl && extractDriveId(s.fileUrl)) return s.fileUrl;
          if (s.directFileUrl && extractDriveId(s.directFileUrl)) return s.directFileUrl;
        }
      }
    }

    return '';
  }

  public async resolveCandidateFileUrl(projectName: string, passportNumber: string, candidateName?: string): Promise<string> {
    const cleanPass = (passportNumber || '').trim().toUpperCase();
    const cleanCand = (candidateName || '').trim().toUpperCase();

    const extractDriveId = (text?: string): string => {
      if (!text || typeof text !== 'string') return '';
      const m1 = text.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
      if (m1 && m1[1]) return m1[1];
      const m2 = text.match(/[?&]id=([a-zA-Z0-9_-]+)/);
      if (m2 && m2[1]) return m2[1];
      const m3 = text.match(/\/d\/([a-zA-Z0-9_-]+)/);
      if (m3 && m3[1]) return m3[1];
      const m4 = text.match(/\/open\?id=([a-zA-Z0-9_-]+)/);
      if (m4 && m4[1]) return m4[1];
      const m5 = text.match(/\/uc\?id=([a-zA-Z0-9_-]+)/);
      if (m5 && m5[1]) return m5[1];
      return '';
    };

    // 1. Check local submissions state via synchronous helper
    const cachedDriveUrl = this.findCandidateDriveUrl(projectName, passportNumber, candidateName);
    if (cachedDriveUrl) {
      return cachedDriveUrl;
    }

    const existing = this.submissions.find(s => 
      this.isProjectMatch(s.project, projectName) && (
        (cleanPass && s.passportNumber && s.passportNumber.toUpperCase() === cleanPass) ||
        (cleanCand && s.candidateName && s.candidateName.toUpperCase() === cleanCand)
      )
    );

    if (existing && existing.fileUrl && extractDriveId(existing.fileUrl)) {
      return existing.fileUrl;
    }

    // 2. Fetch directly from Google Apps Script project sheet
    if (this.config.gasWebAppUrl) {
      try {
        const metricsRes = await this.triggerGasAction('getProjectDashboardMetrics', [projectName, this.config.passcode || 'Gowell921']);
        const metricsData = metricsRes && (metricsRes.data !== undefined ? metricsRes.data : metricsRes.result !== undefined ? metricsRes.result : metricsRes);
        if (metricsData && Array.isArray(metricsData.allLogs)) {
          const matched = metricsData.allLogs.find((l: any) => {
            const p = (l.passport || '').toString().trim().toUpperCase();
            const n = (l.candidateName || '').toString().trim().toUpperCase();
            return (cleanPass && p === cleanPass) || (cleanCand && n === cleanCand);
          });

          if (matched && Array.isArray(matched.allCells)) {
            for (const cell of matched.allCells) {
              if (typeof cell === 'string' && (cell.includes('drive.google.com/file') || cell.includes('drive.google.com/open') || cell.includes('drive.google.com/uc'))) {
                const driveId = extractDriveId(cell);
                if (driveId) {
                  const directUrl = `https://drive.google.com/file/d/${driveId}/view?usp=sharing`;
                  if (existing) {
                    existing.fileUrl = directUrl;
                    this.saveStored(STORAGE_KEYS.SUBMISSIONS, this.submissions);
                    this.pushStateToServer().catch(console.warn);
                  }
                  return directUrl;
                }
              }
            }
          }
        }
      } catch (e) {
        console.warn('resolveCandidateFileUrl error:', e);
      }
    }

    return '';
  }

  // Comprehensive Cloud + All Projects Google Sheets Synchronizer
  public async fetchAllProjectSheetsData(): Promise<{ success: boolean; projectCount: number; submissionCount: number; message: string }> {
    const projResult = await this.syncProjectsFromRemote();
    const subsResult = await this.syncSubmissionsFromRemote();
    const extResult = await this.syncAllExternalProjectSheets();

    const totalExtNew = extResult.newSubmissions;
    const totalExtUpd = extResult.updatedSubmissions;
    let extra = '';
    if (totalExtNew > 0 || totalExtUpd > 0) {
      extra = ` (${totalExtNew} new, ${totalExtUpd} updated from external sheets)`;
    }

    return {
      success: projResult.success || subsResult.success || extResult.syncedProjects > 0,
      projectCount: this.projects.length,
      submissionCount: this.submissions.length,
      message: `Fetched and synced ${this.submissions.length} candidate records across ${this.projects.length} project sheet(s)${extra}.`
    };
  }

  public clearDemoData(): { success: boolean; message: string } {
    this.submissions = [];
    this.saveStored(STORAGE_KEYS.SUBMISSIONS, []);
    return { success: true, message: 'Sample demo candidates cleared. Ready for live candidate records!' };
  }

  public async submitCandidate(payload: {
    project: string;
    recruiter: string;
    candidateName: string;
    passportNumber: string;
    mobileNumber: string;
    altMobileNumber?: string;
    emailId?: string;
    jobRole?: string;
    remarks?: string;
    fileData?: string; // base64
    fileName?: string;
    dynamicAnswers?: Record<string, any>;
    overrideDuplicate?: boolean;
  }): Promise<{ success: boolean; message: string; fileUrl?: string }> {
    if (this.isSubmittingCandidate) {
      return { success: false, message: 'Candidate upload already in progress. Please wait for the current upload to finish.' };
    }
    this.isSubmittingCandidate = true;

    try {
      const cleanCandidate = (payload.candidateName || '').trim().toUpperCase();
      const cleanPassport = (payload.passportNumber || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
      const cleanMobile = (payload.mobileNumber || '').trim();
      const cleanAltMobile = (payload.altMobileNumber || '').trim();
      const cleanEmail = (payload.emailId || '').trim();
      const cleanJobRole = (payload.jobRole || '').trim().toUpperCase();
      const cleanRemarks = (payload.remarks || '').trim().toUpperCase();

      // Clear deletion key if candidate is newly submitted
      if (cleanPassport) {
        this.deletedSubmissionKeys.delete('pass_' + cleanPassport.toLowerCase());
        this.deletedSubmissionKeys.delete(`${payload.project.trim().toLowerCase()}___${cleanPassport.toLowerCase()}`);
        this.deletedSubmissionKeys.delete(`${cleanCandidate.toLowerCase()}___${cleanPassport.toLowerCase()}`);
        this.saveStored('doc_hub_deleted_submissions_keys', Array.from(this.deletedSubmissionKeys));
      }

      // Check project status
      const targetProject = this.projects.find(p => p.name === payload.project || this.isProjectMatch(p.name, payload.project));
      if (targetProject && (targetProject.submission === 'Inactive' || targetProject.status === 'Closed')) {
        return { success: false, message: 'Submissions are currently closed for this project.' };
      }

      // Check duplicate candidate ownership
      const existing = this.submissions.find(
        s => s.project === payload.project && s.passportNumber.toUpperCase() === cleanPassport
      );
      const oldFileUrl = existing?.fileUrl || existing?.directFileUrl || '';

      if (existing) {
        const isOriginalRecruiter = existing.recruiter.trim().toLowerCase() === payload.recruiter.trim().toLowerCase();
        if (!isOriginalRecruiter) {
          return {
            success: false,
            message: `Submission Blocked: Candidate (Passport ${cleanPassport}) was already submitted for project "${payload.project}" by recruiter "${existing.recruiter}". Only "${existing.recruiter}" is authorized to update or re-upload this candidate.`
          };
        }

        if (!payload.overrideDuplicate) {
          return {
            success: false,
            message: `Candidate (Passport ${cleanPassport}) already submitted. Please confirm re-upload to overwrite your previous submission.`
          };
        }
      }

      // Handle duplicate override: remove old records locally and from remote
      if (payload.overrideDuplicate) {
        this.submissions = this.submissions.filter(
          s => !(s.project === payload.project && s.passportNumber.toLowerCase() === cleanPassport.toLowerCase())
        );
      }

      // Prepare unified dynamicAnswers with standard field names for backwards compatibility
      const mergedDynamic: Record<string, any> = {};
      if (payload.dynamicAnswers) {
        Object.entries(payload.dynamicAnswers).forEach(([k, v]) => {
          mergedDynamic[k] = typeof v === 'string' ? v.trim().toUpperCase() : v;
        });
      }
      if (cleanJobRole) mergedDynamic['Job Role'] = cleanJobRole;
      if (cleanAltMobile) mergedDynamic['Alternative Mobile No.'] = cleanAltMobile;
      if (cleanEmail) mergedDynamic['Email ID'] = cleanEmail;

      // Create file representation
      const timestampTag = new Date().toISOString().replace(/[:.]/g, '-');
      const generatedFileName = `${cleanCandidate} ${cleanPassport} [${timestampTag}].pdf`;
      const initialFileUrl = '';

      const newRecord: CandidateSubmission = {
        id: 'sub-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
        timestamp: new Date().toISOString(),
        project: payload.project,
        recruiter: payload.recruiter,
        candidateName: cleanCandidate,
        passportNumber: cleanPassport,
        mobileNumber: cleanMobile,
        altMobileNumber: cleanAltMobile,
        emailId: cleanEmail,
        jobRole: cleanJobRole,
        remarks: cleanRemarks,
        fileUrl: initialFileUrl,
        fileName: payload.fileName || generatedFileName,
        directFileUrl: payload.fileData || '',
        dynamicAnswers: mergedDynamic,
        status: 'Verified'
      };

      // Check if this candidate already exists in this.submissions
      const existingIndex = this.submissions.findIndex(
        s => s.project === payload.project && s.passportNumber.toUpperCase() === cleanPassport
      );

      if (existingIndex >= 0) {
        newRecord.id = this.submissions[existingIndex].id || newRecord.id;
        this.submissions[existingIndex] = {
          ...this.submissions[existingIndex],
          ...newRecord
        };
      } else {
        this.submissions.unshift(newRecord);
      }
      this.recalculateProjectCounts();
      this.saveStored(STORAGE_KEYS.PROJECTS, this.projects);
      this.saveStored(STORAGE_KEYS.SUBMISSIONS, this.submissions);

      // Push to server so candidate immediately appears on other devices / manager screens
      this.pushStateToServer().catch(console.warn);
      this.notifyListeners();

    // Upload to Google Apps Script (Drive + Sheets) with robust handling
    let driveFileUrl = '';
    if (this.config.gasWebAppUrl) {
      try {
        const gasRes = await this.triggerGasAction('submitUserData', [
          {
            project: payload.project,
            recruiter: payload.recruiter,
            candidateName: cleanCandidate,
            passportNumber: cleanPassport,
            mobileNumber: cleanMobile,
            altMobileNumber: cleanAltMobile,
            emailId: cleanEmail,
            jobRole: cleanJobRole,
            remarks: payload.remarks,
            fileData: payload.fileData,
            dynamicAnswers: mergedDynamic,
            overrideDuplicate: payload.overrideDuplicate ? { fileUrl: oldFileUrl } : null,
            existingFileUrl: oldFileUrl,
            sheetUrl: targetProject?.sheetUrl || '',
            folderUrl: targetProject?.folderUrl || '',
            fields: targetProject?.fields || []
          }
        ]);

        if (gasRes) {
          let innerData = gasRes;
          if (typeof gasRes.data === 'string') {
            try { innerData = JSON.parse(gasRes.data); } catch {}
          } else if (gasRes.data && typeof gasRes.data === 'object') {
            innerData = gasRes.data;
          }

          if (innerData && (innerData.success === false || innerData.error)) {
            // Remote submission rejected: rollback local state
            this.submissions = this.submissions.filter(s => s.id !== newRecord.id);
            this.saveStored(STORAGE_KEYS.SUBMISSIONS, this.submissions);
            this.pushStateToServer().catch(console.warn);

            return {
              success: false,
              message: `Google Sheets Error: ${innerData.error || innerData.message || 'Failed to record candidate in project sheet'}`
            };
          }

          driveFileUrl = innerData.fileUrl || innerData.url || gasRes.fileUrl || (innerData.data && innerData.data.fileUrl) || '';
          if (driveFileUrl) {
            newRecord.fileUrl = driveFileUrl;
            const targetSub = this.submissions.find(s => s.id === newRecord.id);
            if (targetSub) {
              targetSub.fileUrl = driveFileUrl;
            }
            this.saveStored(STORAGE_KEYS.SUBMISSIONS, this.submissions);
            this.pushStateToServer().catch(console.warn);
            this.notifyListeners();
          }

          // Trigger background sync so sheet rows sync into local state
          setTimeout(() => {
            this.syncSubmissionsFromRemote().catch(console.warn);
          }, 1500);
        } else {
          // gasRes returned null (upload timed out or connection failed)
          // Rollback local record so recruiter can retry cleanly without duplicate candidate warnings
          this.submissions = this.submissions.filter(s => s.id !== newRecord.id);
          this.saveStored(STORAGE_KEYS.SUBMISSIONS, this.submissions);
          this.pushStateToServer().catch(console.warn);

          return {
            success: false,
            message: 'Connection timed out while uploading to Google Drive & Sheets. Please check your connection and retry.'
          };
        }
      } catch (gasErr: any) {
        console.warn('GAS submitUserData error:', gasErr);
        this.submissions = this.submissions.filter(s => s.id !== newRecord.id);
        this.saveStored(STORAGE_KEYS.SUBMISSIONS, this.submissions);
        this.pushStateToServer().catch(console.warn);

        return {
          success: false,
          message: `Submission error: ${gasErr.message || 'Google Drive / Sheet connection failed'}`
        };
      }
    }



      return {
        success: true,
        message: driveFileUrl
          ? `Candidate ${cleanCandidate} (${cleanPassport}) uploaded to Google Drive & recorded in Google Sheet!`
          : `Candidate ${cleanCandidate} (${cleanPassport}) submitted and verified successfully!`,
        fileUrl: driveFileUrl || initialFileUrl
      };
    } finally {
      this.isSubmittingCandidate = false;
    }
  }

  public async deleteSubmission(
    id?: string,
    projectName?: string,
    passportNumber?: string,
    candidateName?: string,
    fileUrl?: string
  ): Promise<{ success: boolean; message: string }> {
    const cleanId = id ? id.trim() : '';
    const cleanProj = projectName ? projectName.trim().toLowerCase() : '';
    const cleanPass = passportNumber ? passportNumber.trim().toLowerCase() : '';
    const cleanCand = candidateName ? candidateName.trim().toLowerCase() : '';

    if (cleanId) this.deletedSubmissionKeys.add(cleanId);
    if (cleanProj && cleanPass) this.deletedSubmissionKeys.add(`${cleanProj}___${cleanPass}`);
    if (cleanCand && cleanPass) this.deletedSubmissionKeys.add(`${cleanCand}___${cleanPass}`);
    if (cleanPass) this.deletedSubmissionKeys.add(`pass_${cleanPass}`);
    if (cleanProj && cleanCand) this.deletedSubmissionKeys.add(`${cleanProj}___name_${cleanCand}`);
    if (cleanCand) this.deletedSubmissionKeys.add(`name_${cleanCand}`);
    this.saveStored('doc_hub_deleted_submissions_keys', Array.from(this.deletedSubmissionKeys));

    this.submissions = this.submissions.filter(s => {
      if (cleanId && s.id === cleanId) return false;
      if (cleanProj && cleanPass && (s.project || '').trim().toLowerCase() === cleanProj && (s.passportNumber || '').trim().toLowerCase() === cleanPass) return false;
      if (cleanCand && cleanPass && (s.candidateName || '').trim().toLowerCase() === cleanCand && (s.passportNumber || '').trim().toLowerCase() === cleanPass) return false;
      if (cleanPass && (s.passportNumber || '').trim().toLowerCase() === cleanPass) return false;
      if (cleanProj && cleanCand && (s.project || '').trim().toLowerCase() === cleanProj && (s.candidateName || '').trim().toLowerCase() === cleanCand) return false;
      return true;
    });

    this.saveStored(STORAGE_KEYS.SUBMISSIONS, this.submissions);
    this.recalculateProjectCounts();
    this.notifyListeners();

    // Push deletion to server with overwriteSubmissions & deletedSubmission
    this.pushStateToServer({
      overwriteSubmissions: true,
      deletedSubmission: {
        id: cleanId,
        project: projectName,
        passportNumber: passportNumber,
        candidateName: candidateName
      }
    }).catch(console.warn);



    // Also delete from Google Apps Script
    if (this.config.gasWebAppUrl && projectName) {
      this.triggerGasAction('managerDeleteSubmissionRecord', [
        projectName,
        candidateName || '',
        passportNumber || '',
        fileUrl || '',
        this.config.passcode || 'Gowell921'
      ]).catch(console.warn);
    }

    return { success: true, message: 'Submission record removed and archived.' };
  }

  // --- PERFORMANCE METRICS ---
  public getRecruiterPerformance(projectName?: string): RecruiterPerformance[] {
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const yesterdayStr = yesterday.toISOString().slice(0, 10);

    const relevant = (projectName && projectName !== 'All Projects')
      ? this.submissions.filter(s => this.isProjectMatch(s.project, projectName))
      : this.submissions;

    // Leaderboard strictly tracks registered active recruiters
    const map: Record<string, { today: number; yesterday: number; total: number }> = {};
    this.recruiters.forEach(r => {
      const clean = r.trim();
      if (clean) {
        map[clean] = { today: 0, yesterday: 0, total: 0 };
      }
    });

    relevant.forEach(sub => {
      const rec = (sub.recruiter || '').trim();
      if (!rec) return;

      // Match recruiter in roster (case-insensitive)
      const matched = this.recruiters.find(r => r.trim().toLowerCase() === rec.toLowerCase());
      if (matched && map[matched]) {
        map[matched].total++;
        if (isTodaySubmission(sub.timestamp)) {
          map[matched].today++;
        } else if (isYesterdaySubmission(sub.timestamp)) {
          map[matched].yesterday++;
        }
      }
    });

    const output: RecruiterPerformance[] = Object.keys(map).map(name => ({
      name,
      today: map[name].today,
      yesterday: map[name].yesterday,
      total: map[name].total
    }));

    output.sort((a, b) => b.today - a.today || b.total - a.total || a.name.localeCompare(b.name));
    return output;
  }

  // --- SUPABASE INTEGRATION (REMOVED: GOOGLE SHEETS IS PRIMARY BACKUP) ---
  public async querySupabase(): Promise<{ ok: boolean; status: number; error: string }> {
    return { ok: false, status: 0, error: 'Supabase connection removed. Google Sheets is the backup.' };
  }

  // --- GOOGLE APPS SCRIPT ACTION ROUTER ---
  private async triggerGasAction(action: string, args: any[] = [], customConfig?: BackendConfig): Promise<any> {
    const targetGasUrl = (customConfig && customConfig.gasWebAppUrl) || this.config.gasWebAppUrl;
    if (!targetGasUrl) return null;

    const isHeavyAction = action === 'submitUserData' || (args && JSON.stringify(args).length > 2000);
    const timeoutMs = isHeavyAction ? 60000 : 25000;

    const parseResponse = (text: string): any => {
      if (!text || typeof text !== 'string') return null;
      const clean = text.trim();
      if (clean.startsWith('<!doctype html') || clean.startsWith('<html') || clean.includes('<title>Error') || clean.includes('404 Not Found')) {
        return null;
      }
      try {
        const parsed = JSON.parse(clean);
        if (parsed && typeof parsed.data === 'string') {
          try {
            const inner = JSON.parse(parsed.data);
            return { ...parsed, ...inner, data: inner };
          } catch {}
        }
        return parsed;
      } catch {
        return clean;
      }
    };

    // ── 1. HEAVY ACTION STRATEGY (Candidate Document Uploads / submitUserData) ────
    // DIRECT BROWSER POST connects straight to Google Apps Script.
    // Why: Bypasses Vercel's 10-second serverless execution limit and Vercel's 4.5MB payload limit!
    // Content-Type "text/plain;charset=utf-8" avoids browser CORS preflight.
    if (isHeavyAction) {
      // 1A. Attempt Direct Browser POST first (preferred for file uploads)
      try {
        const postRes = await fetch(targetGasUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({ action, args }),
          redirect: 'follow',
          signal: AbortSignal.timeout(timeoutMs)
        });

        if (postRes.ok) {
          const text = await postRes.text();
          const parsed = parseResponse(text);
          if (parsed) {
            return parsed;
          }
        }
      } catch (directErr) {
        console.warn('Direct browser GAS upload failed, attempting server proxy fallback:', directErr);
      }

      // 1B. Server Proxy Fallback (in case of client-side ISP / DNS / adblocker issues)
      try {
        const proxyRes = await fetch('/api/gas-proxy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            scriptUrl: targetGasUrl,
            targetUrl: targetGasUrl,
            payload: { action, args }
          }),
          signal: AbortSignal.timeout(50000)
        });

        if (proxyRes.ok) {
          const text = await proxyRes.text();
          const parsed = parseResponse(text);
          if (parsed) {
            return parsed;
          }
        }
      } catch (proxyErr) {
        console.warn('Server GAS proxy upload attempt failed or timed out:', proxyErr);
      }

      return null;
    }

    // ── 2. LIGHTWEIGHT ACTION STRATEGY (Queries, Passcodes, Verification) ─────
    // 2A. Direct GET first (fastest, natively supported by doGet with CORS)
    try {
      const directUrl = new URL(targetGasUrl);
      directUrl.searchParams.set('action', action);
      if (args && args.length > 0) {
        directUrl.searchParams.set('args', JSON.stringify(args));
      }

      const getRes = await fetch(directUrl.toString(), {
        method: 'GET',
        headers: { 'Accept': 'application/json, text/plain, */*' },
        redirect: 'follow',
        signal: AbortSignal.timeout(timeoutMs)
      });

      if (getRes.ok) {
        const text = await getRes.text();
        const parsed = parseResponse(text);
        if (parsed) {
          return parsed;
        }
      }
    } catch (getErr) {
      // Continue to proxy fallback
    }

    // 2B. Server Proxy Fallback
    try {
      const proxyRes = await fetch('/api/gas-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scriptUrl: targetGasUrl,
          targetUrl: targetGasUrl,
          payload: { action, args }
        }),
        signal: AbortSignal.timeout(timeoutMs)
      });

      if (proxyRes.ok) {
        const text = await proxyRes.text();
        const parsed = parseResponse(text);
        if (parsed) {
          return parsed;
        }
      }
    } catch (proxyErr) {
      // Continue to direct POST fallback
    }

    // 2C. Direct POST Fallback
    try {
      const postRes = await fetch(targetGasUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action, args }),
        redirect: 'follow',
        signal: AbortSignal.timeout(timeoutMs)
      });

      if (postRes.ok) {
        const text = await postRes.text();
        const parsed = parseResponse(text);
        if (parsed) {
          return parsed;
        }
      }
    } catch (postErr) {
      console.warn('Direct GAS POST fallback failed:', postErr);
    }

    return null;
  }

  // Trigger Google Sheet & Drive Cloud Backup Sync
  public async triggerGoogleSheetsBackup(): Promise<{ success: boolean; message: string }> {
    if (!this.config.gasWebAppUrl) {
      return { success: false, message: 'Google Apps Script Web App URL is not configured.' };
    }
    try {
      await this.syncProjectsFromRemote();
      await this.syncSubmissionsFromRemote();
      await this.pushStateToServer();
      return { success: true, message: `Google Sheets cloud backup sync completed successfully! Total ${this.submissions.length} candidate submissions synchronized.` };
    } catch (e: any) {
      return { success: false, message: e.message || 'Backup sync failed.' };
    }
  }

  // Backwards-compatibility alias
  public async triggerSheetToSupabaseMigration(): Promise<{ success: boolean; message: string }> {
    return this.triggerGoogleSheetsBackup();
  }

  // --- HEALTH DIAGNOSTICS ---
  public async testHealth(): Promise<ConnectionStatus> {
    const status: ConnectionStatus = {
      gas: 'offline',
      lastChecked: new Date().toLocaleTimeString(),
      message: 'Diagnosing Google Sheets connection...'
    };

    // Google Apps Script & Google Sheets Check
    if (this.config.gasWebAppUrl) {
      try {
        const gasRes = await this.triggerGasAction('checkManagerPasscode', [this.config.passcode]);
        if (gasRes && gasRes.success) {
          status.gas = 'connected';
          status.message = 'Google Sheets & Drive: CONNECTED (Active Backup)';
        } else {
          status.gas = 'error';
          status.message = 'Google Sheets & Drive: CHECK PASSCODE';
        }
      } catch {
        status.gas = 'error';
        status.message = 'Google Sheets & Drive: CONNECTION ERROR';
      }
    } else {
      status.message = 'Google Sheets: URL not configured';
    }

    return status;
  }
}

export const apiService = new ApiService();
