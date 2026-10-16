import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  BarChart3,
  Users,
  FolderKanban,
  Database,
  Settings,
  Plus,
  Search,
  Trash2,
  ExternalLink,
  Eye,
  Download,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  KeyRound,
  Lock,
  Unlock,
  FileSpreadsheet,
  HardDrive,
  Check,
  X,
  ShieldCheck,
  Sparkles,
  Layers,
  ArrowUpDown,
  Code,
  Briefcase,
  Activity,
  Copy,
  Link2,
  FileText,
  UploadCloud,
  Share2,
  Globe,
  ListFilter,
  Calendar,
  Clock
} from 'lucide-react';
import { Project, CandidateSubmission, RecruiterPerformance, BackendConfig, ProjectField, FieldType, AutoSyncState } from '../types';
import { apiService } from '../services/apiService';
import { DocPreviewModal } from './DocPreviewModal';
import { DeleteConfirmModal } from './DeleteConfirmModal';
import { ConnectSheetModal } from './ConnectSheetModal';
import { ErrorBoundary } from './ErrorBoundary';
import { getFullCodeGsScript } from '../data/codeGsTemplate';
import { formatDisplayDate, formatDisplayDateTime, formatTimeAgo } from '../utils/dateUtils';

interface ManagerDashboardProps {
  projects: Project[];
  recruiters: string[];
  onRefreshData: () => void;
  onAuthChange?: (authenticated: boolean) => void;
}

