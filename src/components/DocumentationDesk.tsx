import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  Search,
  FileText,
  User,
  CreditCard,
  Briefcase,
  Phone,
  Calendar,
  ExternalLink,
  Copy,
  Check,
  Printer,
  RefreshCw,
  Eye,
  EyeOff,
  SlidersHorizontal,
  LayoutGrid,
  List,
  CheckCircle2,
  X,
  FileCheck,
  Building2,
  Layers,
  Sparkles,
  Download,
  AlertCircle,
  Lock,
  Unlock,
  KeyRound,
  ShieldCheck,
  LogOut,
  Activity,
  FileSpreadsheet,
  HardDrive
} from 'lucide-react';
import { Project, CandidateSubmission } from '../types';
import { apiService } from '../services/apiService';
import { DocPreviewModal } from './DocPreviewModal';
import { formatDisplayDate, formatDisplayDateTime } from '../utils/dateUtils';

interface DocumentationDeskProps {
  projects: Project[];
  recruiters: string[];
  onRefreshData: () => void;
}

export const DocumentationDesk: React.FC<DocumentationDeskProps> = ({
  projects,
  recruiters,
  onRefreshData
}) => {
  // Authentication State
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    try {
      return localStorage.getItem('doc_hub_doc_auth') === 'true' || sessionStorage.getItem('doc_hub_doc_auth') === 'true';
    } catch {
      return false;
    }
  });
  const [inputPasscode, setInputPasscode] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string>('');

  const [submissions, setSubmissions] = useState<CandidateSubmission[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  
  // Global Search State
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedProjectFilter, setSelectedProjectFilter] = useState<string>('All Projects');
  const [selectedJobRoleFilter, setSelectedJobRoleFilter] = useState<string>('All Roles');
  const [selectedRecruiterFilter, setSelectedRecruiterFilter] = useState<string>('All Recruiters');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<string>('All Statuses');
  const [dateRangeFilter, setDateRangeFilter] = useState<'all' | 'today' | 'week'>('all');

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
  
  // View mode & modals
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');
  const [inspectingCandidate, setInspectingCandidate] = useState<CandidateSubmission | null>(null);
  const [previewDocCandidate, setPreviewDocCandidate] = useState<CandidateSubmission | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copiedPassport, setCopiedPassport] = useState<string | null>(null);

  const extractDriveId = (text?: string): string => {
    if (!text || typeof text !== 'string') return '';
    const m1 = text.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
    if (m1 && m1[1]) return m1[1];
    const m2 = text.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (m2 && m2[1]) return m2[1];
    const m3 = text.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (m3 && m3[1]) return m3[1];
    return '';
  };

  const handleOpenDirectDoc = (candidate: CandidateSubmission) => {
    const raw = (candidate.fileUrl || candidate.directFileUrl || '').trim();
    const driveId = extractDriveId(raw);
    if (driveId) {
      window.open(`https://drive.google.com/file/d/${driveId}/view?usp=sharing`, '_blank');
      return;
    }
    if (raw && (raw.startsWith('http://') || raw.startsWith('https://')) && !raw.includes('/folders/') && !raw.includes('storage.googleapis.com')) {
      window.open(raw, '_blank');
      return;
    }
    const cleanPass = (candidate.passportNumber || '').trim();
    const cleanName = (candidate.candidateName || '').trim();
    const searchUrl = `https://drive.google.com/drive/search?q=${encodeURIComponent(cleanPass ? `"${cleanPass}"` : `"${cleanName}"`)}`;
    window.open(searchUrl, '_blank');
  };

  const searchInputRef = useRef<HTMLInputElement>(null);

  // Keyboard shortcut (Ctrl+K or / to focus search)
  useEffect(() => {
    if (!isAuthenticated) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      } else if (e.key === '/' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isAuthenticated]);

  // Fetch Submissions (Always Live by default with real-time auto-fetch subscription)
  useEffect(() => {
    if (isAuthenticated) {
      loadSubmissions(false);
      const unsub = apiService.subscribe(() => {
        loadSubmissions(false);
      });
      return () => unsub();
    }
  }, [isAuthenticated]);

  const loadSubmissions = async (forceRemote: boolean = true) => {
    setIsLoading(true);
    try {
      if (forceRemote) {
        await apiService.fetchAllProjectSheetsData().catch(console.warn);
      }
      const data = await apiService.getSubmissions(undefined, undefined, forceRemote);
      setSubmissions(data);
    } catch (err) {
      console.warn('Failed to load candidate submissions:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Auth Handlers
  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (apiService.verifyDocPasscode(inputPasscode)) {
      setIsAuthenticated(true);
      try {
        localStorage.setItem('doc_hub_doc_auth', 'true');
        sessionStorage.setItem('doc_hub_doc_auth', 'true');
      } catch {}
      setAuthError('');
      loadSubmissions();
    } else {
      setAuthError('Incorrect documentation password.');
    }
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    try {
      localStorage.removeItem('doc_hub_doc_auth');
      sessionStorage.removeItem('doc_hub_doc_auth');
    } catch {}
    setInputPasscode('');
    setAuthError('');
  };

  // Filter Submissions
  const filteredSubmissions = useMemo(() => {
    const deduplicated = apiService.deduplicateSubmissions(submissions);
    const query = searchQuery.trim().toLowerCase();
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    return deduplicated.filter((sub) => {
      const jobRole = sub.jobRole || apiService.getEffectiveJobRole(sub);
      const altMob = sub.altMobileNumber || apiService.getEffectiveAltMobile(sub);
      const email = sub.emailId || apiService.getEffectiveEmail(sub);

      // 1. Project Filter
      if (selectedProjectFilter !== 'All Projects' && !apiService.isProjectMatch(sub.project, selectedProjectFilter)) {
        return false;
      }

      // 2. Job Role Filter
      if (selectedJobRoleFilter !== 'All Roles' && jobRole.toLowerCase() !== selectedJobRoleFilter.toLowerCase()) {
        return false;
      }

      // 3. Recruiter Filter
      if (selectedRecruiterFilter !== 'All Recruiters' && sub.recruiter.toLowerCase() !== selectedRecruiterFilter.toLowerCase()) {
        return false;
      }

      // 4. Status Filter
      if (selectedStatusFilter !== 'All Statuses' && (sub.status || 'Verified') !== selectedStatusFilter) {
        return false;
      }

      // 5. Date Range
      if (dateRangeFilter === 'today') {
        if (!sub.timestamp || sub.timestamp.slice(0, 10) !== todayStr) return false;
      } else if (dateRangeFilter === 'week') {
        const subDate = new Date(sub.timestamp);
        if (subDate < oneWeekAgo) return false;
      }

      // 6. Global Search Bar (Candidate Name, Passport Number, Job Role, Mobile, Alt Mobile, Email, Recruiter, Dynamic Answers)
      if (query) {
        const nameMatch = sub.candidateName?.toLowerCase().includes(query);
        const passMatch = sub.passportNumber?.toLowerCase().includes(query);
        const roleMatch = jobRole.toLowerCase().includes(query);
        const projMatch = sub.project?.toLowerCase().includes(query);
        const phoneMatch = sub.mobileNumber?.toLowerCase().includes(query);
        const altPhoneMatch = altMob.toLowerCase().includes(query);
        const emailMatch = email.toLowerCase().includes(query);
        const recMatch = sub.recruiter?.toLowerCase().includes(query);
        const remarksMatch = sub.remarks?.toLowerCase().includes(query);

        // Check inside dynamic form answers
        let dynamicMatch = false;
        if (sub.dynamicAnswers && typeof sub.dynamicAnswers === 'object') {
          dynamicMatch = Object.values(sub.dynamicAnswers).some(val => 
            String(val).toLowerCase().includes(query)
          );
        }

        return nameMatch || passMatch || roleMatch || projMatch || phoneMatch || altPhoneMatch || emailMatch || recMatch || remarksMatch || dynamicMatch;
      }

      return true;
    });
  }, [submissions, searchQuery, selectedProjectFilter, selectedJobRoleFilter, selectedRecruiterFilter, selectedStatusFilter, dateRangeFilter]);

  const copyToClipboard = (text: string, id: string, type: 'full' | 'passport') => {
    navigator.clipboard.writeText(text);
    if (type === 'passport') {
      setCopiedPassport(id);
      setTimeout(() => setCopiedPassport(null), 2000);
    } else {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    }
  };

  const handlePrintDossier = (sub: CandidateSubmission) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const dynamicFieldsHtml = sub.dynamicAnswers 
      ? Object.entries(sub.dynamicAnswers).map(([k, v]) => `
          <tr>
            <td style="padding: 8px 12px; border: 1px solid #e2e8f0; font-weight: bold; background: #f8fafc; text-transform: capitalize;">${k.replace(/_/g, ' ')}</td>
            <td style="padding: 8px 12px; border: 1px solid #e2e8f0;">${formatDisplayDate(v, k)}</td>
          </tr>
        `).join('')
      : '';

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Candidate Dossier - ${sub.candidateName} (${sub.passportNumber})</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; padding: 40px; color: #0f172a; max-width: 800px; margin: 0 auto; }
            h1 { font-size: 22px; margin-bottom: 4px; color: #1e293b; }
            .header-bar { border-bottom: 2px solid #2563eb; padding-bottom: 12px; margin-bottom: 24px; display: flex; justify-content: space-between; align-items: flex-end; }
            .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; margin-bottom: 24px; }
            .box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 16px; }
            .label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #64748b; font-weight: bold; }
            .value { font-size: 14px; font-weight: bold; color: #0f172a; margin-top: 4px; }
            table { width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 13px; }
            .footer { margin-top: 40px; border-top: 1px solid #e2e8f0; padding-top: 12px; font-size: 11px; color: #94a3b8; text-align: center; }
          </style>
        </head>
        <body>
          <div class="header-bar">
            <div>
              <h1>Candidate Verification Dossier</h1>
              <div style="font-size: 13px; color: #64748b;">Dynamic Document Hub — Documentation Verification Record</div>
            </div>
            <div style="font-size: 12px; font-weight: bold; color: #2563eb; background: #eff6ff; padding: 6px 12px; border-radius: 6px;">
              STATUS: ${sub.status || 'VERIFIED'}
            </div>
          </div>

          <div class="grid">
            <div class="box">
              <div class="label">Candidate Name</div>
              <div class="value">${sub.candidateName}</div>
            </div>
            <div class="box">
              <div class="label">Passport Number</div>
              <div class="value" style="font-family: monospace;">${sub.passportNumber}</div>
            </div>
            <div class="box">
              <div class="label">Job Role / Trade</div>
              <div class="value" style="color: #2563eb;">${sub.jobRole || apiService.getEffectiveJobRole(sub) || 'General'}</div>
            </div>
            <div class="box">
              <div class="label">Target Project</div>
              <div class="value">${sub.project}</div>
            </div>
            <div class="box">
              <div class="label">Primary Mobile No.</div>
              <div class="value">${sub.mobileNumber || 'Not specified'}</div>
            </div>
            <div class="box">
              <div class="label">Alternative Mobile No.</div>
              <div class="value">${sub.altMobileNumber || apiService.getEffectiveAltMobile(sub) || 'Not specified'}</div>
            </div>
            <div class="box">
              <div class="label">Email ID</div>
              <div class="value">${sub.emailId || apiService.getEffectiveEmail(sub) || 'Not specified'}</div>
            </div>
            <div class="box">
              <div class="label">Submitted By Recruiter</div>
              <div class="value">${sub.recruiter}</div>
            </div>
            <div class="box">
              <div class="label">Submission Date & Time</div>
              <div class="value">${formatDisplayDateTime(sub.timestamp)}</div>
            </div>
          </div>

          ${sub.remarks ? `
            <div style="background: #fffbeb; border: 1px solid #fef3c7; border-radius: 8px; padding: 12px 16px; margin-bottom: 24px;">
              <div class="label" style="color: #92400e;">Recruiter Remarks</div>
              <div style="font-size: 13px; color: #78350f; margin-top: 4px; line-height: 1.5;">${sub.remarks}</div>
            </div>
          ` : ''}

          ${dynamicFieldsHtml ? `
            <h3 style="font-size: 14px; text-transform: uppercase; color: #334155; margin-top: 24px; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px;">
              Project Application Questionnaire Responses
            </h3>
            <table>
              <thead>
                <tr style="background: #f1f5f9; text-align: left;">
                  <th style="padding: 8px 12px; border: 1px solid #e2e8f0; width: 40%;">Field / Question</th>
                  <th style="padding: 8px 12px; border: 1px solid #e2e8f0;">Provided Answer</th>
                </tr>
              </thead>
              <tbody>
                ${dynamicFieldsHtml}
              </tbody>
            </table>
          ` : ''}

          <div class="footer">
            Printed from Documentation Desk • Verified Record ID: ${sub.id || sub.passportNumber} • ${formatDisplayDateTime(new Date())}
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
    }, 250);
  };

  const formatSummaryForShare = (sub: CandidateSubmission) => {
    const jobRole = sub.jobRole || apiService.getEffectiveJobRole(sub);
    const altMob = sub.altMobileNumber || apiService.getEffectiveAltMobile(sub);
    const email = sub.emailId || apiService.getEffectiveEmail(sub);

    let text = `📋 CANDIDATE VERIFICATION DOSSIER\n`;
    text += `━━━━━━━━━━━━━━━━━━━━━\n`;
    text += `👤 Name: ${sub.candidateName}\n`;
    text += `🛂 Passport: ${sub.passportNumber}\n`;
    if (jobRole) text += `💼 Job Role: ${jobRole}\n`;
    text += `🏢 Project: ${sub.project}\n`;
    text += `📱 Mobile: ${sub.mobileNumber || 'N/A'}\n`;
    if (altMob) text += `📞 Alt Mobile: ${altMob}\n`;
    if (email) text += `✉️ Email ID: ${email}\n`;
    text += `🧑‍💼 Recruiter: ${sub.recruiter}\n`;
    text += `📅 Submitted: ${formatDisplayDateTime(sub.timestamp)}\n`;
    text += `✅ Status: ${sub.status || 'Verified'}\n`;
    
    if (sub.remarks) {
      text += `💬 Remarks: ${sub.remarks}\n`;
    }

    if (sub.dynamicAnswers && Object.keys(sub.dynamicAnswers).length > 0) {
      text += `\n📝 Application Details:\n`;
      Object.entries(sub.dynamicAnswers).forEach(([k, v]) => {
        text += `• ${k.replace(/_/g, ' ')}: ${formatDisplayDate(v, k)}\n`;
      });
    }

    if (sub.fileUrl) {
      text += `\n📄 Document Link: ${sub.fileUrl}\n`;
    }

    return text;
  };

  // ── LOCKED LOGIN SCREEN ──────────────────────────────────────────────────
  if (!isAuthenticated) {
    return (
      <div className="max-w-md mx-auto my-16 p-8 bg-white rounded-3xl border border-slate-200 shadow-xl text-center animate-fadeIn">
        <div className="w-16 h-16 rounded-2xl bg-indigo-50 border border-indigo-200 text-indigo-600 flex items-center justify-center mx-auto mb-5 shadow-sm">
          <ShieldCheck className="w-8 h-8" />
        </div>

        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 border border-blue-200 text-blue-700 text-xs font-bold mb-3">
          <FileCheck className="w-3.5 h-3.5" />
          <span>Documentation Desk</span>
        </div>

        <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight mb-2">
          Documentation Desk Locked
        </h2>
        <p className="text-xs text-slate-500 mb-6 leading-relaxed">
          Please enter the security password to unlock candidate verification, global passport lookup, and document inspector.
        </p>

        <form onSubmit={handleLogin} className="space-y-4">
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              id="doc-passcode-input"
              autoFocus
              placeholder="Enter password..."
              value={inputPasscode}
              onChange={(e) => setInputPasscode(e.target.value)}
              className="w-full pl-4 pr-11 py-3 bg-slate-50 border border-slate-300 rounded-xl text-center text-lg font-mono font-bold tracking-widest focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all text-slate-900"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
              title={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>

          {authError && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 font-medium animate-fadeIn">
              {authError}
            </div>
          )}

          <button
            type="submit"
            id="unlock-doc-desk-btn"
            className="w-full py-3.5 bg-indigo-900 hover:bg-indigo-800 text-white font-extrabold rounded-xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            <Unlock className="w-4 h-4 text-amber-400" />
            <span>Unlock Documentation Desk</span>
          </button>
        </form>
      </div>
    );
  }


  // ── AUTHENTICATED DOCUMENTATION DESK ─────────────────────────────────────
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      
      {/* 1. Top Documentation Officer Banner & Quick Access */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 rounded-3xl p-6 sm:p-8 text-white shadow-xl border border-slate-800 relative overflow-hidden">
        <div className="absolute right-0 top-0 translate-x-1/4 -translate-y-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl pointer-events-none"></div>
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/20 border border-blue-400/30 text-blue-300 text-xs font-bold tracking-wide">
              <FileCheck className="w-3.5 h-3.5" />
              DOCUMENTATION & VERIFICATION DESK
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
              Global Candidate Document Search
            </h1>
            <p className="text-sm text-slate-300 max-w-2xl leading-relaxed">
              Instantly look up candidate submissions, verify passport credentials, inspect attached CVs, and cross-reference candidate records across all active projects.
            </p>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3">
            <button
              id="lock-doc-desk-btn"
              onClick={handleLogout}
              title="Lock Documentation Desk & Log Out"
              className="p-3 bg-slate-800/80 hover:bg-rose-950/60 border border-slate-700 hover:border-rose-800/80 text-slate-300 hover:text-rose-300 rounded-2xl transition-all shadow-xs flex items-center gap-2 text-xs font-bold cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Lock Desk</span>
            </button>
          </div>

        </div>

        {/* Quick Stats Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-6 border-t border-slate-800 text-xs">
          <div className="bg-slate-800/40 border border-slate-800 rounded-xl p-3">
            <span className="text-slate-400 block text-[11px]">Total Candidate Records</span>
            <span className="text-xl font-extrabold text-white mt-0.5 block">{submissions.length}</span>
          </div>
          <div className="bg-slate-800/40 border border-slate-800 rounded-xl p-3">
            <span className="text-slate-400 block text-[11px]">Active Projects</span>
            <span className="text-xl font-extrabold text-blue-400 mt-0.5 block">{projects.length}</span>
          </div>
          <div className="bg-slate-800/40 border border-slate-800 rounded-xl p-3">
            <span className="text-slate-400 block text-[11px]">Active Recruiters</span>
            <span className="text-xl font-extrabold text-indigo-400 mt-0.5 block">{recruiters.length}</span>
          </div>
          <div className="bg-slate-800/40 border border-slate-800 rounded-xl p-3">
            <span className="text-slate-400 block text-[11px]">Current Filter Matches</span>
            <span className="text-xl font-extrabold text-emerald-400 mt-0.5 block">{filteredSubmissions.length}</span>
          </div>
        </div>
      </div>

      {/* 2. Global Search & Filter Bar */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs space-y-4">
        
        {/* Main Search Input */}
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400">
            <Search className="w-5 h-5 text-blue-600" />
          </div>
          <input
            ref={searchInputRef}
            id="global-candidate-search-input"
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value.toUpperCase())}
            placeholder="SEARCH CANDIDATE NAME, PASSPORT NUMBER (E.G. N1234567), PROJECT NAME, PHONE, OR RECRUITER..."
            className="w-full pl-12 pr-28 py-3.5 bg-slate-50 hover:bg-white focus:bg-white text-slate-900 border border-slate-300 focus:border-blue-600 rounded-xl text-sm font-bold uppercase focus:outline-hidden focus:ring-3 focus:ring-blue-500/20 transition-all shadow-2xs placeholder:text-slate-400"
          />
          <div className="absolute inset-y-0 right-0 pr-3 flex items-center gap-2">
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-md"
                title="Clear search"
              >
                <X className="w-4 h-4" />
              </button>
            )}
            <kbd className="hidden sm:inline-flex items-center px-2 py-0.5 text-[10px] font-semibold text-slate-500 bg-slate-200/80 rounded-md border border-slate-300">
              Ctrl + K
            </kbd>
          </div>
        </div>

        {/* Filter Dropdowns & View Toggles */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Filter by Project */}
            <div className="flex items-center space-x-1.5">
              <span className="text-xs font-semibold text-slate-500">Project:</span>
              <select
                id="doc-filter-project-select"
                value={selectedProjectFilter}
                onChange={(e) => setSelectedProjectFilter(e.target.value)}
                className="bg-slate-50 hover:bg-white text-slate-800 border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-semibold focus:outline-hidden focus:ring-2 focus:ring-blue-400 transition-all cursor-pointer"
              >
                <option value="All Projects">All Projects ({projects.length})</option>
                {projects.map((p) => (
                  <option key={p.name} value={p.name}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Filter by Job Role */}
            <div className="flex items-center space-x-1.5">
              <span className="text-xs font-semibold text-slate-500">Job Role:</span>
              <select
                id="doc-filter-role-select"
                value={selectedJobRoleFilter}
                onChange={(e) => setSelectedJobRoleFilter(e.target.value)}
                className="bg-slate-50 hover:bg-white text-slate-800 border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-semibold focus:outline-hidden focus:ring-2 focus:ring-blue-400 transition-all cursor-pointer"
              >
                <option value="All Roles">All Roles ({availableJobRoles.length})</option>
                {availableJobRoles.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>

            {/* Filter by Recruiter */}
            <div className="flex items-center space-x-1.5">
              <span className="text-xs font-semibold text-slate-500">Recruiter:</span>
              <select
                id="doc-filter-recruiter-select"
                value={selectedRecruiterFilter}
                onChange={(e) => setSelectedRecruiterFilter(e.target.value)}
                className="bg-slate-50 hover:bg-white text-slate-800 border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-semibold focus:outline-hidden focus:ring-2 focus:ring-blue-400 transition-all cursor-pointer"
              >
                <option value="All Recruiters">All Recruiters ({recruiters.length})</option>
                {recruiters.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>

            {/* Filter by Date Range */}
            <div className="flex items-center space-x-1 bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-xs">
              <button
                onClick={() => setDateRangeFilter('all')}
                className={`px-2.5 py-1 rounded-md font-medium transition-all ${
                  dateRangeFilter === 'all' ? 'bg-white text-blue-700 shadow-2xs font-bold' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                All Time
              </button>
              <button
                onClick={() => setDateRangeFilter('today')}
                className={`px-2.5 py-1 rounded-md font-medium transition-all ${
                  dateRangeFilter === 'today' ? 'bg-white text-blue-700 shadow-2xs font-bold' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Today
              </button>
              <button
                onClick={() => setDateRangeFilter('week')}
                className={`px-2.5 py-1 rounded-md font-medium transition-all ${
                  dateRangeFilter === 'week' ? 'bg-white text-blue-700 shadow-2xs font-bold' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Past 7 Days
              </button>
            </div>

            {/* Reset Filters button if any active */}
            {(searchQuery || selectedProjectFilter !== 'All Projects' || selectedJobRoleFilter !== 'All Roles' || selectedRecruiterFilter !== 'All Recruiters' || dateRangeFilter !== 'all') && (
              <button
                onClick={() => {
                  setSearchQuery('');
                  setSelectedProjectFilter('All Projects');
                  setSelectedJobRoleFilter('All Roles');
                  setSelectedRecruiterFilter('All Recruiters');
                  setSelectedStatusFilter('All Statuses');
                  setDateRangeFilter('all');
                }}
                className="text-xs text-rose-600 hover:text-rose-700 font-semibold px-2 py-1 hover:bg-rose-50 rounded-md transition-colors"
              >
                Clear Filters
              </button>
            )}
          </div>

          {/* Layout Toggle (Table vs Cards) */}
          <div className="flex items-center space-x-1 bg-slate-100 p-1 rounded-xl border border-slate-200">
            <button
              onClick={() => setViewMode('table')}
              title="Table view"
              className={`p-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all ${
                viewMode === 'table' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <List className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Table</span>
            </button>
            <button
              onClick={() => setViewMode('cards')}
              title="Cards view"
              className={`p-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all ${
                viewMode === 'cards' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Cards</span>
            </button>
          </div>

        </div>

      </div>

      {/* Selected Project Information Bar */}
      {selectedProjectFilter !== 'All Projects' && (() => {
        const activeProj = projects.find(p => apiService.isProjectMatch(p.name, selectedProjectFilter));
        if (!activeProj) return null;
        return (
          <div className="bg-slate-900 text-white px-5 py-3 rounded-2xl flex flex-wrap items-center justify-between gap-3 shadow-xs">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <span className="text-xs font-bold text-slate-300">Active Project:</span>
              <span className="text-xs font-extrabold text-white">{activeProj.name}</span>
            </div>

            <div className="flex items-center gap-2">
              <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-800 text-slate-300 border border-slate-700">
                Status: {activeProj.status || 'Open'}
              </span>
              <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-blue-950 text-blue-300 border border-blue-800/60">
                {activeProj.totalSubmissions || 0} Total Submissions
              </span>
            </div>
          </div>
        );
      })()}

      {/* 3. Search Results Content */}
      <div className="space-y-4">
        
        {/* Results Header / Counter */}
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-extrabold text-slate-900">
              Candidate Records
            </h2>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-800">
              {filteredSubmissions.length} found
            </span>
          </div>

          {searchQuery && (
            <span className="text-xs text-slate-500">
              Filtering by keyword: <strong className="text-slate-800 font-mono">"{searchQuery}"</strong>
            </span>
          )}
        </div>

        {/* Empty State */}
        {filteredSubmissions.length === 0 ? (
          <div className="bg-white rounded-2xl p-12 border border-slate-200 text-center space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
              <Search className="w-8 h-8" />
            </div>
            <div className="space-y-1 max-w-md mx-auto">
              <h3 className="text-base font-bold text-slate-800">No matching candidate records</h3>
              <p className="text-xs text-slate-500">
                We couldn't find any candidate submissions matching your search criteria. Try adjusting your query or resetting filters.
              </p>
            </div>
            <button
              onClick={() => {
                setSearchQuery('');
                setSelectedProjectFilter('All Projects');
                setSelectedRecruiterFilter('All Recruiters');
                setDateRangeFilter('all');
              }}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-xs transition-colors"
            >
              Reset All Filters
            </button>
          </div>
        ) : viewMode === 'table' ? (
          
          /* Table View */
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    <th className="py-3.5 px-4">Candidate & Passport</th>
                    <th className="py-3.5 px-4">Project Name</th>
                    <th className="py-3.5 px-4">Job Role</th>
                    <th className="py-3.5 px-4">Contact Numbers</th>
                    <th className="py-3.5 px-4">Email ID</th>
                    <th className="py-3.5 px-4">Recruiter</th>
                    <th className="py-3.5 px-4">Submission Date</th>
                    <th className="py-3.5 px-4">Document / CV</th>
                    <th className="py-3.5 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs font-medium text-slate-700">
                  {filteredSubmissions.map((sub) => {
                    const isPassportCopied = copiedPassport === sub.passportNumber;
                    const isFullCopied = copiedId === (sub.id || sub.passportNumber);
                    const jobRole = sub.jobRole || apiService.getEffectiveJobRole(sub);
                    const altMob = sub.altMobileNumber || apiService.getEffectiveAltMobile(sub);
                    const email = sub.emailId || apiService.getEffectiveEmail(sub);

                    return (
                      <tr 
                        key={sub.id || `${sub.project}-${sub.passportNumber}`}
                        className="hover:bg-blue-50/50 transition-colors group cursor-pointer"
                        onClick={() => setInspectingCandidate(sub)}
                      >
                        {/* Candidate Name & Passport */}
                        <td className="py-3 px-4">
                          <div className="flex items-center space-x-3">
                            <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-xs shrink-0">
                              {sub.candidateName.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <div className="font-bold text-slate-900 group-hover:text-blue-700 flex items-center gap-1.5">
                                <span>{sub.candidateName}</span>
                              </div>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <span className="font-mono font-bold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded text-[11px]">
                                  {sub.passportNumber}
                                </span>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    copyToClipboard(sub.passportNumber, sub.passportNumber, 'passport');
                                  }}
                                  title="Copy passport number"
                                  className="text-slate-400 hover:text-blue-600 p-0.5"
                                >
                                  {isPassportCopied ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                                </button>
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Project Name */}
                        <td className="py-3 px-4">
                          <div className="font-bold text-slate-800 truncate max-w-[170px]" title={sub.project}>
                            {sub.project}
                          </div>
                        </td>

                        {/* Job Role */}
                        <td className="py-3 px-4 whitespace-nowrap">
                          {jobRole ? (
                            <span className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-800 border border-blue-200 text-[11px] font-bold">
                              {jobRole}
                            </span>
                          ) : (
                            <span className="text-slate-400 text-[11px] italic">—</span>
                          )}
                        </td>

                        {/* Contact Numbers (Mobile + Alt) */}
                        <td className="py-3 px-4 whitespace-nowrap">
                          {sub.mobileNumber ? (
                            <div className="space-y-0.5">
                              <a
                                href={`tel:${sub.mobileNumber}`}
                                onClick={(e) => e.stopPropagation()}
                                className="font-mono text-slate-700 hover:text-blue-600 flex items-center gap-1 font-semibold"
                              >
                                <Phone className="w-3 h-3 text-emerald-600" />
                                <span>{sub.mobileNumber}</span>
                              </a>
                              {altMob && altMob !== sub.mobileNumber && (
                                <span className="font-mono text-slate-500 text-[10px] block">
                                  Alt: {altMob}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>

                        {/* Email ID */}
                        <td className="py-3 px-4 whitespace-nowrap truncate max-w-[150px]" title={email}>
                          {email ? (
                            <span className="text-slate-700 font-medium text-xs truncate block">
                              {email}
                            </span>
                          ) : (
                            <span className="text-slate-400 text-[11px] italic">—</span>
                          )}
                        </td>

                        {/* Recruiter */}
                        <td className="py-3 px-4 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <User className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                            <span className="font-medium text-slate-800">{sub.recruiter}</span>
                          </div>
                        </td>

                        {/* Submission Date */}
                        <td className="py-3 px-4 text-slate-500 whitespace-nowrap">
                          <div className="font-medium text-slate-800">{formatDisplayDateTime(sub.timestamp)}</div>
                        </td>

                        {/* Document CV */}
                        <td className="py-3 px-4 whitespace-nowrap">
                          {sub.fileUrl ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setPreviewDocCandidate(sub);
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 font-semibold text-[11px] transition-colors border border-blue-200/60"
                            >
                              <FileText className="w-3 h-3 text-blue-600" />
                              <span>View CV</span>
                            </button>
                          ) : (
                            <span className="text-slate-400 text-[11px]">No file</span>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="py-3 px-4 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end space-x-1.5">
                            <button
                              type="button"
                              onClick={() => setInspectingCandidate(sub)}
                              title="Inspect Full Candidate Dossier"
                              className="p-1.5 text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            >
                              <Eye className="w-4 h-4" />
                            </button>

                            <button
                              type="button"
                              onClick={() => handlePrintDossier(sub)}
                              title="Print / Export Dossier"
                              className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
                            >
                              <Printer className="w-4 h-4" />
                            </button>

                            <button
                              type="button"
                              onClick={() => copyToClipboard(formatSummaryForShare(sub), sub.id || sub.passportNumber, 'full')}
                              title="Copy details to clipboard"
                              className="p-1.5 text-slate-600 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                            >
                              {isFullCopied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
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

        ) : (

          /* Cards View */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredSubmissions.map((sub) => {
              const isPassportCopied = copiedPassport === sub.passportNumber;
              const isFullCopied = copiedId === (sub.id || sub.passportNumber);
              const jobRole = sub.jobRole || apiService.getEffectiveJobRole(sub);
              const altMob = sub.altMobileNumber || apiService.getEffectiveAltMobile(sub);
              const email = sub.emailId || apiService.getEffectiveEmail(sub);

              return (
                <div
                  key={sub.id || `${sub.project}-${sub.passportNumber}`}
                  onClick={() => setInspectingCandidate(sub)}
                  className="bg-white rounded-2xl p-5 border border-slate-200 hover:border-blue-400 hover:shadow-md transition-all cursor-pointer flex flex-col justify-between space-y-4 group"
                >
                  <div className="space-y-3">
                    
                    {/* Card Top */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-sm shrink-0">
                          {sub.candidateName.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <h3 className="font-extrabold text-sm text-slate-900 group-hover:text-blue-700 leading-snug">
                            {sub.candidateName}
                          </h3>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="font-mono text-xs font-bold text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded">
                              {sub.passportNumber}
                            </span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                copyToClipboard(sub.passportNumber, sub.passportNumber, 'passport');
                              }}
                              className="text-slate-400 hover:text-blue-600 p-0.5"
                              title="Copy passport"
                            >
                              {isPassportCopied ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                            </button>
                          </div>
                        </div>
                      </div>

                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200">
                        {sub.status || 'Verified'}
                      </span>
                    </div>

                    {/* Metadata Grid */}
                    <div className="space-y-2 pt-2 border-t border-slate-100 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500 flex items-center gap-1">
                          <Briefcase className="w-3.5 h-3.5 text-blue-600" /> Project & Role
                        </span>
                        <div className="text-right">
                          <span className="font-bold text-slate-800 truncate max-w-[140px] block" title={sub.project}>
                            {sub.project}
                          </span>
                          {jobRole && (
                            <span className="text-[11px] font-bold text-blue-700">
                              {jobRole}
                            </span>
                          )}
                        </div>
                      </div>

                      {sub.mobileNumber && (
                        <div className="flex items-center justify-between">
                          <span className="text-slate-500 flex items-center gap-1">
                            <Phone className="w-3.5 h-3.5 text-emerald-600" /> Mobile
                          </span>
                          <div className="text-right font-mono">
                            <span className="font-semibold text-slate-800 block">
                              {sub.mobileNumber}
                            </span>
                            {altMob && altMob !== sub.mobileNumber && (
                              <span className="text-[10px] text-slate-500 block">
                                Alt: {altMob}
                              </span>
                            )}
                          </div>
                        </div>
                      )}

                      {email && (
                        <div className="flex items-center justify-between">
                          <span className="text-slate-500 flex items-center gap-1">
                            <CreditCard className="w-3.5 h-3.5 text-purple-600" /> Email
                          </span>
                          <span className="font-medium text-slate-700 truncate max-w-[160px]" title={email}>
                            {email}
                          </span>
                        </div>
                      )}

                      <div className="flex items-center justify-between">
                        <span className="text-slate-500 flex items-center gap-1">
                          <User className="w-3.5 h-3.5 text-indigo-600" /> Recruiter
                        </span>
                        <span className="font-semibold text-slate-800">
                          {sub.recruiter}
                        </span>
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-slate-500 flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5 text-slate-400" /> Submitted
                        </span>
                        <span className="text-slate-600 font-medium">
                          {formatDisplayDate(sub.timestamp)}
                        </span>
                      </div>
                    </div>

                    {/* Dynamic answers summary chip */}
                    {sub.dynamicAnswers && Object.keys(sub.dynamicAnswers).length > 0 && (
                      <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100 flex flex-wrap gap-1.5 text-[11px]">
                        {Object.entries(sub.dynamicAnswers).slice(0, 3).map(([k, v]) => (
                          <span key={k} className="bg-white px-2 py-0.5 rounded border border-slate-200 font-medium text-slate-700">
                            <strong className="capitalize text-slate-500">{k.replace(/_/g, ' ')}:</strong> {formatDisplayDate(v, k)}
                          </span>
                        ))}
                        {Object.keys(sub.dynamicAnswers).length > 3 && (
                          <span className="text-slate-400 font-semibold self-center">
                            +{Object.keys(sub.dynamicAnswers).length - 3} more
                          </span>
                        )}
                      </div>
                    )}

                  </div>

                  {/* Card Bottom Actions */}
                  <div className="pt-3 border-t border-slate-100 flex items-center justify-between" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      onClick={() => setPreviewDocCandidate(sub)}
                      className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:text-blue-800"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      <span>{sub.fileName ? 'View Document' : 'View CV'}</span>
                    </button>

                    <div className="flex items-center space-x-1">
                      <button
                        type="button"
                        onClick={() => handlePrintDossier(sub)}
                        title="Print Dossier"
                        className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
                      >
                        <Printer className="w-4 h-4" />
                      </button>

                      <button
                        type="button"
                        onClick={() => copyToClipboard(formatSummaryForShare(sub), sub.id || sub.passportNumber, 'full')}
                        title="Copy details"
                        className="p-1.5 text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                      >
                        {isFullCopied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                      </button>

                      <button
                        type="button"
                        onClick={() => setInspectingCandidate(sub)}
                        className="px-2.5 py-1 bg-slate-900 hover:bg-blue-600 text-white rounded-lg text-xs font-bold transition-colors"
                      >
                        Inspect
                      </button>
                    </div>
                  </div>

                </div>
              );
            })}
          </div>
        )}

      </div>

      {/* 4. Full Candidate Dossier Inspector Modal */}
      {inspectingCandidate && (() => {
        const inspRole = inspectingCandidate.jobRole || apiService.getEffectiveJobRole(inspectingCandidate);
        const inspAltMob = inspectingCandidate.altMobileNumber || apiService.getEffectiveAltMobile(inspectingCandidate);
        const inspEmail = inspectingCandidate.emailId || apiService.getEffectiveEmail(inspectingCandidate);

        return createPortal(
          <div 
            className="fixed inset-0 z-[99999] flex items-center justify-center p-3 sm:p-6 bg-slate-950/80 backdrop-blur-xs overflow-y-auto"
            onClick={(e) => {
              if (e.target === e.currentTarget) setInspectingCandidate(null);
            }}
          >
            <div 
              className="relative w-full max-w-3xl my-auto bg-white rounded-2xl sm:rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[85vh] sm:max-h-[90vh]"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Inspector Header */}
              <div className="flex items-center justify-between px-5 sm:px-6 py-4 bg-slate-900 text-white shrink-0">
                <div className="flex items-center space-x-3">
                  <div className="w-11 h-11 rounded-xl bg-blue-500/20 border border-blue-400/30 flex items-center justify-center text-blue-400 font-extrabold text-lg shrink-0">
                    {inspectingCandidate.candidateName.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-extrabold text-base sm:text-lg leading-tight text-white flex items-center gap-2">
                      <span className="truncate">{inspectingCandidate.candidateName}</span>
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 shrink-0">
                        {inspectingCandidate.status || 'Verified'}
                      </span>
                    </h3>
                    <p className="text-xs text-slate-300 flex items-center gap-2 mt-0.5">
                      <span>Passport: <strong className="font-mono text-blue-300">{inspectingCandidate.passportNumber}</strong></span>
                      {inspRole && (
                        <span>• Role: <strong className="text-amber-300">{inspRole}</strong></span>
                      )}
                    </p>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={() => handlePrintDossier(inspectingCandidate)}
                    title="Print dossier"
                    className="p-2 text-slate-300 hover:text-white hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
                  >
                    <Printer className="w-5 h-5" />
                  </button>
                  <button
                    id="close-candidate-inspector-btn"
                    type="button"
                    onClick={() => setInspectingCandidate(null)}
                    className="p-2 text-slate-300 hover:text-white hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Inspector Body */}
              <div className="p-5 sm:p-6 overflow-y-auto space-y-5 flex-1">
                
                {/* Key Highlights Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                  
                  {/* Job Role */}
                  <div className="p-3.5 bg-blue-50/70 border border-blue-200 rounded-xl">
                    <span className="text-[11px] font-bold text-blue-700 uppercase tracking-wider block mb-1 flex items-center gap-1.5">
                      <Briefcase className="w-3.5 h-3.5 text-blue-600" /> Job Role / Trade
                    </span>
                    <p className="text-sm font-extrabold text-blue-950">{inspRole || 'General'}</p>
                  </div>

                  {/* Target Project */}
                  <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl">
                    <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1 flex items-center gap-1.5">
                      <Building2 className="w-3.5 h-3.5 text-blue-600" /> Target Project
                    </span>
                    <p className="text-sm font-extrabold text-slate-900">{inspectingCandidate.project}</p>
                  </div>

                  {/* Primary Mobile */}
                  <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                        <Phone className="w-3.5 h-3.5 text-emerald-600" /> Primary Mobile
                      </span>
                      {inspectingCandidate.mobileNumber && (
                        <button
                          type="button"
                          onClick={() => copyToClipboard(inspectingCandidate.mobileNumber || '', `mob-${inspectingCandidate.id}`, 'full')}
                          className="text-slate-400 hover:text-emerald-600"
                          title="Copy Mobile"
                        >
                          <Copy className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                    <p className="text-sm font-mono font-bold text-slate-900">
                      {inspectingCandidate.mobileNumber || 'Not specified'}
                    </p>
                  </div>

                  {/* Alt Mobile */}
                  <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                        <Phone className="w-3.5 h-3.5 text-amber-600" /> Alt: Mobile No.
                      </span>
                      {inspAltMob && (
                        <button
                          type="button"
                          onClick={() => copyToClipboard(inspAltMob, `alt-${inspectingCandidate.id}`, 'full')}
                          className="text-slate-400 hover:text-amber-600"
                          title="Copy Alt Mobile"
                        >
                          <Copy className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                    <p className="text-sm font-mono font-bold text-slate-900">
                      {inspAltMob || 'Not specified'}
                    </p>
                  </div>

                  {/* Email ID */}
                  <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                        <CreditCard className="w-3.5 h-3.5 text-purple-600" /> Email ID
                      </span>
                      {inspEmail && (
                        <button
                          type="button"
                          onClick={() => copyToClipboard(inspEmail, `email-${inspectingCandidate.id}`, 'full')}
                          className="text-slate-400 hover:text-purple-600"
                          title="Copy Email"
                        >
                          <Copy className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                    <p className="text-sm font-bold text-slate-900 truncate" title={inspEmail}>
                      {inspEmail || 'Not specified'}
                    </p>
                  </div>

                  {/* Recruiter */}
                  <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl">
                    <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1 flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5 text-indigo-600" /> Submitted By Recruiter
                    </span>
                    <p className="text-sm font-extrabold text-slate-900">{inspectingCandidate.recruiter}</p>
                  </div>

                  {/* Submission Timestamp */}
                  <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl">
                    <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1 flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-slate-500" /> Submission Timestamp
                    </span>
                    <p className="text-xs font-semibold text-slate-800">
                      {new Date(inspectingCandidate.timestamp).toLocaleString()}
                    </p>
                  </div>

                  {/* Passport Verification */}
                  <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl">
                    <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1 flex items-center gap-1.5">
                      <CreditCard className="w-3.5 h-3.5 text-emerald-600" /> Passport Verification
                    </span>
                    <p className="text-xs font-bold text-emerald-700 flex items-center gap-1">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" /> Clean Duplicate Check
                    </p>
                  </div>

                  {/* Record ID */}
                  <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl">
                    <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1 flex items-center gap-1.5">
                      <FileCheck className="w-3.5 h-3.5 text-blue-600" /> Record ID
                    </span>
                    <p className="text-xs font-mono font-semibold text-slate-600 truncate">
                      {inspectingCandidate.id || 'SUB-LOCAL-AUTOGEN'}
                    </p>
                  </div>
                </div>

                {/* Remarks Box */}
                {inspectingCandidate.remarks && (
                  <div className="p-4 bg-amber-50/80 border border-amber-200 rounded-xl">
                    <h4 className="text-xs font-bold text-amber-900 uppercase tracking-wider mb-1">
                      Recruiter Remarks & Notes
                    </h4>
                    <p className="text-xs text-amber-950 whitespace-pre-wrap leading-relaxed">
                      {inspectingCandidate.remarks}
                    </p>
                  </div>
                )}

                {/* Dynamic Project Fields Section */}
                {inspectingCandidate.dynamicAnswers && Object.keys(inspectingCandidate.dynamicAnswers).length > 0 && (
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                    <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-indigo-600" />
                      Project Specific Intake Answers
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {Object.entries(inspectingCandidate.dynamicAnswers).map(([fieldKey, val]) => (
                        <div key={fieldKey} className="bg-white p-3 rounded-lg border border-slate-200 shadow-2xs">
                          <span className="text-[11px] font-semibold text-slate-500 block mb-0.5 capitalize">
                            {fieldKey.replace(/_/g, ' ')}
                          </span>
                          <span className="text-xs font-bold text-slate-900 block">
                            {formatDisplayDate(val, fieldKey)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Attached CV Card */}
                <div className="p-5 bg-blue-50/60 border border-blue-200 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="flex items-center space-x-3.5">
                    <div className="w-12 h-12 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-md">
                      <FileText className="w-6 h-6" />
                    </div>
                    <div>
                      <h5 className="font-extrabold text-sm text-slate-900">
                        {inspectingCandidate.fileName || `${inspectingCandidate.candidateName}_Resume.pdf`}
                      </h5>
                      <p className="text-xs text-slate-500">Standardized PDF Document Archive</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    <button
                      type="button"
                      onClick={() => setPreviewDocCandidate(inspectingCandidate)}
                      className="flex-1 sm:flex-none inline-flex items-center justify-center px-4 py-2.5 bg-white hover:bg-slate-100 text-slate-800 text-xs font-bold rounded-xl border border-slate-300 shadow-2xs transition-colors gap-1.5 cursor-pointer"
                    >
                      <Eye className="w-4 h-4 text-blue-600" /> Preview Dossier
                    </button>
                    <button
                      type="button"
                      onClick={() => handleOpenDirectDoc(inspectingCandidate)}
                      className="flex-1 sm:flex-none inline-flex items-center justify-center px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors gap-1.5 cursor-pointer"
                    >
                      <ExternalLink className="w-4 h-4" /> Open Drive File
                    </button>
                  </div>
                </div>

              </div>

              {/* Inspector Footer */}
              <div className="flex items-center justify-between px-6 py-4 bg-slate-50 border-t border-slate-200">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => copyToClipboard(formatSummaryForShare(inspectingCandidate), inspectingCandidate.id || inspectingCandidate.passportNumber, 'full')}
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-700 hover:text-slate-900 bg-white border border-slate-300 px-3 py-2 rounded-xl shadow-2xs transition-colors cursor-pointer"
                  >
                    {copiedId === (inspectingCandidate.id || inspectingCandidate.passportNumber) ? (
                      <>
                        <Check className="w-4 h-4 text-emerald-600" />
                        <span>Copied Dossier!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4 text-slate-500" />
                        <span>Copy Full Details</span>
                      </>
                    )}
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setInspectingCandidate(null)}
                  className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition-colors cursor-pointer"
                >
                  Close Inspector
                </button>
              </div>

            </div>
          </div>,
          document.body
        );
      })()}

      {/* 5. Separate Document Viewer Modal */}
      {previewDocCandidate && (
        <DocPreviewModal
          submission={previewDocCandidate}
          onClose={() => setPreviewDocCandidate(null)}
        />
      )}

    </div>
  );
};
