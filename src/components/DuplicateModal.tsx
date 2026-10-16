import React, { useEffect } from 'react';
import { User, Calendar, Check, X, RefreshCw, Briefcase } from 'lucide-react';
import { CandidateSubmission } from '../types';
import { formatDisplayDateTime } from '../utils/dateUtils';

interface DuplicateModalProps {
  existing: CandidateSubmission;
  candidateName: string;
  passportNumber: string;
  currentRecruiter: string;
  isSubmitting?: boolean;
  onConfirmOverride: () => void;
  onCancel: () => void;
}

export const DuplicateModal: React.FC<DuplicateModalProps> = ({
  existing,
  candidateName,
  passportNumber,
  currentRecruiter,
  isSubmitting = false,
  onConfirmOverride,
  onCancel
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', handleKeyDown);
    const origOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = origOverflow;
    };
  }, [onCancel]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/80 backdrop-blur-xs overflow-y-auto animate-fadeIn"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="relative w-full max-w-lg my-auto bg-white rounded-2xl sm:rounded-3xl shadow-2xl border border-indigo-200 overflow-hidden flex flex-col max-h-[85vh] sm:max-h-[90vh]">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-700 to-indigo-700 px-5 sm:px-6 py-4 text-white flex items-center space-x-3 shrink-0">
          <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center shrink-0">
            <RefreshCw className="w-5 h-5 text-white" />
          </div>
          <div className="min-w-0">
            <h3 className="font-bold text-base sm:text-lg leading-tight">Confirm Candidate Re-upload</h3>
            <p className="text-xs text-blue-100">Passport Number: <span className="font-mono font-bold">{passportNumber}</span></p>
          </div>
        </div>

        {/* Content */}
        <div className="p-5 sm:p-6 space-y-4 overflow-y-auto flex-1">
          <p className="text-sm text-slate-700 leading-relaxed">
            You previously submitted this candidate for project <strong className="text-slate-900 font-semibold">{existing.project}</strong>. As the original uploader, you have permission to rewrite this record.
          </p>

          <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-2.5">
            <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              Previous Submission Details
            </div>
            
            <div className="flex items-center text-xs text-slate-700 justify-between">
              <span className="flex items-center gap-1.5 text-slate-500">
                <User className="w-3.5 h-3.5 text-slate-400" /> Candidate Name:
              </span>
              <span className="font-bold text-slate-900">{existing.candidateName}</span>
            </div>

            <div className="flex items-center text-xs text-slate-700 justify-between">
              <span className="flex items-center gap-1.5 text-slate-500">
                <Briefcase className="w-3.5 h-3.5 text-slate-400" /> Original Recruiter:
              </span>
              <span className="font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">
                {existing.recruiter} (You)
              </span>
            </div>

            <div className="flex items-center text-xs text-slate-700 justify-between">
              <span className="flex items-center gap-1.5 text-slate-500">
                <Calendar className="w-3.5 h-3.5 text-slate-400" /> Upload Date:
              </span>
              <span className="font-medium text-slate-800">
                {formatDisplayDateTime(existing.timestamp)}
              </span>
            </div>
          </div>

          <div className="p-3.5 bg-blue-50/80 border border-blue-200 rounded-xl text-xs text-blue-900 space-y-1">
            <span className="font-bold block">What will happen on confirmation?</span>
            <p className="text-slate-600 leading-normal">
              Your previous candidate record and stored CV file will be replaced and updated with your newly entered details and uploaded document for <strong className="text-slate-800">{candidateName}</strong>.
            </p>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-5 sm:px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-3 shrink-0">
          <button
            type="button"
            id="duplicate-cancel-btn"
            disabled={isSubmitting}
            onClick={onCancel}
            className="px-4 py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-50 text-slate-700 text-sm font-semibold transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <X className="w-4 h-4" /> Cancel
          </button>
          
          <button
            type="button"
            id="duplicate-override-btn"
            disabled={isSubmitting}
            onClick={onConfirmOverride}
            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 text-white text-sm font-bold shadow-md transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            {isSubmitting ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" /> Uploading & Updating...
              </>
            ) : (
              <>
                <Check className="w-4 h-4" /> Re-upload & Overwrite Submission
              </>
            )}
          </button>
        </div>

      </div>
    </div>
  );
};

