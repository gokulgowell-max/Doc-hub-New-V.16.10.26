/**
 * CSV and TSV parsing utility with RFC 4180 compliance
 * Handles multi-line quoted fields, escaped quotes, and delimiter autodetection
 */

export interface ParsedSheetData {
  headers: string[];
  rows: string[][];
  totalRows: number;
}

export type TargetFieldType =
  | 'candidateName'
  | 'passportNumber'
  | 'mobileNumber'
  | 'altMobileNumber'
  | 'emailId'
  | 'jobRole'
  | 'recruiter'
  | 'timestamp'
  | 'fileUrl'
  | 'remarks'
  | 'custom'
  | 'skip';

export interface HeaderMappingOption {
  key: TargetFieldType;
  label: string;
  required?: boolean;
  isCustom?: boolean;
}

export const TARGET_FIELD_OPTIONS: HeaderMappingOption[] = [
  { key: 'candidateName', label: 'Candidate Name *', required: true },
  { key: 'passportNumber', label: 'Passport Number *', required: true },
  { key: 'mobileNumber', label: 'Primary Mobile / Phone' },
  { key: 'altMobileNumber', label: 'Alternate Mobile / Phone' },
  { key: 'emailId', label: 'Email Address' },
  { key: 'jobRole', label: 'Job Role / Trade / Position' },
  { key: 'recruiter', label: 'Recruiter / Sourced By' },
  { key: 'timestamp', label: 'Submission Date / Timestamp' },
  { key: 'fileUrl', label: 'Document / CV Link (Google Drive)' },
  { key: 'remarks', label: 'Remarks / Notes' },
  { key: 'custom', label: 'Custom Project Field', isCustom: true },
  { key: 'skip', label: '-- Ignore / Skip Column --' }
];

/**
 * Robust CSV/TSV parser supporting quotes and multiple lines
 */
export function parseCsvText(rawText: string): ParsedSheetData {
  if (!rawText || !rawText.trim()) {
    return { headers: [], rows: [], totalRows: 0 };
  }

  // Remove Byte Order Mark (BOM) if present
  let text = rawText.replace(/^\uFEFF/, '').trim();

  // Detect delimiter: tab or comma or semicolon
  const firstLine = text.split(/\r\n|\n|\r/)[0] || '';
  const tabCount = (firstLine.match(/\t/g) || []).length;
  const commaCount = (firstLine.match(/,/g) || []).length;
  const semicolonCount = (firstLine.match(/;/g) || []).length;

  let delimiter = ',';
  if (tabCount > commaCount && tabCount > semicolonCount) {
    delimiter = '\t';
  } else if (semicolonCount > commaCount && semicolonCount > tabCount) {
    delimiter = ';';
  }

  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let insideQuotes = false;
  let i = 0;
  const len = text.length;

  while (i < len) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"') {
      if (insideQuotes && nextChar === '"') {
        // Escaped double quote inside quoted field: "" -> "
        currentField += '"';
        i += 2;
        continue;
      } else {
        // Toggle quotes
        insideQuotes = !insideQuotes;
        i++;
        continue;
      }
    }

    if (!insideQuotes && char === delimiter) {
      // Delimiter outside quotes: finish current cell
      currentRow.push(currentField.trim());
      currentField = '';
      i++;
      continue;
    }

    if (!insideQuotes && (char === '\n' || char === '\r')) {
      // Line break outside quotes: finish row
      if (char === '\r' && nextChar === '\n') {
        i++; // skip \r of \r\n
      }
      currentRow.push(currentField.trim());
      currentField = '';
      
      // Only push non-empty rows
      if (currentRow.some(cell => cell.length > 0)) {
        rows.push(currentRow);
      }
      currentRow = [];
      i++;
      continue;
    }

    // Regular character
    currentField += char;
    i++;
  }

  // Final field and row if any
  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField.trim());
    if (currentRow.some(cell => cell.length > 0)) {
      rows.push(currentRow);
    }
  }

  if (rows.length === 0) {
    return { headers: [], rows: [], totalRows: 0 };
  }

  // Row 0 is headers
  const headers = rows[0].map(h => (h || '').trim());
  const dataRows = rows.slice(1).map(row => {
    // Pad or trim to match headers count
    const padded = [...row];
    while (padded.length < headers.length) {
      padded.push('');
    }
    return padded.slice(0, headers.length);
  });

  return {
    headers,
    rows: dataRows,
    totalRows: dataRows.length
  };
}

