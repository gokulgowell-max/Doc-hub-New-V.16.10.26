/**
 * Date Formatting Utility
 * Enforces clean DD/MM/YYYY format across all candidate records, intake questions, and timestamps.
 */

export function formatDisplayDate(val: any, fieldName?: string): string {
  if (val === null || val === undefined || val === '') return '—';

  // Handle Date objects
  if (val instanceof Date) {
    if (isNaN(val.getTime())) return '—';
    const day = String(val.getDate()).padStart(2, '0');
    const month = String(val.getMonth() + 1).padStart(2, '0');
    const year = val.getFullYear();
    return `${day}/${month}/${year}`;
  }

  // Handle array / object values safely
  if (typeof val === 'object') {
    try {
      if (Array.isArray(val)) {
        return val.map(v => formatDisplayDate(v, fieldName)).join(', ');
      }
      return JSON.stringify(val);
    } catch {
      return String(val);
    }
  }

  const str = String(val).trim();
  if (!str) return '—';

  // Already in DD/MM/YYYY or DD-MM-YYYY format
  if (/^\d{1,2}[\/\.-]\d{1,2}[\/\.-]\d{4}$/.test(str)) {
    const parts = str.split(/[\/\.-]/);
    const d = parts[0].padStart(2, '0');
    const m = parts[1].padStart(2, '0');
    const y = parts[2];
    return `${d}/${m}/${y}`;
  }

  // Pure YYYY-MM-DD string
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    const [y, m, d] = str.split('-');
    return `${d.padStart(2, '0')}/${m.padStart(2, '0')}/${y}`;
  }

  // ISO string e.g. 1998-06-15T18:30:00.000Z or similar
  const isIsoString = /^\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}:\d{2}/.test(str);
  const isDateField = fieldName && /(date|dob|birth|joining|expiry|validity|passport_expiry|timestamp)/i.test(fieldName);

  if (isIsoString || isDateField) {
    const d = new Date(str);
    if (!isNaN(d.getTime())) {
      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const year = d.getFullYear();
      return `${day}/${month}/${year}`;
    }
  }

  return str;
}

export function formatDisplayDateTime(val: any): string {
  if (!val) return '—';
  const d = new Date(val);
  if (isNaN(d.getTime())) return String(val);

  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return `${day}/${month}/${year} ${time}`;
}

export function formatTimeAgo(val: any): string {
  if (!val) return 'never';
  const d = new Date(val);
  if (isNaN(d.getTime())) return 'recently';
  
  const diffSec = Math.floor((Date.now() - d.getTime()) / 1000);
  if (diffSec < 5) return 'just now';
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return formatDisplayDate(d);
}

/**
 * Converts any date representation (DD/MM/YYYY, ISO, timestamp, Date object)
 * into a valid HTML5 input date value (YYYY-MM-DD).
 */
export function toDateInputValue(val: any): string {
  if (val === null || val === undefined || val === '') return '';

  if (val instanceof Date) {
    if (isNaN(val.getTime())) return '';
    const y = val.getFullYear();
    const m = String(val.getMonth() + 1).padStart(2, '0');
    const d = String(val.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  const str = String(val).trim();
  if (!str) return '';

  // Already in YYYY-MM-DD format
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return str;
  }

  // In DD/MM/YYYY or DD-MM-YYYY format
  if (/^\d{1,2}[\/\.-]\d{1,2}[\/\.-]\d{4}$/.test(str)) {
    const parts = str.split(/[\/\.-]/);
    const d = parts[0].padStart(2, '0');
    const m = parts[1].padStart(2, '0');
    const y = parts[2];
    return `${y}-${m}-${d}`;
  }

  // Parse generic date or ISO string
  const d = new Date(str);
  if (!isNaN(d.getTime())) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  return '';
}

