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

  // 10. Timestamp
  if (/timestamp|submission.*date|date.*time|submitted.*at|created.*at|^date$/i.test(h)) {
    return 'timestamp';
  }

  // 11. Known skippable metadata
  if (/^id$|^row$|^index$|^serial$|^sl.*no$|^s.*no$|^score$/i.test(h)) {
    return 'skip';
  }

  // Default to custom field
  return 'custom';
}