/**
 * Intelligently suggests target field for a given column header
 */
export function detectHeaderMapping(header: string): TargetFieldType {
  const h = (header || '').toLowerCase().trim();

  // 1. Alternate Mobile (check before primary mobile!)
  if (/alt|alternate|alternative|secondary.*phone|secondary.*mob|emergency|second.*mob|second.*phone/i.test(h)) {
    return 'altMobileNumber';
  }

  // 2. Primary Mobile
  if (/mobile|phone|contact|whatsapp|cell|telephone|contact.*no/i.test(h)) {
    return 'mobileNumber';
  }

  // 3. Passport Number
  if (/passport|pass.*port|pp.*no|pp.*num|passport.*no|passport.*#|civil.*id|iqama/i.test(h)) {
    return 'passportNumber';
  }

  // 4. Candidate Name
  if (/candidate.*name|applicant.*name|full.*name|person.*name|worker.*name|candidate|applicant|student.*name|^name$/i.test(h)) {
    return 'candidateName';
  }

  // 5. Job Role / Trade
  if (/job.*role|role|trade|position|designation|applied.*for|profession|skill|category|occupation/i.test(h)) {
    return 'jobRole';
  }

  // 6. Recruiter Name
  if (/recruiter|agent|sourced.*by|intake.*by|consultant|hr|interviewer|coordinator|entered.*by/i.test(h)) {
    return 'recruiter';
  }

  // 7. CV / File Link
  if (/cv|resume|file|drive.*link|doc.*url|file.*url|upload|attachment|document|pdf.*url/i.test(h)) {
    return 'fileUrl';
  }

  // 8. Email
  if (/email|e-mail|mail/i.test(h)) {
    return 'emailId';
  }

  // 9. Remarks / Notes
  if (/remark|comment|note|feedback|status.*note|details/i.test(h)) {
    return 'remarks';
  }

  // 10. Timestamp / Submission Date
  if (/timestamp|time.*stamp|submission.*date|date.*submission|submitted|created.*at|created.*date|entry.*date|applied.*date|record.*date|^date$/i.test(h)) {
    return 'timestamp';
  }

  // 11. Known skippable metadata
  if (/^id$|^row$|^index$|^serial$|^sl.*no$|^s.*no$|^score$/i.test(h)) {
    return 'skip';
  }

  // Default to custom field
  return 'custom';
}

/**
 * Normalizes any date string (ISO, DD/MM/YYYY, MM/DD/YYYY, YYYY-MM-DD, AM/PM, or spreadsheet format)
 * into a valid ISO string. Returns empty string if unparseable (or current time if fallbackToNow is true).
 */
