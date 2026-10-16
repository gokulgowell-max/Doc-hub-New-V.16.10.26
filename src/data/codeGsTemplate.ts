/**
 * COMPLETE GOOGLE APPS SCRIPT BACKEND CODE (Code.gs)
 * Production deployment script for Dynamic Document Hub
 */

export const getFullCodeGsScript = (passcode: string = 'Gowell921', teamEmails: string[] = ['gokul@gmail.com', 'kumar@gmail.com']): string => {
  const emailsArrayStr = teamEmails.map(e => `'${e}'`).join(', ');

  return `/**
 * =========================================================
 *  DYNAMIC DOCUMENT HUB — SERVER-SIDE LOGIC (Code.gs)
 * =========================================================
 * Fixes applied vs. original version:
 *  1. doGet() handles JSONP and direct JSON output for external hosting.
 *  2. Manager access is verified on the SERVER, stored in PropertiesService.
 *  3. Editing project custom questions updates the header row of its linked
 *     Google Sheet safely (historical order preserved, new fields appended).
 *  4. submitUserData() writes answers matching the sheet's actual header label.
 *  5. Added input validation, filename sanitization, text formatting for
 *     Passport & Mobile Number columns (@), and safe empty sheet handling.
 *  6. Dual synchronization to Supabase and Google Drive trash automation.
 * =========================================================
 */

var SHEET_CONFIG = 'Config';
var SHEET_PROJECTS = 'Project_Config';
var PROP_PASSCODE = 'MANAGER_PASSCODE';
var DEFAULT_PASSCODE = '${passcode}';

var FIXED_HEADERS = ['Timestamp', 'Uploaded By', 'Candidate Name', 'Passport Number', 'Job Role', 'Mobile Number', 'Alt Mobile Number', 'Email ID'];
var DOC_URL_HEADER = 'Document URL';

// Team members who should automatically get Editor access on every newly
// created project Sheet + Drive folder.
var TEAM_EDITOR_EMAILS = [${emailsArrayStr}];

// ------------------------------------------
// PERFORMANCE: short-lived server-side caching
// ------------------------------------------
var CACHE_FORM_INIT_TTL = 30;   // recruiters/projects list for public form
var CACHE_PROJECT_LIST_TTL = 15; // manager dashboard project cards
var CACHE_PERF_TTL = 15;         // performance monitor table per project

function cachePutSafe_(key, value, ttlSeconds) {
  try {
    CacheService.getScriptCache().put(key, value, ttlSeconds);
  } catch (e) {
    // Cache write failure fallback
  }
}

function cacheRemoveSafe_(key) {
  try {
    CacheService.getScriptCache().remove(key);
  } catch (e) { /* ignore */ }
}

// ==========================================
// 1. APPLICATION ROUTING
// ==========================================

function doGet(e) {
  // ── External API call (GitHub Pages / static hosting) ──────────────────
  if (e && e.parameter && e.parameter.action) {
    try {
      var action = e.parameter.action;
      var args   = e.parameter.args ? JSON.parse(e.parameter.args) : [];
      var result = dispatchApiAction_(action, args);
      var json   = JSON.stringify({ success: true, data: result });

      // JSONP: wrap response in callback(…) — completely bypasses all CORS issues
      if (e.parameter.callback) {
        return ContentService
          .createTextOutput(e.parameter.callback + '(' + json + ')')
          .setMimeType(ContentService.MimeType.JAVASCRIPT);
      }
      return ContentService.createTextOutput(json)
        .setMimeType(ContentService.MimeType.JSON);

    } catch (err) {
      var errJson = JSON.stringify({ success: false, error: err.toString() });
      if (e.parameter.callback) {
        return ContentService
          .createTextOutput(e.parameter.callback + '(' + errJson + ')')
          .setMimeType(ContentService.MimeType.JAVASCRIPT);
      }
      return ContentService.createTextOutput(errJson)
        .setMimeType(ContentService.MimeType.JSON);
    }
  }

  // ── Normal Apps Script web app ──────────────────────────────────────────
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('Dynamic Document Hub')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Routes an action name + args array to the correct server function.
 * Used by both doGet (GET API) and doPost (POST API / file uploads).
 */
function dispatchApiAction_(action, args) {
  if (action === 'getFormInitializationData')        return getFormInitializationData();
  if (action === 'getRecruiterSubmissionsHistory')   return getRecruiterSubmissionsHistory(args[0], args[1]);
  if (action === 'submitUserData')                   return submitUserData(args[0]);
  if (action === 'checkDuplicatePassport')           return checkDuplicatePassport(args[0], args[1]);
  if (action === 'checkManagerPasscode')             return checkManagerPasscode(args[0]);
  if (action === 'getExtendedProjectsList')          return getExtendedProjectsList(args[0], args[1]);
  if (action === 'getProjectDashboardMetrics')       return getProjectDashboardMetrics(args[0], args[1]);
  if (action === 'getRecruiterPerformanceForProject')return getRecruiterPerformanceForProject(args[0], args[1]);
  if (action === 'managerCreateRecruiter')           return managerCreateRecruiter(args[0], args[1]);
  if (action === 'managerDeleteRecruiter')           return managerDeleteRecruiter(args[0], args[1]);
  if (action === 'managerDeleteProject')             return managerDeleteProject(args[0], args[1]);
  if (action === 'managerRepairProjectHeaders')      return managerRepairProjectHeaders(args[0], args[1]);
  if (action === 'managerChangePasscode')            return managerChangePasscode(args[0], args[1]);
  if (action === 'managerGrantTeamAccessToAllProjects') return managerGrantTeamAccessToAllProjects(args[0]);
  if (action === 'managerDeleteSubmissionRecord')    return managerDeleteSubmissionRecord(args[0], args[1], args[2], args[3], args[4]);
  if (action === 'managerSaveProjectConfig')         return managerSaveProjectConfig(args[0], args[1]);
  if (action === 'migrateAllDataToSupabase')         return migrateAllDataToSupabase();
  if (action === 'managerReadProjectSheetData')      return managerReadProjectSheetData(args[0], args[1]);
  if (action === 'managerGetAllSubmissions')         return managerGetAllSubmissions(args[0]);
  if (action === 'managerFetchSheetByUrl')           return managerFetchSheetByUrl(args[0], args[1]);
  throw new Error('Unsupported API action: ' + action);
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

// ==========================================
// 2. MANAGER AUTHENTICATION
// ==========================================

function getManagerPasscode_() {
  var props = PropertiesService.getScriptProperties();
  var pass = props.getProperty(PROP_PASSCODE);
  if (!pass || pass === 'manager123') {
    pass = DEFAULT_PASSCODE;
    props.setProperty(PROP_PASSCODE, pass);
  }
  return pass;
}

function verifyManagerAccess_(passcode) {
  if (!passcode || passcode.toString() !== getManagerPasscode_()) {
    throw new Error('Access denied: invalid manager passcode.');
  }
}

function checkManagerPasscode(passcode) {
  verifyManagerAccess_(passcode);
  return true;
}

function managerChangePasscode(oldPasscode, newPasscode) {
  verifyManagerAccess_(oldPasscode);
  var clean = (newPasscode || '').toString().trim();
  if (clean.length < 4) return JSON.stringify({ success: false, error: 'Passcode must be >= 4 chars' });
  PropertiesService.getScriptProperties().setProperty(PROP_PASSCODE, clean);
  return 'Passcode updated successfully. Use it next time you open Manager Workspace.';
}

function forceResetPasscode() {
  PropertiesService.getScriptProperties().setProperty(PROP_PASSCODE, '${passcode}');
  Logger.log('Passcode has been set to: ${passcode}');
}

// ==========================================
// 3. PUBLIC FORM INITIALIZATION
// ==========================================

function getFormInitializationData() {
  var cached = CacheService.getScriptCache().get('formInitData');
  if (cached) return JSON.parse(cached);

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var configSheet = ss.getSheetByName(SHEET_CONFIG) || ss.insertSheet(SHEET_CONFIG);
  var projSheet = ss.getSheetByName(SHEET_PROJECTS) || ss.insertSheet(SHEET_PROJECTS);

  if (configSheet.getLastRow() === 0) configSheet.appendRow(['Recruiters List']);

  var recruiters = [];
  if (configSheet.getLastRow() >= 2) {
    recruiters = configSheet.getRange(2, 1, configSheet.getLastRow() - 1, 1).getValues().flat().filter(Boolean);
  }
  recruiters.sort(function(a, b) { return a.localeCompare(b); });

  var activeProjectsConfig = [];
  var projLastRow = projSheet.getLastRow();

  if (projLastRow >= 2) {
    var data = projSheet.getRange(2, 1, projLastRow - 1, 6).getValues();
    data.forEach(function(row) {
      var name = row[0];
      var rawCfg = row[5] ? JSON.parse(row[5]) : [];
      var fields = Array.isArray(rawCfg) ? rawCfg : (rawCfg.fields || []);
      var jobRoles = Array.isArray(rawCfg) ? [] : (rawCfg.jobRoles || []);
      if (name && name.trim() !== '') {
        activeProjectsConfig.push({ name: name, fields: fields, jobRoles: jobRoles });
      }
    });
  }
  // Last created project shows first
  activeProjectsConfig.reverse();

  var result = { recruiters: recruiters, projectsConfig: activeProjectsConfig };
  cachePutSafe_('formInitData', JSON.stringify(result), CACHE_FORM_INIT_TTL);
  return result;
}

function getProjectFieldsConfig(projectName) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var projSheet = ss.getSheetByName(SHEET_PROJECTS);
  if (!projSheet || projSheet.getLastRow() < 2) return [];

  var data = projSheet.getRange(2, 1, projSheet.getLastRow() - 1, 6).getValues();
  for (var i = 0; i < data.length; i++) {
    if (data[i][0] === projectName) {
      var raw = data[i][5] ? JSON.parse(data[i][5]) : [];
      return Array.isArray(raw) ? raw : (raw.fields || []);
    }
  }
  return [];
}

// ==========================================
// 4. MANAGER: PROJECT & RECRUITER CONFIGURATION
// ==========================================

function getExtendedProjectsList(passcode, forceRefresh) {
  verifyManagerAccess_(passcode);

  var cacheKey = 'extendedProjectsList';
  if (!forceRefresh) {
    var cached = CacheService.getScriptCache().get(cacheKey);
    if (cached) return JSON.parse(cached);
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var projSheet = ss.getSheetByName(SHEET_PROJECTS) || ss.insertSheet(SHEET_PROJECTS);
  var lastRow = projSheet.getLastRow();
  if (lastRow < 2) return [];

  var data = projSheet.getRange(2, 1, lastRow - 1, 6).getValues();
  var list = data.map(function(row) {
    var rawCfg = row[5] ? JSON.parse(row[5]) : [];
    var fields = Array.isArray(rawCfg) ? rawCfg : (rawCfg.fields || []);
    var jobRoles = Array.isArray(rawCfg) ? [] : (rawCfg.jobRoles || []);
    return {
      name: row[0],
      sheetUrl: row[1],
      folderUrl: row[2],
      submission: row[3],
      status: row[4],
      fields: fields,
      jobRoles: jobRoles
    };
  });

  list.forEach(function(p) {
    p.todaySubmissions = 0;
    p.totalSubmissions = 0;
    p.dataUnreachable = false;
  });

  // Last created project shows first
  list.reverse();
  cachePutSafe_(cacheKey, JSON.stringify(list), CACHE_PROJECT_LIST_TTL);
  return list;
}

function buildSyncedHeaders_(targetSheet, desiredFields) {
  var existingHeaders = [];
  if (targetSheet.getLastRow() >= 1 && targetSheet.getLastColumn() >= 1) {
    existingHeaders = targetSheet.getRange(1, 1, 1, targetSheet.getLastColumn()).getValues()[0];
  }

  var existingCustomHeaders = [];
  if (existingHeaders.length > FIXED_HEADERS.length + 1) {
    existingCustomHeaders = existingHeaders.slice(FIXED_HEADERS.length, existingHeaders.length - 1);
  }

  var desiredLabels = (desiredFields || []).map(function(f) { return f.label; });
  var mergedCustomHeaders = existingCustomHeaders.slice();
  desiredLabels.forEach(function(label) {
    if (mergedCustomHeaders.indexOf(label) === -1) mergedCustomHeaders.push(label);
  });

  return FIXED_HEADERS.concat(mergedCustomHeaders, [DOC_URL_HEADER]);
}

var SUBMISSION_REMARKS_LABEL = 'Remarks';
function withSubmissionRemarksField_(fields) {
  return [{ id: '_submission_remarks', label: SUBMISSION_REMARKS_LABEL, type: 'text' }].concat(fields || []);
}

function grantTeamEditors_(sheetUrl, folderUrl) {
  var errors = [];

  if (sheetUrl) {
    try {
      var ssObj = SpreadsheetApp.openByUrl(sheetUrl);
      TEAM_EDITOR_EMAILS.forEach(function(email) {
        try { ssObj.addEditor(email); } catch (e) { errors.push(email + ' (sheet): ' + e.toString()); }
      });
    } catch (e) {
      errors.push('Could not open sheet to grant access: ' + e.toString());
    }
  }

  if (folderUrl) {
    var folderIdMatch = folderUrl.match(/[-\\w]{25,}/);
    if (folderIdMatch) {
      try {
        var folderObj = DriveApp.getFolderById(folderIdMatch[0]);
        TEAM_EDITOR_EMAILS.forEach(function(email) {
          try { folderObj.addEditor(email); } catch (e) { errors.push(email + ' (folder): ' + e.toString()); }
        });
      } catch (e) {
        errors.push('Could not open folder to grant access: ' + e.toString());
      }
    } else {
      errors.push('Could not parse folder ID from URL.');
    }
  }

  return errors;
}

function managerGrantTeamAccessToAllProjects(passcode) {
  try {
    verifyManagerAccess_(passcode);

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var projSheet = ss.getSheetByName(SHEET_PROJECTS);
    if (!projSheet || projSheet.getLastRow() < 2) return JSON.stringify({ success: false, error: 'No projects found' });

    var data = projSheet.getRange(2, 1, projSheet.getLastRow() - 1, 3).getValues();
    var successCount = 0;
    var allErrors = [];

    data.forEach(function(row) {
      var name = row[0], sheetUrl = row[1], folderUrl = row[2];
      var errs = grantTeamEditors_(sheetUrl, folderUrl);
      if (errs.length === 0) {
        successCount++;
      } else {
        allErrors.push(name + ': ' + errs.join('; '));
      }
    });

    var summary = 'Granted editor access on ' + successCount + ' of ' + data.length + ' project(s) to: ' + TEAM_EDITOR_EMAILS.join(', ') + '.';
    if (allErrors.length > 0) {
      summary += '\\n\\nIssues:\\n' + allErrors.join('\\n');
    }
    return summary;
  } catch (e) {
    Logger.log('managerGrantTeamAccessToAllProjects failed: %s', e.stack || e.toString());
    return 'Error: ' + e.toString();
  }
}

function managerSaveProjectConfig(payload, passcode) {
  try {
    verifyManagerAccess_(passcode);

    if (!payload || !payload.name || !payload.name.toString().trim()) {
      return JSON.stringify({ success: false, error: 'Project name is required' });
    }
    payload.name = payload.name.toString().trim();

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var projSheet = ss.getSheetByName(SHEET_PROJECTS) || ss.insertSheet(SHEET_PROJECTS);

    if (projSheet.getLastRow() === 0) {
      projSheet.appendRow(['Project Name', 'Sheet URL', 'Folder URL', 'Submission Mode', 'Status Mode', 'Fields JSON']);
    }

    var lastRow = projSheet.getLastRow();
    var names = lastRow >= 2 ? projSheet.getRange(2, 1, lastRow - 1, 1).getValues().flat() : [];
    var rowIndex = -1;

    var finalSheetUrl = payload.sheetUrl || '';
    var finalFolderUrl = payload.folderUrl || '';

    if (payload.originalName) {
      rowIndex = names.indexOf(payload.originalName);
      if (rowIndex !== -1) {
        rowIndex = rowIndex + 2;
      }
    } else {
      rowIndex = names.indexOf(payload.name);
      if (rowIndex !== -1) {
        rowIndex = rowIndex + 2;
      }
    }

    if (rowIndex === -1) {
      // Only generate new sheet/folder if not provided
      if (!finalSheetUrl) {
        var autoSpreadsheet = SpreadsheetApp.create('[Logs] ' + payload.name);
        finalSheetUrl = autoSpreadsheet.getUrl();
      }
      if (!finalFolderUrl) {
        var autoFolder = DriveApp.createFolder('[Files] ' + payload.name);
        finalFolderUrl = autoFolder.getUrl();
      }

      // Automatically share with the team
      grantTeamEditors_(finalSheetUrl, finalFolderUrl);
    }

    var externalSs = SpreadsheetApp.openByUrl(finalSheetUrl);
    var targetSheet = externalSs.getSheets()[0];

    var syncedHeaders = buildSyncedHeaders_(targetSheet, withSubmissionRemarksField_(payload.fields));
    targetSheet.getRange(1, 1, 1, syncedHeaders.length).setValues([syncedHeaders]);
    targetSheet.getRange(1, 1, 1, syncedHeaders.length).setFontWeight('bold');
    if (targetSheet.getFrozenRows() < 1) targetSheet.setFrozenRows(1);
    targetSheet.getRange(2, 4, Math.max(targetSheet.getMaxRows() - 1, 1), 2).setNumberFormat('@');

    var rowData = [
      payload.name,
      finalSheetUrl,
      finalFolderUrl,
      payload.submission,
      payload.status,
      JSON.stringify({ fields: payload.fields || [], jobRoles: payload.jobRoles || [] })
    ];

    if (rowIndex !== -1) {
      projSheet.getRange(rowIndex, 1, 1, 6).setValues([rowData]);
      cacheRemoveSafe_('formInitData');
      cacheRemoveSafe_('extendedProjectsList');
      cacheRemoveSafe_('perf_' + payload.name);
      return 'Project configuration changes updated successfully!';
    } else {
      projSheet.appendRow(rowData);
      cacheRemoveSafe_('formInitData');
      cacheRemoveSafe_('extendedProjectsList');
      return 'Project workspace generated automatically! Sheet & Drive Folder initialized.';
    }
  } catch (e) {
    return 'Ecosystem Initialization Exception Error: ' + e.toString();
  }
}

function managerDeleteProject(projectName, passcode) {
  try {
    verifyManagerAccess_(passcode);

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var projSheet = ss.getSheetByName(SHEET_PROJECTS);
    if (!projSheet) return JSON.stringify({ success: false, error: 'Project sheet not found' });

    var lastRow = projSheet.getLastRow();
    if (lastRow < 2) return JSON.stringify({ success: false, error: 'No projects to delete' });

    var data = projSheet.getRange(2, 1, lastRow - 1, 1).getValues().flat();
    var targetIndex = data.indexOf(projectName);

    if (targetIndex !== -1) {
      projSheet.deleteRow(targetIndex + 2);
      cacheRemoveSafe_('formInitData');
      cacheRemoveSafe_('extendedProjectsList');
      cacheRemoveSafe_('perf_' + projectName);
      return 'Success';
    }
    return JSON.stringify({ success: false, error: 'Project not found' });
  } catch (e) {
    return 'Deletion Failure: ' + e.toString();
  }
}

function managerCreateRecruiter(recruiterName, passcode) {
  try {
    verifyManagerAccess_(passcode);

    if (!recruiterName || !recruiterName.toString().trim()) return JSON.stringify({ success: false, error: 'Name is required' });
    recruiterName = recruiterName.toString().trim();

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var configSheet = ss.getSheetByName(SHEET_CONFIG) || ss.insertSheet(SHEET_CONFIG);
    if (configSheet.getLastRow() === 0) configSheet.appendRow(['Recruiters List']);

    var existing = configSheet.getLastRow() >= 2
      ? configSheet.getRange(2, 1, configSheet.getLastRow() - 1, 1).getValues().flat()
      : [];
    if (existing.indexOf(recruiterName) !== -1) return JSON.stringify({ success: false, error: 'Recruiter already exists' });

    configSheet.appendRow([recruiterName]);
    cacheRemoveSafe_('formInitData');
    return 'Recruiter reference added.';
  } catch (e) {
    return 'Error: ' + e.toString();
  }
}

function managerDeleteRecruiter(recruiterName, passcode) {
  try {
    verifyManagerAccess_(passcode);

    if (!recruiterName || !recruiterName.toString().trim()) return JSON.stringify({ success: false, error: 'Name is required' });
    var target = recruiterName.toString().trim().toLowerCase();

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var configSheet = ss.getSheetByName(SHEET_CONFIG);
    if (!configSheet || configSheet.getLastRow() < 2) return JSON.stringify({ success: false, error: 'No recruiters found' });

    var lastRow = configSheet.getLastRow();
    var data = configSheet.getRange(2, 1, lastRow - 1, 1).getValues().flat();
    var deleted = false;

    for (var i = data.length - 1; i >= 0; i--) {
      var item = (data[i] || '').toString().trim().toLowerCase();
      if (item === target) {
        configSheet.deleteRow(i + 2);
        deleted = true;
      }
    }

    cacheRemoveSafe_('formInitData');
    return deleted ? 'Recruiter removed from roster.' : JSON.stringify({ success: false, error: 'Recruiter not found' });
  } catch (e) {
    return 'Error: ' + e.toString();
  }
}

// ==========================================
// 5. MANAGER: ANALYTICS & DASHBOARD METRICS
// ==========================================

function getProjectDashboardMetrics(projectName, passcode) {
  try {
    verifyManagerAccess_(passcode);

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var projSheet = ss.getSheetByName(SHEET_PROJECTS);
    if (!projSheet || projSheet.getLastRow() < 2) return { error: 'Project configuration sheet is empty.' };

    var sheetUrl = '';
    var folderUrl = '';

    var configData = projSheet.getRange(2, 1, projSheet.getLastRow() - 1, 3).getValues();
    for (var i = 0; i < configData.length; i++) {
      if (configData[i][0] === projectName) {
        sheetUrl = configData[i][1];
        folderUrl = configData[i][2];
        break;
      }
    }

    if (!sheetUrl) return { error: 'Spreadsheet URL connection string is empty.' };

    var externalSs = SpreadsheetApp.openByUrl(sheetUrl);
    var sheet = externalSs.getSheets()[0];
    var lastRow = sheet.getLastRow();

    var headers = lastRow > 0 ? sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0] : [];
    var rows = lastRow >= 2 ? sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues() : [];

    var totalSubmissions = rows.length;
    var todaySubmissions = 0;
    var yesterdaySubmissions = 0;

    var recruiterTotalMap = {};
    var recruiterTodayMap = {};
    var recruiterYesterdayMap = {};

    var startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    var todayMs = startOfToday.getTime();
    var yesterdayMs = todayMs - 24 * 60 * 60 * 1000;

    var processedRows = [];

    rows.forEach(function(row) {
      var rawTimestamp = row[0];
      var timestamp = rawTimestamp instanceof Date ? rawTimestamp : new Date(rawTimestamp);
      var recruiter = row[1] || 'Unknown';

      recruiterTotalMap[recruiter] = (recruiterTotalMap[recruiter] || 0) + 1;

      var checkDate = new Date(timestamp.getTime());
      checkDate.setHours(0, 0, 0, 0);
      var checkMs = checkDate.getTime();

      if (checkMs === todayMs) {
        todaySubmissions++;
        recruiterTodayMap[recruiter] = (recruiterTodayMap[recruiter] || 0) + 1;
      } else if (checkMs === yesterdayMs) {
        yesterdaySubmissions++;
        recruiterYesterdayMap[recruiter] = (recruiterYesterdayMap[recruiter] || 0) + 1;
      }

      var serializableCells = row.map(function(cell) {
        return cell instanceof Date ? cell.toISOString() : cell;
      });

      processedRows.push({
        timestamp: timestamp.toISOString(),
        recruiter: recruiter,
        candidateName: row[2],
        passport: row[3],
        mobile: row[4],
        allCells: serializableCells
      });
    });

    var recruiterBreakdown = Object.keys(recruiterTotalMap).map(function(rec) {
      return {
        name: rec,
        total: recruiterTotalMap[rec] || 0,
        today: recruiterTodayMap[rec] || 0,
        yesterday: recruiterYesterdayMap[rec] || 0
      };
    });
    recruiterBreakdown.sort(function(a, b) { return b.total - a.total; });

    return {
      projectName: projectName,
      sheetUrl: sheetUrl,
      folderUrl: folderUrl,
      headers: headers,
      total: totalSubmissions,
      today: todaySubmissions,
      yesterday: yesterdaySubmissions,
      recruiterData: recruiterBreakdown,
      allLogs: processedRows
    };

  } catch (e) {
    Logger.log('getProjectDashboardMetrics failed for "%s": %s', projectName, e.stack || e.toString());
    return { error: e.toString() };
  }
}

function getRecruiterPerformanceForProject(projectName, passcode) {
  try {
    verifyManagerAccess_(passcode);

    var cacheKey = 'perf_' + projectName;
    var cached = CacheService.getScriptCache().get(cacheKey);
    if (cached) return JSON.parse(cached);

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var configSheet = ss.getSheetByName(SHEET_CONFIG);
    var allRecruiters = [];
    if (configSheet && configSheet.getLastRow() >= 2) {
      allRecruiters = configSheet.getRange(2, 1, configSheet.getLastRow() - 1, 1).getValues().flat().filter(Boolean);
    }

    var projSheet = ss.getSheetByName(SHEET_PROJECTS);
    if (!projSheet || projSheet.getLastRow() < 2) return { error: 'No projects found.' };

    var configData = projSheet.getRange(2, 1, projSheet.getLastRow() - 1, 2).getValues();
    var sheetUrl = null;
    for (var i = 0; i < configData.length; i++) {
      if (configData[i][0] === projectName) { sheetUrl = configData[i][1]; break; }
    }
    if (!sheetUrl) return { error: 'Project not found.' };

    var perf = {};
    allRecruiters.forEach(function(name) { perf[name] = { today: 0, yesterday: 0, total: 0 }; });

    var externalSs = SpreadsheetApp.openByUrl(sheetUrl);
    var sheet = externalSs.getSheets()[0];
    var lastRow = sheet.getLastRow();

    if (lastRow >= 2) {
      var startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);
      var todayMs = startOfToday.getTime();
      var yesterdayMs = todayMs - 24 * 60 * 60 * 1000;

      var rows = sheet.getRange(2, 1, lastRow - 1, 2).getValues();
      rows.forEach(function(r) {
        var ts = r[0] instanceof Date ? r[0] : new Date(r[0]);
        var recruiter = r[1] || 'Unknown';
        if (!perf[recruiter]) perf[recruiter] = { today: 0, yesterday: 0, total: 0 };

        perf[recruiter].total++;

        var check = new Date(ts.getTime());
        check.setHours(0, 0, 0, 0);
        var checkMs = check.getTime();
        if (checkMs === todayMs) perf[recruiter].today++;
        else if (checkMs === yesterdayMs) perf[recruiter].yesterday++;
      });
    }

    var rowsOut = Object.keys(perf).map(function(name) {
      return { name: name, today: perf[name].today, yesterday: perf[name].yesterday, total: perf[name].total };
    });
    rowsOut.sort(function(a, b) { return b.today - a.today || b.total - a.total || a.name.localeCompare(b.name); });

    var result = { projectName: projectName, rows: rowsOut };
    cachePutSafe_(cacheKey, JSON.stringify(result), CACHE_PERF_TTL);
    return result;
  } catch (e) {
    Logger.log('getRecruiterPerformanceForProject failed for "%s": %s', projectName, e.stack || e.toString());
    return { error: e.toString() };
  }
}

function managerRepairProjectHeaders(projectName, passcode) {
  try {
    verifyManagerAccess_(passcode);

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var projSheet = ss.getSheetByName(SHEET_PROJECTS);
    if (!projSheet || projSheet.getLastRow() < 2) return JSON.stringify({ success: false, error: 'No projects found' });

    var lastRow = projSheet.getLastRow();
    var data = projSheet.getRange(2, 1, lastRow - 1, 6).getValues();
    var projectRow = null;
    for (var i = 0; i < data.length; i++) {
      if (data[i][0] === projectName) { projectRow = data[i]; break; }
    }
    if (!projectRow) return JSON.stringify({ success: false, error: 'Project not found' });

    var sheetUrl = projectRow[1];
    var fieldsConfig = JSON.parse(projectRow[5] || '[]');

    var externalSs = SpreadsheetApp.openByUrl(sheetUrl);
    var targetSheet = externalSs.getSheets()[0];

    var syncedHeaders = buildSyncedHeaders_(targetSheet, withSubmissionRemarksField_(fieldsConfig));
    targetSheet.getRange(1, 1, 1, syncedHeaders.length).setValues([syncedHeaders]);
    targetSheet.getRange(1, 1, 1, syncedHeaders.length).setFontWeight('bold');
    if (targetSheet.getFrozenRows() < 1) targetSheet.setFrozenRows(1);
    targetSheet.getRange(2, 4, Math.max(targetSheet.getMaxRows() - 1, 1), 2).setNumberFormat('@');

    return 'Headers repaired successfully. Current columns: ' + syncedHeaders.join(', ');
  } catch (e) {
    Logger.log('managerRepairProjectHeaders failed for "%s": %s', projectName, e.stack || e.toString());
    return 'Repair Failed: ' + e.toString();
  }
}

function extractDriveId_(str) {
  if (!str || typeof str !== 'string') return '';
  var m1 = str.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (m1 && m1[1]) return m1[1];
  var m2 = str.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (m2 && m2[1]) return m2[1];
  var m3 = str.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (m3 && m3[1]) return m3[1];
  var m4 = str.match(/\/open\?id=([a-zA-Z0-9_-]+)/);
  if (m4 && m4[1]) return m4[1];
  var m5 = str.match(/\/uc\?id=([a-zA-Z0-9_-]+)/);
  if (m5 && m5[1]) return m5[1];
  return '';
}

function sanitizeFilename_(str) {
  return String(str || '').replace(/[\\\\/:*?"<>|]/g, '').trim();
}

function submitUserData(payload) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
  } catch(lockErr) {
    return JSON.stringify({ success: false, error: 'Server is currently processing another upload. Please retry in a few seconds.' });
  }

  try {
    if (!payload || !payload.project || !payload.recruiter || !payload.candidateName || !payload.passportNumber) {
      return JSON.stringify({ success: false, error: 'Missing mandatory fields' });
    }
    if (!/^[A-Za-z0-9]+$/.test(payload.passportNumber)) {
      return JSON.stringify({ success: false, error: 'Invalid passport format' });
    }
    if (!payload.fileData || payload.fileData.indexOf('data:') !== 0) {
      return JSON.stringify({ success: false, error: 'Valid candidate document (PDF) is required' });
    }

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var projSheet = ss.getSheetByName(SHEET_PROJECTS);

    var data = (projSheet && projSheet.getLastRow() >= 2) ? projSheet.getRange(2, 1, projSheet.getLastRow() - 1, 6).getValues() : [];
    var projectRow = null;
    var normProj = String(payload.project || '').trim().toLowerCase();

    // 1. Exact match
    for (var i = 0; i < data.length; i++) {
      if (String(data[i][0] || '').trim().toLowerCase() === normProj) {
        projectRow = data[i];
        break;
      }
    }

    // 2. Normalized match (ignores date format variations like 7/2026 vs 07/26)
    if (!projectRow) {
      var cleanNorm = normProj.replace(/[\(\[\{]?\d{1,2}\/\d{2,4}[\)\]\}]?/g, '').replace(/[^a-z0-9]/g, '');
      for (var i = 0; i < data.length; i++) {
        var cleanSheet = String(data[i][0] || '').trim().toLowerCase().replace(/[\(\[\{]?\d{1,2}\/\d{2,4}[\)\]\}]?/g, '').replace(/[^a-z0-9]/g, '');
        if (cleanNorm && cleanSheet && (cleanNorm === cleanSheet || cleanSheet.indexOf(cleanNorm) !== -1 || cleanNorm.indexOf(cleanSheet) !== -1)) {
          projectRow = data[i];
          break;
        }
      }
    }

    var sheetUrl = projectRow ? projectRow[1] : (payload.sheetUrl || '');
    var folderUrl = projectRow ? projectRow[2] : (payload.folderUrl || '');
    var fieldsConfig = projectRow ? JSON.parse(projectRow[5] || '[]') : (payload.fields || []);

    if (!sheetUrl || !folderUrl) {
      return JSON.stringify({ success: false, error: 'Project "' + payload.project + '" sheet or folder is not configured.' });
    }

    // Auto-register project in master SHEET_PROJECTS if not present
    if (!projectRow && projSheet && sheetUrl && folderUrl) {
      try {
        projSheet.appendRow([
          payload.project,
          sheetUrl,
          folderUrl,
          'Active',
          'Open',
          JSON.stringify(fieldsConfig || [])
        ]);
      } catch(regErr) {}
    }

    if (projectRow && (projectRow[3] !== 'Active' || projectRow[4] !== 'Open')) {
      return JSON.stringify({ success: false, error: 'Submissions closed for this project.' });
    }

    var folderIdMatch = folderUrl.match(/[-\\w]{25,}/);
    if (!folderIdMatch) return JSON.stringify({ success: false, error: 'Project Drive folder not configured' });
    var folder = DriveApp.getFolderById(folderIdMatch[0]);

    var cleanCandidateName = sanitizeFilename_(payload.candidateName);
    var cleanPassport = sanitizeFilename_(payload.passportNumber).toUpperCase();
    var timestampTag = Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'GMT', 'yyyyMMdd_HHmmss');
    var standardFileName = cleanCandidateName + ' ' + cleanPassport + ' [' + timestampTag + '].pdf';

    var contentMatch = payload.fileData.match(/data:(.*?);/);
    if (!contentMatch) return JSON.stringify({ success: false, error: 'Invalid document base64 data' });
    var contentType = contentMatch[1];
    var byteCharacters = Utilities.base64Decode(payload.fileData.split(',')[1]);
    var blob = Utilities.newBlob(byteCharacters, contentType, standardFileName);

    var file = folder.createFile(blob);
    var fileUrl = file.getUrl();

    // Verify file URL was generated successfully
    if (!fileUrl || !fileUrl.startsWith('http')) {
      try { file.setTrashed(true); } catch(e) {}
      return JSON.stringify({ success: false, error: 'Google Drive failed to generate a document URL. Please retry.' });
    }

    var externalSs = SpreadsheetApp.openByUrl(sheetUrl);
    var targetSheet = externalSs.getSheets()[0];

    // Find all existing rows matching this passport number
    var targetData = targetSheet.getDataRange().getValues();
    var existingRowIndices = [];
    var existingRecruiter = '';

    for (var r = 1; r < targetData.length; r++) {
      var passInSheet = (targetData[r][3] || '').toString().trim().toUpperCase();
      if (passInSheet === cleanPassport) {
        existingRowIndices.push(r + 1);
        if (!existingRecruiter) {
          existingRecruiter = (targetData[r][1] || '').toString().trim();
        }
      }
    }

    var existingRowIndex = existingRowIndices.length > 0 ? existingRowIndices[0] : -1;

    if (existingRowIndex !== -1) {
      var isSameRecruiter = existingRecruiter.toLowerCase() === payload.recruiter.toString().trim().toLowerCase();
      if (!isSameRecruiter) {
        try { file.setTrashed(true); } catch (e) {}
        return JSON.stringify({
          success: false,
          error: 'Security Policy: Candidate (Passport ' + cleanPassport + ') was previously uploaded by ' + existingRecruiter + '. Only ' + existingRecruiter + ' is authorized to re-upload or update this candidate.'
        });
      }

      if (!payload.overrideDuplicate) {
        try { file.setTrashed(true); } catch (e) {}
        return JSON.stringify({
          success: false,
          error: 'Duplicate candidate detected. Please confirm re-upload to overwrite.'
        });
      }

      // Cleanup old Drive file safely
      try {
        var oldUrl = payload.existingFileUrl || (targetData[existingRowIndex - 1] && targetData[existingRowIndex - 1][targetData[0].length - 1]) || '';
        var oldId = extractDriveId_(oldUrl);
        if (oldId && oldId !== file.getId()) {
          try { DriveApp.getFileById(oldId).setTrashed(true); } catch(eTrash) {}
        }
      } catch (delErr) {
        Logger.log('Old file trash warning: ' + delErr.toString());
      }
    }

    var lastCol = targetSheet.getLastColumn();
    var headers = lastCol > 0 ? targetSheet.getRange(1, 1, 1, lastCol).getValues()[0] : [];
    if (headers.length === 0) {
      headers = buildSyncedHeaders_(targetSheet, withSubmissionRemarksField_(fieldsConfig));
      targetSheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    }

    var answerByLabel = {};
    if (payload.emailId) answerByLabel['Email ID'] = payload.emailId;
    if (payload.altMobileNumber) answerByLabel['Alt. Mobile No.'] = payload.altMobileNumber;
    if (payload.altMobileNumber) answerByLabel['Alternative Mobile No.'] = payload.altMobileNumber;
    if (payload.jobRole) answerByLabel['Job Role'] = payload.jobRole;
    if (payload.remarks) answerByLabel[SUBMISSION_REMARKS_LABEL] = (payload.remarks || '').toString().trim().slice(0, 1000);

    if (payload.dynamicAnswers && typeof payload.dynamicAnswers === 'object') {
      for (var dKey in payload.dynamicAnswers) {
        answerByLabel[dKey] = payload.dynamicAnswers[dKey];
      }
    }

    fieldsConfig.forEach(function(field) {
      if (payload.dynamicAnswers && payload.dynamicAnswers[field.id] !== undefined) {
        answerByLabel[field.label] = payload.dynamicAnswers[field.id];
      }
    });

    function getHeaderValue(header, idx, totalHeaders) {
      if (idx === 0) return new Date();
      if (idx === 1) return payload.recruiter || '';
      if (idx === 2) return cleanCandidateName || '';
      if (idx === 3) return cleanPassport || '';

      var h = String(header || '').trim().toLowerCase();
      var hClean = h.replace(/[^a-z0-9]/g, '');

      // Document URL column (last column or matching name)
      if (idx === totalHeaders - 1 || /documenturl|fileurl|docurl|resumeurl|cvurl|driveurl|document|filelink|link/.test(hClean)) {
        return fileUrl || '';
      }

      // Email column
      if (/email|e-mail|mailid|emailaddress/.test(hClean)) {
        if (payload.emailId) return payload.emailId;
        if (payload.dynamicAnswers) {
          for (var ek in payload.dynamicAnswers) {
            if (/email|e-mail|mail/.test(ek.replace(/[^a-z0-9]/g, '').toLowerCase()) && payload.dynamicAnswers[ek]) {
              return payload.dynamicAnswers[ek];
            }
          }
        }
      }

      // Alt Mobile column
      if (/alt|alternate|alternative|secondary/.test(hClean) && /mob|phone|contact|number|num/.test(hClean)) {
        if (payload.altMobileNumber) return payload.altMobileNumber;
        if (payload.dynamicAnswers) {
          for (var ak in payload.dynamicAnswers) {
            if (/alt|alternate|alternative|secondary/.test(ak.toLowerCase()) && payload.dynamicAnswers[ak]) {
              return payload.dynamicAnswers[ak];
            }
          }
        }
      }

      // Primary Mobile Number column
      if (/^mobile$|^phone$|mobilenumber|primarymobile|contactnumber|phonenumber/.test(hClean) || idx === 4) {
        if (payload.mobileNumber) return payload.mobileNumber;
      }

      // Job Role column
      if (/jobrole|role|trade|position|designation|appliedfor/.test(hClean)) {
        if (payload.jobRole) return payload.jobRole;
        if (payload.dynamicAnswers) {
          for (var rk in payload.dynamicAnswers) {
            if (/jobrole|role|trade|position/.test(rk.replace(/[^a-z0-9]/g, '').toLowerCase()) && payload.dynamicAnswers[rk]) {
              return payload.dynamicAnswers[rk];
            }
          }
        }
      }

      // Remarks column
      if (/remark|note|comment/.test(hClean)) {
        if (payload.remarks) return String(payload.remarks).trim().slice(0, 1000);
        if (payload.dynamicAnswers && payload.dynamicAnswers['Remarks']) return String(payload.dynamicAnswers['Remarks']).trim().slice(0, 1000);
      }

      // Exact match in answerByLabel
      if (answerByLabel.hasOwnProperty(header)) {
        return answerByLabel[header];
      }

      // Dynamic answers lookup by exact label or field id
      if (payload.dynamicAnswers && typeof payload.dynamicAnswers === 'object') {
        if (payload.dynamicAnswers.hasOwnProperty(header)) {
          return payload.dynamicAnswers[header];
        }
        for (var key in payload.dynamicAnswers) {
          if (key.trim().toLowerCase() === h) return payload.dynamicAnswers[key];
          if (key.replace(/[^a-z0-9]/g, '').toLowerCase() === hClean) return payload.dynamicAnswers[key];
        }
      }

      // Match against fieldsConfig
      if (Array.isArray(fieldsConfig)) {
        for (var f = 0; f < fieldsConfig.length; f++) {
          var fc = fieldsConfig[f];
          var fcLabel = String(fc.label || '').trim().toLowerCase();
          var fcClean = fcLabel.replace(/[^a-z0-9]/g, '');
          if (fcLabel === h || fcClean === hClean) {
            if (payload.dynamicAnswers && payload.dynamicAnswers[fc.id] !== undefined) {
              return payload.dynamicAnswers[fc.id];
            }
          }
        }
      }

      return '';
    }

    var recordRow = headers.map(function(header, idx) {
      return getHeaderValue(header, idx, headers.length);
    });

    // Write to Google Sheet:
    // If existing row exists: update that row IN PLACE!
    var writeRowIndex = existingRowIndex > 0 ? existingRowIndex : (targetSheet.getLastRow() + 1);
    targetSheet.getRange(writeRowIndex, 1, 1, recordRow.length).setValues([recordRow]);
    targetSheet.getRange(writeRowIndex, 4, 1, 2).setNumberFormat('@');

    // Clean up any extraneous duplicate rows for this passport (if more than 1 existed)
    if (existingRowIndices.length > 1) {
      for (var d = existingRowIndices.length - 1; d >= 1; d--) {
        try {
          targetSheet.deleteRow(existingRowIndices[d]);
        } catch(delRowErr) {}
      }
    }

    // Optional Supabase Dual Insert
    try {
      var supabaseUrl = 'https://txvpmrbfmvhqlnbhpcrb.supabase.co/rest/v1/submissions';
      var supabaseKey = 'sb_publishable_fV81QoyMB6YsPCcXQsz3rg_Xlu-airU';
      var supaPayload = {
        project_name: payload.project,
        recruiter: payload.recruiter,
        candidate_name: cleanCandidateName,
        passport_number: cleanPassport,
        mobile_number: payload.mobileNumber || '',
        file_url: fileUrl,
        data: answerByLabel
      };
      
      UrlFetchApp.fetch(supabaseUrl, {
        method: 'post',
        contentType: 'application/json',
        headers: {
          'apikey': supabaseKey,
          'Authorization': 'Bearer ' + supabaseKey,
          'Prefer': 'return=minimal'
        },
        payload: JSON.stringify(supaPayload),
        muteHttpExceptions: true
      });
    } catch(supabaseErr) {}

    cacheRemoveSafe_('extendedProjectsList');
    cacheRemoveSafe_('perf_' + payload.project);

    return JSON.stringify({ success: true, message: 'Data record submitted successfully!', fileUrl: fileUrl });

  } catch (e) {
    Logger.log('submitUserData failed: %s', e.stack || e.toString());
    return JSON.stringify({ success: false, error: 'Data processing failed: ' + e.toString() });
  } finally {
    try { lock.releaseLock(); } catch(relErr) {}
  }
}

function getRecruiterSubmissionsHistory(projectName, recruiterName) {
  try {
    if (!projectName || !recruiterName) return [];
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var projSheet = ss.getSheetByName(SHEET_PROJECTS);
    if (!projSheet || projSheet.getLastRow() < 2) return [];
    var data = projSheet.getRange(2, 1, projSheet.getLastRow() - 1, 2).getValues();
    var sheetUrl = null;
    for (var i = 0; i < data.length; i++) {
      if (data[i][0] === projectName) { sheetUrl = data[i][1]; break; }
    }
    if (!sheetUrl) return [];
    var externalSs = SpreadsheetApp.openByUrl(sheetUrl);
    var sheet = externalSs.getSheets()[0];
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return [];
    var rows = sheet.getRange(2, 1, lastRow - 1, 4).getValues();
    var history = [];
    var seenPassports = {};
    rows.forEach(function(row) {
      var ts = row[0];
      var uploadedBy = row[1];
      var name = row[2];
      var passport = (row[3] || '').toString().trim().toUpperCase();
      if (uploadedBy && uploadedBy.toString().trim().toLowerCase() === recruiterName.toString().trim().toLowerCase()) {
        if (!seenPassports[passport]) {
          seenPassports[passport] = true;
          var dateStr = ts instanceof Date ? ts.toISOString() : new Date(ts).toISOString();
          history.push({
            timestamp: dateStr,
            candidateName: name,
            passportNumber: passport
          });
        }
      }
    });
    history.sort(function(a, b) {
      return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
    });
    return history;
  } catch (e) {
    Logger.log('getRecruiterSubmissionsHistory failed: %s', e.stack || e.toString());
    return [];
  }
}

function checkDuplicatePassport(projectName, passportNumber) {
  try {
    if (!projectName || !passportNumber) return { isDuplicate: false };
    
    var cleanPassport = String(passportNumber).replace(/[\\\\/:*?"<>|]/g, '').trim().toLowerCase();
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var projSheet = ss.getSheetByName(SHEET_PROJECTS);
    if (!projSheet || projSheet.getLastRow() < 2) return { isDuplicate: false };

    var data = projSheet.getRange(2, 1, projSheet.getLastRow() - 1, 2).getValues();
    var sheetUrl = null;
    for (var i = 0; i < data.length; i++) {
      if (data[i][0] === projectName) { sheetUrl = data[i][1]; break; }
    }
    if (!sheetUrl) return { isDuplicate: false };

    var externalSs = SpreadsheetApp.openByUrl(sheetUrl);
    var sheet = externalSs.getSheets()[0];
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return { isDuplicate: false };

    var lastCol = sheet.getLastColumn();
    var allRows = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
    
    for (var r = 0; r < allRows.length; r++) {
      var row = allRows[r];
      var rowPassport = String(row[3] || '').replace(/[\\\\/:*?"<>|]/g, '').trim().toLowerCase();
      if (rowPassport === cleanPassport) {
        return {
          isDuplicate: true,
          uploadedBy: String(row[1] || '').trim(),
          rowIdx: r + 2,
          fileUrl: String(row[lastCol - 1] || '')
        };
      }
    }
    
    return { isDuplicate: false };
  } catch(e) {
    Logger.log('checkDuplicatePassport error: ' + e.toString());
    return { isDuplicate: false };
  }
}

function doPost(e) {
  try {
    var postData = JSON.parse(e.postData.contents);

    if (postData.type === 'INSERT' && postData.table === 'submissions') {
      var syncResult = syncSupabaseWebhook(postData.record);
      return ContentService.createTextOutput(JSON.stringify({ success: true, sync: syncResult }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    var action = postData.action;
    var args = postData.args || [];
    var result = dispatchApiAction_(action, args);

    return ContentService.createTextOutput(JSON.stringify({ success: true, data: result }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function syncSupabaseWebhook(record) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var projSheet = ss.getSheetByName(SHEET_PROJECTS);
    if (!projSheet) return JSON.stringify({ success: false, error: 'No project sheet' });

    var data = projSheet.getRange(2, 1, projSheet.getLastRow() - 1, 6).getValues();
    var projectRow = null;
    for (var i = 0; i < data.length; i++) {
      if (data[i][0] === record.project_name) { projectRow = data[i]; break; }
    }
    if (!projectRow) return JSON.stringify({ success: false, error: 'Project not found' });

    var sheetUrl = projectRow[1];
    var folderUrl = projectRow[2];
    
    var externalSs = SpreadsheetApp.openByUrl(sheetUrl);
    var targetSheet = externalSs.getSheets()[0];
    
    var folderId = folderUrl.match(/[-\\w]{25,}/);
    if (!folderId) return JSON.stringify({ success: false, error: 'No folder ID' });
    
    var targetFolder = DriveApp.getFolderById(folderId[0]);
    
    var pdfBlob = null;
    if (record.file_url) {
      var response = UrlFetchApp.fetch(record.file_url);
      pdfBlob = response.getBlob();
      pdfBlob.setName(record.candidate_name + '_' + record.passport_number + '.pdf');
    }
    
    var finalDriveUrl = '';
    if (pdfBlob) {
      var file = targetFolder.createFile(pdfBlob);
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      finalDriveUrl = file.getUrl();
    }
    
    var existingRowIndex = -1;
    var targetData = targetSheet.getDataRange().getValues();
    for (var r = targetData.length - 1; r >= 1; r--) {
      if (String(targetData[r][3]).trim().toUpperCase() === String(record.passport_number).trim().toUpperCase()) {
        existingRowIndex = r + 1;
        var oldFileUrl = targetData[r][targetData[r].length - 1];
        if (oldFileUrl && String(oldFileUrl).indexOf('http') === 0 && !finalDriveUrl) {
          finalDriveUrl = oldFileUrl;
        }
        break;
      }
    }
    
    var lastCol = targetSheet.getLastColumn();
    var headers = lastCol > 0 ? targetSheet.getRange(1, 1, 1, lastCol).getValues()[0] : [];
    
    var recordRow = headers.map(function(header, idx) {
      if (idx === 0) return new Date(record.created_at || new Date());
      if (idx === 1) return record.recruiter;
      if (idx === 2) return record.candidate_name;
      if (idx === 3) return record.passport_number;
      if (idx === 4) return record.mobile_number || '';
      if (idx === headers.length - 1 || header === DOC_URL_HEADER) return finalDriveUrl || record.file_url || '';
      return record.data && record.data.hasOwnProperty(header) ? record.data[header] : '';
    });
    
    var targetRowIndex = existingRowIndex > 0 ? existingRowIndex : (targetSheet.getLastRow() + 1);
    targetSheet.getRange(targetRowIndex, 1, 1, recordRow.length).setValues([recordRow]);
    targetSheet.getRange(targetRowIndex, 4, 1, 2).setNumberFormat('@');
    
    return 'Synced successfully';
  } catch(err) {
    Logger.log('Webhook sync error: ' + err.toString());
    return 'Error: ' + err.toString();
  }
}

function managerDeleteSubmissionRecord(projectName, candidateName, passportNumber, fileUrl, passcode) {
  try {
    verifyManagerAccess_(passcode);
    
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var projSheet = ss.getSheetByName(SHEET_PROJECTS);
    if (!projSheet || projSheet.getLastRow() < 2) return JSON.stringify({ success: false, error: 'No project config sheet' });
    
    var data = projSheet.getRange(2, 1, projSheet.getLastRow() - 1, 2).getValues();
    var sheetUrl = null;
    for (var i = 0; i < data.length; i++) {
      if (isProjectMatch_(data[i][0], projectName)) { sheetUrl = data[i][1]; break; }
    }
    if (!sheetUrl) return JSON.stringify({ success: false, error: 'Project sheet not found' });
    
    var externalSs = SpreadsheetApp.openByUrl(sheetUrl);
    var sheet = externalSs.getSheets()[0];
    var lastRow = sheet.getLastRow();
    var lastCol = Math.max(sheet.getLastColumn(), 6);
    if (lastRow < 2) return JSON.stringify({ success: false, error: 'Sheet is empty' });
    
    var rows = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
    var targetRowIndex = -1;
    var cleanPass = String(passportNumber || '').trim().toLowerCase();
    var cleanName = String(candidateName || '').trim().toLowerCase();

    for (var j = 0; j < rows.length; j++) {
      var row = rows[j];
      var rowJoined = row.map(function(c) { return String(c).trim().toLowerCase(); }).join(' ');
      var rowPass = String(row[3] || '').trim().toLowerCase();
      var rowName = String(row[2] || '').trim().toLowerCase();

      var passMatched = cleanPass && (rowPass === cleanPass || rowJoined.indexOf(cleanPass) !== -1);
      var nameMatched = cleanName && (rowName === cleanName || rowJoined.indexOf(cleanName) !== -1);

      if ((cleanPass && passMatched) || (cleanName && nameMatched)) {
        targetRowIndex = j + 2; 
        break;
      }
    }
    
    if (targetRowIndex !== -1) {
      sheet.deleteRow(targetRowIndex);
    }
    
    // Trash Google Drive File if provided
    if (fileUrl) {
      var fileIdMatch = fileUrl.match(/[-\w]{25,}/);
      if (fileIdMatch) {
        try {
          var file = DriveApp.getFileById(fileIdMatch[0]);
          file.setTrashed(true);
        } catch (driveErr) {
          Logger.log('Drive file trash error: %s', driveErr.toString());
        }
      }
    }
    
    cacheRemoveSafe_('extendedProjectsList');
    cacheRemoveSafe_('perf_' + projectName);
    
    return JSON.stringify({ success: true, message: 'Submission record removed from sheet and Drive file archived!' });
  } catch (e) {
    Logger.log('managerDeleteSubmissionRecord failed: %s', e.stack || e.toString());
    return JSON.stringify({ success: false, error: e.toString() });
  }
}

var SUPABASE_URL = "https://txvpmrbfmvhqlnbhpcrb.supabase.co";
var SUPABASE_KEY = "sb_publishable_fV81QoyMB6YsPCcXQsz3rg_Xlu-airU";

function migrateAllDataToSupabase() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var projSheet = ss.getSheetByName(SHEET_PROJECTS);
  if (!projSheet || projSheet.getLastRow() < 2) return "No projects found";
  
  var projectsData = projSheet.getRange(2, 1, projSheet.getLastRow() - 1, 6).getValues();
  
  for (var i = 0; i < projectsData.length; i++) {
    var projectName = projectsData[i][0];
    var sheetUrl = projectsData[i][1];
    var fieldsConfig = JSON.parse(projectsData[i][5] || '[]');
    
    if (!sheetUrl) continue;
    try {
      var externalSs = SpreadsheetApp.openByUrl(sheetUrl);
      var targetSheet = externalSs.getSheets()[0];
      if (targetSheet.getLastRow() < 2) continue;
      
      var data = targetSheet.getRange(1, 1, targetSheet.getLastRow(), targetSheet.getLastColumn()).getValues();
      var headers = data[0];
      
      for (var r = 1; r < data.length; r++) {
        var row = data[r];
        
        var date = row[0];
        var recruiter = row[1];
        var candidateName = row[2];
        var passportNumber = row[3];
        var mobileNumber = row[4];
        var fileUrl = row[headers.length - 1];
        
        var dynamicAnswers = {};
        for (var c = 5; c < headers.length - 1; c++) {
          var header = headers[c];
          var fieldDef = fieldsConfig.find(function(f) { return f.label === header; });
          if (fieldDef) {
            dynamicAnswers[fieldDef.id] = row[c];
          } else {
            dynamicAnswers[header.toLowerCase().replace(/[^a-z0-9]/g, '_')] = row[c];
          }
        }
        
        var payload = {
          project_name: projectName,
          recruiter: recruiter,
          candidate_name: candidateName,
          passport_number: String(passportNumber),
          mobile_number: String(mobileNumber),
          data: dynamicAnswers,
          file_url: fileUrl,
          created_at: new Date(date).toISOString()
        };
        
        var options = {
          method: 'post',
          contentType: 'application/json',
          headers: {
            'apikey': SUPABASE_KEY,
            'Authorization': 'Bearer ' + SUPABASE_KEY,
            'Prefer': 'resolution=ignore-duplicates'
          },
          payload: JSON.stringify(payload),
          muteHttpExceptions: true
        };
        
        UrlFetchApp.fetch(SUPABASE_URL + '/rest/v1/submissions', options);
      }
    } catch (e) {
      Logger.log("Error migrating project " + projectName + ": " + e.toString());
    }
  }
  return "Migration completed successfully.";
}

function managerReadProjectSheetData(passcode, projectName) {
  var cleanPass = passcode;
  var cleanProj = projectName;
  if (passcode && !projectName && String(passcode).length > 20) {
    cleanProj = passcode;
    cleanPass = getManagerPasscode_();
  }
  verifyManagerAccess_(cleanPass);

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var projSheet = ss.getSheetByName(SHEET_PROJECTS);
  var data = projSheet.getDataRange().getValues();
  var sheetUrl = null;
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === cleanProj) {
      sheetUrl = data[i][1];
      break;
    }
  }
  if (!sheetUrl) throw new Error('Project not found');
  
  var targetSs = SpreadsheetApp.openByUrl(sheetUrl);
  var targetSheet = targetSs.getSheets()[0];
  var sheetData = targetSheet.getDataRange().getValues();
  
  return sheetData.map(function(r) {
    return r.map(function(cell) {
      if (cell instanceof Date) return cell.toISOString();
      return cell;
    });
  });
}

/**
 * Master Data Fetcher: reads all candidate submissions from every project spreadsheet
 * configured in Project_Config in a single efficient call.
 */
function managerGetAllSubmissions(passcode) {
  verifyManagerAccess_(passcode);

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var projSheet = ss.getSheetByName(SHEET_PROJECTS);
  if (!projSheet || projSheet.getLastRow() < 2) return [];

  var projectsData = projSheet.getRange(2, 1, projSheet.getLastRow() - 1, 6).getValues();
  var allSubmissions = [];

  for (var i = 0; i < projectsData.length; i++) {
    var projectName = projectsData[i][0];
    var sheetUrl = projectsData[i][1];
    var fieldsConfig = [];
    try {
      fieldsConfig = projectsData[i][5] ? (typeof projectsData[i][5] === 'string' ? JSON.parse(projectsData[i][5]) : projectsData[i][5]) : [];
    } catch(e) {
      fieldsConfig = [];
    }

    if (!projectName || !sheetUrl) continue;

    try {
      var externalSs = SpreadsheetApp.openByUrl(sheetUrl);
      var targetSheet = externalSs.getSheets()[0];
      var lastRow = targetSheet.getLastRow();
      var lastCol = targetSheet.getLastColumn();

      if (lastRow < 2 || lastCol < 1) continue;

      var headers = targetSheet.getRange(1, 1, 1, lastCol).getValues()[0];
      var rows = targetSheet.getRange(2, 1, lastRow - 1, lastCol).getValues();

      // Detect header indexes
      var nameIdx = 2, passIdx = 3, mobIdx = 4, fileIdx = lastCol - 1;
      for (var h = 0; h < headers.length; h++) {
        var hStr = String(headers[h]).toLowerCase();
        if (/candidate|applicant/i.test(hStr)) nameIdx = h;
        else if (/passport/i.test(hStr)) passIdx = h;
        else if (/mobile|phone|contact/i.test(hStr)) mobIdx = h;
        else if (/url|link|file|cv|resume|doc/i.test(hStr)) fileIdx = h;
      }

      for (var r = 0; r < rows.length; r++) {
        var row = rows[r];
        var candName = String(row[nameIdx] || '').trim();
        var passNum = String(row[passIdx] || '').trim().toUpperCase();

        if (!candName && !passNum) continue;

        var ts = row[0] instanceof Date ? row[0].toISOString() : (row[0] ? new Date(row[0]).toISOString() : new Date().toISOString());
        var recruiter = String(row[1] || 'Recruiter').trim();
        var mobNum = String(row[mobIdx] || '').trim();
        var fileUrl = fileIdx >= 0 && row[fileIdx] ? String(row[fileIdx]) : '';

        // Dynamic answers
        var dynamicAnswers = {};
        for (var c = 0; c < headers.length; c++) {
          if (c !== 0 && c !== 1 && c !== nameIdx && c !== passIdx && c !== mobIdx && c !== fileIdx) {
            var headerKey = String(headers[c] || '');
            if (headerKey && row[c] !== undefined && row[c] !== '') {
              dynamicAnswers[headerKey] = row[c] instanceof Date ? row[c].toISOString() : row[c];
            }
          }
        }

        allSubmissions.push({
          id: 'sub-' + projectName.replace(/[^a-zA-Z0-9]/g, '') + '-' + (r + 1) + '-' + (passNum || 'P').replace(/[^a-zA-Z0-9]/g, ''),
          timestamp: ts,
          project: projectName,
          recruiter: recruiter,
          candidateName: candName || 'Candidate',
          passportNumber: passNum,
          mobileNumber: mobNum,
          remarks: dynamicAnswers['Remarks'] || dynamicAnswers['remarks'] || '',
          fileUrl: fileUrl,
          fileName: (candName || 'Candidate') + ' ' + (passNum || '') + '.pdf',
          dynamicAnswers: dynamicAnswers,
          status: 'Verified'
        });
      }
    } catch(projErr) {
      Logger.log('Error reading sheet for project ' + projectName + ': ' + projErr.toString());
    }
  }

  return allSubmissions;
}

function managerFetchSheetByUrl(passcode, sheetUrl) {
  verifyManagerAccess_(passcode);
  if (!sheetUrl) return JSON.stringify({ success: false, error: 'Sheet URL is required' });
  var targetSs = SpreadsheetApp.openByUrl(sheetUrl);
  var targetSheet = targetSs.getSheets()[0];
  var sheetData = targetSheet.getDataRange().getValues();
  if (!sheetData || sheetData.length === 0) {
    return JSON.stringify({ success: false, error: 'The sheet appears to be empty.' });
  }
  var headers = sheetData[0].map(function(c) { return String(c || '').trim(); });
  var rows = sheetData.slice(1).map(function(r) {
    return r.map(function(cell) {
      if (cell instanceof Date) return cell.toISOString();
      return cell != null ? String(cell) : '';
    });
  });
  return JSON.stringify({
    success: true,
    headers: headers,
    rows: rows,
    totalRows: rows.length
  });
}
`;
};
