import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  FileSpreadsheet,
  Link2,
  Upload,
  Check,
  AlertCircle,
  RefreshCw,
  X,
  ArrowRight,
  ArrowLeft,
  ChevronDown,
  CheckCircle2,
  FileText,
  User,
  CreditCard,
  Phone,
  Briefcase,
  HelpCircle,
  Sparkles,
  Layers,
  Search,
  ExternalLink,
  Calendar
} from 'lucide-react';
import { Project, CandidateSubmission, ProjectField } from '../types';
import { apiService } from '../services/apiService';
import { formatDisplayDate } from '../utils/dateUtils';
import {
  parseCsvText,
  detectHeaderMapping,
  TARGET_FIELD_OPTIONS,
  TargetFieldType,
  ParsedSheetData,
  parseAndNormalizeTimestamp,
  extractSubmissionDateFromRow,
  isTodaySubmission
} from '../utils/csvParser';

interface ConnectSheetModalProps {
  isOpen: boolean;
  onClose: () => void;
  projects: Project[];
  recruiters: string[];
  initialProjectName?: string;
  onSuccess: (result: { projectName: string; importedCount: number; updatedCount: number }) => void;
}

export const ConnectSheetModal: React.FC<ConnectSheetModalProps> = ({
  isOpen,
  onClose,
  projects,
  recruiters,
  initialProjectName,
  onSuccess
}) => {
  // Step navigation: 1 = Sheet Input & Project, 2 = Header Mapping, 3 = Review & Import
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);

  // Project configuration
  const [projectMode, setProjectMode] = useState<'existing' | 'new'>(initialProjectName ? 'existing' : 'new');
  const [selectedExistingProject, setSelectedExistingProject] = useState<string>(initialProjectName || (projects[0]?.name || ''));
  const [newProjectName, setNewProjectName] = useState<string>('');
  const [newProjectDescription, setNewProjectDescription] = useState<string>('');

  // Sheet input method
  const [inputMethod, setInputMethod] = useState<'url' | 'paste' | 'file'>('url');
  const [sheetUrl, setSheetUrl] = useState<string>('');
  const [pastedCsv, setPastedCsv] = useState<string>('');
  const [uploadedFileName, setUploadedFileName] = useState<string>('');

  // Fetching & Parsing State
  const [isFetching, setIsFetching] = useState<boolean>(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [isPrivateSheetError, setIsPrivateSheetError] = useState<boolean>(false);
  const [parsedData, setParsedData] = useState<ParsedSheetData | null>(null);

  // Column header mapping: column index -> target field type
  const [columnMapping, setColumnMapping] = useState<Record<number, TargetFieldType>>({});
  // Custom label overrides for custom fields: column index -> custom label
  const [customFieldLabels, setCustomFieldLabels] = useState<Record<number, string>>({});

  // Defaults for unmapped/empty fields
  const [defaultRecruiter, setDefaultRecruiter] = useState<string>(recruiters[0] || 'Imported via Sheet');
  const [defaultJobRole, setDefaultJobRole] = useState<string>('');
  const [updateExisting, setUpdateExisting] = useState<boolean>(true);

  // Submission state
  const [isImporting, setIsImporting] = useState<boolean>(false);
  const [importResult, setImportResult] = useState<{
    success: boolean;
    importedCount: number;
    updatedCount: number;
    message: string;
  } | null>(null);

  // Sync initial project selection
  useEffect(() => {
    if (initialProjectName) {
      setSelectedExistingProject(initialProjectName);
      setProjectMode('existing');
    }
  }, [initialProjectName]);

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Handle Fetching External Sheet
  const handleFetchSheet = async () => {
    setFetchError(null);
    setIsPrivateSheetError(false);

    let rawCsvText = '';
    let targetUrl = '';

    if (inputMethod === 'url') {
      targetUrl = sheetUrl.trim();
      if (!targetUrl) {
        setFetchError('Please paste a Google Sheet link to proceed.');
        return;
      }
      if (targetUrl.toLowerCase().includes('/forms/')) {
        setFetchError('You pasted a Google Form URL instead of its linked Spreadsheet. Please open your Google Form, click the "Responses" tab at the top, click the green Google Sheets icon ("View in Sheets"), and copy THAT spreadsheet link here.');
        return;
      }
    } else if (inputMethod === 'paste') {
      rawCsvText = pastedCsv.trim();
      if (!rawCsvText) {
        setFetchError('Please paste your CSV or spreadsheet table data.');
        return;
      }
    } else if (inputMethod === 'file') {
      if (!pastedCsv.trim()) {
        setFetchError('Please select a valid CSV file.');
        return;
      }
      rawCsvText = pastedCsv;
    }

    // Validate project name - if empty, provide a clean default so data fetch is not blocked
    let effectiveProject = projectMode === 'new' ? newProjectName.trim() : selectedExistingProject.trim();
    if (!effectiveProject) {
      if (projectMode === 'new') {
        const autoName = `External Campaign - ${new Date().toLocaleDateString('en-GB')}`;
        setNewProjectName(autoName);
        effectiveProject = autoName;
      } else if (projects.length > 0) {
        setSelectedExistingProject(projects[0].name);
        effectiveProject = projects[0].name;
      } else {
        setFetchError('Please select or name a project.');
        return;
      }
    }

    setIsFetching(true);

    try {
      let data: any;
      if (rawCsvText) {
        data = parseCsvText(rawCsvText);
        if (data.headers.length === 0) {
          throw new Error('No valid column headers found in the provided data.');
        }
        data = {
          success: true,
          headers: data.headers,
          rows: data.rows,
          totalRows: data.totalRows
        };
      } else {
        data = await apiService.fetchExternalSheet(targetUrl);
      }

      if (!data.success) {
        if (data.isPrivateSheet) {
          setIsPrivateSheetError(true);
        }
        throw new Error(data.error || 'Failed to read headers from sheet.');
      }

      if (!data.headers || data.headers.length === 0) {
        throw new Error('The connected sheet has no header row or column names.');
      }

      setParsedData({
        headers: data.headers,
        rows: data.rows || [],
        totalRows: data.totalRows || (data.rows ? data.rows.length : 0)
      });

      // Auto-detect header mapping for each column
      const initialMap: Record<number, TargetFieldType> = {};
      const initialCustomLabels: Record<number, string> = {};

      data.headers.forEach((h: string, idx: number) => {
        const detected = detectHeaderMapping(h);
        initialMap[idx] = detected;
        if (detected === 'custom') {
          initialCustomLabels[idx] = h.trim();
        }
      });

      setColumnMapping(initialMap);
      setCustomFieldLabels(initialCustomLabels);

      // Advance to Step 2: Header Mapping
      setCurrentStep(2);
    } catch (err: any) {
      const errMsg = err?.message || 'Error connecting to Google Sheet.';
      setFetchError(errMsg);
      if (
        errMsg.toLowerCase().includes('private') ||
        errMsg.toLowerCase().includes('anyone with the link') ||
        errMsg.toLowerCase().includes('failed to fetch') ||
        errMsg.toLowerCase().includes('network') ||
        errMsg.toLowerCase().includes('permission') ||
        errMsg.toLowerCase().includes('unable to read')
      ) {
        setIsPrivateSheetError(true);
      }
    } finally {
      setIsFetching(false);
    }
  };

  // Handle File Upload (.csv)
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadedFileName(file.name);
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setPastedCsv(content);
      setFetchError(null);
    };
    reader.onerror = () => {
      setFetchError('Failed to read the uploaded file.');
    };
    reader.readAsText(file);
  };

  // Change mapping for a specific column
  const handleUpdateMapping = (colIdx: number, newTarget: TargetFieldType) => {
    setColumnMapping(prev => ({
      ...prev,
      [colIdx]: newTarget
    }));

    if (newTarget === 'custom' && !customFieldLabels[colIdx] && parsedData?.headers[colIdx]) {
      setCustomFieldLabels(prev => ({
        ...prev,
        [colIdx]: parsedData.headers[colIdx].trim()
      }));
    }
  };

  // Validation: Check if candidateName and passportNumber are mapped
  const mappedTargets = useMemo(() => {
    return Object.values(columnMapping);
  }, [columnMapping]);

  const hasCandidateNameMapped = mappedTargets.includes('candidateName');
  const hasPassportMapped = mappedTargets.includes('passportNumber');
  const isMappingValid = hasCandidateNameMapped && hasPassportMapped;

  // Transform rows based on current mapping
  const previewCandidates = useMemo(() => {
    if (!parsedData) return [];

    const effectiveProject = projectMode === 'new' ? newProjectName.trim() : selectedExistingProject.trim();
    const rowsToPreview = parsedData.rows.slice(0, 5);

    return rowsToPreview.map((row, rowIdx) => {
      const cand: Partial<CandidateSubmission> = {
        project: effectiveProject,
        recruiter: defaultRecruiter,
        dynamicAnswers: {}
      };

      parsedData.headers.forEach((header, colIdx) => {
        const val = (row[colIdx] || '').trim();
        const target = columnMapping[colIdx];

        if (!val || target === 'skip') return;

        if (target === 'candidateName') cand.candidateName = val;
        else if (target === 'passportNumber') cand.passportNumber = val.toUpperCase().replace(/[^A-Z0-9]/g, '');
        else if (target === 'mobileNumber') cand.mobileNumber = val;
        else if (target === 'altMobileNumber') cand.altMobileNumber = val;
        else if (target === 'emailId') cand.emailId = val;
        else if (target === 'jobRole') cand.jobRole = val;
        else if (target === 'recruiter') cand.recruiter = val;
        else if (target === 'timestamp') {
          const parsed = parseAndNormalizeTimestamp(val, false);
          cand.timestamp = parsed || val;
        }
        else if (target === 'fileUrl') {
          cand.fileUrl = val;
          cand.directFileUrl = val;
        }
        else if (target === 'remarks') cand.remarks = val;
        else if (target === 'custom') {
          const fieldLabel = customFieldLabels[colIdx] || header;
          cand.dynamicAnswers = cand.dynamicAnswers || {};
          cand.dynamicAnswers[fieldLabel] = val;
        }
      });

      // If no explicit timestamp mapping, search row for genuine submission date
      if (!cand.timestamp) {
        const foundDate = extractSubmissionDateFromRow(parsedData.headers, row, columnMapping);
        if (foundDate) cand.timestamp = foundDate;
      }

      if (!cand.jobRole && defaultJobRole) {
        cand.jobRole = defaultJobRole;
      }

      return cand;
    });
  }, [parsedData, columnMapping, customFieldLabels, projectMode, newProjectName, selectedExistingProject, defaultRecruiter, defaultJobRole]);

  // Execute Import
  const handleApplyImport = async () => {
    if (!parsedData || !isMappingValid) return;

    const effectiveProject = projectMode === 'new' ? newProjectName.trim() : selectedExistingProject.trim();
    if (!effectiveProject) {
      setFetchError('Project name is missing.');
      return;
    }

    setIsImporting(true);
    setFetchError(null);

    try {
      const allCandidates: Partial<CandidateSubmission>[] = [];
      const extractedRoles = new Set<string>();
      if (defaultJobRole.trim()) extractedRoles.add(defaultJobRole.trim());

      const dynamicFieldsMap = new Map<string, ProjectField>();

      // Build column mapping dictionary to save to project config
      const savedHeaderMapping: Record<string, string> = {};
      parsedData.headers.forEach((h, idx) => {
        const target = columnMapping[idx];
        if (target) {
          savedHeaderMapping[h] = target;
        }
      });

      parsedData.rows.forEach((row, rowIdx) => {
        // Extract genuine submission date from the external sheet row
        const rowSubmissionDate = extractSubmissionDateFromRow(parsedData.headers, row, columnMapping);

        const cand: Partial<CandidateSubmission> = {
          id: `sub-sheet-${Date.now()}-${rowIdx + 1}-${Math.random().toString(36).slice(2, 6)}`,
          timestamp: rowSubmissionDate || new Date().toISOString(),
          project: effectiveProject,
          recruiter: defaultRecruiter,
          dynamicAnswers: {},
          status: 'Verified'
        };

        parsedData.headers.forEach((header, colIdx) => {
          const val = (row[colIdx] || '').trim();
          const target = columnMapping[colIdx];

          if (!val || target === 'skip') return;

          if (target === 'candidateName') cand.candidateName = val;
          else if (target === 'passportNumber') cand.passportNumber = val.toUpperCase().replace(/[^A-Z0-9]/g, '');
          else if (target === 'mobileNumber') cand.mobileNumber = val;
          else if (target === 'altMobileNumber') cand.altMobileNumber = val;
          else if (target === 'emailId') cand.emailId = val;
          else if (target === 'jobRole') {
            cand.jobRole = val;
            extractedRoles.add(val);
          }
          else if (target === 'recruiter') cand.recruiter = val;
          else if (target === 'timestamp') {
            const norm = parseAndNormalizeTimestamp(val, false);
            if (norm) {
              cand.timestamp = norm;
            }
          }
          else if (target === 'fileUrl') {
            cand.fileUrl = val;
            cand.directFileUrl = val;
          }
          else if (target === 'remarks') cand.remarks = val;
          else if (target === 'custom') {
            const fieldLabel = customFieldLabels[colIdx] || header;
            cand.dynamicAnswers = cand.dynamicAnswers || {};
            cand.dynamicAnswers[fieldLabel] = val;

            if (!dynamicFieldsMap.has(fieldLabel)) {
              dynamicFieldsMap.set(fieldLabel, {
                id: `f_${Date.now()}_${colIdx}`,
                label: fieldLabel,
                type: 'text',
                required: false
              });
            }
          }
        });

        if (!cand.jobRole && defaultJobRole.trim()) {
          cand.jobRole = defaultJobRole.trim();
        }

        // Only include rows that have at least Candidate Name or Passport Number
        if (cand.candidateName || cand.passportNumber) {
          allCandidates.push(cand);
        }
      });

      if (allCandidates.length === 0) {
        throw new Error('No valid candidate rows could be found in the sheet with the selected mapping.');
      }

      // Execute import through apiService
      const res = await apiService.importExternalCandidates({
        projectName: effectiveProject,
        projectDescription: newProjectDescription.trim() || `Imported via Google Sheet (${allCandidates.length} candidate entries)`,
        sheetUrl: inputMethod === 'url' ? sheetUrl.trim() : undefined,
        columnMapping: savedHeaderMapping,
        candidates: allCandidates,
        jobRoles: Array.from(extractedRoles),
        fields: Array.from(dynamicFieldsMap.values()),
        isNewProject: projectMode === 'new',
        updateExisting
      });

      setImportResult({
        success: true,
        importedCount: res.importedCount,
        updatedCount: res.updatedCount,
        message: res.message
      });

      // Call parent callback to refresh UI views
      onSuccess({
        projectName: effectiveProject,
        importedCount: res.importedCount,
        updatedCount: res.updatedCount
      });
    } catch (err: any) {
      setFetchError(err.message || 'Import failed. Please check the mapping and retry.');
    } finally {
      setIsImporting(false);
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-950/70 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200/80 w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden text-slate-900 font-sans">
        
        {/* Modal Header */}
        <div className="bg-slate-900 text-white px-6 py-4.5 flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shadow-inner">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-extrabold text-white">Connect External Google Sheet</h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  Universal Importer
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Connect external Google Forms or Google Sheets data into Gowell Document Hub with automatic column header detection
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors cursor-pointer"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Step Progress Bar */}
        <div className="bg-slate-50 border-b border-slate-200 px-6 py-2.5 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 sm:gap-6">
            <button
              onClick={() => setCurrentStep(1)}
              className={`flex items-center gap-2 font-bold cursor-pointer transition-colors ${
                currentStep === 1 ? 'text-blue-600' : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] ${
                currentStep === 1 ? 'bg-blue-600 text-white' : currentStep > 1 ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-600'
              }`}>
                {currentStep > 1 ? '✓' : '1'}
              </span>
              <span>1. Sheet & Project</span>
            </button>

            <span className="text-slate-300 hidden sm:inline">→</span>

            <button
              onClick={() => parsedData && setCurrentStep(2)}
              disabled={!parsedData}
              className={`flex items-center gap-2 font-bold transition-colors ${
                !parsedData ? 'opacity-40 cursor-not-allowed text-slate-400' : currentStep === 2 ? 'text-blue-600 cursor-pointer' : 'text-slate-500 hover:text-slate-900 cursor-pointer'
              }`}
            >
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] ${
                currentStep === 2 ? 'bg-blue-600 text-white' : currentStep > 2 ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-600'
              }`}>
                {currentStep > 2 ? '✓' : '2'}
              </span>
              <span>2. Column Headers & Mapping</span>
            </button>

            <span className="text-slate-300 hidden sm:inline">→</span>

            <button
              onClick={() => parsedData && isMappingValid && setCurrentStep(3)}
              disabled={!parsedData || !isMappingValid}
              className={`flex items-center gap-2 font-bold transition-colors ${
                !parsedData || !isMappingValid ? 'opacity-40 cursor-not-allowed text-slate-400' : currentStep === 3 ? 'text-blue-600 cursor-pointer' : 'text-slate-500 hover:text-slate-900 cursor-pointer'
              }`}
            >
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] ${
                currentStep === 3 ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-600'
              }`}>
                3
              </span>
              <span>3. Preview & Apply</span>
            </button>
          </div>

          {parsedData && (
            <div className="text-[11px] text-slate-500 hidden md:block">
              Found <strong className="text-slate-800">{parsedData.totalRows}</strong> row(s) & <strong className="text-slate-800">{parsedData.headers.length}</strong> column(s)
            </div>
          )}
        </div>

        {/* Modal Body with Scroll */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">

          {/* Success Banner */}
          {importResult && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 text-emerald-900 space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-extrabold text-sm text-emerald-900">Sheet Connected & Candidates Successfully Imported!</h4>
                  <p className="text-xs text-emerald-700">{importResult.message}</p>
                </div>
              </div>
              <div className="pt-2 border-t border-emerald-200/60 flex items-center justify-between">
                <span className="text-xs text-emerald-800 font-medium">
                  The candidates are immediately visible in Documentation Desk, Global Search, and Manager Workspace.
                </span>
                <button
                  onClick={onClose}
                  className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
                >
                  Done / Close
                </button>
              </div>
            </div>
          )}

          {/* General Error Alert */}
          {fetchError && (
            <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 text-rose-900 space-y-2">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="text-xs font-bold text-rose-900">{fetchError}</p>
                  {isPrivateSheetError && (
                    <div className="text-[11px] text-rose-800 space-y-1 bg-white/70 p-3 rounded-xl border border-rose-200">
                      <p className="font-semibold">How to make your Google Sheet accessible:</p>
                      <ol className="list-decimal list-inside space-y-0.5 text-slate-700">
                        <li>Open your spreadsheet in Google Sheets</li>
                        <li>Click the top-right blue <strong className="text-slate-900">Share</strong> button</li>
                        <li>Under "General access", change to <strong className="text-slate-900">"Anyone with the link"</strong></li>
                        <li>Ensure the role is set to <strong className="text-slate-900">"Viewer"</strong></li>
                        <li>Click "Copy link" and paste it back here!</li>
                      </ol>
                      <div className="pt-1 flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setInputMethod('paste');
                            setFetchError(null);
                          }}
                          className="inline-flex items-center gap-1.5 px-3 py-1 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-[11px] font-bold transition-colors cursor-pointer"
                        >
                          <span>Switch to Paste Rows / CSV Data</span>
                          <ArrowRight className="w-3 h-3" />
                        </button>
                        <span className="text-[11px] text-slate-500 italic">No sharing required (simply copy from sheet & paste)</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ──────────────── STEP 1: SHEET & PROJECT ──────────────── */}
          {currentStep === 1 && !importResult && (
            <div className="space-y-6">

              {/* Target Project Card */}
              <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-5 space-y-4">
                <div className="flex items-center gap-2 text-slate-800 font-extrabold text-sm">
                  <Briefcase className="w-4 h-4 text-blue-600" />
                  <span>Step 1.1: Choose Target Project / Campaign</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className={`flex items-start gap-3 p-3.5 rounded-xl border-2 transition-all cursor-pointer ${
                    projectMode === 'new' ? 'border-blue-600 bg-white shadow-xs' : 'border-slate-200 hover:border-slate-300 bg-slate-100/60'
                  }`}>
                    <input
                      type="radio"
                      name="projectMode"
                      checked={projectMode === 'new'}
                      onChange={() => setProjectMode('new')}
                      className="mt-0.5"
                    />
                    <div>
                      <span className="text-xs font-bold text-slate-900 block">Create New Project</span>
                      <span className="text-[11px] text-slate-500">Create a brand new campaign for this external sheet</span>
                    </div>
                  </label>

                  <label className={`flex items-start gap-3 p-3.5 rounded-xl border-2 transition-all cursor-pointer ${
                    projectMode === 'existing' ? 'border-blue-600 bg-white shadow-xs' : 'border-slate-200 hover:border-slate-300 bg-slate-100/60'
                  }`}>
                    <input
                      type="radio"
                      name="projectMode"
                      checked={projectMode === 'existing'}
                      onChange={() => setProjectMode('existing')}
                      className="mt-0.5"
                    />
                    <div>
                      <span className="text-xs font-bold text-slate-900 block">Add to Existing Project</span>
                      <span className="text-[11px] text-slate-500">Append candidates to one of your current active projects</span>
                    </div>
                  </label>
                </div>

                {projectMode === 'new' ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        New Project Name <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        placeholder="e.g., Qatar MEP Electricians - Form Responses"
                        value={newProjectName}
                        onChange={(e) => setNewProjectName(e.target.value)}
                        className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Campaign Description (Optional)
                      </label>
                      <input
                        type="text"
                        placeholder="e.g., Collected via public Google Form intake"
                        value={newProjectDescription}
                        onChange={(e) => setNewProjectDescription(e.target.value)}
                        className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="pt-2">
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Select Existing Project <span className="text-rose-500">*</span>
                    </label>
                    <div className="relative">
                      <select
                        value={selectedExistingProject}
                        onChange={(e) => setSelectedExistingProject(e.target.value)}
                        className="w-full appearance-none px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-xs font-medium focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none pr-10"
                      >
                        {projects.map((proj) => (
                          <option key={proj.name} value={proj.name}>
                            {proj.name} ({proj.totalSubmissions || 0} candidates)
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-3 pointer-events-none" />
                    </div>
                  </div>
                )}
              </div>

              {/* Sheet Input Card */}
              <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-slate-800 font-extrabold text-sm">
                    <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                    <span>Step 1.2: Connect Data Source</span>
                  </div>

                  {/* Input Method Switcher */}
                  <div className="flex items-center bg-slate-200/80 p-0.5 rounded-xl text-xs">
                    <button
                      type="button"
                      onClick={() => setInputMethod('url')}
                      className={`px-3 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                        inputMethod === 'url' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Google Sheet Link
                    </button>
                    <button
                      type="button"
                      onClick={() => setInputMethod('paste')}
                      className={`px-3 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                        inputMethod === 'paste' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Paste Table Data
                    </button>
                    <button
                      type="button"
                      onClick={() => setInputMethod('file')}
                      className={`px-3 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                        inputMethod === 'file' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Upload CSV File
                    </button>
                  </div>
                </div>

                {inputMethod === 'url' && (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Google Sheet Link / URL <span className="text-rose-500">*</span>
                      </label>
                      <div className="relative">
                        <input
                          type="url"
                          placeholder="https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit#gid=0"
                          value={sheetUrl}
                          onChange={(e) => setSheetUrl(e.target.value)}
                          className="w-full pl-9 pr-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-xs font-mono focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                        />
                        <Link2 className="w-4 h-4 text-slate-400 absolute left-3 top-3 pointer-events-none" />
                      </div>
                    </div>

                    <div className="flex items-start gap-2 bg-blue-50/70 border border-blue-100 rounded-xl p-3 text-blue-900 text-[11px]">
                      <Sparkles className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                      <p>
                        Works with any Google Spreadsheet or Google Form response sheet. Ensure General Access is set to <strong>"Anyone with the link can view"</strong> so our engine can fetch headers.
                      </p>
                    </div>
                  </div>
                )}

                {inputMethod === 'paste' && (
                  <div className="space-y-2">
                    <label className="block text-xs font-bold text-slate-700">
                      Paste CSV or Tab-Separated Values (From Excel or Google Sheets) <span className="text-rose-500">*</span>
                    </label>
                    <textarea
                      rows={5}
                      placeholder="Timestamp,Candidate Name,Passport No,Mobile Number,Role,CV Link&#10;2026-10-14,Mohammed Ali,N1234567,+974 555-1234,Electrician,https://drive.google.com/..."
                      value={pastedCsv}
                      onChange={(e) => setPastedCsv(e.target.value)}
                      className="w-full p-3 bg-white border border-slate-300 rounded-xl text-xs font-mono focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    />
                    <p className="text-[11px] text-slate-400">
                      Copy rows directly from your Google Sheet or Excel and paste here. Delimiters (commas, tabs) will be detected automatically.
                    </p>
                  </div>
                )}

                {inputMethod === 'file' && (
                  <div className="space-y-2">
                    <label className="block text-xs font-bold text-slate-700">
                      Upload CSV File <span className="text-rose-500">*</span>
                    </label>
                    <div className="border-2 border-dashed border-slate-300 rounded-2xl p-6 text-center hover:bg-slate-100/50 transition-colors">
                      <Upload className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                      <input
                        type="file"
                        accept=".csv,text/csv,text/plain"
                        id="csv-file-upload"
                        onChange={handleFileUpload}
                        className="hidden"
                      />
                      <label
                        htmlFor="csv-file-upload"
                        className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer shadow-xs"
                      >
                        Choose .CSV File
                      </label>
                      {uploadedFileName ? (
                        <p className="text-xs font-semibold text-emerald-600 mt-2">
                          ✓ Selected: {uploadedFileName}
                        </p>
                      ) : (
                        <p className="text-[11px] text-slate-400 mt-2">
                          Supports comma-separated values exported from Google Sheets or Excel
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Action Button */}
              <div className="flex justify-end pt-2">
                <button
                  onClick={handleFetchSheet}
                  disabled={isFetching}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`} />
                  <span>{isFetching ? 'Fetching & Detecting Headers...' : 'Fetch & Detect Columns'}</span>
                  {!isFetching && <ArrowRight className="w-4 h-4" />}
                </button>
              </div>

            </div>
          )}

          {/* ──────────────── STEP 2: COLUMN HEADERS & MAPPING ──────────────── */}
          {currentStep === 2 && parsedData && !importResult && (
            <div className="space-y-6">

              {/* Detection Banner */}
              <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-extrabold text-emerald-900">
                      Headers Detected Successfully ({parsedData.headers.length} Columns, {parsedData.totalRows} Candidate Rows)
                    </h4>
                    <p className="text-[11px] text-emerald-700">
                      Review column matches below. If any header was misidentified, change it in the dropdown to match your exact format.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-xs">
                  <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold ${
                    hasCandidateNameMapped ? 'bg-emerald-200 text-emerald-800' : 'bg-rose-100 text-rose-700 border border-rose-300'
                  }`}>
                    {hasCandidateNameMapped ? '✓ Name Mapped' : '! Name Required'}
                  </span>
                  <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold ${
                    hasPassportMapped ? 'bg-emerald-200 text-emerald-800' : 'bg-rose-100 text-rose-700 border border-rose-300'
                  }`}>
                    {hasPassportMapped ? '✓ Passport Mapped' : '! Passport Required'}
                  </span>
                </div>
              </div>

              {/* Header Mapping Table */}
              <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
                <div className="bg-slate-100 px-4 py-2.5 border-b border-slate-200 text-xs font-bold text-slate-700 flex items-center justify-between">
                  <span className="uppercase text-[10px] tracking-wider text-slate-500 font-extrabold">
                    Column Header Detection & Assignment Matrix
                  </span>
                  <span className="text-[11px] text-slate-500 font-normal">
                    Change any dropdown to correct mapping
                  </span>
                </div>

                <div className="divide-y divide-slate-200">
                  {parsedData.headers.map((header, colIdx) => {
                    const currentTarget = columnMapping[colIdx] || 'custom';
                    const sampleVal1 = parsedData.rows[0]?.[colIdx] || '';
                    const sampleVal2 = parsedData.rows[1]?.[colIdx] || '';
                    const isCustom = currentTarget === 'custom';

                    return (
                      <div
                        key={colIdx}
                        className={`p-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3 transition-colors ${
                          currentTarget === 'skip' ? 'bg-slate-50/50 opacity-60' : 'bg-white hover:bg-slate-50/80'
                        }`}
                      >
                        {/* Left: Source Column in Sheet */}
                        <div className="space-y-1 md:w-5/12">
                          <div className="flex items-center gap-2">
                            <span className="px-1.5 py-0.5 rounded bg-slate-200 text-slate-700 font-mono text-[10px] font-bold">
                              Col {colIdx + 1}
                            </span>
                            <span className="font-extrabold text-xs text-slate-900" title={header}>
                              {header || `(Unnamed Column ${colIdx + 1})`}
                            </span>
                          </div>

                          {/* Sample data preview */}
                          <div className="text-[11px] text-slate-500 truncate flex items-center gap-1.5">
                            <span className="text-slate-400 font-medium">Sample:</span>
                            <span className="font-mono text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded text-[10px] max-w-[260px] truncate">
                              {sampleVal1 ? `"${sampleVal1}"` : sampleVal2 ? `"${sampleVal2}"` : '(Empty cell)'}
                            </span>
                          </div>
                        </div>

                        {/* Right: Target Hub Field Selection */}
                        <div className="md:w-7/12 flex flex-col sm:flex-row sm:items-center gap-2 justify-end">
                          <div className="relative flex-1 max-w-sm">
                            <select
                              value={currentTarget}
                              onChange={(e) => handleUpdateMapping(colIdx, e.target.value as TargetFieldType)}
                              className={`w-full appearance-none px-3 py-1.5 border rounded-xl text-xs font-semibold outline-none pr-8 cursor-pointer ${
                                currentTarget === 'candidateName' || currentTarget === 'passportNumber'
                                  ? 'border-blue-500 bg-blue-50/40 text-blue-900'
                                  : currentTarget === 'skip'
                                  ? 'border-slate-300 bg-slate-100 text-slate-500'
                                  : 'border-slate-300 bg-white text-slate-800 focus:border-blue-500'
                              }`}
                            >
                              {TARGET_FIELD_OPTIONS.map((opt) => (
                                <option key={opt.key} value={opt.key}>
                                  {opt.label}
                                </option>
                              ))}
                            </select>
                            <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-2.5 pointer-events-none" />
                          </div>

                          {/* If Custom Field, allow naming the label */}
                          {isCustom && (
                            <input
                              type="text"
                              placeholder="Field Label"
                              value={customFieldLabels[colIdx] || header}
                              onChange={(e) => setCustomFieldLabels(prev => ({ ...prev, [colIdx]: e.target.value }))}
                              className="px-2.5 py-1.5 border border-slate-300 rounded-xl text-xs bg-slate-50 focus:bg-white focus:border-blue-500 outline-none w-36"
                              title="Custom field display label"
                            />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Fallback Defaults Configuration */}
              <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4.5 space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
                  <User className="w-3.5 h-3.5 text-blue-600" />
                  <span>Default Settings for Unassigned Information</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">
                      Assigned Recruiter (If column missing in sheet)
                    </label>
                    <select
                      value={defaultRecruiter}
                      onChange={(e) => setDefaultRecruiter(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-medium outline-none"
                    >
                      {recruiters.map((rec) => (
                        <option key={rec} value={rec}>
                          {rec}
                        </option>
                      ))}
                      <option value="Imported via Google Sheet">Imported via Google Sheet</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">
                      Default Job Role / Trade (If role missing)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g., General Applicant or Pipe Welder"
                      value={defaultJobRole}
                      onChange={(e) => setDefaultJobRole(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs outline-none"
                    />
                  </div>
                </div>

                <div className="pt-1">
                  <label className="inline-flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={updateExisting}
                      onChange={(e) => setUpdateExisting(e.target.checked)}
                      className="rounded text-blue-600"
                    />
                    <span>Update existing candidate profile if matching passport number is already registered</span>
                  </label>
                </div>
              </div>

              {/* Navigation Buttons */}
              <div className="flex items-center justify-between pt-2">
                <button
                  onClick={() => setCurrentStep(1)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 border border-slate-300 hover:bg-slate-100 rounded-xl text-xs font-bold text-slate-700 transition-colors cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Back to Source</span>
                </button>

                <button
                  onClick={() => setCurrentStep(3)}
                  disabled={!isMappingValid}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer disabled:opacity-50"
                >
                  <span>Preview Transformed Data</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>

            </div>
          )}

          {/* ──────────────── STEP 3: PREVIEW & APPLY ──────────────── */}
          {currentStep === 3 && parsedData && !importResult && (
            <div className="space-y-6">

              {/* Import Summary Card */}
              <div className="bg-slate-900 text-white rounded-2xl p-5 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-400">
                      Ready to Apply & Import
                    </span>
                    <h3 className="text-base font-extrabold text-white">
                      Target Project: {projectMode === 'new' ? newProjectName : selectedExistingProject}
                    </h3>
                    <p className="text-xs text-slate-400">
                      {parsedData.totalRows} candidate entries will be synced with Gowell Document Hub
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleApplyImport}
                      disabled={isImporting}
                      className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-black rounded-xl text-xs transition-all shadow-md cursor-pointer disabled:opacity-50"
                    >
                      <Check className={`w-4 h-4 ${isImporting ? 'animate-spin' : ''}`} />
                      <span>{isImporting ? 'Syncing to System...' : 'Apply & Import Now'}</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Sample Data Table Preview */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                  <span>Candidate Records Preview (First 5 Rows)</span>
                  <span className="text-slate-500 font-normal">How these rows appear in Hub</span>
                </div>

                <div className="border border-slate-200 rounded-2xl overflow-x-auto shadow-xs">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="bg-slate-100 text-slate-600 uppercase text-[10px] font-bold border-b border-slate-200">
                        <th className="py-2.5 px-3">Candidate Name</th>
                        <th className="py-2.5 px-3">Passport Number</th>
                        <th className="py-2.5 px-3">Job Role</th>
                        <th className="py-2.5 px-3">Submission Date</th>
                        <th className="py-2.5 px-3">Mobile</th>
                        <th className="py-2.5 px-3">Recruiter</th>
                        <th className="py-2.5 px-3">Document / CV</th>
                        <th className="py-2.5 px-3">Extra Fields</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium">
                      {previewCandidates.map((cand, idx) => (
                        <tr key={idx} className="hover:bg-slate-50">
                          <td className="py-2.5 px-3 font-bold text-slate-900">
                            {cand.candidateName || <span className="text-slate-400 italic">None</span>}
                          </td>
                          <td className="py-2.5 px-3 font-mono font-bold text-blue-700">
                            {cand.passportNumber || <span className="text-rose-500 italic">Missing</span>}
                          </td>
                          <td className="py-2.5 px-3 text-slate-700">
                            {cand.jobRole || <span className="text-slate-400 italic">None</span>}
                          </td>
                          <td className="py-2.5 px-3">
                            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-blue-50 text-blue-900 font-mono text-[11px] font-semibold border border-blue-200/60">
                              <Calendar className="w-3 h-3 text-blue-600 shrink-0" />
                              <span>{formatDisplayDate(cand.timestamp)}</span>
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-slate-600 font-mono text-[11px]">
                            {cand.mobileNumber || '-'}
                          </td>
                          <td className="py-2.5 px-3 text-slate-700">
                            <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[11px]">
                              {cand.recruiter}
                            </span>
                          </td>
                          <td className="py-2.5 px-3">
                            {cand.fileUrl ? (
                              <a
                                href={cand.fileUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 text-[11px] text-blue-600 hover:underline"
                              >
                                <ExternalLink className="w-3 h-3" />
                                <span>Drive File</span>
                              </a>
                            ) : (
                              <span className="text-slate-400 text-[11px] italic">No file link</span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-slate-500 text-[11px]">
                            {cand.dynamicAnswers && Object.keys(cand.dynamicAnswers).length > 0 ? (
                              <span className="text-slate-600">
                                {Object.keys(cand.dynamicAnswers).length} field(s)
                              </span>
                            ) : (
                              '-'
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Navigation Buttons */}
              <div className="flex items-center justify-between pt-2">
                <button
                  onClick={() => setCurrentStep(2)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 border border-slate-300 hover:bg-slate-100 rounded-xl text-xs font-bold text-slate-700 transition-colors cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Adjust Mapping</span>
                </button>

                <button
                  onClick={handleApplyImport}
                  disabled={isImporting}
                  className="inline-flex items-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-md cursor-pointer disabled:opacity-50"
                >
                  <Check className={`w-4 h-4 ${isImporting ? 'animate-spin' : ''}`} />
                  <span>{isImporting ? 'Importing Candidates...' : 'Confirm & Apply Import'}</span>
                </button>
              </div>

            </div>
          )}

        </div>

        {/* Modal Footer */}
        <div className="bg-slate-50 border-t border-slate-200 px-6 py-3 flex items-center justify-between text-xs text-slate-500">
          <span>Gowell Universal Sheet Connector • Preserves Google Drive links & dynamic answers</span>
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-slate-600 hover:text-slate-900 font-bold transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>

      </div>
    </div>,
    document.body
  );
};