export const ManagerDashboard: React.FC<ManagerDashboardProps> = ({
  projects,
  recruiters,
  onRefreshData,
  onAuthChange
}) => {
  // Passcode Lock State
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    try {
      return localStorage.getItem('doc_hub_manager_auth') === 'true' || sessionStorage.getItem('doc_hub_manager_auth') === 'true';
    } catch {
      return false;
    }
  });
  const [inputPasscode, setInputPasscode] = useState<string>('');
  const [authError, setAuthError] = useState<string>('');

  useEffect(() => {
    if (onAuthChange) {
      onAuthChange(isAuthenticated);
    }
  }, [isAuthenticated, onAuthChange]);

  // Active Tab
  const [activeTab, setActiveTab] = useState<'analytics' | 'submissions' | 'projects' | 'recruiters' | 'settings'>(() => {
    try {
      const stored = localStorage.getItem('doc_hub_manager_tab');
      if (stored && ['analytics', 'submissions', 'projects', 'recruiters', 'settings'].includes(stored)) {
        return stored as any;
      }
    } catch { }
    return 'analytics';
  });

  const handleSelectTab = (tab: 'analytics' | 'submissions' | 'projects' | 'recruiters' | 'settings') => {
    setActiveTab(tab);
    try {
      localStorage.setItem('doc_hub_manager_tab', tab);
    } catch { }
  };

  // Submissions Explorer State
  const [submissions, setSubmissions] = useState<CandidateSubmission[]>([]);
  const [allSubmissions, setAllSubmissions] = useState<CandidateSubmission[]>(() => apiService.getAllSubmissions());
  const [filterProject, setFilterProject] = useState<string>('All Projects');
  const [filterRecruiter, setFilterRecruiter] = useState<string>('All Recruiters');
  const [filterJobRole, setFilterJobRole] = useState<string>('All Roles');
  const [dateRangeFilter, setDateRangeFilter] = useState<'all' | 'today' | 'this_week' | 'this_month' | 'custom'>('all');
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [previewDoc, setPreviewDoc] = useState<CandidateSubmission | null>(null);
  const [candidateToDelete, setCandidateToDelete] = useState<CandidateSubmission | null>(null);
  const [projectToDelete, setProjectToDelete] = useState<string | null>(null);
  const [showClearDemoConfirm, setShowClearDemoConfirm] = useState<boolean>(false);

  // Performance State & Filter (All vs Project-wise)
  const [performanceList, setPerformanceList] = useState<RecruiterPerformance[]>([]);
  const [leaderboardProjectFilter, setLeaderboardProjectFilter] = useState<string>('All Projects');

  // Project Modal State
  const [showProjectModal, setShowProjectModal] = useState<boolean>(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [previewProject, setPreviewProject] = useState<Project | null>(null);
  const [projectNameInput, setProjectNameInput] = useState<string>('');
  const [projectDescInput, setProjectDescInput] = useState<string>('');
  const [projectSheetUrlInput, setProjectSheetUrlInput] = useState<string>('');
  const [projectFolderUrlInput, setProjectFolderUrlInput] = useState<string>('');
  const [projectJobRoles, setProjectJobRoles] = useState<string[]>([]);
  const [newJobRoleInput, setNewJobRoleInput] = useState<string>('');
  const [projectFields, setProjectFields] = useState<ProjectField[]>([]);
  const [fieldOptionInputs, setFieldOptionInputs] = useState<Record<number, string>>({});
  const [projectStatus, setProjectStatus] = useState<'Open' | 'Closed'>('Open');
  const [projectSubmission, setProjectSubmission] = useState<'Active' | 'Inactive'>('Active');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isSavingProject, setIsSavingProject] = useState<boolean>(false);
  const [projectModalError, setProjectModalError] = useState<string | null>(null);

  // Connect External Google Sheet Modal State
  const [showConnectSheetModal, setShowConnectSheetModal] = useState<boolean>(false);
  const [connectSheetInitialProject, setConnectSheetInitialProject] = useState<string | undefined>(undefined);
  const [sheetSuccessBanner, setSheetSuccessBanner] = useState<{ projectName: string; importedCount: number; updatedCount: number } | null>(null);

  const handleOpenConnectSheet = (projectName?: string) => {
    setConnectSheetInitialProject(projectName);
    setShowConnectSheetModal(true);
  };

  const handleConnectSheetSuccess = (result: { projectName: string; importedCount: number; updatedCount: number }) => {
    setSheetSuccessBanner(result);
    onRefreshData();
    setTimeout(() => {
      setSheetSuccessBanner(null);
    }, 9000);
  };

  // New Recruiter Input & Management
  const [localRecruiters, setLocalRecruiters] = useState<string[]>(recruiters);
  const [deletingRecruiter, setDeletingRecruiter] = useState<string | null>(null);
  const [newRecruiterName, setNewRecruiterName] = useState<string>('');
  const [recruiterMessage, setRecruiterMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    setLocalRecruiters(recruiters);
  }, [recruiters]);

  // System Settings State
  const [config, setConfig] = useState<BackendConfig>(apiService.getConfig());
  const [autoSyncState, setAutoSyncState] = useState<AutoSyncState>(apiService.getAutoSyncState());
  const [oldPasscode, setOldPasscode] = useState<string>('');
  const [newPasscode, setNewPasscode] = useState<string>('');
  const [oldDocPasscode, setOldDocPasscode] = useState<string>('');
  const [newDocPasscode, setNewDocPasscode] = useState<string>('');
  const [settingsMessage, setSettingsMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [showCodeExport, setShowCodeExport] = useState<boolean>(false);
  const [teamLinkCopied, setTeamLinkCopied] = useState<boolean>(false);

  // Load Data on Mount / Auth & Auto-sync subscription
  useEffect(() => {
    if (isAuthenticated) {
      loadData();

      // Subscribe to real-time auto-fetch data updates
      const unsubData = apiService.subscribe(() => {
        loadData(false);
      });

      const unsubSync = apiService.subscribeSyncState((newState) => {
        setAutoSyncState(newState);
      });

      return () => {
        unsubData();
        unsubSync();
      };
    }
  }, [isAuthenticated, filterProject, filterRecruiter, leaderboardProjectFilter]);

  const loadData = async (forceRemote: boolean = false) => {
    if (forceRemote) {
      setIsSyncing(true);
    }
    try {
      const allSubs = await apiService.getSubmissions(filterProject, filterRecruiter, forceRemote);
      setSubmissions(allSubs);
      setAllSubmissions(apiService.getAllSubmissions());
      const perf = apiService.getRecruiterPerformance(leaderboardProjectFilter);
      setPerformanceList(perf);
      setConfig(apiService.getConfig());
    } finally {
      if (forceRemote) {
        setIsSyncing(false);
      }
    }
  };

  const handleSyncCloudData = async () => {
    setIsSyncing(true);
    setSettingsMessage(null);
    try {
      const res = await apiService.fetchAllProjectSheetsData();
      await loadData(true);
      onRefreshData();
      if (res.success) {
        setSettingsMessage({ type: 'success', text: res.message });
      } else {
        setSettingsMessage({ type: 'error', text: res.message || 'No candidate records found in project Google Sheets.' });
      }
    } catch (err: any) {
      setSettingsMessage({ type: 'error', text: 'Sheet data fetch failed: ' + (err.message || String(err)) });
    } finally {
      setIsSyncing(false);
      setTimeout(() => setSettingsMessage(null), 6000);
    }
  };

  const handleClearDemoData = () => {
    setShowClearDemoConfirm(true);
  };

  const confirmClearDemoData = async () => {
    const res = apiService.clearDemoData();
    await loadData(false);
    onRefreshData();
    setSettingsMessage({ type: 'success', text: res.message });
    setTimeout(() => setSettingsMessage(null), 4000);
  };

  // Auth Handler
  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (apiService.verifyPasscode(inputPasscode)) {
      setIsAuthenticated(true);
      try {
        localStorage.setItem('doc_hub_manager_auth', 'true');
        sessionStorage.setItem('doc_hub_manager_auth', 'true');
      } catch { }
      setAuthError('');
      loadData();
    } else {
      setAuthError('Invalid manager passcode.');
    }
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    try {
      localStorage.removeItem('doc_hub_manager_auth');
      sessionStorage.removeItem('doc_hub_manager_auth');
    } catch { }
  };

  // Available Job Roles across projects and submissions
  const availableJobRoles = useMemo(() => {
    const roleSet = new Set<string>();
    projects.forEach(p => {
      if (Array.isArray(p.jobRoles)) {
        p.jobRoles.forEach(r => { if (r && r.trim()) roleSet.add(r.trim()); });
      }
    });
    submissions.forEach(s => {
      const r = s.jobRole || apiService.getEffectiveJobRole(s);
      if (r && r.trim()) roleSet.add(r.trim());
    });
    return Array.from(roleSet).sort();
  }, [projects, submissions]);

  // Submissions Search & Filter
  const filteredSubmissions = useMemo(() => {
    const deduplicated = apiService.deduplicateSubmissions(submissions);
    let result = deduplicated;

    if (filterProject !== 'All Projects') {
      result = result.filter(s => apiService.isProjectMatch(s.project, filterProject));
    }

    if (filterRecruiter !== 'All Recruiters') {
      result = result.filter(s => s.recruiter.trim().toLowerCase() === filterRecruiter.trim().toLowerCase());
    }

    if (filterJobRole !== 'All Roles') {
      result = result.filter(s => (s.jobRole || apiService.getEffectiveJobRole(s)).trim().toLowerCase() === filterJobRole.trim().toLowerCase());
    }

    // Timeframe & Date Range Filter
    if (dateRangeFilter !== 'all') {
      const now = new Date();
      const todayIso = now.toISOString().slice(0, 10);

      // Calculate start of current week (Monday)
      const dayOfWeek = (now.getDay() + 6) % 7; // Monday = 0
      const startOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek, 0, 0, 0, 0);

      // Calculate start of current month (1st of month)
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);

      result = result.filter(s => {
        if (!s.timestamp) return false;
        const subDate = new Date(s.timestamp);
        if (isNaN(subDate.getTime())) return true;
        const subDateIso = subDate.toISOString().slice(0, 10);

        if (dateRangeFilter === 'today') {
          return subDateIso === todayIso;
        }
        if (dateRangeFilter === 'this_week') {
          return subDate >= startOfWeek;
        }
        if (dateRangeFilter === 'this_month') {
          return subDate >= startOfMonth;
        }
        if (dateRangeFilter === 'custom') {
          if (customStartDate && subDateIso < customStartDate) return false;
          if (customEndDate && subDateIso > customEndDate) return false;
          return true;
        }
        return true;
      });
    }

    const q = searchQuery.toLowerCase().trim();
    if (!q) return result;

    return result.filter((s) => {
      const role = s.jobRole || apiService.getEffectiveJobRole(s);
      const altMob = s.altMobileNumber || apiService.getEffectiveAltMobile(s);
      const email = s.emailId || apiService.getEffectiveEmail(s);
      return (
        s.candidateName.toLowerCase().includes(q) ||
        s.passportNumber.toLowerCase().includes(q) ||
        (s.mobileNumber && s.mobileNumber.toLowerCase().includes(q)) ||
        (altMob && altMob.toLowerCase().includes(q)) ||
        (email && email.toLowerCase().includes(q)) ||
        (role && role.toLowerCase().includes(q)) ||
        s.recruiter.toLowerCase().includes(q) ||
        s.project.toLowerCase().includes(q)
      );
    });
  }, [submissions, searchQuery, filterProject, filterRecruiter, filterJobRole, dateRangeFilter, customStartDate, customEndDate]);

  // Delete Submission Record - Opens Custom Confirmation Box
  const handleDeleteSubmission = (sub: CandidateSubmission) => {
    setCandidateToDelete(sub);
  };

  const confirmDeleteCandidate = async () => {
    if (!candidateToDelete) return;
    const sub = candidateToDelete;
    setIsSyncing(true);
    try {
      setSubmissions(prev => prev.filter(s => s.id !== sub.id && !(s.project?.toLowerCase() === sub.project?.toLowerCase() && s.passportNumber?.toLowerCase() === sub.passportNumber?.toLowerCase())));
      setAllSubmissions(prev => prev.filter(s => s.id !== sub.id && !(s.project?.toLowerCase() === sub.project?.toLowerCase() && s.passportNumber?.toLowerCase() === sub.passportNumber?.toLowerCase())));
      await apiService.deleteSubmission(sub.id, sub.project, sub.passportNumber, sub.candidateName, sub.fileUrl);
      await loadData(false);
      onRefreshData();
    } catch (err: any) {
      console.warn('Delete error:', err);
    } finally {
      setIsSyncing(false);
    }
  };

  // Project Modal Handlers
  const handleOpenNewProject = () => {
    setEditingProject(null);
    setProjectNameInput('');
    setProjectDescInput('');
    setProjectSheetUrlInput('');
    setProjectFolderUrlInput('');
    setProjectJobRoles(['Nurse', 'Assistant Nurse']);
    setNewJobRoleInput('');
    setProjectStatus('Open');
    setProjectSubmission('Active');
    setProjectFields([
      { id: 'experience', label: 'Total Experience (Years)', type: 'number', required: false },
      { id: 'qualification', label: 'Qualification / Trade', type: 'text', required: false }
    ]);
    setProjectModalError(null);
    setIsSavingProject(false);
    setShowProjectModal(true);
  };

  const handleOpenEditProject = (proj: Project) => {
    setEditingProject(proj);
    setProjectNameInput(proj.name);
    setProjectDescInput(proj.description || '');
    setProjectSheetUrlInput(proj.sheetUrl || '');
    setProjectFolderUrlInput(proj.folderUrl || '');
    setProjectJobRoles(proj.jobRoles ? [...proj.jobRoles] : []);
    setNewJobRoleInput('');
    setProjectStatus(proj.status);
    setProjectSubmission(proj.submission);
    setProjectFields(proj.fields ? [...proj.fields] : []);
    setProjectModalError(null);
    setIsSavingProject(false);
    setShowProjectModal(true);
  };

  const handleAddJobRole = () => {
    const clean = newJobRoleInput.trim().toUpperCase();
    if (!clean) return;
    if (!projectJobRoles.some(r => r.toUpperCase() === clean.toUpperCase())) {
      setProjectJobRoles([...projectJobRoles, clean]);
    }
    setNewJobRoleInput('');
  };

  const handleRemoveJobRole = (roleToRemove: string) => {
    setProjectJobRoles(projectJobRoles.filter(r => r.toUpperCase() !== roleToRemove.toUpperCase()));
  };

  const handleAddPresetRole = (roleName: string) => {
    const clean = roleName.trim().toUpperCase();
    if (!projectJobRoles.some(r => r.toUpperCase() === clean.toUpperCase())) {
      setProjectJobRoles([...projectJobRoles, clean]);
    }
  };

  const handleAddField = () => {
    const newId = 'field_' + Date.now();
    setProjectFields([
      ...projectFields,
      { id: newId, label: 'New Question', type: 'text', required: false, options: [] }
    ]);
  };

  const handleUpdateField = (index: number, updates: Partial<ProjectField>) => {
    const updated = [...projectFields];
    updated[index] = { ...updated[index], ...updates };
    setProjectFields(updated);
  };

  const handleRemoveField = (index: number) => {
    setProjectFields(projectFields.filter((_, i) => i !== index));
    // Clean up input state for removed field
    setFieldOptionInputs(prev => {
      const next = { ...prev };
      delete next[index];
      return next;
    });
  };

  const handleAddOption = (fieldIdx: number, customText?: string) => {
    const raw = customText !== undefined ? customText : (fieldOptionInputs[fieldIdx] || '');
    if (!raw.trim()) return;

    // Split by comma or newline
    const newOpts = raw
      .split(/[,|\n]/)
      .map(s => s.trim())
      .filter(s => s.length > 0);

    if (newOpts.length === 0) return;

    const currentField = projectFields[fieldIdx];
    const currentOptions = Array.isArray(currentField.options) ? [...currentField.options] : [];

    for (const opt of newOpts) {
      if (!currentOptions.includes(opt)) {
        currentOptions.push(opt);
      }
    }

    handleUpdateField(fieldIdx, { options: currentOptions });
    setFieldOptionInputs(prev => ({ ...prev, [fieldIdx]: '' }));
  };

  const handleRemoveOption = (fieldIdx: number, optIdx: number) => {
    const currentField = projectFields[fieldIdx];
    if (!currentField.options) return;
    const currentOptions = currentField.options.filter((_, i) => i !== optIdx);
    handleUpdateField(fieldIdx, { options: currentOptions });
  };

  const handleApplyPresetOptions = (fieldIdx: number, presetList: string[]) => {
    handleUpdateField(fieldIdx, { options: [...presetList] });
  };

  const handleCopyLink = (url: string, id: string) => {
    if (!url) return;
    navigator.clipboard.writeText(url);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2500);
  };

  const handleSaveProject = async () => {
    if (!projectNameInput.trim()) {
      setProjectModalError('Please enter a project name.');
      return;
    }

    setIsSavingProject(true);
    setProjectModalError(null);

    try {
      // Sanitize fields and their options
      const sanitizedFields: ProjectField[] = projectFields.map(f => {
        const isDropdown = f.type === 'select' || f.type === 'dropdown';
        let optionsList: string[] = [];
        if (Array.isArray(f.options)) {
          optionsList = f.options.map(o => String(o).trim()).filter(Boolean);
        } else if (typeof f.options === 'string') {
          optionsList = String(f.options).split(',').map(o => o.trim()).filter(Boolean);
        }

        return {
          ...f,
          label: f.label.trim() || 'Custom Field',
          type: isDropdown ? 'select' : f.type,
          options: isDropdown ? (optionsList.length > 0 ? optionsList : ['Yes', 'No']) : undefined
        };
      });

      const payload: Project = {
        name: projectNameInput.trim(),
        description: projectDescInput.trim(),
        status: projectStatus,
        submission: projectSubmission,
        jobRoles: projectJobRoles.filter(r => r.trim().length > 0),
        fields: sanitizedFields,
        sheetUrl: projectSheetUrlInput.trim() || editingProject?.sheetUrl || '',
        folderUrl: projectFolderUrlInput.trim() || editingProject?.folderUrl || ''
      };

      const res = await apiService.saveProject(payload, editingProject?.name);
      if (res.success) {
        setShowProjectModal(false);
        setSettingsMessage({ type: 'success', text: res.message || `Project "${payload.name}" saved successfully!` });
        setTimeout(() => setSettingsMessage(null), 4000);
        onRefreshData();
        await loadData();
      } else {
        setProjectModalError(res.message);
      }
    } catch (err: any) {
      setProjectModalError(err.message || 'Failed to save project. Please retry.');
    } finally {
      setIsSavingProject(false);
    }
  };

  const handleDeleteProject = (name: string) => {
    setProjectToDelete(name);
  };

  const confirmDeleteProject = async () => {
    if (!projectToDelete) return;
    const name = projectToDelete;
    const res = await apiService.deleteProject(name);
    await loadData();
    onRefreshData();
    if (res.success) {
      setSettingsMessage({ type: 'success', text: res.message });
      setTimeout(() => setSettingsMessage(null), 4000);
    }
  };

  // Recruiter Management
  const handleAddRecruiter = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = newRecruiterName.trim();
    if (!clean) return;
    const res = await apiService.addRecruiter(clean);
    if (res.success) {
      setRecruiterMessage({ type: 'success', text: res.message });
      setNewRecruiterName('');
      setLocalRecruiters(prev => [...prev.filter(r => r.toLowerCase() !== clean.toLowerCase()), clean].sort());
      onRefreshData();
      await loadData();
      setTimeout(() => setRecruiterMessage(null), 3500);
    } else {
      setRecruiterMessage({ type: 'error', text: res.message });
    }
  };

  const handleDeleteRecruiter = async (name: string) => {
    setLocalRecruiters(prev => prev.filter(r => r.trim().toLowerCase() !== name.trim().toLowerCase()));
    setDeletingRecruiter(null);
    const res = await apiService.deleteRecruiter(name);
    setRecruiterMessage({ type: 'success', text: res.message || `Recruiter "${name}" removed from roster.` });
    onRefreshData();
    await loadData();
    setTimeout(() => setRecruiterMessage(null), 3500);
  };

  // Settings Save
  const handleSaveConfig = async () => {
    setIsSyncing(true);
    try {
      apiService.saveConfig(config);
      await apiService.pushStateToServer();
      // Automatically trigger cloud sync from Google Sheets
      if (config.gasWebAppUrl) {
        await apiService.runAutoSync(true);
      }
      setSettingsMessage({
        type: 'success',
        text: 'Configuration saved! All team members and devices are now synchronized with these credentials and live data.'
      });
      onRefreshData();
      await loadData();
    } catch (e: any) {
      setSettingsMessage({ type: 'error', text: e.message || 'Failed to save configuration.' });
    } finally {
      setIsSyncing(false);
      setTimeout(() => setSettingsMessage(null), 4000);
    }
  };

  const handleChangePasscode = (e: React.FormEvent) => {
    e.preventDefault();
    const res = apiService.changePasscode(oldPasscode, newPasscode);
    if (res.success) {
      setSettingsMessage({ type: 'success', text: res.message });
      setOldPasscode('');
      setNewPasscode('');
    } else {
      setSettingsMessage({ type: 'error', text: res.message });
    }
  };

  const handleChangeDocPasscode = (e: React.FormEvent) => {
    e.preventDefault();
    const res = apiService.changeDocPasscode(oldDocPasscode, newDocPasscode);
    if (res.success) {
      setSettingsMessage({ type: 'success', text: res.message });
      setOldDocPasscode('');
      setNewDocPasscode('');
    } else {
      setSettingsMessage({ type: 'error', text: res.message });
    }
  };

  // Export to CSV
  const handleExportCSV = () => {
    if (filteredSubmissions.length === 0 && submissions.length === 0) {
      alert('No submissions to export.');
      return;
    }

    const exportList = filteredSubmissions.length > 0 ? filteredSubmissions : submissions;
    const headers = ['Timestamp', 'Project', 'Job Role', 'Recruiter', 'Candidate Name', 'Passport Number', 'Mobile Number', 'Alt Mobile Number', 'Email ID', 'Remarks', 'Document URL'];
    const rows = exportList.map(s => [
      formatDisplayDateTime(s.timestamp),
      `"${s.project}"`,
      `"${s.jobRole || apiService.getEffectiveJobRole(s) || ''}"`,
      `"${s.recruiter}"`,
      `"${s.candidateName}"`,
      `"${s.passportNumber}"`,
      `"${s.mobileNumber || ''}"`,
      `"${s.altMobileNumber || apiService.getEffectiveAltMobile(s) || ''}"`,
      `"${s.emailId || apiService.getEffectiveEmail(s) || ''}"`,
      `"${(s.remarks || '').replace(/"/g, '""')}"`,
      `"${s.fileUrl || ''}"`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Candidate_Submissions_Export_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Total Analytics Computations & Project Count Resolvers
  const allSubsList = allSubmissions.length > 0 ? allSubmissions : submissions;
  const totalSubmissionsCount = allSubsList.length;
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const yesterdayStr = yesterday.toISOString().slice(0, 10);

  const todayCount = allSubsList.filter(s => s.timestamp && s.timestamp.slice(0, 10) === todayStr).length;
  const yesterdayCount = allSubsList.filter(s => s.timestamp && s.timestamp.slice(0, 10) === yesterdayStr).length;
  const activeProjectsCount = projects.filter(p => p.status === 'Open').length;

  const getProjectSubmissionCount = (proj: Project): number => {
    const matchedCount = allSubsList.filter(s => apiService.isProjectMatch(s.project, proj.name)).length;
    return Math.max(proj.totalSubmissions || 0, matchedCount);
  };

  // ── LOCK SCREEN ─────────────────────────────────────────────────────────────
  if (!isAuthenticated) {
    return (
      <div className="max-w-md mx-auto my-16 p-8 bg-white rounded-3xl border border-slate-200 shadow-xl text-center animate-fadeIn">
        <div className="w-16 h-16 rounded-2xl bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center mx-auto mb-5 shadow-sm">
          <Lock className="w-8 h-8" />
        </div>

        <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight mb-2">
          Manager Workspace Locked
        </h2>
        <p className="text-xs text-slate-500 mb-6 leading-relaxed">
          Please enter the manager security passcode to access analytics, project management, and candidate logs.
        </p>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <input
              type="password"
              id="manager-passcode-input"
              autoFocus
              placeholder="Enter passcode..."
              value={inputPasscode}
              onChange={(e) => setInputPasscode(e.target.value)}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-300 rounded-xl text-center text-lg font-mono font-bold tracking-widest focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all text-slate-900"
            />
          </div>

          {authError && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 font-medium">
              {authError}
            </div>
          )}

          <button
            type="submit"
            id="unlock-workspace-btn"
            className="w-full py-3.5 bg-slate-900 hover:bg-slate-800 text-white font-extrabold rounded-xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            <Unlock className="w-4 h-4 text-amber-400" />
            <span>Unlock Workspace</span>
          </button>
        </form>
      </div>
    );
  }


  // ── AUTHENTICATED MANAGER DASHBOARD ─────────────────────────────────────────
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-fadeIn space-y-8">

      {/* Top Bar with Navigation Tabs */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white p-4 sm:p-6 rounded-3xl border border-slate-200 shadow-xs">

        <div className="flex items-center space-x-3">
          <div className="w-12 h-12 rounded-2xl bg-slate-900 text-amber-400 flex items-center justify-center font-extrabold text-lg shadow-sm">
            <KeyRound className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                Manager Workspace
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200 uppercase tracking-wide">
                Admin Control
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Live submission logs, dynamic project builder & recruiter analytics
            </p>
          </div>
        </div>

        {/* Tab Switcher & Quick Actions */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-2xl border border-slate-200">
            <button
              onClick={async () => {
                setIsSyncing(true);
                try {
                  const res = await apiService.testConnection();
                  setSettingsMessage({ type: res.success ? 'success' : 'error', text: res.message });
                } catch (e: any) {
                  setSettingsMessage({ type: 'error', text: e.message || 'Test failed' });
                } finally {
                  setIsSyncing(false);
                }
              }}
              disabled={isSyncing}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-xs font-bold text-emerald-700 shadow-2xs transition-all disabled:opacity-50"
              title="Test connection to Google Apps Script and Google Sheets backup"
            >
              <Activity className="w-3.5 h-3.5 text-emerald-600" />
              <span>Test Connection</span>
            </button>

            <button
              id="fetch-sheets-data-btn"
              onClick={handleSyncCloudData}
              disabled={isSyncing}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-2xs transition-all disabled:opacity-50 cursor-pointer"
              title="Fetch all live candidate submissions and project records from Google Sheets"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>Fetch Project Sheets Data</span>
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 bg-slate-100 p-1.5 rounded-2xl border border-slate-200">
            <button
              onClick={() => handleSelectTab('analytics')}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${activeTab === 'analytics' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              <span>Overview & Stats</span>
            </button>

            <button
              onClick={() => handleSelectTab('submissions')}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${activeTab === 'submissions' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>All Submissions ({submissions.length})</span>
            </button>

            <button
              onClick={() => handleSelectTab('projects')}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${activeTab === 'projects' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
            >
              <FolderKanban className="w-3.5 h-3.5" />
              <span>Project Builder</span>
            </button>

            <button
              onClick={() => handleSelectTab('recruiters')}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${activeTab === 'recruiters' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Recruiters ({recruiters.length})</span>
            </button>

            <button
              onClick={() => handleSelectTab('settings')}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${activeTab === 'settings' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
            >
              <Settings className="w-3.5 h-3.5" />
              <span>Settings & Sync</span>
            </button>

            <button
              onClick={handleLogout}
              title="Lock manager workspace"
              className="p-2 text-slate-400 hover:text-rose-600 hover:bg-white rounded-xl transition-all"
            >
              <Lock className="w-4 h-4" />
            </button>
          </div>
        </div>

      </div>

      {/* ── TAB 1: ANALYTICS & OVERVIEW ─────────────────────────────────────────── */}
      {activeTab === 'analytics' && (
        <div className="space-y-6 animate-fadeIn">

          {/* 4 Stat Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
              <div className="space-y-1">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">Total Submissions</span>
                <h3 className="text-2xl font-black text-slate-900">{totalSubmissionsCount}</h3>
                <p className="text-[11px] text-emerald-600 font-medium">All active campaigns</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                <FileSpreadsheet className="w-6 h-6" />
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
              <div className="space-y-1">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">Today's Uploads</span>
                <h3 className="text-2xl font-black text-indigo-600">{todayCount}</h3>
                <p className="text-[11px] text-slate-500">Since 00:00 midnight</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                <BarChart3 className="w-6 h-6" />
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
              <div className="space-y-1">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">Yesterday's Total</span>
                <h3 className="text-2xl font-black text-slate-700">{yesterdayCount}</h3>
                <p className="text-[11px] text-slate-500">24-hour baseline</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center">
                <Users className="w-6 h-6" />
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
              <div className="space-y-1">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">Active Projects</span>
                <h3 className="text-2xl font-black text-emerald-600">{activeProjectsCount}</h3>
                <p className="text-[11px] text-slate-500">{projects.length} Total Registered</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <FolderKanban className="w-6 h-6" />
              </div>
            </div>

          </div>

          {/* Leaderboard & Project Throughput */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

            {/* Recruiter Leaderboard Table (7 cols) */}
            <div className="lg:col-span-7 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="font-extrabold text-slate-900 text-base">Recruiter Performance Leaderboard</h3>
                  <p className="text-xs text-slate-500">Real-time candidate intake count per team member</p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <select
                      value={leaderboardProjectFilter}
                      onChange={(e) => setLeaderboardProjectFilter(e.target.value)}
                      className="text-xs font-bold bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl px-3 py-1.5 text-slate-700 pr-8 focus:outline-hidden focus:ring-2 focus:ring-blue-500 cursor-pointer"
                    >
                      <option value="All Projects">🏆 Overall (All Projects)</option>
                      {projects.map((p) => (
                        <option key={p.name} value={p.name}>
                          📁 {p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    onClick={() => loadData()}
                    className="p-2 text-slate-500 hover:text-blue-600 hover:bg-slate-50 rounded-xl transition-all"
                    title="Refresh leaderboard stats"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs table-fixed">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500 uppercase font-bold text-[11px]">
                      <th className="pb-3 pl-3 text-left w-[34%]">Recruiter Name</th>
                      <th className="pb-3 text-center w-[22%]">Today</th>
                      <th className="pb-3 text-center w-[22%]">Yesterday</th>
                      <th className="pb-3 pr-3 text-center w-[22%]">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {performanceList.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="py-6 text-center text-slate-400 font-medium">
                          No active recruiters found.
                        </td>
                      </tr>
                    ) : (
                      performanceList.map((rec, index) => (
                        <tr key={rec.name} className="hover:bg-slate-50/80 transition-colors group">
                          <td className="py-3 pl-3 font-bold text-slate-900 w-[34%]">
                            <div className="flex items-center gap-3 min-w-0">
                              <span className="w-4 text-center text-xs font-bold text-slate-400 shrink-0">
                                {index + 1}
                              </span>
                              <span className="font-semibold text-slate-800 group-hover:text-blue-600 transition-colors truncate">{rec.name}</span>
                            </div>
                          </td>
                          <td className="py-3 text-center w-[22%]">
                            {rec.today > 0 ? (
                              <span className="font-bold text-indigo-600 text-sm">
                                +{rec.today}
                              </span>
                            ) : (
                              <span className="text-slate-400 font-medium text-sm">0</span>
                            )}
                          </td>
                          <td className="py-3 text-center w-[22%]">
                            {rec.yesterday > 0 ? (
                              <span className="font-semibold text-slate-700 text-sm">
                                {rec.yesterday}
                              </span>
                            ) : (
                              <span className="text-slate-400 font-medium text-sm">0</span>
                            )}
                          </td>
                          <td className="py-3 pr-3 text-center w-[22%]">
                            <span className="font-black text-slate-900 text-sm">{rec.total}</span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Project Throughput Summary (5 cols) */}
            <div className="lg:col-span-5 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
              <div>
                <h3 className="font-extrabold text-slate-900 text-base">Campaign Volume Breakdown</h3>
                <p className="text-xs text-slate-500">Distribution of candidate applications by project</p>
              </div>

              <div className="space-y-3">
                {projects.length === 0 ? (
                  <div className="p-6 text-center text-slate-400 text-xs border border-dashed border-slate-200 rounded-xl">
                    No active campaigns. Create a project in the Job Projects tab to track volume.
                  </div>
                ) : (
                  projects.map((proj) => {
                    const projCount = getProjectSubmissionCount(proj);
                    const percentage = totalSubmissionsCount > 0 ? Math.round((projCount / totalSubmissionsCount) * 100) : 0;

                    return (
                      <div key={proj.name} className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-bold text-slate-900 truncate max-w-[200px]" title={proj.name}>
                            {proj.name}
                          </span>
                          <span className="font-mono font-bold text-slate-700">
                            {projCount} ({percentage}%)
                          </span>
                        </div>
                        <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                          <div
                            className="bg-blue-600 h-full rounded-full transition-all"
                            style={{ width: `${percentage}%` }}
                          ></div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

          </div>

          {/* Recent Candidate Submissions Quick Preview Table */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-extrabold text-slate-900 text-base">Recent Candidate Intakes</h3>
                <p className="text-xs text-slate-500">Click any candidate to open full document preview & questionnaire dossier</p>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab('submissions')}
                className="text-xs font-bold text-blue-600 hover:text-blue-800 transition-colors"
              >
                View All Submissions ({submissions.length}) →
              </button>
            </div>

            {submissions.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-xs border border-dashed border-slate-200 rounded-xl">
                No candidate submissions logged yet.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500 uppercase font-bold text-[10px]">
                      <th className="pb-2.5">Date & Time</th>
                      <th className="pb-2.5">Candidate Name</th>
                      <th className="pb-2.5">Passport Number</th>
                      <th className="pb-2.5">Project</th>
                      <th className="pb-2.5">Recruiter</th>
                      <th className="pb-2.5 text-center">Document Preview</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {submissions.slice(0, 6).map((sub) => (
                      <tr key={sub.id || sub.passportNumber} className="hover:bg-blue-50/40 transition-colors group">
                        <td className="py-3 text-slate-500 whitespace-nowrap">
                          <span className="font-medium text-slate-700 block">{new Date(sub.timestamp).toLocaleDateString()}</span>
                          <span className="text-[10px] text-slate-400">{new Date(sub.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </td>
                        <td
                          onClick={() => setPreviewDoc(sub)}
                          className="py-3 font-bold text-slate-900 cursor-pointer hover:text-blue-600"
                          title="Click to preview document"
                        >
                          <span className="line-clamp-1">{sub.candidateName}</span>
                        </td>
                        <td
                          onClick={() => setPreviewDoc(sub)}
                          className="py-3 font-mono font-bold text-blue-700 whitespace-nowrap cursor-pointer hover:opacity-80"
                          title="Click to preview document"
                        >
                          <span className="bg-blue-50 border border-blue-200/60 px-1.5 py-0.5 rounded text-[11px]">
                            {sub.passportNumber}
                          </span>
                        </td>
                        <td className="py-3 font-semibold text-slate-700">{sub.project}</td>
                        <td className="py-3 text-slate-600 font-medium">{sub.recruiter}</td>
                        <td className="py-3 text-center whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => setPreviewDoc(sub)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition-all shadow-2xs cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>Preview Document</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

        </div>
      )}

      {/* ── TAB 2: SUBMISSIONS EXPLORER ────────────────────────────────────────── */}
      {activeTab === 'submissions' && (
        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs space-y-6 animate-fadeIn">

          {/* Controls Bar */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">

            {/* Search Input */}
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
              <input
                type="text"
                placeholder="Search by candidate name, passport, phone..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value.toUpperCase())}
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:bg-white text-slate-800 font-bold uppercase"
              />
            </div>

            {/* Filter Dropdowns & CSV Export */}
            <div className="flex flex-wrap items-center gap-3">

              {/* Project Filter */}
              <select
                value={filterProject}
                onChange={(e) => setFilterProject(e.target.value)}
                className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-hidden cursor-pointer"
              >
                <option value="All Projects">All Projects</option>
                {projects.map((p) => (
                  <option key={p.name} value={p.name}>{p.name}</option>
                ))}
              </select>

              {/* Job Role Filter */}
              <select
                value={filterJobRole}
                onChange={(e) => setFilterJobRole(e.target.value)}
                className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-hidden cursor-pointer"
              >
                <option value="All Roles">All Job Roles</option>
                {availableJobRoles.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>

              {/* Recruiter Filter */}
              <select
                value={filterRecruiter}
                onChange={(e) => setFilterRecruiter(e.target.value)}
                className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-hidden cursor-pointer"
              >
                <option value="All Recruiters">All Recruiters</option>
                {recruiters.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>

              {/* Cloud Sync Button */}
              <button
                onClick={handleSyncCloudData}
                disabled={isSyncing}
                title="Fetch live records from Google Sheets backup"
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                <span>{isSyncing ? 'Syncing...' : 'Sync Cloud Data'}</span>
              </button>

              {/* CSV Export Button */}
              <button
                onClick={handleExportCSV}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export CSV</span>
              </button>

            </div>

          </div>

          {/* Timeframe & Date Range Filter Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-slate-50/90 rounded-2xl border border-slate-200 shadow-2xs">

            {/* Quick Timeframe Buttons */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mr-1 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-slate-500" />
                Timeframe:
              </span>

              <button
                type="button"
                onClick={() => setDateRangeFilter('all')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${dateRangeFilter === 'all'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-white text-slate-600 hover:bg-slate-100 hover:text-slate-900 border border-slate-200'
                  }`}
              >
                All Time
              </button>

              <button
                type="button"
                onClick={() => setDateRangeFilter('today')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${dateRangeFilter === 'today'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-white text-slate-600 hover:bg-slate-100 hover:text-slate-900 border border-slate-200'
                  }`}
              >
                Today
              </button>

              <button
                type="button"
                onClick={() => setDateRangeFilter('this_week')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${dateRangeFilter === 'this_week'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-white text-slate-600 hover:bg-slate-100 hover:text-slate-900 border border-slate-200'
                  }`}
              >
                This Week
              </button>

              <button
                type="button"
                onClick={() => setDateRangeFilter('this_month')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${dateRangeFilter === 'this_month'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-white text-slate-600 hover:bg-slate-100 hover:text-slate-900 border border-slate-200'
                  }`}
              >
                This Month
              </button>

              <button
                type="button"
                onClick={() => setDateRangeFilter('custom')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${dateRangeFilter === 'custom'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-white text-slate-600 hover:bg-slate-100 hover:text-slate-900 border border-slate-200'
                  }`}
              >
                <Calendar className="w-3.5 h-3.5" />
                <span>Custom Range</span>
              </button>
            </div>

            {/* Custom Date Pickers (visible when Custom Range is active) */}
            {dateRangeFilter === 'custom' && (
              <div className="flex flex-wrap items-center gap-2 animate-fadeIn">
                <div className="flex items-center gap-1.5 bg-white px-2.5 py-1.5 rounded-xl border border-slate-200 text-xs shadow-2xs">
                  <span className="text-[11px] font-bold text-slate-500">From:</span>
                  <input
                    type="date"
                    value={customStartDate}
                    onChange={(e) => setCustomStartDate(e.target.value)}
                    className="bg-transparent text-xs font-semibold text-slate-800 focus:outline-hidden cursor-pointer"
                  />
                </div>

                <div className="flex items-center gap-1.5 bg-white px-2.5 py-1.5 rounded-xl border border-slate-200 text-xs shadow-2xs">
                  <span className="text-[11px] font-bold text-slate-500">To:</span>
                  <input
                    type="date"
                    value={customEndDate}
                    onChange={(e) => setCustomEndDate(e.target.value)}
                    className="bg-transparent text-xs font-semibold text-slate-800 focus:outline-hidden cursor-pointer"
                  />
                </div>

                {(customStartDate || customEndDate) && (
                  <button
                    type="button"
                    onClick={() => { setCustomStartDate(''); setCustomEndDate(''); }}
                    className="p-1.5 text-slate-400 hover:text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg text-xs transition-all cursor-pointer"
                    title="Clear date filter"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            )}

            {/* Matching Records Count Badge */}
            <div className="flex items-center gap-2">
              <span className="px-3 py-1 bg-white border border-slate-200 rounded-xl text-xs font-extrabold text-slate-700 shadow-2xs">
                {filteredSubmissions.length} of {submissions.length} candidates
              </span>
            </div>

          </div>

          {/* Data Table */}
          <div className="overflow-x-auto border border-slate-200 rounded-2xl bg-white shadow-2xs">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="py-3 px-3 w-[130px] whitespace-nowrap">Submission Time</th>
                  <th className="py-3 px-3 min-w-[130px] max-w-[200px]">Project</th>
                  <th className="py-3 px-3 min-w-[110px] whitespace-nowrap">Job Role</th>
                  <th className="py-3 px-3 min-w-[140px] max-w-[190px]">Candidate Name</th>
                  <th className="py-3 px-3 w-[110px] whitespace-nowrap">Passport No.</th>
                  <th className="py-3 px-3 min-w-[130px] whitespace-nowrap">Contact Numbers</th>
                  <th className="py-3 px-3 min-w-[130px] max-w-[160px] whitespace-nowrap">Email ID</th>
                  <th className="py-3 px-3 w-[100px] whitespace-nowrap">Recruiter</th>
                  <th className="py-3 px-3 w-[80px] text-center whitespace-nowrap">Document</th>
                  <th className="py-3 px-3 w-[60px] text-right whitespace-nowrap">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredSubmissions.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="p-8 text-center text-slate-400">
                      No candidate submissions match the selected criteria.
                    </td>
                  </tr>
                ) : (
                  filteredSubmissions.map((sub) => {
                    const jobRole = sub.jobRole || apiService.getEffectiveJobRole(sub);
                    const altMob = sub.altMobileNumber || apiService.getEffectiveAltMobile(sub);
                    const email = sub.emailId || apiService.getEffectiveEmail(sub);

                    return (
                      <tr key={sub.id || sub.passportNumber} className="hover:bg-blue-50/40 transition-colors">

                        <td className="py-2.5 px-3 text-slate-500 whitespace-nowrap">
                          <span className="block font-medium text-slate-700">{formatDisplayDateTime(sub.timestamp)}</span>
                        </td>

                        <td className="py-2.5 px-3 font-semibold text-slate-800" title={sub.project}>
                          <span className="line-clamp-1">{sub.project}</span>
                        </td>

                        <td className="py-2.5 px-3 whitespace-nowrap">
                          {jobRole ? (
                            <span className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-800 border border-blue-200 text-[11px] font-bold">
                              {jobRole}
                            </span>
                          ) : (
                            <span className="text-slate-400 text-[11px] italic">—</span>
                          )}
                        </td>

                        <td
                          onClick={() => setPreviewDoc(sub)}
                          className="py-2.5 px-3 font-bold text-slate-900 cursor-pointer hover:text-blue-600 group"
                          title="Click to preview document & questionnaire answers"
                        >
                          <span className="line-clamp-1 flex items-center gap-1.5">
                            <span>{sub.candidateName}</span>
                            <Eye className="w-3 h-3 text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                          </span>
                        </td>

                        <td
                          onClick={() => setPreviewDoc(sub)}
                          className="py-2.5 px-3 font-mono font-bold text-blue-700 whitespace-nowrap cursor-pointer hover:opacity-80"
                          title="Click to preview document"
                        >
                          <span className="bg-blue-50 border border-blue-200/60 px-1.5 py-0.5 rounded text-[11px] hover:bg-blue-100 hover:border-blue-300 transition-colors">
                            {sub.passportNumber}
                          </span>
                        </td>

                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <span className="font-mono text-slate-700 font-medium block text-xs">
                            {sub.mobileNumber || '—'}
                          </span>
                          {altMob && altMob !== sub.mobileNumber && (
                            <span className="font-mono text-slate-500 text-[10px] block">
                              Alt: {altMob}
                            </span>
                          )}
                        </td>

                        <td className="py-2.5 px-3 whitespace-nowrap truncate max-w-[160px]" title={email}>
                          {email ? (
                            <span className="text-slate-700 font-medium text-xs truncate block">
                              {email}
                            </span>
                          ) : (
                            <span className="text-slate-400 text-[11px] italic">—</span>
                          )}
                        </td>

                        <td className="py-2.5 px-3 font-medium text-slate-700 whitespace-nowrap">
                          <span className="px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200 text-[11px] font-semibold">
                            {sub.recruiter}
                          </span>
                        </td>

                        <td className="py-2.5 px-3 text-center whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => setPreviewDoc(sub)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 font-bold transition-colors text-[11px] cursor-pointer"
                          >
                            <Eye className="w-3 h-3" /> Preview
                          </button>
                        </td>

                        <td className="py-2.5 px-3 text-right whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => handleDeleteSubmission(sub)}
                            title="Delete submission record"
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>

                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="text-xs text-slate-500 flex items-center justify-between">
            <span>Showing {filteredSubmissions.length} of {submissions.length} total candidate submissions</span>
            <span className="flex items-center gap-1 text-emerald-600 font-medium">
              <CheckCircle2 className="w-3.5 h-3.5" /> Synced with Google Sheets Cloud Backup
            </span>
          </div>

        </div>
      )}

      {/* ── TAB 3: PROJECT BUILDER ─────────────────────────────────────────────── */}
      {activeTab === 'projects' && (
        <div className="space-y-6 animate-fadeIn">

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-extrabold text-slate-900">Active Job Projects & Connected Data Sheets</h2>
              <p className="text-xs text-slate-500">Every project connects directly to its own individual Google Spreadsheet and Google Drive storage folder</p>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={handleSyncCloudData}
                disabled={isSyncing}
                title="Pull latest projects & sheet links from Google Sheets"
                className="inline-flex items-center gap-1.5 px-3.5 py-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                <span>{isSyncing ? 'Refreshing...' : 'Reload Sheets'}</span>
              </button>

              <button
                onClick={() => handleOpenConnectSheet()}
                className="inline-flex items-center gap-2 px-3.5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer"
                title="Connect external Google Sheet or Form responses and auto-detect columns"
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>Connect External Sheet</span>
              </button>

              <button
                onClick={handleOpenNewProject}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Create New Project</span>
              </button>
            </div>
          </div>

          {/* Connected Data Sheets Quick Access Directory */}
          {projects.length > 0 && (
            <div className="bg-slate-900 text-white p-5 rounded-3xl border border-slate-800 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                    <FileSpreadsheet className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-sm text-white">Project Data Sheets & Drive Directories ({projects.length})</h3>
                    <p className="text-[11px] text-slate-400">Direct external access to individual spreadsheets where candidate submissions are saved</p>
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400 uppercase font-bold text-[10px]">
                      <th className="pb-2.5">Project / Campaign</th>
                      <th className="pb-2.5">Mode</th>
                      <th className="pb-2.5">Google Spreadsheet Link (Col B)</th>
                      <th className="pb-2.5">Drive Folder Link (Col C)</th>
                      <th className="pb-2.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {projects.map((proj) => {
                      const hasSheet = Boolean(proj.sheetUrl && proj.sheetUrl.trim());
                      const hasFolder = Boolean(proj.folderUrl && proj.folderUrl.trim());
                      const subCount = getProjectSubmissionCount(proj);

                      return (
                        <tr key={proj.name} className="hover:bg-slate-800/40 transition-colors">
                          <td className="py-3 font-bold text-white">
                            <div className="flex items-center gap-2">
                              <span className="truncate max-w-[180px] sm:max-w-[240px]" title={proj.name}>{proj.name}</span>
                              <span className="px-1.5 py-0.5 bg-slate-800 text-slate-300 rounded text-[10px] font-mono">
                                {subCount}
                              </span>
                            </div>
                          </td>
                          <td className="py-3">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${proj.status === 'Open' ? 'bg-emerald-950 text-emerald-300 border border-emerald-800' : 'bg-slate-800 text-slate-400'
                              }`}>
                              {proj.status}
                            </span>
                          </td>
                          <td className="py-3">
                            {hasSheet ? (
                              <div className="flex items-center gap-2">
                                <a
                                  href={proj.sheetUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-950/80 hover:bg-emerald-900 text-emerald-300 hover:text-emerald-200 border border-emerald-700/60 rounded-lg text-[11px] font-semibold transition-all"
                                  title="Open Google Sheet in new tab"
                                >
                                  <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
                                  <span>Open Sheet</span>
                                  <ExternalLink className="w-3 h-3 text-emerald-400" />
                                </a>
                                <button
                                  onClick={() => handleCopyLink(proj.sheetUrl || '', `sheet-${proj.name}`)}
                                  className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-800"
                                  title="Copy Sheet URL"
                                >
                                  {copiedId === `sheet-${proj.name}` ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                                </button>
                              </div>
                            ) : (
                              <span className="text-slate-500 text-[11px] italic">No sheet URL configured</span>
                            )}
                          </td>
                          <td className="py-3">
                            {hasFolder ? (
                              <div className="flex items-center gap-2">
                                <a
                                  href={proj.folderUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-950/80 hover:bg-blue-900 text-blue-300 hover:text-blue-200 border border-blue-700/60 rounded-lg text-[11px] font-semibold transition-all"
                                  title="Open Google Drive Folder in new tab"
                                >
                                  <HardDrive className="w-3.5 h-3.5 text-blue-400" />
                                  <span>Open Drive</span>
                                  <ExternalLink className="w-3 h-3 text-blue-400" />
                                </a>
                                <button
                                  onClick={() => handleCopyLink(proj.folderUrl || '', `folder-${proj.name}`)}
                                  className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-800"
                                  title="Copy Folder URL"
                                >
                                  {copiedId === `folder-${proj.name}` ? <Check className="w-3.5 h-3.5 text-blue-400" /> : <Copy className="w-3.5 h-3.5" />}
                                </button>
                              </div>
                            ) : (
                              <span className="text-slate-500 text-[11px] italic">No drive URL configured</span>
                            )}
                          </td>
                          <td className="py-3 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() => handleOpenConnectSheet(proj.name)}
                                className="px-2.5 py-1 bg-emerald-950/80 hover:bg-emerald-900 text-emerald-300 hover:text-emerald-200 border border-emerald-700/60 rounded-lg text-xs font-medium transition-colors cursor-pointer"
                                title="Import or connect external Google Sheet for this project"
                              >
                                Connect Sheet
                              </button>
                              <button
                                onClick={() => handleOpenEditProject(proj)}
                                className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium transition-colors cursor-pointer"
                              >
                                Edit
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {projects.length === 0 ? (
            <div className="bg-white rounded-2xl p-12 border border-dashed border-slate-300 text-center space-y-4">
              <div className="w-14 h-14 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto">
                <Briefcase className="w-7 h-7" />
              </div>
              <div className="space-y-1 max-w-sm mx-auto">
                <h3 className="text-base font-bold text-slate-800">No Projects Created Yet</h3>
                <p className="text-xs text-slate-500">
                  Get started by creating your first recruitment campaign with custom questionnaire fields and linked Google Sheet.
                </p>
              </div>
              <button
                type="button"
                onClick={handleOpenNewProject}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Create Your First Project</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {projects.map((proj) => (
                <div key={proj.name} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4 flex flex-col justify-between">

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${proj.status === 'Open' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'
                        }`}>
                        {proj.status} • {proj.submission}
                      </span>
                      <span className="text-xs font-mono font-bold text-slate-500">
                        {getProjectSubmissionCount(proj)} Submissions
                      </span>
                    </div>

                    <h3 className="text-base font-extrabold text-slate-900">{proj.name}</h3>
                    {proj.description && <p className="text-xs text-slate-600 leading-relaxed">{proj.description}</p>}

                    {/* Direct Sheet & Drive Badges */}
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      {proj.sheetUrl ? (
                        <a
                          href={proj.sheetUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-lg text-xs font-semibold transition-colors"
                          title={proj.sheetUrl}
                        >
                          <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Google Sheet</span>
                          <ExternalLink className="w-3 h-3 text-emerald-500" />
                        </a>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-100 text-slate-400 rounded-lg text-[11px]">
                          <FileSpreadsheet className="w-3 h-3" /> No Sheet Link
                        </span>
                      )}

                      {proj.folderUrl ? (
                        <a
                          href={proj.folderUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-200 rounded-lg text-xs font-semibold transition-colors"
                          title={proj.folderUrl}
                        >
                          <HardDrive className="w-3.5 h-3.5 text-blue-600" />
                          <span>Drive Folder</span>
                          <ExternalLink className="w-3 h-3 text-blue-500" />
                        </a>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-100 text-slate-400 rounded-lg text-[11px]">
                          <HardDrive className="w-3 h-3" /> No Folder Link
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Configured Job Roles */}
                  <div className="p-3 bg-blue-50/60 rounded-xl text-xs space-y-1.5 border border-blue-100/80">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-blue-900 flex items-center gap-1.5">
                        <Briefcase className="w-3.5 h-3.5 text-blue-600" />
                        Configured Job Roles ({proj.jobRoles?.length || 0}):
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5 pt-0.5">
                      {proj.jobRoles && proj.jobRoles.length > 0 ? (
                        proj.jobRoles.map((role) => (
                          <span key={role} className="px-2 py-0.5 bg-white border border-blue-200 rounded-md text-[11px] font-semibold text-blue-800 shadow-2xs">
                            {role}
                          </span>
                        ))
                      ) : (
                        <span className="text-slate-400 text-[11px] italic">No specific roles defined (Any role allowed)</span>
                      )}
                    </div>
                  </div>

                  {/* Question schema count */}
                  <div className="p-3 bg-slate-50 rounded-xl text-xs space-y-1.5">
                    <span className="font-bold text-slate-700 block">Additional Custom Fields ({proj.fields?.length || 0}):</span>
                    <div className="flex flex-wrap gap-1.5">
                      {proj.fields && proj.fields.length > 0 ? (
                        proj.fields.map(f => (
                          <span key={f.id} className="px-2 py-0.5 bg-white border border-slate-200 rounded-md text-[11px] text-slate-700">
                            {f.label} ({f.type})
                          </span>
                        ))
                      ) : (
                        <span className="text-slate-400 text-[11px]">Core mandatory questions only (Passport, Mobile, Alt Mobile, Email, CV)</span>
                      )}
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {proj.sheetUrl && (
                        <a
                          href={proj.sheetUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="p-2 text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                          title="Open linked Google Sheet"
                        >
                          <FileSpreadsheet className="w-4 h-4" />
                        </a>
                      )}
                      {proj.folderUrl && (
                        <a
                          href={proj.folderUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="p-2 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="Open linked Google Drive Folder"
                        >
                          <HardDrive className="w-4 h-4" />
                        </a>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setPreviewProject(proj)}
                        className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-1"
                        title="Preview how recruiters see this project's form"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Preview Form</span>
                      </button>
                      <button
                        onClick={() => handleOpenEditProject(proj)}
                        className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg text-xs font-bold transition-colors cursor-pointer"
                      >
                        Edit Schema & Links
                      </button>
                      <button
                        onClick={() => handleDeleteProject(proj.name)}
                        className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                        title="Delete project"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                </div>
              ))}
            </div>
          )}

        </div>
      )}

      {/* ── TAB 4: RECRUITER ROSTER ────────────────────────────────────────────── */}
      {activeTab === 'recruiters' && (
        <div className="max-w-4xl mx-auto space-y-6 animate-fadeIn">

          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4">
            <h2 className="text-lg font-extrabold text-slate-900">Add New Recruiter Profile</h2>
            <p className="text-xs text-slate-500">Authorized team members who can upload candidate documents</p>

            <form onSubmit={handleAddRecruiter} className="flex gap-3">
              <input
                type="text"
                placeholder="ENTER RECRUITER FULL NAME (E.G. RAMESH KUMAR)"
                value={newRecruiterName}
                onChange={(e) => setNewRecruiterName(e.target.value.toUpperCase())}
                className="flex-1 px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-blue-500 text-slate-900 font-bold uppercase"
              />
              <button
                type="submit"
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer"
              >
                Add Recruiter
              </button>
            </form>

            {recruiterMessage && (
              <div className={`p-3 rounded-xl text-xs font-medium ${recruiterMessage.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-rose-50 text-rose-800 border border-rose-200'
                }`}>
                {recruiterMessage.text}
              </div>
            )}
          </div>

          {/* Recruiters List */}
          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-extrabold text-slate-900 text-sm">Active Recruiter Roster ({localRecruiters.length})</h3>
                <p className="text-xs text-slate-500">Authorized recruiters listed across candidate intake forms</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {localRecruiters.map((rec) => {
                const recSubs = allSubsList.filter(s => s.recruiter.trim().toLowerCase() === rec.trim().toLowerCase()).length;
                const isConfirming = deletingRecruiter === rec;

                return (
                  <div key={rec} className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <h4 className="font-bold text-slate-900 text-sm truncate">{rec}</h4>
                      <p className="text-xs text-slate-500">{recSubs} candidates submitted</p>
                    </div>

                    <div className="shrink-0 flex items-center gap-1.5">
                      {isConfirming ? (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleDeleteRecruiter(rec)}
                            className="px-2.5 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-extrabold transition-all shadow-xs cursor-pointer"
                          >
                            Delete
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeletingRecruiter(null)}
                            className="px-2 py-1 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-xs font-bold transition-all cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setDeletingRecruiter(rec)}
                          className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                          title={`Remove ${rec} from recruiter list`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

        </div>
      )}

      {/* ── TAB 5: SETTINGS & SYNC ─────────────────────────────────────────────── */}
      {activeTab === 'settings' && (
        <div className="max-w-4xl mx-auto space-y-6 animate-fadeIn">

          {settingsMessage && (
            <div className={`p-4 rounded-2xl flex items-center gap-2 text-sm font-bold ${settingsMessage.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-rose-50 text-rose-800 border border-rose-200'
              }`}>
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              <span>{settingsMessage.text}</span>
            </div>
          )}

          {/* Automatic Background Data Fetching Engine Card */}
          <div className="bg-gradient-to-br from-slate-900 via-indigo-950 to-blue-950 text-white p-6 rounded-3xl shadow-lg border border-indigo-500/20 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-blue-500/20 border border-blue-400/30 flex items-center justify-center text-blue-400">
                    <RefreshCw className={`w-5 h-5 ${autoSyncState.isSyncing ? 'animate-spin' : ''}`} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-extrabold text-white">Auto Data Fetching Engine</h3>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                        Continuous Live Sync
                      </span>
                    </div>
                    <p className="text-xs text-slate-300 mt-0.5">
                      Automatically queries and fetches latest submissions from Google Sheets without manual button clicks
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.autoSyncEnabled !== false}
                    onChange={(e) => {
                      const updated = { ...config, autoSyncEnabled: e.target.checked };
                      setConfig(updated);
                      apiService.saveConfig({ autoSyncEnabled: e.target.checked });
                    }}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                  <span className="ml-2.5 text-xs font-bold text-slate-200">
                    {config.autoSyncEnabled !== false ? 'Auto-Fetch Active' : 'Auto-Fetch Paused'}
                  </span>
                </label>
              </div>
            </div>

            {/* Interval Selector & Live Stats */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 pt-3 border-t border-indigo-500/20">
              <div className="bg-white/5 backdrop-blur-xs p-3.5 rounded-2xl border border-white/10">
                <span className="text-[10px] text-indigo-200 block font-bold uppercase tracking-wider">Sync Frequency</span>
                <select
                  value={config.autoSyncInterval || 15}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    const updated = { ...config, autoSyncInterval: val };
                    setConfig(updated);
                    apiService.saveConfig({ autoSyncInterval: val });
                  }}
                  className="mt-1.5 w-full bg-slate-900/90 text-white font-bold text-xs rounded-xl px-3 py-2 border border-indigo-400/30 focus:ring-2 focus:ring-blue-400 cursor-pointer"
                >
                  <option value={10}>Every 10 seconds (High Frequency)</option>
                  <option value={15}>Every 15 seconds (Recommended)</option>
                  <option value={30}>Every 30 seconds</option>
                  <option value={60}>Every 1 minute</option>
                  <option value={120}>Every 2 minutes</option>
                </select>
              </div>

              <div className="bg-white/5 backdrop-blur-xs p-3.5 rounded-2xl border border-white/10 flex flex-col justify-center">
                <span className="text-[10px] text-indigo-200 block font-bold uppercase tracking-wider">Live Status</span>
                <div className="flex items-center gap-2 mt-1.5">
                  <span className={`w-2.5 h-2.5 rounded-full ${autoSyncState.isSyncing ? 'bg-blue-400 animate-ping' : autoSyncState.status === 'error' ? 'bg-rose-400' : 'bg-emerald-400'}`}></span>
                  <span className="text-xs font-bold text-white">
                    {autoSyncState.isSyncing ? 'Fetching latest data...' : autoSyncState.status === 'error' ? 'Sync paused / error' : 'Synchronized'}
                  </span>
                </div>
                <span className="text-[10px] text-indigo-300 mt-1 font-mono">
                  Last fetch: {autoSyncState.lastSyncTime ? formatTimeAgo(autoSyncState.lastSyncTime) : 'Never'}
                </span>
              </div>

              <div className="bg-white/5 backdrop-blur-xs p-3.5 rounded-2xl border border-white/10 flex flex-col justify-between">
                <div>
                  <span className="text-[10px] text-indigo-200 block font-bold uppercase tracking-wider">Connected Source</span>
                  <span className="text-xs font-bold text-white mt-1 block truncate">
                    {autoSyncState.syncSource || 'Google Sheets Backup'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => apiService.runAutoSync(true)}
                  disabled={autoSyncState.isSyncing}
                  className="mt-2 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold transition-all shadow-xs disabled:opacity-50 cursor-pointer"
                >
                  <RefreshCw className={`w-3 h-3 ${autoSyncState.isSyncing ? 'animate-spin' : ''}`} />
                  <span>{autoSyncState.isSyncing ? 'Syncing...' : 'Fetch Now'}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Backend Connection Endpoints */}
          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-extrabold text-slate-900">Backend & Cloud Storage Integration</h2>
                <p className="text-xs text-slate-500">Configure your Google Apps Script Web App backup and cloud sync endpoints</p>
              </div>

              <button
                onClick={() => setShowCodeExport(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors cursor-pointer"
              >
                <Code className="w-3.5 h-3.5" />
                <span>View Google Script Code</span>
              </button>
            </div>

            {/* Team Multi-Device Sync Notice */}
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200/80 rounded-2xl p-4 flex items-start gap-3">
              <div className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0 mt-0.5 shadow-xs">
                <Users className="w-4 h-4" />
              </div>
              <div className="text-xs text-slate-700 space-y-1">
                <p className="font-bold text-slate-900">
                  Global Team Multi-Device Synchronization
                </p>
                <p className="text-slate-600 leading-relaxed">
                  When you save your Google Apps Script URL here, it is <strong>automatically shared with all connected team members and devices</strong>. Anyone who opens this link will immediately see all active job projects, recruiters, and candidate files without needing to reconfigure credentials.
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide">
                  Google Apps Script Web App URL (doGet / doPost)
                </label>
                <input
                  type="text"
                  placeholder="https://script.google.com/macros/s/AKfycb.../exec"
                  value={config.gasWebAppUrl}
                  onChange={(e) => setConfig({ ...config, gasWebAppUrl: e.target.value })}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono focus:ring-2 focus:ring-blue-500 text-slate-800"
                />
                <p className="text-[11px] text-slate-500">Auto creates project sheets, Drive folders, and archives candidate PDF files.</p>
              </div>

              {/* Dedicated Google Sheets Backup Notice Card */}
              <div className="p-4 rounded-2xl bg-emerald-50/80 border border-emerald-200/90 flex items-start gap-3.5">
                <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 mt-0.5 shadow-xs">
                  <Database className="w-4 h-4" />
                </div>
                <div className="text-xs text-slate-700 space-y-1">
                  <p className="font-bold text-slate-900 flex items-center gap-2">
                    <span>Google Sheets is Primary Backup & Storage</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] bg-emerald-100 text-emerald-800 font-bold border border-emerald-300/60">
                      Active Cloud Backup
                    </span>
                  </p>
                  <p className="text-slate-600 leading-relaxed">
                    All candidate submissions, resume attachments, and project custom fields are stored and backed up directly in your Google Sheets and Google Drive folders. Supabase connection has been removed in favor of direct Google Sheets storage.
                  </p>
                </div>
              </div>

              <div className="pt-2 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={handleSaveConfig}
                  className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-xs shadow-xs transition-colors cursor-pointer"
                >
                  Save Connection Settings
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const url = apiService.getPreconfiguredTeamUrl();
                    if (url) {
                      if (navigator.clipboard) {
                        navigator.clipboard.writeText(url);
                      } else {
                        const tempInput = document.createElement('input');
                        tempInput.value = url;
                        document.body.appendChild(tempInput);
                        tempInput.select();
                        document.execCommand('copy');
                        document.body.removeChild(tempInput);
                      }
                      setTeamLinkCopied(true);
                      setSettingsMessage({
                        type: 'success',
                        text: '1-Click Team Sync link copied! Send this link to anyone on your team (WhatsApp/Email) to immediately connect their phone or browser with all live data.'
                      });
                      setTimeout(() => setTeamLinkCopied(false), 3500);
                    }
                  }}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-violet-600 hover:bg-violet-700 text-white font-bold rounded-xl text-xs shadow-xs transition-colors cursor-pointer"
                >
                  {teamLinkCopied ? <Check className="w-3.5 h-3.5 text-emerald-300" /> : <Share2 className="w-3.5 h-3.5" />}
                  <span>{teamLinkCopied ? 'Link Copied to Clipboard!' : 'Copy 1-Click Team Sync Link'}</span>
                </button>

                <button
                  type="button"
                  onClick={async () => {
                    setIsSyncing(true);
                    try {
                      const res = await apiService.testConnection();
                      setSettingsMessage({ type: res.success ? 'success' : 'error', text: res.message });
                    } catch (e: any) {
                      setSettingsMessage({ type: 'error', text: e.message || 'Test failed' });
                    } finally {
                      setIsSyncing(false);
                    }
                  }}
                  disabled={isSyncing}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                >
                  <Activity className="w-3.5 h-3.5" />
                  <span>Test Connection</span>
                </button>

                <button
                  type="button"
                  onClick={handleSyncCloudData}
                  disabled={isSyncing}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                  <span>{isSyncing ? 'Refreshing...' : 'Force Cloud Data Refresh'}</span>
                </button>

                <button
                  type="button"
                  onClick={async () => {
                    setIsSyncing(true);
                    const res = await apiService.triggerGoogleSheetsBackup();
                    setSettingsMessage({ type: res.success ? 'success' : 'error', text: res.message });
                    setIsSyncing(false);
                  }}
                  disabled={isSyncing}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 font-bold rounded-xl text-xs transition-colors cursor-pointer disabled:opacity-50"
                >
                  <Database className="w-3.5 h-3.5" />
                  <span>Sync Google Sheets Backup</span>
                </button>

                <button
                  type="button"
                  onClick={handleClearDemoData}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold rounded-xl text-xs transition-colors cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Clear Demo / Sample Candidates</span>
                </button>
              </div>

              {/* Vercel & Multi-Browser Deployment Guide */}
              <div className="mt-4 pt-4 border-t border-slate-100 bg-slate-50/80 rounded-2xl p-4 space-y-3">
                <div className="flex items-center gap-2 text-slate-800 font-bold text-xs">
                  <Globe className="w-4 h-4 text-violet-600" />
                  <span>Vercel & Multi-Browser Cross-Device Synchronization Guide</span>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  When you host on <strong>Vercel</strong> or open the link on another browser, you have <strong>two seamless options</strong> to make all projects and live database entries reflect for every user:
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  <div className="bg-white p-3.5 rounded-xl border border-slate-200 space-y-1.5 shadow-2xs">
                    <div className="flex items-center gap-1.5 font-bold text-violet-700">
                      <span className="w-5 h-5 rounded-full bg-violet-100 text-violet-700 flex items-center justify-center text-[10px]">1</span>
                      <span>Option 1: 1-Click Pre-Configured Link</span>
                    </div>
                    <p className="text-slate-600 text-[11px] leading-relaxed">
                      Click <strong>"Copy 1-Click Team Sync Link"</strong> above. When any recruiter opens this link on WhatsApp or their phone browser, their device instantly saves the connection and displays all live data.
                    </p>
                  </div>
                  <div className="bg-white p-3.5 rounded-xl border border-slate-200 space-y-1.5 shadow-2xs">
                    <div className="flex items-center gap-1.5 font-bold text-blue-700">
                      <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-[10px]">2</span>
                      <span>Option 2: Vercel Environment Variables</span>
                    </div>
                    <p className="text-slate-600 text-[11px] leading-relaxed">
                      In your <strong>Vercel Project Dashboard → Settings → Environment Variables</strong>, add:
                    </p>
                    <code className="block text-[10px] font-mono bg-slate-100 p-2 rounded text-slate-800 leading-tight">
                      VITE_GAS_WEBAPP_URL={config.gasWebAppUrl || 'https://script.google.com/...'}
                    </code>
                    <p className="text-[10px] text-slate-500">
                      Once added, redeploy on Vercel. Every visitor to your clean Vercel URL will immediately be connected to your database!
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Passcode Management */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Manager Passcode */}
            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
                  <Lock className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900">Manager Passcode</h3>
                  <p className="text-[11px] text-slate-500">Workspace security passcode</p>
                </div>
              </div>

              <form onSubmit={handleChangePasscode} className="space-y-3">
                <div className="space-y-1">
                  <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wide">
                    Current Passcode
                  </label>
                  <input
                    type="password"
                    required
                    placeholder="Current passcode"
                    value={oldPasscode}
                    onChange={(e) => setOldPasscode(e.target.value)}
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 text-slate-800"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wide">
                    New Passcode
                  </label>
                  <input
                    type="password"
                    required
                    placeholder="New passcode (min 4 chars)"
                    value={newPasscode}
                    onChange={(e) => setNewPasscode(e.target.value)}
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 text-slate-800"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-xs transition-colors cursor-pointer"
                >
                  Update Manager Passcode
                </button>
              </form>
            </div>

            {/* Documentation Desk Passcode */}
            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900">Documentation Password</h3>
                  <p className="text-[11px] text-slate-500">Documentation Desk search passcode</p>
                </div>
              </div>

              <form onSubmit={handleChangeDocPasscode} className="space-y-3">
                <div className="space-y-1">
                  <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wide">
                    Current Password
                  </label>
                  <input
                    type="password"
                    required
                    placeholder="Current doc password (Gowell123)"
                    value={oldDocPasscode}
                    onChange={(e) => setOldDocPasscode(e.target.value)}
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 text-slate-800"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wide">
                    New Password
                  </label>
                  <input
                    type="password"
                    required
                    placeholder="New password (min 4 chars)"
                    value={newDocPasscode}
                    onChange={(e) => setNewDocPasscode(e.target.value)}
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 text-slate-800"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full py-2.5 bg-indigo-900 hover:bg-indigo-800 text-white font-bold rounded-xl text-xs transition-colors cursor-pointer"
                >
                  Update Documentation Password
                </button>
              </form>
            </div>
          </div>

        </div>
      )}

      {/* ── PROJECT CREATE / EDIT MODAL ────────────────────────────────────────── */}
      {showProjectModal && createPortal(
        <div
          className="fixed inset-0 z-[99999] flex items-center justify-center p-3 sm:p-6 bg-slate-950/80 backdrop-blur-xs overflow-y-auto"
        >
          <div
            className="relative w-full max-w-2xl my-auto bg-white rounded-2xl sm:rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[85vh] sm:max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >

            <div className="flex items-center justify-between px-5 sm:px-6 py-4 bg-slate-900 text-white shrink-0">
              <h3 className="font-extrabold text-base sm:text-lg">
                {editingProject ? `Edit Schema: ${editingProject.name}` : 'Create New Recruitment Project'}
              </h3>
              <button onClick={() => setShowProjectModal(false)} className="p-1 text-slate-400 hover:text-white cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 sm:p-6 overflow-y-auto space-y-5 flex-1">

              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700 uppercase">Project / Campaign Title *</label>
                <input
                  type="text"
                  required
                  placeholder="E.G. STRUCTURAL ENGINEERS - BAHRAIN 2026"
                  value={projectNameInput}
                  onChange={(e) => setProjectNameInput(e.target.value.toUpperCase())}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-bold uppercase text-slate-900"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700 uppercase">Project Description</label>
                <textarea
                  rows={2}
                  placeholder="Brief summary of candidate criteria..."
                  value={projectDescInput}
                  onChange={(e) => setProjectDescInput(e.target.value)}
                  className="w-full px-4 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-700 uppercase">Project Status</label>
                  <select
                    value={projectStatus}
                    onChange={(e) => setProjectStatus(e.target.value as any)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold"
                  >
                    <option value="Open">Open</option>
                    <option value="Closed">Closed</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-700 uppercase">Submission Mode</label>
                  <select
                    value={projectSubmission}
                    onChange={(e) => setProjectSubmission(e.target.value as any)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold"
                  >
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                  </select>
                </div>
              </div>

              {/* ── JOB ROLES CONFIGURATION SECTION ──────────────── */}
              <div className="p-4 bg-blue-50/50 rounded-2xl border border-blue-200/80 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Briefcase className="w-4 h-4 text-blue-600" />
                    <h4 className="font-extrabold text-xs text-slate-900 uppercase">Project Job Roles / Designations</h4>
                  </div>
                  <span className="text-[11px] font-bold text-blue-700 bg-blue-100/80 px-2 py-0.5 rounded-full">
                    {projectJobRoles.length} Roles Added
                  </span>
                </div>
                <p className="text-[11px] text-slate-500">
                  Define the job roles candidates can apply for in this project. Recruiters will choose from these roles during intake.
                </p>

                {/* Add Role Input */}
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="ENTER ROLE NAME (E.G. ELECTRICIAN, NURSE, PIPE FITTER)..."
                    value={newJobRoleInput}
                    onChange={(e) => setNewJobRoleInput(e.target.value.toUpperCase())}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddJobRole();
                      }
                    }}
                    className="flex-1 px-3.5 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold uppercase text-slate-900 focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    type="button"
                    onClick={handleAddJobRole}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer"
                  >
                    + Add Role
                  </button>
                </div>

                {/* Quick Role Suggestions */}
                <div className="pt-1">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                    Quick Add Presets:
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {['Nurse', 'Electrician', 'Plumber', 'Pipe Fitter', 'Welder', 'Mason', 'Carpenter', 'Heavy Driver', 'Light Driver', 'AC Technician', 'Helper', 'Cook/Chef', 'Security Guard', 'Accountant', 'Teacher', 'Forklift Operator'].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => handleAddPresetRole(preset)}
                        className="px-2 py-0.5 bg-white hover:bg-blue-100 text-slate-700 hover:text-blue-800 border border-slate-200 rounded text-[10px] font-medium transition-colors cursor-pointer"
                      >
                        + {preset}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Active Configured Roles Chips */}
                <div className="pt-2 border-t border-blue-200/50">
                  <span className="text-[11px] font-bold text-slate-700 block mb-1.5">
                    Current Roles for this Project ({projectJobRoles.length}):
                  </span>
                  {projectJobRoles.length === 0 ? (
                    <p className="text-xs text-slate-400 italic">No specific roles added. (Recruiters can type any custom role)</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {projectJobRoles.map((role) => (
                        <span
                          key={role}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white border border-blue-300 rounded-lg text-xs font-bold text-blue-900 shadow-2xs"
                        >
                          <span>{role}</span>
                          <button
                            type="button"
                            onClick={() => handleRemoveJobRole(role)}
                            className="text-slate-400 hover:text-rose-600 transition-colors cursor-pointer"
                            title={`Remove ${role}`}
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* ── AUTOMATIC MANDATORY QUESTIONS NOTICE ─────────────────── */}
              <div className="p-4 bg-amber-50/70 border border-amber-200 rounded-2xl space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-amber-700" />
                    <h4 className="font-extrabold text-xs text-amber-950 uppercase tracking-wide">
                      Automatic Mandatory Questions (Enforced in all projects)
                    </h4>
                  </div>
                  <span className="text-[10px] font-bold bg-amber-200/80 text-amber-900 px-2 py-0.5 rounded-full">
                    Built-in
                  </span>
                </div>
                <p className="text-[11px] text-amber-900 leading-relaxed">
                  The following core questions are mandatory and automatically required across all projects for candidate verification:
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1">
                  <div className="px-2.5 py-1.5 bg-white/80 border border-amber-300/80 rounded-lg text-[11px] font-bold text-slate-800 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                    <span>Passport No. *</span>
                  </div>
                  <div className="px-2.5 py-1.5 bg-white/80 border border-amber-300/80 rounded-lg text-[11px] font-bold text-slate-800 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                    <span>Mobile No. *</span>
                  </div>
                  <div className="px-2.5 py-1.5 bg-white/80 border border-amber-300/80 rounded-lg text-[11px] font-bold text-slate-800 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                    <span>Alt: Mobile No. *</span>
                  </div>
                  <div className="px-2.5 py-1.5 bg-white/80 border border-amber-300/80 rounded-lg text-[11px] font-bold text-slate-800 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                    <span>Email ID *</span>
                  </div>
                  <div className="px-2.5 py-1.5 bg-white/80 border border-amber-300/80 rounded-lg text-[11px] font-bold text-slate-800 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                    <span>Candidate Name *</span>
                  </div>
                  <div className="px-2.5 py-1.5 bg-white/80 border border-amber-300/80 rounded-lg text-[11px] font-bold text-slate-800 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                    <span>Job Role *</span>
                  </div>
                </div>
              </div>

              {/* Data Sheet and Storage Folder URLs */}
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
                <div className="flex items-center gap-2">
                  <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                  <h4 className="font-extrabold text-xs text-slate-900 uppercase">Cloud Data Destinations</h4>
                </div>

                <div className="space-y-1">
                  <label className="block text-[11px] font-bold text-slate-700">
                    Project Google Spreadsheet URL (Column B in Master Sheet)
                  </label>
                  <input
                    type="url"
                    placeholder="https://docs.google.com/spreadsheets/d/..."
                    value={projectSheetUrlInput}
                    onChange={(e) => setProjectSheetUrlInput(e.target.value)}
                    className="w-full px-3.5 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-900 focus:ring-2 focus:ring-emerald-500 font-mono"
                  />
                  <p className="text-[10px] text-slate-400">All submissions for this project are recorded in this specific spreadsheet.</p>
                </div>

                <div className="space-y-1">
                  <label className="block text-[11px] font-bold text-slate-700">
                    Project Google Drive Folder URL (Column C in Master Sheet)
                  </label>
                  <input
                    type="url"
                    placeholder="https://drive.google.com/drive/folders/..."
                    value={projectFolderUrlInput}
                    onChange={(e) => setProjectFolderUrlInput(e.target.value)}
                    className="w-full px-3.5 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-900 focus:ring-2 focus:ring-blue-500 font-mono"
                  />
                  <p className="text-[10px] text-slate-400">Candidate CVs and passport scans are saved into this Drive folder.</p>
                </div>
              </div>

              {/* Dynamic Questions Builder */}
              <div className="space-y-3 pt-3 border-t border-slate-100">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-extrabold text-sm text-slate-900">Additional Project Questions (Optional)</h4>
                    <p className="text-[11px] text-slate-500">Custom questions added on top of the mandatory questions</p>
                  </div>

                  <button
                    type="button"
                    onClick={handleAddField}
                    className="px-3 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 font-bold rounded-lg text-xs flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add Question
                  </button>
                </div>

                <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
                  {projectFields.map((field, idx) => {
                    const isDropdown = field.type === 'select' || field.type === 'dropdown';

                    return (
                      <div key={field.id} className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2.5 shadow-2xs">
                        {/* Question Top Row */}
                        <div className="flex items-center gap-2.5">
                          <input
                            type="text"
                            placeholder="Question Label (e.g. Total Exp, Data Flow, DOB)"
                            value={field.label}
                            onChange={(e) => handleUpdateField(idx, { label: e.target.value })}
                            className="flex-1 px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-900 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                          />

                          <select
                            value={field.type === 'dropdown' ? 'select' : field.type}
                            onChange={(e) => {
                              const nextType = e.target.value as FieldType;
                              const updates: Partial<ProjectField> = { type: nextType };
                              if (nextType === 'select' && (!field.options || field.options.length === 0)) {
                                updates.options = ['Yes', 'No'];
                              }
                              handleUpdateField(idx, updates);
                            }}
                            className="px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-medium text-slate-800 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                          >
                            <option value="text">Text Input</option>
                            <option value="number">Number</option>
                            <option value="date">Date Picker</option>
                            <option value="select">Dropdown (Options)</option>
                          </select>

                          <label className="flex items-center gap-1 text-[11px] text-slate-600 font-medium cursor-pointer shrink-0">
                            <input
                              type="checkbox"
                              checked={field.required || false}
                              onChange={(e) => handleUpdateField(idx, { required: e.target.checked })}
                              className="rounded text-blue-600"
                            />
                            Req.
                          </label>

                          <button
                            type="button"
                            onClick={() => handleRemoveField(idx)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer transition-colors"
                            title="Delete question"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {/* Dropdown Options Builder (Rendered only when type is select / dropdown) */}
                        {isDropdown && (
                          <div className="bg-white p-3 rounded-lg border border-indigo-100 space-y-2.5">
                            <div className="flex items-center justify-between flex-wrap gap-1">
                              <span className="text-[11px] font-bold text-indigo-700 uppercase tracking-wider flex items-center gap-1">
                                <ListFilter className="w-3 h-3 text-indigo-600" /> Dropdown Options ({field.options?.length || 0})
                              </span>

                              {/* Quick Presets */}
                              <div className="flex items-center gap-1 flex-wrap">
                                <span className="text-[10px] text-slate-400 font-semibold">Presets:</span>
                                <button
                                  type="button"
                                  onClick={() => handleApplyPresetOptions(idx, ['Yes', 'No'])}
                                  className="px-1.5 py-0.5 text-[10px] bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 text-slate-600 rounded font-semibold cursor-pointer transition-colors"
                                >
                                  Yes/No
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleApplyPresetOptions(idx, ['Male', 'Female', 'Other'])}
                                  className="px-1.5 py-0.5 text-[10px] bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 text-slate-600 rounded font-semibold cursor-pointer transition-colors"
                                >
                                  Gender
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleApplyPresetOptions(idx, ['Fresher', '1-2 Years', '3-5 Years', '5+ Years'])}
                                  className="px-1.5 py-0.5 text-[10px] bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 text-slate-600 rounded font-semibold cursor-pointer transition-colors"
                                >
                                  Exp Levels
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleApplyPresetOptions(idx, ['GNM', 'B.Sc Nursing', 'Post B.Sc', 'M.Sc'])}
                                  className="px-1.5 py-0.5 text-[10px] bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 text-slate-600 rounded font-semibold cursor-pointer transition-colors"
                                >
                                  Nursing
                                </button>
                              </div>
                            </div>

                            {/* Option Chips */}
                            <div className="flex flex-wrap gap-1.5 min-h-[26px] items-center">
                              {field.options && field.options.length > 0 ? (
                                field.options.map((opt, optIdx) => (
                                  <span
                                    key={optIdx}
                                    className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-indigo-50 text-indigo-800 text-xs font-semibold rounded-md border border-indigo-200"
                                  >
                                    <span>{opt}</span>
                                    <button
                                      type="button"
                                      onClick={() => handleRemoveOption(idx, optIdx)}
                                      className="text-indigo-400 hover:text-rose-600 cursor-pointer ml-0.5"
                                      title={`Remove "${opt}"`}
                                    >
                                      <X className="w-3 h-3" />
                                    </button>
                                  </span>
                                ))
                              ) : (
                                <span className="text-[11px] text-amber-600 italic bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                                  ⚠️ No options configured. Add options below.
                                </span>
                              )}
                            </div>

                            {/* Add Option Input Row */}
                            <div className="flex items-center gap-2">
                              <input
                                type="text"
                                placeholder="Type option name (or comma-separated e.g. Option 1, Option 2)..."
                                value={fieldOptionInputs[idx] || ''}
                                onChange={(e) => setFieldOptionInputs({ ...fieldOptionInputs, [idx]: e.target.value })}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    handleAddOption(idx);
                                  }
                                }}
                                className="flex-1 px-3 py-1 bg-slate-50 border border-slate-300 rounded-lg text-xs font-medium text-slate-900 focus:bg-white focus:ring-1 focus:ring-indigo-500"
                              />
                              <button
                                type="button"
                                onClick={() => handleAddOption(idx)}
                                className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg text-xs flex items-center gap-1 cursor-pointer transition-colors shrink-0"
                              >
                                <Plus className="w-3 h-3" /> Add Option
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

            </div>

            {/* Error Banner */}
            {projectModalError && (
              <div className="mx-5 sm:mx-6 mb-3 p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs font-semibold text-rose-700 flex items-center gap-2 animate-fadeIn">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{projectModalError}</span>
              </div>
            )}

            <div className="flex items-center justify-between gap-3 px-5 sm:px-6 py-4 bg-slate-50 border-t border-slate-200 shrink-0">
              <div>
                {editingProject && (
                  <button
                    type="button"
                    disabled={isSavingProject}
                    onClick={() => {
                      setShowProjectModal(false);
                      handleDeleteProject(editingProject.name);
                    }}
                    className="px-4 py-2 text-rose-600 hover:text-rose-700 hover:bg-rose-50 disabled:opacity-50 border border-rose-200 font-bold text-xs rounded-xl flex items-center gap-1.5 cursor-pointer transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete Project</span>
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={isSavingProject}
                  onClick={() => setShowProjectModal(false)}
                  className="px-4 py-2 text-slate-600 font-semibold text-xs rounded-xl hover:bg-slate-200 disabled:opacity-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  id="save-project-btn"
                  disabled={isSavingProject}
                  onClick={handleSaveProject}
                  className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-extrabold text-xs rounded-xl shadow-xs cursor-pointer flex items-center gap-2 transition-all"
                >
                  {isSavingProject ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Saving Project Schema...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      <span>Save Project Schema</span>
                    </>
                  )}
                </button>
              </div>
            </div>

          </div>
        </div>,
        document.body
      )}

      {/* ── PROJECT FORM LIVE PREVIEW MODAL ────────────────────────────────────── */}
      {previewProject && createPortal(
        <div
          className="fixed inset-0 z-[99999] flex items-center justify-center p-3 sm:p-6 bg-slate-950/80 backdrop-blur-xs overflow-y-auto"
          onClick={(e) => {
            if (e.target === e.currentTarget) setPreviewProject(null);
          }}
        >
          <div
            className="relative w-full max-w-2xl my-auto bg-white rounded-2xl sm:rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[85vh] sm:max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >

            {/* Modal Header */}
            <div className="flex items-center justify-between px-5 sm:px-6 py-4 bg-slate-900 text-white shrink-0">
              <div className="flex items-center space-x-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-blue-500/20 border border-blue-400/30 flex items-center justify-center text-blue-400 shrink-0">
                  <Eye className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-extrabold text-base sm:text-lg leading-tight text-white truncate">
                    Preview: {previewProject.name}
                  </h3>
                  <p className="text-xs text-slate-300">
                    Live recruitment form preview for recruiters & applicants
                  </p>
                </div>
              </div>

              <button
                onClick={() => setPreviewProject(null)}
                className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 sm:p-6 overflow-y-auto space-y-6 flex-1 bg-slate-50/50">

              {/* Project Overview Banner */}
              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-2">
                <div className="flex items-center justify-between">
                  <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold ${previewProject.status === 'Open' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'
                    }`}>
                    {previewProject.status} • {previewProject.submission}
                  </span>
                  <span className="text-xs font-semibold text-slate-500">
                    {previewProject.fields?.length || 0} Dynamic Field(s)
                  </span>
                </div>
                {previewProject.description && (
                  <p className="text-xs text-slate-600 leading-relaxed pt-1">
                    {previewProject.description}
                  </p>
                )}
              </div>

              {/* Form Fields Simulation */}
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
                <h4 className="font-extrabold text-xs text-slate-900 uppercase tracking-wider flex items-center gap-1.5 border-b border-slate-100 pb-2">
                  <FileText className="w-4 h-4 text-blue-600" /> Intake Questionnaire Preview
                </h4>

                {/* Standard Core Fields */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div className="space-y-1">
                    <label className="block text-xs font-bold text-slate-700">
                      Candidate Full Name <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      disabled
                      placeholder="e.g. Rahul Sharma"
                      className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-500 cursor-not-allowed"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="block text-xs font-bold text-slate-700">
                      Passport Number <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      disabled
                      placeholder="e.g. N1234567"
                      className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-500 cursor-not-allowed uppercase"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-bold text-slate-700">
                    Mobile Contact Number
                  </label>
                  <input
                    type="text"
                    disabled
                    placeholder="+91 98765 43210"
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-500 cursor-not-allowed"
                  />
                </div>

                {/* Dynamic Questions */}
                {previewProject.fields && previewProject.fields.length > 0 && (
                  <div className="space-y-3 pt-2 border-t border-slate-100">
                    <span className="text-[11px] font-bold text-indigo-700 uppercase tracking-wider block">
                      Custom Project Fields
                    </span>
                    {previewProject.fields.map((f) => {
                      const isDropdown = f.type === 'select' || f.type === 'dropdown';
                      const isDate = f.type === 'date' || /(dob|date_of_birth|birth_date)/i.test(f.id);
                      let optionsList: string[] = [];
                      if (Array.isArray(f.options)) {
                        optionsList = f.options.map(o => String(o).trim()).filter(Boolean);
                      } else if (typeof f.options === 'string') {
                        optionsList = String(f.options).split(',').map(o => o.trim()).filter(Boolean);
                      }

                      return (
                        <div key={f.id} className="space-y-1">
                          <label className="block text-xs font-bold text-slate-700">
                            {f.label} {f.required && <span className="text-rose-500">*</span>}
                          </label>
                          {isDropdown ? (
                            <select disabled className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700 cursor-not-allowed">
                              <option value="">Select an option...</option>
                              {optionsList.length > 0 ? (
                                optionsList.map((opt, oIdx) => (
                                  <option key={oIdx} value={opt}>{opt}</option>
                                ))
                              ) : (
                                <option disabled>No options configured</option>
                              )}
                            </select>
                          ) : isDate ? (
                            <div className="relative flex items-center">
                              <input
                                type="date"
                                disabled
                                className="w-full px-3.5 py-2 pr-10 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-500 cursor-not-allowed"
                              />
                              <Calendar className="w-3.5 h-3.5 text-slate-400 absolute right-3 pointer-events-none" />
                            </div>
                          ) : (
                            <input
                              type={f.type === 'number' ? 'number' : 'text'}
                              disabled
                              placeholder={`Enter ${f.label.toLowerCase()}...`}
                              className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-500 cursor-not-allowed"
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Resume Upload Box Preview */}
                <div className="p-4 border-2 border-dashed border-slate-200 rounded-xl bg-slate-50/70 text-center space-y-1">
                  <UploadCloud className="w-6 h-6 text-slate-400 mx-auto" />
                  <p className="text-xs font-bold text-slate-600">Candidate CV / Resume Attachment</p>
                  <p className="text-[11px] text-slate-400">PDF, DOC, DOCX up to 25MB</p>
                </div>

              </div>

            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-between px-5 sm:px-6 py-4 bg-slate-50 border-t border-slate-200 shrink-0">
              <span className="text-xs text-slate-500">
                Form validation & duplicate passport detection are active.
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    const p = previewProject;
                    setPreviewProject(null);
                    handleOpenEditProject(p);
                  }}
                  className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 font-bold text-xs rounded-xl transition-colors cursor-pointer"
                >
                  Edit Schema
                </button>
                <button
                  onClick={() => setPreviewProject(null)}
                  className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl transition-colors cursor-pointer"
                >
                  Close Preview
                </button>
              </div>
            </div>

          </div>
        </div>,
        document.body
      )}

      {/* ── CODE.GS EXPORT MODAL ────────────────────────────────────────────────── */}
      {showCodeExport && (() => {
        const fullScript = getFullCodeGsScript(config.passcode || 'Gowell921', config.teamEmails || ['gokul@gmail.com', 'kumar@gmail.com']);
        const lineCount = fullScript.split('\n').length;

        const handleDownload = () => {
          const blob = new Blob([fullScript], { type: 'text/javascript;charset=utf-8' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = 'Code.gs';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        };

        return createPortal(
          <div
            className="fixed inset-0 z-[99999] flex items-center justify-center p-3 sm:p-6 bg-slate-950/80 backdrop-blur-xs overflow-y-auto"
            onClick={(e) => {
              if (e.target === e.currentTarget) setShowCodeExport(false);
            }}
          >
            <div
              className="relative w-full max-w-4xl my-auto bg-white rounded-2xl sm:rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[85vh] sm:max-h-[90vh]"
              onClick={(e) => e.stopPropagation()}
            >

              <div className="flex items-center justify-between px-5 sm:px-6 py-4 bg-slate-900 text-white shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shrink-0">
                    <Code className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-sm sm:text-base">Complete Google Apps Script Backend (Code.gs)</h3>
                    <p className="text-[11px] text-slate-400 font-mono">
                      {lineCount} lines • Dynamic multi-sheet routing & Google Drive PDF archiving
                    </p>
                  </div>
                </div>
                <button onClick={() => setShowCodeExport(false)} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-5 sm:p-6 overflow-y-auto space-y-4 flex-1">
                <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 text-xs text-blue-900 leading-relaxed flex items-start gap-3">
                  <AlertCircle className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                  <div>
                    <strong className="font-bold">How to update your Google Apps Script:</strong>
                    <ol className="list-decimal ml-4 mt-1 space-y-0.5 text-blue-800">
                      <li>Open your Master Google Spreadsheet and click <strong>Extensions → Apps Script</strong>.</li>
                      <li>Replace the contents of <code>Code.gs</code> with this complete script.</li>
                      <li>Click <strong>Deploy → New deployment → Web app</strong> (Execute as: <em>Me</em>, Access: <em>Anyone</em>).</li>
                      <li>Copy the new Web App URL and paste it in Manager Settings.</li>
                    </ol>
                  </div>
                </div>

                <div className="relative rounded-2xl overflow-hidden border border-slate-800 shadow-inner">
                  <div className="bg-slate-900 px-4 py-2 flex items-center justify-between text-[11px] text-slate-400 font-mono border-b border-slate-800">
                    <span>Code.gs (Apps Script Engine)</span>
                    <span>Passcode: <strong className="text-amber-400">{config.passcode || 'Gowell921'}</strong></span>
                  </div>
                  <pre className="p-4 bg-slate-950 text-emerald-400 rounded-b-2xl text-xs font-mono overflow-x-auto max-h-[400px] leading-relaxed select-all">
                    {fullScript}
                  </pre>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 px-5 sm:px-6 py-4 bg-slate-50 border-t border-slate-200 shrink-0">
                <span className="text-xs text-slate-500 font-medium">
                  Configured for {config.teamEmails?.length || 2} team editors & master passcode.
                </span>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleDownload}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 text-xs font-bold rounded-xl transition-all shadow-xs cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5 text-slate-600" />
                    <span>Download Code.gs</span>
                  </button>

                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(fullScript);
                      alert('Complete Code.gs (' + lineCount + ' lines) copied to clipboard!');
                    }}
                    className="inline-flex items-center gap-1.5 px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-xs transition-all cursor-pointer"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy Full Script ({lineCount} lines)</span>
                  </button>
                </div>
              </div>

            </div>
          </div>,
          document.body
        );
      })()}

      {/* Document Quick Preview Modal */}
      {previewDoc && (
        <ErrorBoundary fallbackTitle="Unable to preview candidate dossier" onReset={() => setPreviewDoc(null)}>
          <DocPreviewModal
            submission={previewDoc}
            onClose={() => setPreviewDoc(null)}
            onDelete={handleDeleteSubmission}
          />
        </ErrorBoundary>
      )}

      {/* Candidate Submission Deletion Confirmation Popup */}
      <DeleteConfirmModal
        isOpen={!!candidateToDelete}
        submission={candidateToDelete}
        title="Delete Candidate Submission"
        description="Are you sure you want to permanently delete this candidate submission record?"
        confirmButtonText="Delete Candidate"
        onClose={() => setCandidateToDelete(null)}
        onConfirm={confirmDeleteCandidate}
      />

      {/* Project Deletion Confirmation Popup */}
      <DeleteConfirmModal
        isOpen={!!projectToDelete}
        title="Delete Recruitment Project"
        description={`Are you sure you want to delete recruitment campaign "${projectToDelete}"? It will be removed from active projects.`}
        confirmButtonText="Delete Project"
        onClose={() => setProjectToDelete(null)}
        onConfirm={confirmDeleteProject}
      />

      {/* Clear Demo Candidates Confirmation Popup */}
      <DeleteConfirmModal
        isOpen={showClearDemoConfirm}
        title="Clear Sample / Demo Candidates"
        description="Are you sure you want to clear all sample demo candidates? Your dashboard will only display real live submissions."
        confirmButtonText="Clear Demo Data"
        onClose={() => setShowClearDemoConfirm(false)}
        onConfirm={confirmClearDemoData}
      />

      {/* Connect External Google Sheet Importer Modal */}
      {showConnectSheetModal && (
        <ConnectSheetModal
          isOpen={showConnectSheetModal}
          onClose={() => {
            setShowConnectSheetModal(false);
            setConnectSheetInitialProject(undefined);
          }}
          projects={projects}
          recruiters={recruiters}
          initialProjectName={connectSheetInitialProject}
          onSuccess={handleConnectSheetSuccess}
        />
      )}

      {/* Sheet Import Success Toast */}
      {sheetSuccessBanner && (
        <div className="fixed bottom-6 right-6 z-50 bg-emerald-900 text-white px-5 py-3.5 rounded-2xl shadow-xl border border-emerald-700/80 flex items-center gap-3 animate-fadeIn">
          <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-300 flex items-center justify-center shrink-0">
            <Check className="w-4 h-4" />
          </div>
          <div>
            <p className="text-xs font-bold text-white">Google Sheet Synced Successfully!</p>
            <p className="text-[11px] text-emerald-200">
              {sheetSuccessBanner.importedCount} new, {sheetSuccessBanner.updatedCount} updated in "{sheetSuccessBanner.projectName}"
            </p>
          </div>
          <button
            onClick={() => setSheetSuccessBanner(null)}
            className="ml-2 text-emerald-300 hover:text-white p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

    </div>
  );
};
