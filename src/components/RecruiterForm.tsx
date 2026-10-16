import React, { useState, useEffect, useRef } from 'react';
import { 
  User, 
  Briefcase, 
  FileText, 
  UploadCloud, 
  CheckCircle2, 
  AlertCircle, 
  Clock, 
  Check, 
  RefreshCw, 
  ArrowRight, 
  FileUp, 
  Search,
  ShieldCheck,
  History,
  Phone,
  HelpCircle,
  Eye,
  Trash2,
  Calendar
} from 'lucide-react';
import { Project, CandidateSubmission } from '../types';
import { apiService } from '../services/apiService';
import { DuplicateModal } from './DuplicateModal';
import { DocPreviewModal } from './DocPreviewModal';
import { formatDisplayDateTime, toDateInputValue } from '../utils/dateUtils';

interface RecruiterFormProps {
  projects: Project[];
  recruiters: string[];
  selectedRecruiter: string;
  onSelectRecruiter: (name: string) => void;
  onSubmissionSuccess: () => void;
}

export const RecruiterForm: React.FC<RecruiterFormProps> = ({
  projects,
  recruiters,
  selectedRecruiter,
  onSelectRecruiter,
  onSubmissionSuccess
}) => {
  // Form State
  const [selectedProjectName, setSelectedProjectName] = useState<string>('');
  const [selectedJobRole, setSelectedJobRole] = useState<string>('');
  const [customJobRole, setCustomJobRole] = useState<string>('');
  const [candidateName, setCandidateName] = useState<string>('');
  const [passportNumber, setPassportNumber] = useState<string>('');
  const [mobileNumber, setMobileNumber] = useState<string>('');
  const [altMobileNumber, setAltMobileNumber] = useState<string>('');
  const [emailId, setEmailId] = useState<string>('');
  const [remarks, setRemarks] = useState<string>('');
  const [dynamicAnswers, setDynamicAnswers] = useState<Record<string, any>>({});
  
  // File State
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileBase64, setFileBase64] = useState<string>('');
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Status & Validation
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const isSubmittingRef = useRef<boolean>(false);
  const [submissionFeedback, setSubmissionFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [duplicateMatch, setDuplicateMatch] = useState<CandidateSubmission | null>(null);
  const [showDuplicateModal, setShowDuplicateModal] = useState<boolean>(false);
  
  // Recruiter History Drawer
  const [showHistory, setShowHistory] = useState<boolean>(false);
  const [myHistory, setMyHistory] = useState<CandidateSubmission[]>([]);
  const [previewDoc, setPreviewDoc] = useState<CandidateSubmission | null>(null);

  // Active Project object
  const activeProject = projects.find(p => p.name === selectedProjectName) || projects.find(p => p.status === 'Open' && p.submission === 'Active') || projects[0];

  useEffect(() => {
    if (activeProject && !selectedProjectName) {
      setSelectedProjectName(activeProject.name);
    }
  }, [activeProject, selectedProjectName]);

  const getSmartJobRoles = (proj?: Project): string[] => {
    if (proj && Array.isArray(proj.jobRoles) && proj.jobRoles.length > 0) {
      return proj.jobRoles;
    }
    const name = (proj?.name || '').toLowerCase();
    if (name.includes('nurse')) return ['STAFF NURSE', 'BSC NURSE', 'GNM NURSE', 'ICU NURSE', 'ASSISTANT NURSE'];
    if (name.includes('electrician')) return ['ELECTRICIAN', 'INDUSTRIAL ELECTRICIAN', 'BUILDING ELECTRICIAN', 'ASSISTANT ELECTRICIAN'];
    if (name.includes('welder') || name.includes('fabricat')) return ['WELDER', '6G WELDER', 'MIG WELDER', 'TIG WELDER', 'FABRICATOR', 'FITTER'];
    if (name.includes('doctor')) return ['GENERAL PRACTITIONER', 'SPECIALIST DOCTOR', 'RESIDENT MEDICAL OFFICER', 'CONSULTANT'];
    if (name.includes('dental')) return ['DENTAL NURSE', 'DENTAL LAB TECHNICIAN', 'DENTIST', 'DENTAL ASSISTANT'];
    if (name.includes('forklift')) return ['FORKLIFT OPERATOR', 'HEAVY EQUIPMENT OPERATOR', 'WAREHOUSE WORKER'];
    if (name.includes('caregiver') || name.includes('home')) return ['CAREGIVER', 'HOME NURSE', 'HOME CARE ASSISTANT'];
    if (name.includes('pediatric')) return ['PEDIATRIC NURSE', 'NICU NURSE', 'PICU NURSE'];
    if (name.includes('teacher')) return ['PRIMARY TEACHER', 'SECONDARY TEACHER', 'ENGLISH TEACHER', 'MATHEMATICS TEACHER'];
    if (name.includes('waiter') || name.includes('waitress')) return ['WAITER', 'WAITRESS', 'BARTENDER', 'F&B SERVICE STEWARD'];
    if (name.includes('koc') || name.includes('guard') || name.includes('habib')) return ['STAFF NURSE', 'TECHNICIAN', 'SAFETY OFFICER', 'PHARMACIST', 'ASSISTANT NURSE'];
    return ['STAFF NURSE', 'ELECTRICIAN', 'WELDER', 'TECHNICIAN', 'OPERATOR', 'CAREGIVER'];
  };

  const availableJobRoles = getSmartJobRoles(activeProject);

  // When active project changes, reset or initialize job role selection
  useEffect(() => {
    if (activeProject) {
      const roles = getSmartJobRoles(activeProject);
      if (roles.length > 0) {
        setSelectedJobRole(roles[0]);
      } else {
        setSelectedJobRole('');
      }
      setCustomJobRole('');
    }
  }, [selectedProjectName, activeProject]);

  // Live duplicate detection indicator when typing passport number
  useEffect(() => {
    const clean = passportNumber.trim();
    if (!clean || clean.length < 3 || !selectedProjectName) {
      setDuplicateMatch(null);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const result = await apiService.checkDuplicatePassport(selectedProjectName, clean);
        if (result.isDuplicate && result.existing) {
          setDuplicateMatch(result.existing);
        } else {
          setDuplicateMatch(null);
        }
      } catch (e) {
        console.warn('Duplicate check error:', e);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [passportNumber, selectedProjectName]);

  // Reset dynamic answers when project changes & subscribe to auto-fetch updates
  useEffect(() => {
    if (activeProject) {
      const initialAnswers: Record<string, any> = {};
      activeProject.fields.forEach(f => {
        initialAnswers[f.id] = '';
      });
      setDynamicAnswers(initialAnswers);
      loadRecruiterHistory();
    }

    const unsub = apiService.subscribe(() => {
      loadRecruiterHistory();
    });

    return () => unsub();
  }, [selectedProjectName, selectedRecruiter]);

  const loadRecruiterHistory = async () => {
    if (selectedRecruiter && selectedProjectName) {
      const history = await apiService.getSubmissions(selectedProjectName, selectedRecruiter);
      setMyHistory(history);
    }
  };

  // File Handling
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const processFile = (file: File) => {
    if (file.size > 25 * 1024 * 1024) {
      alert('File size exceeds 25MB limit. Please upload a compressed PDF or document.');
      return;
    }

    setSelectedFile(file);
    const reader = new FileReader();
    reader.onload = () => {
      setFileBase64(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const removeFile = () => {
    setSelectedFile(null);
    setFileBase64('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Resolve Effective Job Role
  const effectiveJobRole = selectedJobRole === '__custom__' 
    ? customJobRole.trim() 
    : (selectedJobRole.trim() || customJobRole.trim());

  // Submit Handler (Checks duplicate at the final submission step)
  const handleSubmit = async (e: React.FormEvent | null, overrideDuplicate: boolean = false) => {
    if (e) e.preventDefault();

    // Prevent duplicate concurrent submissions
    if (isSubmittingRef.current) {
      return;
    }

    if (!selectedRecruiter) {
      setSubmissionFeedback({ type: 'error', message: 'Please select your Recruiter profile name first.' });
      return;
    }

    if (!selectedProjectName) {
      setSubmissionFeedback({ type: 'error', message: 'Please select an active project.' });
      return;
    }

    // Validate Job Role
    if (!effectiveJobRole) {
      setSubmissionFeedback({ type: 'error', message: 'Please select or enter the candidate Job Role.' });
      return;
    }

    // Validate Mandatory Core Fields
    if (!candidateName.trim()) {
      setSubmissionFeedback({ type: 'error', message: 'Candidate Full Name is mandatory.' });
      return;
    }

    if (!passportNumber.trim()) {
      setSubmissionFeedback({ type: 'error', message: 'Passport Number is mandatory.' });
      return;
    }

    if (!mobileNumber.trim()) {
      setSubmissionFeedback({ type: 'error', message: 'Mobile Number is mandatory.' });
      return;
    }

    if (!altMobileNumber.trim()) {
      setSubmissionFeedback({ type: 'error', message: 'Alternative Mobile No. is mandatory.' });
      return;
    }

    if (!emailId.trim()) {
      setSubmissionFeedback({ type: 'error', message: 'Email ID is mandatory.' });
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(emailId.trim())) {
      setSubmissionFeedback({ type: 'error', message: 'Please enter a valid Email ID (e.g. candidate@example.com).' });
      return;
    }

    // Validate Project Specific Requirements Questions (All Questions Mandatory)
    if (activeProject && Array.isArray(activeProject.fields) && activeProject.fields.length > 0) {
      for (const field of activeProject.fields) {
        const val = dynamicAnswers[field.id];
        if (val === undefined || val === null || String(val).trim() === '') {
          setSubmissionFeedback({
            type: 'error',
            message: `Question "${field.label}" in Project Specific Requirements is mandatory. Please provide an answer.`
          });
          return;
        }
      }
    }

    // Validate Candidate CV / Document (PDF) (Mandatory)
    if (!selectedFile || !fileBase64) {
      setSubmissionFeedback({
        type: 'error',
        message: 'Candidate CV / Document (PDF) is mandatory. Please upload the candidate document before submitting.'
      });
      return;
    }

    // Perform duplicate check at the submission step
    if (!overrideDuplicate) {
      setIsSubmitting(true);
      try {
        const dupCheck = await apiService.checkDuplicatePassport(selectedProjectName, passportNumber.trim());
        if (dupCheck.isDuplicate && dupCheck.existing) {
          const isSameRecruiter = dupCheck.existing.recruiter.trim().toLowerCase() === selectedRecruiter.trim().toLowerCase();
          
          if (!isSameRecruiter) {
            // Blocked: Different recruiter previously uploaded this candidate
            setSubmissionFeedback({
              type: 'error',
              message: `Submission Blocked: Candidate (Passport: ${passportNumber.trim().toUpperCase()}) was already submitted for project "${selectedProjectName}" by recruiter "${dupCheck.existing.recruiter}". Only "${dupCheck.existing.recruiter}" is authorized to update or re-upload this candidate.`
            });
            setIsSubmitting(false);
            isSubmittingRef.current = false;
            return;
          } else {
            // Same recruiter: Allow re-upload confirmation modal at this final step
            setDuplicateMatch(dupCheck.existing);
            setShowDuplicateModal(true);
            setIsSubmitting(false);
            isSubmittingRef.current = false;
            return;
          }
        }
      } catch (e) {
        console.warn('Duplicate check:', e);
      }
    }

    isSubmittingRef.current = true;
    setIsSubmitting(true);
    setSubmissionFeedback(null);

    try {
      const upperDynamic: Record<string, any> = {};
      if (dynamicAnswers) {
        Object.entries(dynamicAnswers).forEach(([k, v]) => {
          upperDynamic[k] = typeof v === 'string' ? v.trim().toUpperCase() : v;
        });
      }

      const res = await apiService.submitCandidate({
        project: selectedProjectName,
        recruiter: selectedRecruiter,
        candidateName: candidateName.trim().toUpperCase(),
        passportNumber: passportNumber.trim().toUpperCase(),
        mobileNumber: mobileNumber.trim(),
        altMobileNumber: altMobileNumber.trim(),
        emailId: emailId.trim(),
        jobRole: effectiveJobRole.trim().toUpperCase(),
        remarks: remarks.trim().toUpperCase(),
        fileData: fileBase64,
        fileName: selectedFile?.name,
        dynamicAnswers: upperDynamic,
        overrideDuplicate: overrideDuplicate
      });

      if (res.success) {
        setSubmissionFeedback({ type: 'success', message: res.message });
        // Reset inputs
        setCandidateName('');
        setPassportNumber('');
        setMobileNumber('');
        setAltMobileNumber('');
        setEmailId('');
        setRemarks('');
        setCustomJobRole('');
        removeFile();
        setDuplicateMatch(null);
        setShowDuplicateModal(false);

        // Reset dynamic questions
        if (activeProject) {
          const freshAnswers: Record<string, any> = {};
          activeProject.fields.forEach(f => { freshAnswers[f.id] = ''; });
          setDynamicAnswers(freshAnswers);
        }

        loadRecruiterHistory();
        onSubmissionSuccess();
      } else {
        setSubmissionFeedback({ type: 'error', message: res.message });
      }
    } catch (err: any) {
      setSubmissionFeedback({ type: 'error', message: err.message || 'Submission failed. Please check network connection.' });
    } finally {
      setIsSubmitting(false);
      isSubmittingRef.current = false;
    }
  };

  const handleDuplicateOverrideConfirm = () => {
    if (isSubmittingRef.current) return;
    setShowDuplicateModal(false);
    handleSubmit(null, true);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-fadeIn">
      
      {/* Top Banner / Welcome */}
      <div className="mb-8 bg-gradient-to-r from-blue-700 via-indigo-700 to-slate-900 rounded-3xl p-6 sm:p-8 text-white shadow-xl">
        <div className="space-y-1 max-w-3xl">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-white/20 text-white backdrop-blur-xs">
              Recruiter Portal
            </span>
            <span className="text-xs text-blue-200">Safe Sync Active</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
            Candidate Document Upload Hub
          </h1>
          <p className="text-sm text-blue-100 leading-relaxed">
            Submit candidate CV documents, passport identification, and project-specific questionnaires securely.
          </p>
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Column: Submission Form (8 cols) */}
        <div className="lg:col-span-8 space-y-6">
          
          <form onSubmit={(e) => handleSubmit(e, false)} className="space-y-6">
            
            {/* 1. Recruiter Profile Selection Box */}
            <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-4">
              <div className="flex items-center space-x-2.5">
                <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-sm">
                  1
                </div>
                <div>
                  <h2 className="font-bold text-slate-900 text-base">Select Recruiter Name</h2>
                  <p className="text-xs text-slate-500">Choose your recruiter profile</p>
                </div>
              </div>

              <div>
                <select
                  id="recruiter-select-dropdown"
                  value={selectedRecruiter}
                  onChange={(e) => onSelectRecruiter(e.target.value)}
                  className="w-full bg-slate-50 hover:bg-white focus:bg-white text-slate-900 border border-slate-300 focus:border-blue-500 rounded-xl px-4 py-2.5 text-sm font-semibold focus:outline-hidden focus:ring-2 focus:ring-blue-400/20 transition-all cursor-pointer shadow-xs"
                >
                  <option value="">
                    {recruiters.length === 0 ? 'No recruiters configured' : 'Select your name'}
                  </option>
                  {recruiters.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
                {selectedRecruiter && (
                  <p className="text-xs text-emerald-600 mt-2 flex items-center gap-1.5 font-medium">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Submissions will be credited to <strong>{selectedRecruiter}</strong>
                  </p>
                )}
              </div>
            </div>

            {/* 2. Project & Job Role Selection Box */}
            <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2.5">
                  <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-sm">
                    2
                  </div>
                  <div>
                    <h2 className="font-bold text-slate-900 text-base">Select Project & Job Role</h2>
                    <p className="text-xs text-slate-500">Choose the target recruitment campaign and job designation</p>
                  </div>
                </div>

                {availableJobRoles.length > 0 && (
                  <span className="text-xs font-semibold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-full border border-blue-200">
                    {availableJobRoles.length} Roles Configured
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Project Selection */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide">
                    Target Project <span className="text-rose-500">*</span>
                  </label>
                  <select
                    id="target-project-select"
                    value={selectedProjectName}
                    onChange={(e) => setSelectedProjectName(e.target.value)}
                    className="w-full bg-slate-50 hover:bg-white focus:bg-white text-slate-900 border border-slate-300 focus:border-blue-500 rounded-xl px-4 py-2.5 text-sm font-semibold focus:outline-hidden focus:ring-2 focus:ring-blue-400/20 transition-all cursor-pointer shadow-xs"
                  >
                    <option value="" disabled>
                      {projects.length === 0 ? 'No projects available (Create in Manager Portal)' : 'Select project name...'}
                    </option>
                    {projects.map((proj) => (
                      <option key={proj.name} value={proj.name}>
                        {proj.name} {proj.status === 'Closed' ? '(Closed)' : ''}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Job Role Selection - Always a Dropdown */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide">
                    Job Role / Trade <span className="text-rose-500">*</span>
                  </label>
                  <div className="space-y-2">
                    <select
                      id="job-role-select"
                      value={selectedJobRole}
                      onChange={(e) => {
                        const val = e.target.value;
                        setSelectedJobRole(val);
                        if (val !== '__custom__') {
                          setCustomJobRole('');
                        }
                      }}
                      className="w-full bg-slate-50 hover:bg-white focus:bg-white text-slate-900 border border-slate-300 focus:border-blue-500 rounded-xl px-4 py-2.5 text-sm font-semibold focus:outline-hidden focus:ring-2 focus:ring-blue-400/20 transition-all cursor-pointer shadow-xs"
                    >
                      <option value="" disabled>Select a role...</option>
                      {availableJobRoles.map((role) => (
                        <option key={role} value={role}>{role}</option>
                      ))}
                      <option value="__custom__">+ Other / Custom Role...</option>
                    </select>

                    {selectedJobRole === '__custom__' && (
                      <input
                        type="text"
                        id="custom-job-role-input"
                        required
                        autoFocus
                        placeholder="TYPE CANDIDATE JOB ROLE..."
                        value={customJobRole}
                        onChange={(e) => setCustomJobRole(e.target.value.toUpperCase())}
                        className="w-full px-4 py-2 bg-slate-50 border border-blue-300 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:bg-white font-bold uppercase text-slate-800 animate-fadeIn"
                      />
                    )}
                  </div>
                </div>
              </div>

              {/* Quick Role Badges for 1-click selection */}
              {availableJobRoles.length > 0 && (
                <div className="pt-1">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
                    Quick Select Role:
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {availableJobRoles.map((role) => {
                      const isSelected = selectedJobRole === role;
                      return (
                        <button
                          key={role}
                          type="button"
                          onClick={() => {
                            setSelectedJobRole(role);
                            setCustomJobRole('');
                          }}
                          className={`px-3 py-1 rounded-lg text-xs font-semibold uppercase transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-blue-600 text-white shadow-xs scale-102'
                              : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200'
                          }`}
                        >
                          {role}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* 3. Mandatory Candidate Core Details */}
            <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2.5">
                  <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-sm">
                    3
                  </div>
                  <div>
                    <h2 className="font-bold text-slate-900 text-base">Candidate Information</h2>
                    <p className="text-xs text-slate-500">Core identification & contact details required for all projects</p>
                  </div>
                </div>

                <span className="text-xs font-bold text-amber-700 bg-amber-50 px-2.5 py-1 rounded-full border border-amber-200">
                  Mandatory Fields
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                
                {/* Candidate Full Name */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide">
                    Candidate Full Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    id="candidate-name-input"
                    required
                    placeholder="E.G. MOHAMMED RASHID"
                    value={candidateName}
                    onChange={(e) => setCandidateName(e.target.value.toUpperCase())}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all font-bold uppercase text-slate-800"
                  />
                </div>

                {/* Passport Number */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide">
                    Passport No. <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      id="passport-number-input"
                      required
                      placeholder="E.G. Z5892104"
                      value={passportNumber}
                      onChange={(e) => setPassportNumber(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                      className={`w-full px-4 py-2.5 bg-slate-50 border rounded-xl text-sm font-mono font-bold uppercase transition-all ${
                        duplicateMatch
                          ? (selectedRecruiter && duplicateMatch.recruiter.trim().toLowerCase() === selectedRecruiter.trim().toLowerCase()
                              ? 'border-indigo-400 bg-indigo-50/40 text-indigo-950 focus:ring-2 focus:ring-indigo-500'
                              : 'border-rose-400 bg-rose-50/40 text-rose-950 focus:ring-2 focus:ring-rose-500')
                          : 'border-slate-300 focus:ring-2 focus:ring-blue-500 focus:bg-white text-slate-900'
                      }`}
                    />
                  </div>

                  {/* Informational Status Indicator */}
                  {duplicateMatch && (
                    selectedRecruiter && duplicateMatch.recruiter.trim().toLowerCase() === selectedRecruiter.trim().toLowerCase() ? (
                      <div className="mt-2 p-2.5 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-900 flex items-start gap-2">
                        <AlertCircle className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                        <div>
                          <p className="font-semibold text-blue-950">
                            Already registered by you ({duplicateMatch.recruiter})
                          </p>
                          <p className="text-blue-700 text-[11px] mt-0.5 leading-relaxed">
                            Candidate: <span className="font-medium">{duplicateMatch.candidateName}</span> • Submitted on {formatDisplayDateTime(duplicateMatch.timestamp)}. Complete the form below and click Submit to rewrite/re-upload.
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-2 p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-900 flex items-start gap-2">
                        <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                        <div>
                          <p className="font-bold text-rose-950">
                            Duplicate Alert: Already registered by {duplicateMatch.recruiter}
                          </p>
                          <p className="text-rose-700 text-[11px] mt-0.5 leading-relaxed">
                            Candidate: <span className="font-medium">{duplicateMatch.candidateName}</span> was submitted by <span className="font-bold">{duplicateMatch.recruiter}</span> on {formatDisplayDateTime(duplicateMatch.timestamp)}. Only {duplicateMatch.recruiter} can re-upload or update this candidate.
                          </p>
                        </div>
                      </div>
                    )
                  )}

                  {!duplicateMatch && passportNumber.trim().length >= 6 && (
                    <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-emerald-700 font-medium">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Passport number is available for this project</span>
                    </div>
                  )}
                </div>

                {/* Primary Mobile Number */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide">
                    Mobile No. <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="tel"
                    id="mobile-number-input"
                    required
                    placeholder="e.g. +91 98451 23098"
                    value={mobileNumber}
                    onChange={(e) => setMobileNumber(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all font-mono text-slate-800 font-medium"
                  />
                </div>

                {/* Alternative Mobile Number */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide">
                    Alt: Mobile No. <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="tel"
                    id="alt-mobile-number-input"
                    required
                    placeholder="e.g. +91 94471 88921"
                    value={altMobileNumber}
                    onChange={(e) => setAltMobileNumber(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all font-mono text-slate-800 font-medium"
                  />
                </div>

                {/* Email ID */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide">
                    Email ID <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="email"
                    id="email-id-input"
                    required
                    placeholder="e.g. candidate@gmail.com"
                    value={emailId}
                    onChange={(e) => setEmailId(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all text-slate-800 font-medium"
                  />
                </div>

                {/* Recruiter Remarks */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide">
                    Submission Remarks / Notes
                  </label>
                  <input
                    type="text"
                    id="remarks-input"
                    placeholder="E.G. 5 YRS GULF EXP, READY FOR INTERVIEW"
                    value={remarks}
                    onChange={(e) => setRemarks(e.target.value.toUpperCase())}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all font-bold uppercase text-slate-800"
                  />
                </div>

              </div>
            </div>

            {/* 3. Project Dynamic Questions (All Mandatory) */}
            {activeProject && activeProject.fields && activeProject.fields.length > 0 && (
              <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2.5">
                    <div className="w-8 h-8 rounded-lg bg-purple-100 text-purple-700 flex items-center justify-center font-bold text-sm">
                      3
                    </div>
                    <div>
                      <h2 className="font-bold text-slate-900 text-base flex items-center gap-1.5">
                        Project Specific Requirements <span className="text-rose-500 font-bold">*</span>
                      </h2>
                      <p className="text-xs text-slate-500">All questions below are mandatory for {activeProject.name}</p>
                    </div>
                  </div>

                  <span className="text-xs font-bold text-rose-700 bg-rose-50 px-2.5 py-1 rounded-full border border-rose-200">
                    All {activeProject.fields.length} Questions Mandatory
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {activeProject.fields.map((field) => {
                    const isDropdown = field.type === 'select' || field.type === 'dropdown';
                    const isDate = field.type === 'date' || /(dob|date_of_birth|birth_date)/i.test(field.id);
                    
                    // Normalize options
                    let optionsList: string[] = [];
                    if (Array.isArray(field.options)) {
                      optionsList = field.options.map(o => String(o).trim()).filter(Boolean);
                    } else if (typeof field.options === 'string') {
                      optionsList = String(field.options).split(',').map(o => o.trim()).filter(Boolean);
                    }

                    return (
                      <div key={field.id} className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide">
                            {field.label} <span className="text-rose-500 font-bold">*</span>
                          </label>
                          {isDate && dynamicAnswers[field.id] && (
                            <button
                              type="button"
                              onClick={() => setDynamicAnswers({ ...dynamicAnswers, [field.id]: '' })}
                              className="text-[10px] text-slate-400 hover:text-rose-600 font-medium cursor-pointer"
                            >
                              Clear
                            </button>
                          )}
                        </div>

                        {isDropdown ? (
                          <select
                            required
                            value={dynamicAnswers[field.id] || ''}
                            onChange={(e) => setDynamicAnswers({ ...dynamicAnswers, [field.id]: e.target.value })}
                            className="w-full px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:bg-white font-bold uppercase text-slate-800 transition-all"
                          >
                            <option value="">Select option... (Required)</option>
                            {optionsList.length > 0 ? (
                              optionsList.map((opt) => (
                                <option key={opt} value={opt}>{opt}</option>
                              ))
                            ) : (
                              <>
                                <option value="Yes">Yes</option>
                                <option value="No">No</option>
                              </>
                            )}
                          </select>
                        ) : isDate ? (
                          <div className="relative flex items-center">
                            <input
                              id={`dyn_input_${field.id}`}
                              type="date"
                              required
                              value={toDateInputValue(dynamicAnswers[field.id])}
                              onChange={(e) => setDynamicAnswers({ ...dynamicAnswers, [field.id]: e.target.value })}
                              onClick={(e) => {
                                try {
                                  if ('showPicker' in HTMLInputElement.prototype) {
                                    (e.currentTarget as HTMLInputElement).showPicker();
                                  }
                                } catch (err) {}
                              }}
                              className="w-full px-4 py-2.5 pr-10 bg-slate-50 border border-slate-300 rounded-xl text-sm font-medium text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all cursor-pointer [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-80 hover:[&::-webkit-calendar-picker-indicator]:opacity-100"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                const el = document.getElementById(`dyn_input_${field.id}`) as HTMLInputElement;
                                if (el) {
                                  el.focus();
                                  try {
                                    if ('showPicker' in HTMLInputElement.prototype) {
                                      el.showPicker();
                                    }
                                  } catch (err) {}
                                }
                              }}
                              className="absolute right-3 p-1 text-slate-400 hover:text-blue-600 transition-colors cursor-pointer"
                              title="Click to select date"
                            >
                              <Calendar className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          <input
                            type={field.type === 'number' ? 'number' : 'text'}
                            required
                            placeholder={field.placeholder || `ENTER ${field.label.toUpperCase()} (REQUIRED)`}
                            value={field.type === 'number' ? (dynamicAnswers[field.id] || '') : (dynamicAnswers[field.id] || '').toString().toUpperCase()}
                            onChange={(e) => setDynamicAnswers({ ...dynamicAnswers, [field.id]: field.type === 'number' ? e.target.value : e.target.value.toUpperCase() })}
                            className="w-full px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:bg-white font-bold uppercase text-slate-800 transition-all"
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 4. Document / CV Attachment (Mandatory) */}
            <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2.5">
                  <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-sm">
                    {activeProject && activeProject.fields.length > 0 ? '4' : '3'}
                  </div>
                  <div>
                    <h2 className="font-bold text-slate-900 text-base flex items-center gap-1.5">
                      Candidate CV / Document (PDF) <span className="text-rose-500 font-bold">*</span>
                    </h2>
                    <p className="text-xs text-slate-500">Mandatory attachment — auto-formatted and securely stored in Drive</p>
                  </div>
                </div>
                <span className="text-xs font-bold text-rose-700 bg-rose-50 px-2.5 py-1 rounded-full border border-rose-200">
                  Mandatory
                </span>
              </div>

              {/* Upload Drop Zone */}
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.doc,.docx"
                onChange={handleFileChange}
                className="hidden"
                id="cv-file-picker"
              />

              {!selectedFile ? (
                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-3 ${
                    isDragging
                      ? 'border-rose-500 bg-rose-50/80 scale-[1.01]'
                      : 'border-slate-300 hover:border-rose-400 hover:bg-slate-50'
                  }`}
                >
                  <div className="w-14 h-14 rounded-2xl bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center shadow-xs">
                    <UploadCloud className="w-7 h-7" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-800">
                      Click to choose candidate CV or drag & drop here <span className="text-rose-500 font-bold">*</span>
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      Supports PDF, DOC, DOCX files up to 25MB (Mandatory)
                    </p>
                  </div>
                  <button
                    type="button"
                    className="px-4 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-semibold rounded-lg text-xs transition-colors"
                  >
                    Browse Local File (Mandatory)
                  </button>
                </div>
              ) : (
                <div className="p-4 bg-blue-50/60 border border-blue-200 rounded-2xl flex items-center justify-between gap-4">
                  <div className="flex items-center space-x-3 truncate">
                    <div className="w-11 h-11 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0">
                      <FileText className="w-6 h-6" />
                    </div>
                    <div className="truncate">
                      <p className="text-sm font-bold text-slate-900 truncate">{selectedFile.name}</p>
                      <p className="text-xs text-slate-500">{(selectedFile.size / (1024 * 1024)).toFixed(2)} MB • Ready for Upload</p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={removeFile}
                    className="p-2 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors shrink-0"
                    title="Remove file"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              )}
            </div>

            {/* Feedback Alert */}
            {submissionFeedback && (
              <div className={`p-4 rounded-2xl flex items-start space-x-3 ${
                submissionFeedback.type === 'success'
                  ? 'bg-emerald-50 border border-emerald-200 text-emerald-900'
                  : 'bg-rose-50 border border-rose-200 text-rose-900'
              }`}>
                {submissionFeedback.type === 'success' ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                )}
                <div className="text-sm font-medium">
                  {submissionFeedback.message}
                </div>
              </div>
            )}

            {/* Submit Button */}
            <div className="flex items-center justify-end gap-4">
              <button
                type="submit"
                id="submit-candidate-btn"
                disabled={isSubmitting || !selectedRecruiter}
                className="w-full sm:w-auto px-8 py-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 text-white font-extrabold rounded-2xl shadow-lg shadow-blue-500/25 transition-all flex items-center justify-center gap-2 text-base cursor-pointer"
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="w-5 h-5 animate-spin" />
                    <span>Syncing & Registering Candidate...</span>
                  </>
                ) : (
                  <>
                    <FileUp className="w-5 h-5" />
                    <span>Submit & Archive Candidate</span>
                  </>
                )}
              </button>
            </div>

          </form>

        </div>

        {/* Right Column: Recruiter Activity & Summary (4 cols) */}
        <div className="lg:col-span-4 space-y-6">
          
          {/* Recruiter's Personal Submission History Card */}
          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <History className="w-4 h-4 text-indigo-600" />
                <h3 className="font-bold text-slate-900 text-sm">Your Recent Submissions</h3>
              </div>
              <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md">
                {myHistory.length}
              </span>
            </div>

            {myHistory.length === 0 ? (
              <div className="p-6 text-center text-slate-400 bg-slate-50 rounded-xl text-xs space-y-1">
                <FileText className="w-8 h-8 mx-auto text-slate-300 mb-1" />
                <p className="font-semibold text-slate-600">No submissions yet today</p>
                <p className="text-[11px]">Your candidate uploads for this project will appear here.</p>
              </div>
            ) : (
              <div className="space-y-2.5 max-h-[480px] overflow-y-auto pr-1">
                {myHistory.map((sub) => (
                  <div
                    key={sub.id || sub.passportNumber}
                    className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-xs text-slate-900 truncate">
                        {sub.candidateName}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-mono font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200/60">
                        {sub.passportNumber}
                      </span>
                      <span className="text-slate-500 font-medium flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-slate-400" />
                        {formatDisplayDateTime(sub.timestamp)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>

      </div>

      {/* Duplicate / Re-upload Confirmation Modal at Submit Step */}
      {showDuplicateModal && duplicateMatch && (
        <DuplicateModal
          existing={duplicateMatch}
          candidateName={candidateName}
          passportNumber={passportNumber}
          currentRecruiter={selectedRecruiter}
          isSubmitting={isSubmitting}
          onConfirmOverride={handleDuplicateOverrideConfirm}
          onCancel={() => {
            if (!isSubmitting) setShowDuplicateModal(false);
          }}
        />
      )}

      {/* Document Quick Preview Modal */}
      {previewDoc && (
        <DocPreviewModal
          submission={previewDoc}
          onClose={() => setPreviewDoc(null)}
        />
      )}

    </div>
  );
};