export function parseAndNormalizeTimestamp(rawDate: any, fallbackToNow: boolean = false): string {
  if (!rawDate) return fallbackToNow ? new Date().toISOString() : '';
  if (rawDate instanceof Date) {
    return isNaN(rawDate.getTime()) ? (fallbackToNow ? new Date().toISOString() : '') : rawDate.toISOString();
  }
  let str = String(rawDate).trim();
  if (!str) return fallbackToNow ? new Date().toISOString() : '';

  // 1. Numeric Excel / Google Sheets serial date (e.g. 45581 or 45581.5)
  if (/^\d{5}(?:\.\d+)?$/.test(str)) {
    const num = parseFloat(str);
    const date = new Date(Math.round((num - 25569) * 86400 * 1000));
    if (!isNaN(date.getTime()) && date.getFullYear() >= 1990 && date.getFullYear() <= 2100) {
      return date.toISOString();
    }
  }

  // Clean trailing commas or redundant spaces (e.g. "16/10/2024, 15:30:00")
  str = str.replace(/,\s*/g, ' ').replace(/\s+/g, ' ').trim();

  const nowLimit = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24-hour buffer for timezones

  // 2. Handle DD/MM/YYYY or MM/DD/YYYY with optional time and AM/PM
  const dmyMatch = str.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?(?:\s*(AM|PM))?)?/i);
  if (dmyMatch) {
    const p1 = parseInt(dmyMatch[1], 10);
    const p2 = parseInt(dmyMatch[2], 10);
    const year = parseInt(dmyMatch[3], 10);
    let hour = dmyMatch[4] ? parseInt(dmyMatch[4], 10) : 12;
    const min = dmyMatch[5] ? parseInt(dmyMatch[5], 10) : 0;
    const sec = dmyMatch[6] ? parseInt(dmyMatch[6], 10) : 0;
    const ampm = dmyMatch[7] ? dmyMatch[7].toUpperCase() : null;

    if (ampm === 'PM' && hour < 12) hour += 12;
    if (ampm === 'AM' && hour === 12) hour = 0;

    let day = p1;
    let month = p2 - 1;
    if (p1 > 12 && p2 <= 12) {
      // Must be DD/MM/YYYY
      day = p1;
      month = p2 - 1;
    } else if (p2 > 12 && p1 <= 12) {
      // Must be MM/DD/YYYY
      month = p1 - 1;
      day = p2;
    } else {
      // Standard international format default in recruitment (India / Gulf / UK): DD/MM/YYYY
      day = p1;
      month = p2 - 1;
    }

    let parsed = new Date(Date.UTC(year, month, day, hour, min, sec));
    // If parsed date is in the future (> nowLimit) and swapping produces a valid past date, swap them
    if (parsed > nowLimit && p2 <= 12 && p1 <= 12) {
      const alt = new Date(Date.UTC(year, p1 - 1, p2, hour, min, sec));
      if (!isNaN(alt.getTime()) && alt <= nowLimit) {
        parsed = alt;
      }
    }

    if (!isNaN(parsed.getTime()) && parsed.getUTCFullYear() >= 1990 && parsed.getUTCFullYear() <= 2100) {
      return parsed.toISOString();
    }
  }

  // 3. Handle YYYY/MM/DD, YYYY-MM-DD or full ISO strings
  const ymdMatch = str.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})(?:[T\s](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/i);
  if (ymdMatch) {
    const year = parseInt(ymdMatch[1], 10);
    let month = parseInt(ymdMatch[2], 10) - 1;
    let day = parseInt(ymdMatch[3], 10);
    let hour = ymdMatch[4] ? parseInt(ymdMatch[4], 10) : 12;
    let min = ymdMatch[5] ? parseInt(ymdMatch[5], 10) : 0;
    let sec = ymdMatch[6] ? parseInt(ymdMatch[6], 10) : 0;

    let parsed = new Date(Date.UTC(year, month, day, hour, min, sec));
    // Automatic correction for previously stored inverted ISO timestamps (e.g. 2026-12-10 when today is Oct 19, 2026)
    if (parsed > nowLimit && (month + 1) <= 12 && day <= 12) {
      const swapped = new Date(Date.UTC(year, day - 1, month + 1, hour, min, sec));
      if (!isNaN(swapped.getTime()) && swapped <= nowLimit) {
        parsed = swapped;
      }
    }

    if (!isNaN(parsed.getTime()) && parsed.getUTCFullYear() >= 1990 && parsed.getUTCFullYear() <= 2100) {
      return parsed.toISOString();
    }
  }

  // 4. Fallback to direct JavaScript Date parsing if valid year
  const directDate = new Date(str);
  if (!isNaN(directDate.getTime()) && directDate.getFullYear() >= 1990 && directDate.getFullYear() <= 2100) {
    if (directDate > nowLimit) {
      // Check if swapping month & day fixes future date
      const swapped = new Date(Date.UTC(directDate.getUTCFullYear(), directDate.getUTCDate() - 1, directDate.getUTCMonth() + 1, directDate.getUTCHours(), directDate.getUTCMinutes(), directDate.getUTCSeconds()));
      if (!isNaN(swapped.getTime()) && swapped <= nowLimit) {
        return swapped.toISOString();
      }
    }
    return directDate.toISOString();
  }

  return fallbackToNow ? new Date().toISOString() : '';
}

