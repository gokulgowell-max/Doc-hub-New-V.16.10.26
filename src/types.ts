export type FieldType = 'text' | 'number' | 'date' | 'select' | 'dropdown' | 'textarea' | 'email' | 'tel' | string;

export interface ProjectField {
  id: string;
  label: string;
  type: FieldType;
  required?: boolean;
  options?: string[]; // For 'select' type
  placeholder?: string;
}

export interface Project {
  name: string;
  sheetUrl?: string;
  folderUrl?: string;
  submission: 'Active' | 'Inactive';
  status: 'Open' | 'Closed';
  jobRoles?: string[];
  fields: ProjectField[];
  todaySubmissions?: number;
  totalSubmissions?: number;
  description?: string;
  created_at?: string;
  columnMapping?: Record<string, string>;
}

export interface CandidateSubmission {
  id?: string;
  timestamp: string;
  project: string;
  recruiter: string;
  candidateName: string;
  passportNumber: string;
  mobileNumber?: string;
  altMobileNumber?: string;
  emailId?: string;
  jobRole?: string;
  remarks?: string;
  fileUrl?: string;
  directFileUrl?: string;
  fileName?: string;
  dynamicAnswers?: Record<string, any>;
  answers?: Record<string, any>;
  allCells?: any[];
  status?: 'Verified' | 'Pending' | 'Flagged';
  [key: string]: any;
}

export interface RecruiterPerformance {
  name: string;
  today: number;
  yesterday: number;
  total: number;
}

export interface BackendConfig {
  gasWebAppUrl: string;
  useProxy: boolean;
  passcode: string;
  docPasscode?: string;
  teamEmails: string[];
  autoSyncEnabled?: boolean;
  autoSyncInterval?: number; // in seconds, default 15
}

export interface AutoSyncState {
  isSyncing: boolean;
  lastSyncTime: string | null;
  status: 'idle' | 'syncing' | 'success' | 'error';
  lastError?: string;
  syncedCount?: number;
  projectCount?: number;
  syncSource?: string;
}

export interface ConnectionStatus {
  gas: 'connected' | 'error' | 'testing' | 'offline';
  lastChecked: string;
  message?: string;
}
