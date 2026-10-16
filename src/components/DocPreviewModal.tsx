import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { 
  X, 
  FileText, 
  ExternalLink, 
  User, 
  Calendar, 
  Briefcase, 
  Copy, 
  Check, 
  Printer, 
  Phone, 
  FileCheck,
  Download,
  Trash2,
  Loader2
} from 'lucide-react';
import { CandidateSubmission } from '../types';
import { apiService } from '../services/apiService';
import { formatDisplayDate, formatDisplayDateTime } from '../utils/dateUtils';

interface DocPreviewModalProps {
  submission: CandidateSubmission | null;
  onClose: () => void;
  onDelete?: (submission: CandidateSubmission) => void;
}

// Helper to extract Google Drive File ID from any string
const extractDriveId = (text: string): string => {
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

export const DocPreviewModal: React.FC<DocPreviewModalProps> = ({ submission, onClose, onDelete }) => {
  const [copied, setCopied] = useState(false);
  const [copiedDocUrl, setCopiedDocUrl] = useState(false);

  useEffect(() => {
    if (!submission) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    const origOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = origOverflow;
    };
  }, [submission, onClose]);

  // Compute initially found Drive ID
  const rawUrl = (submission?.fileUrl || '').trim();
  let foundDriveId = extractDriveId(rawUrl);
  if (!foundDriveId && submission?.directFileUrl) foundDriveId = extractDriveId(submission.directFileUrl);
  if (!foundDriveId && submission?.mobileNumber) foundDriveId = extractDriveId(submission.mobileNumber);
  if (!foundDriveId && submission?.altMobileNumber) foundDriveId = extractDriveId(submission.altMobileNumber);
  if (!foundDriveId && submission?.dynamicAnswers) {
    for (const val of Object.values(submission.dynamicAnswers)) {
      if (typeof val === 'string') {
        foundDriveId = extractDriveId(val);
        if (foundDriveId) break;
      }
    }
  }

  // Check synchronous candidate cache across projects
  if (!foundDriveId && submission) {
    const cachedUrl = apiService.findCandidateDriveUrl(submission.project, submission.passportNumber, submission.candidateName);
    if (cachedUrl) {
      foundDriveId = extractDriveId(cachedUrl);
    }
  }

  const [resolvedDriveId, setResolvedDriveId] = useState<string>(foundDriveId);
  const [isResolving, setIsResolving] = useState<boolean>(false);

  useEffect(() => {
    if (!submission) return;

    let currentId = extractDriveId(submission.fileUrl || submission.directFileUrl || '');
    if (!currentId) {
      const cached = apiService.findCandidateDriveUrl(submission.project, submission.passportNumber, submission.candidateName);
      if (cached) currentId = extractDriveId(cached);
    }

    if (currentId) {
      setResolvedDriveId(currentId);
      setIsResolving(false);
      return;
    }

    let isCancelled = false;
    setIsResolving(true);

    const timer = setTimeout(() => {
      if (!isCancelled) setIsResolving(false);
    }, 4000);

    apiService.resolveCandidateFileUrl(submission.project, submission.passportNumber, submission.candidateName)
      .then((url) => {
        if (!isCancelled && url) {
          const directId = extractDriveId(url);
          if (directId) setResolvedDriveId(directId);
        }
      })
      .catch(console.warn)
      .finally(() => {
        clearTimeout(timer);
        if (!isCancelled) setIsResolving(false);
      });

    return () => {
      isCancelled = true;
      clearTimeout(timer);
    };
  }, [submission?.project, submission?.passportNumber, submission?.candidateName, submission?.fileUrl, submission?.id]);

  if (!submission) return null;

  const activeDriveId = resolvedDriveId || foundDriveId;

  // 2. Base64 Data URI check
  let base64DataUri = '';
  if (submission.directFileUrl && submission.directFileUrl.startsWith('data:')) {
    base64DataUri = submission.directFileUrl;
  } else if (rawUrl && rawUrl.startsWith('data:')) {
    base64DataUri = rawUrl;
  }

  // 3. Build candidate-specific direct document URL
  const cleanPassport = (submission.passportNumber || '').trim();
  const cleanCandidate = (submission.candidateName || '').trim();
  const candidateDriveSearchUrl = `https://drive.google.com/drive/search?q=${encodeURIComponent(cleanPassport ? `"${cleanPassport}"` : `"${cleanCandidate}"`)}`;

  let directDocumentUrl = '';
  let docBadge = 'Candidate Document';
  let isDataUri = false;

  if (base64DataUri) {
    directDocumentUrl = base64DataUri;
    isDataUri = true;
    docBadge = 'Attached Document';
  } else if (activeDriveId) {
    directDocumentUrl = `https://drive.google.com/file/d/${activeDriveId}/view?usp=sharing`;
    docBadge = 'Drive PDF Document';
  } else if (rawUrl && (rawUrl.startsWith('http://') || rawUrl.startsWith('https://')) && !rawUrl.includes('/folders/') && !rawUrl.includes('storage.googleapis.com')) {
    directDocumentUrl = rawUrl;
    docBadge = 'Document File';
  } else {
    directDocumentUrl = candidateDriveSearchUrl;
    docBadge = isResolving ? 'Locating PDF...' : 'Drive Document';
  }

  const handleOpenDocument = () => {
    if (base64DataUri) {
      try {
        const parts = base64DataUri.split(',');
        const mimeMatch = parts[0].match(/data:(.*?);/);
        const mimeType = mimeMatch ? mimeMatch[1] : 'application/pdf';
        const byteCharacters = atob(parts[1]);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: mimeType });
        const blobUrl = URL.createObjectURL(blob);
        window.open(blobUrl, '_blank');
        return;
      } catch (err) {
        console.warn('Blob generation error, opening data URI directly', err);
      }
    }
    if (directDocumentUrl) {
      window.open(directDocumentUrl, '_blank');
    }
  };

  const handleCopySummary = () => {
    const jobRole = submission.jobRole || (submission.dynamicAnswers?.['job_role'] as string) || (submission.dynamicAnswers?.['Job Role'] as string) || '';
    const altMob = submission.altMobileNumber || (submission.dynamicAnswers?.['alt_mobile_number'] as string) || (submission.dynamicAnswers?.['Alt Mobile'] as string) || '';
    const email = submission.emailId || (submission.dynamicAnswers?.['email_id'] as string) || (submission.dynamicAnswers?.['Email ID'] as string) || '';

    const dynamicFormatted = submission.dynamicAnswers && Object.keys(submission.dynamicAnswers).length > 0
      ? Object.entries(submission.dynamicAnswers)
          .map(([k, v]) => `${k.replace(/_/g, ' ').padEnd(16)}: ${formatDisplayDate(v, k)}`)
          .join('\n')
      : 'None';

    const text = `--- CANDIDATE SUBMISSION DOSSIER ---
Candidate Name : ${submission.candidateName}
Passport Number: ${submission.passportNumber}
Job Role / Trade: ${jobRole || 'General'}
Target Project : ${submission.project}
Recruiter      : ${submission.recruiter}
Primary Mobile : ${submission.mobileNumber || 'N/A'}
Alt Mobile No. : ${altMob || 'N/A'}
Email ID       : ${email || 'N/A'}
Submission Time: ${formatDisplayDateTime(submission.timestamp)}
--- QUESTIONNAIRE RESPONSES ---
${dynamicFormatted}
${submission.remarks ? `--- REMARKS ---\n${submission.remarks}\n` : ''}${directDocumentUrl ? `--- DOCUMENT LINK ---\n${directDocumentUrl}\n` : ''}-----------------------------------`;

    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyDocUrl = () => {
    if (!directDocumentUrl) return;
    navigator.clipboard.writeText(directDocumentUrl);
    setCopiedDocUrl(true);
    setTimeout(() => setCopiedDocUrl(false), 2000);
  };

  const handlePrintDossier = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      window.print();
      return;
    }

    const jobRole = submission.jobRole || (submission.dynamicAnswers?.['job_role'] as string) || (submission.dynamicAnswers?.['Job Role'] as string) || 'General';
    const altMob = submission.altMobileNumber || (submission.dynamicAnswers?.['alt_mobile_number'] as string) || (submission.dynamicAnswers?.['Alt Mobile'] as string) || 'Not Provided';
    const email = submission.emailId || (submission.dynamicAnswers?.['email_id'] as string) || (submission.dynamicAnswers?.['Email ID'] as string) || 'Not Provided';

    const dynHtml = submission.dynamicAnswers && Object.keys(submission.dynamicAnswers).length > 0
      ? Object.entries(submission.dynamicAnswers).map(([k, v]) => `
        <tr>
          <td style="padding: 8px 12px; border: 1px solid #e2e8f0; font-weight: 600; text-transform: capitalize; color: #475569; width: 40%;">${k.replace(/_/g, ' ')}</td>
          <td style="padding: 8px 12px; border: 1px solid #e2e8f0; font-weight: 700; color: #0f172a;">${formatDisplayDate(v, k)}</td>
        </tr>
      `).join('')
      : '<tr><td colspan="2" style="padding: 8px 12px; border: 1px solid #e2e8f0; color: #64748b; font-style: italic;">No additional questions configured.</td></tr>';

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Candidate Dossier - ${submission.candidateName} (${submission.passportNumber})</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; padding: 30px; color: #1e293b; }
            .header { border-bottom: 3px solid #2563eb; padding-bottom: 12px; margin-bottom: 24px; display: flex; justify-content: space-between; align-items: flex-end; }
            .title { font-size: 24px; font-weight: 900; color: #0f172a; margin: 0; }
            .subtitle { font-size: 13px; color: #64748b; margin-top: 4px; }
            .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; margin-bottom: 24px; }
            .card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; }
            .label { font-size: 10px; font-weight: 700; text-transform: uppercase; color: #64748b; margin-bottom: 4px; }
            .value { font-size: 14px; font-weight: 800; color: #0f172a; }
            .passport { font-family: monospace; color: #1d4ed8; letter-spacing: 1px; }
            table { width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 13px; }
            .remarks { background: #fffbeb; border: 1px solid #fef3c7; padding: 14px; border-radius: 8px; margin-top: 20px; font-size: 13px; }
            .footer { margin-top: 40px; border-top: 1px solid #e2e8f0; padding-top: 12px; font-size: 11px; color: #94a3b8; display: flex; justify-content: space-between; }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <h1 class="title">${submission.candidateName}</h1>
              <div class="subtitle">Recruitment Document Dossier & Intake Record</div>
            </div>
            <div style="text-align: right;">
              <span style="display: inline-block; background: #dbeafe; color: #1e40af; border: 1px solid #bfdbfe; font-size: 12px; font-weight: 800; padding: 4px 10px; border-radius: 6px;">
                ${submission.project} • ${jobRole}
              </span>
            </div>
          </div>

          <div class="grid">
            <div class="card">
              <div class="label">Passport Number</div>
              <div class="value passport">${submission.passportNumber}</div>
            </div>
            <div class="card">
              <div class="label">Job Role / Trade</div>
              <div class="value" style="color: #2563eb;">${jobRole}</div>
            </div>
            <div class="card">
              <div class="label">Recruiter / Officer</div>
              <div class="value">${submission.recruiter}</div>
            </div>
            <div class="card">
              <div class="label">Primary Mobile</div>
              <div class="value">${submission.mobileNumber || 'Not Provided'}</div>
            </div>
            <div class="card">
              <div class="label">Alternative Mobile</div>
              <div class="value">${altMob}</div>
            </div>
            <div class="card">
              <div class="label">Email ID</div>
              <div class="value">${email}</div>
            </div>
            <div class="card" style="grid-column: span 3;">
              <div class="label">Submission Date & Time</div>
              <div class="value" style="font-size: 13px;">${formatDisplayDateTime(submission.timestamp)}</div>
            </div>
          </div>

          <h3 style="font-size: 14px; font-weight: 800; text-transform: uppercase; color: #334155; margin-bottom: 0;">Project Questionnaire Information</h3>
          <table>
            <thead>
              <tr style="background: #f1f5f9;">
                <th style="padding: 8px 12px; border: 1px solid #e2e8f0; text-align: left; font-size: 11px; text-transform: uppercase; color: #475569;">Question / Field</th>
                <th style="padding: 8px 12px; border: 1px solid #e2e8f0; text-align: left; font-size: 11px; text-transform: uppercase; color: #475569;">Candidate Response</th>
              </tr>
            </thead>
            <tbody>
              ${dynHtml}
            </tbody>
          </table>

          ${submission.remarks ? `
            <div class="remarks">
              <strong style="color: #92400e; display: block; margin-bottom: 4px; font-size: 11px; text-transform: uppercase;">Recruiter Remarks:</strong>
              ${submission.remarks}
            </div>
          ` : ''}

          ${directDocumentUrl ? `
            <div style="margin-top: 20px; font-size: 12px; color: #475569;">
              <strong>Document Reference:</strong> <span style="font-family: monospace; color: #2563eb;">${directDocumentUrl}</span>
            </div>
          ` : ''}

          <div class="footer">
            <span>Verified System Intake Record • ID: ${submission.id || submission.passportNumber}</span>
            <span>Printed on ${new Date().toLocaleString()}</span>
          </div>
          <script>window.onload = function() { window.print(); };</script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const candidateName = String(submission.candidateName || 'Candidate');
  const passportNumber = String(submission.passportNumber || 'N/A');
  const projectName = String(submission.project || 'General');
  const recruiterName = String(submission.recruiter || 'Recruiter');
  const jobRoleName = String(submission.jobRole || (submission.dynamicAnswers?.['job_role']) || (submission.dynamicAnswers?.['Job Role']) || '');
  const altMobileNum = String(submission.altMobileNumber || (submission.dynamicAnswers?.['alt_mobile_number']) || (submission.dynamicAnswers?.['Alt Mobile']) || '');
  const emailAddress = String(submission.emailId || (submission.dynamicAnswers?.['email_id']) || (submission.dynamicAnswers?.['Email ID']) || '');
  const avatarChar = (candidateName.trim().charAt(0) || 'C').toUpperCase();

  return createPortal(
    <div
      className="fixed inset-0 z-[99999] flex items-center justify-center p-3 sm:p-5 bg-slate-950/80 backdrop-blur-xs overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div 
        className="relative w-full max-w-3xl my-auto bg-white rounded-2xl sm:rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        
        {/* Modal Top Header */}
        <div className="flex items-center justify-between px-5 sm:px-6 py-4 bg-slate-900 text-white shrink-0">
          <div className="flex items-center space-x-3.5 min-w-0">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center font-extrabold text-lg shadow-sm shrink-0">
              {avatarChar}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-extrabold text-base sm:text-lg leading-tight text-white truncate">
                  {candidateName}
                </h3>
                <span className="bg-blue-500/20 text-blue-300 border border-blue-400/30 px-2 py-0.5 rounded text-[11px] font-mono font-bold shrink-0">
                  {passportNumber}
                </span>
                {jobRoleName && (
                  <span className="bg-amber-500/20 text-amber-300 border border-amber-400/30 px-2 py-0.5 rounded text-[11px] font-bold shrink-0">
                    {jobRoleName}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-300 truncate mt-0.5">
                Project: <strong className="text-white">{projectName}</strong>
                <span className="mx-1.5 text-slate-500">•</span>
                Recruiter: <strong className="text-slate-200">{recruiterName}</strong>
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={handleCopySummary}
              title="Copy candidate details"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl transition-colors cursor-pointer"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copied' : 'Copy'}</span>
            </button>
            <button
              type="button"
              onClick={handlePrintDossier}
              title="Print full candidate dossier"
              className="p-2 text-slate-300 hover:text-white hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
            >
              <Printer className="w-4 h-4" />
            </button>
            <button 
              id="close-doc-preview-btn"
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              title="Close preview (Esc)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body Container */}
        <div className="p-5 sm:p-6 overflow-y-auto flex-1 space-y-5">
          
          {/* Direct Candidate Document Banner Card */}
          <div className="p-4 sm:p-5 bg-gradient-to-r from-blue-50 via-indigo-50 to-slate-50 border border-blue-200 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-2xs">
            <div className="flex items-center space-x-3.5 min-w-0">
              <div className="w-11 h-11 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-md shadow-blue-500/20 shrink-0">
                <FileText className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h4 className="font-extrabold text-slate-900 text-sm truncate max-w-sm">
                    {submission.fileName || `${submission.candidateName} ${submission.passportNumber}.pdf`}
                  </h4>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-200 shrink-0">
                    {docBadge}
                  </span>
                </div>
                <p className="text-xs text-slate-600 mt-0.5">
                  Click to open and view the candidate&apos;s original document file directly
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto">
              {isResolving ? (
                <div className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-blue-100/90 text-blue-800 text-xs font-bold rounded-xl border border-blue-200 shadow-2xs">
                  <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />
                  <span>Loading PDF...</span>
                </div>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={handleOpenDocument}
                    id="open-candidate-doc-btn"
                    className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-extrabold rounded-xl shadow-md shadow-blue-600/20 transition-all cursor-pointer"
                    title="Open candidate document directly in a new tab"
                  >
                    <FileText className="w-4 h-4 text-blue-200" />
                    <span>Open Document</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </button>

                  {directDocumentUrl && !isDataUri && (
                    <button
                      type="button"
                      onClick={handleCopyDocUrl}
                      title="Copy Document Link"
                      className="p-2.5 bg-white hover:bg-slate-100 text-slate-700 rounded-xl border border-slate-300 shadow-2xs transition-colors cursor-pointer"
                    >
                      {copiedDocUrl ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                    </button>
                  )}
                </>
              )}
            </div>
          </div>


          {/* Mandatory & Core Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {/* Job Role */}
            <div className="p-3.5 bg-blue-50/70 border border-blue-200 rounded-xl space-y-1">
              <span className="text-[11px] font-bold text-blue-700 uppercase tracking-wider block flex items-center gap-1.5">
                <Briefcase className="w-3.5 h-3.5 text-blue-600" /> Job Role / Trade
              </span>
              <p className="text-sm font-extrabold text-blue-950 truncate">
                {jobRoleName || 'General'}
              </p>
            </div>

            {/* Target Project */}
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block flex items-center gap-1.5">
                <Briefcase className="w-3.5 h-3.5 text-slate-600" /> Target Project
              </span>
              <p className="text-sm font-extrabold text-slate-900 truncate" title={submission.project}>
                {submission.project}
              </p>
            </div>

            {/* Recruiter */}
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-indigo-600" /> Recruiter
              </span>
              <p className="text-sm font-extrabold text-slate-900 truncate">
                {submission.recruiter}
              </p>
            </div>

            {/* Primary Mobile */}
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5 text-emerald-600" /> Primary Mobile
              </span>
              <p className="text-xs font-mono font-extrabold text-slate-900">
                {submission.mobileNumber || 'Not provided'}
              </p>
            </div>

            {/* Alt Mobile */}
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5 text-amber-600" /> Alt: Mobile No.
              </span>
              <p className="text-xs font-mono font-extrabold text-slate-900">
                {altMobileNum || 'Not provided'}
              </p>
            </div>

            {/* Email ID */}
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-purple-600" /> Email ID
              </span>
              <p className="text-xs font-bold text-slate-900 truncate" title={emailAddress}>
                {emailAddress || 'Not provided'}
              </p>
            </div>
          </div>

          {/* Dynamic Project Answers Breakdown */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-2xs space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h4 className="font-extrabold text-xs text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                <FileCheck className="w-4 h-4 text-blue-600" /> Project Intake Questionnaire Responses
              </h4>
              <span className="text-xs text-slate-500 font-semibold">
                {submission.dynamicAnswers ? Object.keys(submission.dynamicAnswers).length : 0} Field(s)
              </span>
            </div>

            {submission.dynamicAnswers && Object.keys(submission.dynamicAnswers).length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                {Object.entries(submission.dynamicAnswers).map(([key, val]) => (
                  <div key={key} className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                    <span className="text-[11px] font-bold text-slate-500 block uppercase tracking-wider">
                      {key.replace(/_/g, ' ')}
                    </span>
                    <span className="text-sm font-extrabold text-slate-900 block font-mono">
                      {formatDisplayDate(val, key)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-5 text-center text-slate-400 text-xs bg-slate-50 rounded-xl border border-dashed border-slate-200">
                No custom questionnaire responses attached to this submission.
              </div>
            )}
          </div>

          {/* Recruiter Remarks if Available */}
          {submission.remarks && (
            <div className="p-4 bg-amber-50/80 border border-amber-200 rounded-2xl text-xs space-y-1.5">
              <h4 className="font-extrabold text-amber-900 uppercase tracking-wider flex items-center gap-1.5">
                <span>Recruiter Notes & Remarks</span>
              </h4>
              <p className="text-amber-950 font-medium whitespace-pre-wrap leading-relaxed">
                {submission.remarks}
              </p>
            </div>
          )}

        </div>

        {/* Modal Footer Bar */}
        <div className="flex items-center justify-between px-6 py-3.5 bg-slate-50 border-t border-slate-200 shrink-0">
          <span className="text-xs text-slate-500 font-mono">
            Submission ID: {submission.id || submission.passportNumber}
          </span>
          
          <div className="flex items-center gap-2">
            {onDelete && (
              <button
                type="button"
                onClick={() => {
                  onDelete(submission);
                  onClose();
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold rounded-xl border border-rose-200 transition-colors cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleOpenDocument}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition-colors cursor-pointer shadow-xs"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Open Document</span>
              <ExternalLink className="w-3 h-3" />
            </button>

            <button
              onClick={onClose}
              className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-extrabold rounded-xl transition-colors cursor-pointer shadow-xs"
            >
              Close
            </button>
          </div>
        </div>

      </div>
    </div>,
    document.body
  );
};