/**
 * Safely converts any timestamp (DD/MM/YYYY, ISO, raw string, Date) into milliseconds.
 * Always returns a valid number (0 instead of NaN), ensuring robust sorting and comparisons.
 */
export function getValidTimestampMs(rawDate: any): number {
  if (!rawDate) return 0;
  if (rawDate instanceof Date) {
    return isNaN(rawDate.getTime()) ? 0 : rawDate.getTime();
  }
  const norm = parseAndNormalizeTimestamp(rawDate, false);
  if (norm) {
    const d = new Date(norm);
    if (!isNaN(d.getTime())) return d.getTime();
  }
  const direct = new Date(String(rawDate).trim());
  return isNaN(direct.getTime()) ? 0 : direct.getTime();
}

/**
 * Robustly inspects an external sheet data row to locate and extract its genuine submission date.
 */
export function extractSubmissionDateFromRow(
  headers: string[],
  row: string[],
  mapping?: Record<number, string>
): string {
  // 1. Explicitly mapped 'timestamp' column
  if (mapping) {
    for (const [colIdxStr, target] of Object.entries(mapping)) {
      if (target === 'timestamp') {
        const colIdx = parseInt(colIdxStr, 10);
        if (row[colIdx]) {
          const parsed = parseAndNormalizeTimestamp(row[colIdx], false);
          if (parsed) return parsed;
        }
      }
    }
  }

  // 2. Header matching timestamp keywords
  for (let i = 0; i < headers.length; i++) {
    const h = (headers[i] || '').trim();
    if (/timestamp|time.*stamp|submission.*date|date.*submission|submitted|created.*at|created.*date|entry.*date|applied.*date|record.*date|^date$/i.test(h)) {
      if (row[i]) {
        const parsed = parseAndNormalizeTimestamp(row[i], false);
        if (parsed) return parsed;
      }
    }
  }

  // 3. Fallback: Scan row for any cell that has a valid date string
  for (let i = 0; i < row.length; i++) {
    const val = (row[i] || '').trim();
    if (val && val.length >= 8 && val.length <= 40) {
      if (/[\/\-\.]/.test(val) && /\d{4}|\d{2}/.test(val)) {
        const parsed = parseAndNormalizeTimestamp(val, false);
        if (parsed) return parsed;
      }
    }
  }

  return '';
}

/**
 * Checks whether a given timestamp falls on "Today" (matching either UTC or local timezone).
 */
export function isTodaySubmission(timestamp: string | undefined | null): boolean {
  if (!timestamp) return false;
  const now = new Date();
  const utcToday = now.toISOString().slice(0, 10);
  const localToday = now.toLocaleDateString('en-CA'); // YYYY-MM-DD format in local time

  const normIso = parseAndNormalizeTimestamp(timestamp, false);
  if (!normIso) return false;
  const subUtc = normIso.slice(0, 10);
  const subDateObj = new Date(normIso);
  const subLocal = isNaN(subDateObj.getTime()) ? '' : subDateObj.toLocaleDateString('en-CA');

  return (
    subUtc === utcToday ||
    subLocal === localToday ||
    subUtc === localToday ||
    subLocal === utcToday
  );
}

/**
 * Checks whether a given timestamp falls on "Yesterday" (matching either UTC or local timezone).
 */
export function isYesterdaySubmission(timestamp: string | undefined | null): boolean {
  if (!timestamp) return false;
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const yestUtc = yesterday.toISOString().slice(0, 10);
  const yestLocal = yesterday.toLocaleDateString('en-CA');

  const normIso = parseAndNormalizeTimestamp(timestamp, false);
  if (!normIso) return false;
  const subUtc = normIso.slice(0, 10);
  const subDateObj = new Date(normIso);
  const subLocal = isNaN(subDateObj.getTime()) ? '' : subDateObj.toLocaleDateString('en-CA');

  return (
    subUtc === yestUtc ||
    subLocal === yestLocal ||
    subUtc === yestLocal ||
    subLocal === yestUtc
  );
}
