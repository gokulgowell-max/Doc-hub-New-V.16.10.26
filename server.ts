import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { parseCsvText, parseAndNormalizeTimestamp, getValidTimestampMs } from "./src/utils/csvParser.ts";

const app = express();
const PORT = 3000;

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// Enable CORS for Vercel and cross-origin access
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, PATCH, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "X-Requested-With, Content-Type, Authorization, apikey, Accept");
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }
  next();
});

// ── SERVER-SIDE STATE PERSISTENCE (Multi-Device Synchronization) ───────────
const isVercel = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
const DATA_DIR = isVercel ? path.join("/tmp", "gowell_data") : path.join(process.cwd(), "data");
const STATE_FILE = path.join(DATA_DIR, "app_state.json");
const BUNDLED_STATE_FILE = path.join(process.cwd(), "data", "app_state.json");

interface ServerState {
  config: {
    gasWebAppUrl: string;
    useProxy: boolean;
    passcode: string;
    docPasscode: string;
    teamEmails: string[];
    autoSyncEnabled: boolean;
    autoSyncInterval: number;
  };
  projects: any[];
  recruiters: string[];
  submissions: any[];
  lastUpdated: string;
}

const DEFAULT_RECRUITERS = [
  "Abhiram", "Aswathy", "Babina", "Binsira", "Fathima", "Geethu", 
  "Haneera", "Jeny", "Jyothy", "Krishnendhu", "Monica", "Nandhana", 
  "Prabin P", "Rihana", "Rishna", "Shani", "Soji Samuel", "Sulfiya", "GOKUL"
];

const DEFAULT_SERVER_STATE: ServerState = {
  config: {
    gasWebAppUrl: process.env.VITE_GAS_WEBAPP_URL || process.env.GAS_WEBAPP_URL || "https://script.google.com/macros/s/AKfycbxeUV-NGmTg6yfmDPF-68TLremudAtQ8HA4_0XaPOZ3UkCnYDbQi-g2j2Ee-BgNvaVY/exec",
    useProxy: true,
    passcode: process.env.VITE_MANAGER_PASSCODE || "Gowell921",
    docPasscode: process.env.VITE_DOC_PASSCODE || "Gowell123",
    teamEmails: [],
    autoSyncEnabled: true,
    autoSyncInterval: 15
  },

  projects: [],
  recruiters: DEFAULT_RECRUITERS,
  submissions: [],
  lastUpdated: new Date().toISOString()
};

function ensureDataDir(): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  } catch (err) {
    console.warn("Failed to create data directory:", err);
  }
}

function isServerProjectMatch(p1?: string, p2?: string): boolean {
  if (!p1 || !p2) return false;
  const clean = (s: string) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
  const c1 = clean(p1);
  const c2 = clean(p2);
  if (c1 === c2) return true;
  if (!c1 || !c2 || c1 === 'general' || c2 === 'general') return true;
  const base1 = c1.replace(/[0-9]/g, '');
  const base2 = c2.replace(/[0-9]/g, '');
  if (base1.length >= 5 && base2.length >= 5 && (base1 === base2 || base1.includes(base2) || base2.includes(base1))) {
    return true;
  }
  return false;
}

function getEffectivePassport(item: any): string {
  if (!item) return '';
  let pass = String(item.passportNumber || item.passport || '').trim();
  if (!pass && item.dynamicAnswers && typeof item.dynamicAnswers === 'object') {
    for (const [k, v] of Object.entries(item.dynamicAnswers)) {
      if (/passport/i.test(k) && v) {
        pass = String(v).trim();
        break;
      }
    }
  }
  if (!pass && item.answers && typeof item.answers === 'object') {
    for (const [k, v] of Object.entries(item.answers)) {
      if (/passport/i.test(k) && v) {
        pass = String(v).trim();
        break;
      }
    }
  }
  return pass.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function getEffectiveMobile(item: any): string {
  if (!item) return '';
  let mob = String(item.mobileNumber || item.mobile || '').trim();
  if ((!mob || mob === '-') && item.dynamicAnswers && typeof item.dynamicAnswers === 'object') {
    for (const [k, v] of Object.entries(item.dynamicAnswers)) {
      if (/mobile|phone|contact/i.test(k) && v) {
        mob = String(v).trim();
        break;
      }
    }
  }
  if ((!mob || mob === '-') && item.answers && typeof item.answers === 'object') {
    for (const [k, v] of Object.entries(item.answers)) {
      if (/mobile|phone|contact/i.test(k) && v) {
        mob = String(v).trim();
        break;
      }
    }
  }
  return mob === '-' ? '' : mob;
}

function getEffectiveAltMobile(item: any): string {
  if (!item) return '';
  let alt = String(item.altMobileNumber || item.altMobile || item.alternativeMobileNumber || '').trim();
  if (!alt && item.dynamicAnswers && typeof item.dynamicAnswers === 'object') {
    for (const [k, v] of Object.entries(item.dynamicAnswers)) {
      if (/alt|alternate|alternative|secondary.*phone|secondary.*mob/i.test(k) && v) {
        alt = String(v).trim();
        break;
      }
    }
  }
  if (!alt && item.answers && typeof item.answers === 'object') {
    for (const [k, v] of Object.entries(item.answers)) {
      if (/alt|alternate|alternative|secondary.*phone|secondary.*mob/i.test(k) && v) {
        alt = String(v).trim();
        break;
      }
    }
  }
  return alt;
}

function getEffectiveEmail(item: any): string {
  if (!item) return '';
  let email = String(item.emailId || item.email || item.emailAddress || '').trim();
  if (!email && item.dynamicAnswers && typeof item.dynamicAnswers === 'object') {
    for (const [k, v] of Object.entries(item.dynamicAnswers)) {
      if (/email|e-mail|mail/i.test(k) && v) {
        email = String(v).trim();
        break;
      }
    }
  }
  if (!email && item.answers && typeof item.answers === 'object') {
    for (const [k, v] of Object.entries(item.answers)) {
      if (/email|e-mail|mail/i.test(k) && v) {
        email = String(v).trim();
        break;
      }
    }
  }
  return email;
}

function getEffectiveJobRole(item: any): string {
  if (!item) return '';
  let role = String(item.jobRole || item.role || item.trade || item.designation || '').trim();
  if (!role && item.dynamicAnswers && typeof item.dynamicAnswers === 'object') {
    for (const [k, v] of Object.entries(item.dynamicAnswers)) {
      if (/job.*role|role|trade|position|designation|applied.*for/i.test(k) && v) {
        role = String(v).trim();
        break;
      }
    }
  }
  if (!role && item.answers && typeof item.answers === 'object') {
    for (const [k, v] of Object.entries(item.answers)) {
      if (/job.*role|role|trade|position|designation|applied.*for/i.test(k) && v) {
        role = String(v).trim();
        break;
      }
    }
  }
  return role;
}

function deduplicateServerSubmissions(subs: any[]): any[] {
  if (!Array.isArray(subs)) return [];

  const normalizeStr = (str: any) => String(str || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');

  const valid = subs.filter(s => {
    if (!s) return false;
    const name = String(s.candidateName || s.name || '').trim();
    const pass = getEffectivePassport(s);
    if (!name && !pass) return false;
    return true;
  });

  const consolidated: any[] = [];

  for (const raw of valid) {
    const candName = String(raw.candidateName || raw.name || 'Candidate').trim();
    const passNum = getEffectivePassport(raw);
    const mobNum = getEffectiveMobile(raw);
    const altMobNum = getEffectiveAltMobile(raw);
    const emailStr = getEffectiveEmail(raw);
    const jobRoleStr = getEffectiveJobRole(raw);
    const projName = String(raw.project || raw.projectName || 'General').trim();

    const normName = normalizeStr(candName);
    let matchIdx = -1;

    for (let i = 0; i < consolidated.length; i++) {
      const existing = consolidated[i];
      const exPass = getEffectivePassport(existing);
      const exName = normalizeStr(existing.candidateName);

      // Match 1: Same global passport number
      if (passNum && exPass && passNum === exPass) {
        matchIdx = i;
        break;
      }

      // Match 2: Same candidate full name
      if (normName && exName && normName.length >= 3 && normName === exName) {
        if (isServerProjectMatch(projName, existing.project)) {
          matchIdx = i;
          break;
        }
        if (raw.recruiter && existing.recruiter && raw.recruiter.trim().toLowerCase() === existing.recruiter.trim().toLowerCase()) {
          matchIdx = i;
          break;
        }
      }

      // Match 3: Identical submission ID
      if (raw.id && existing.id && raw.id === existing.id) {
        matchIdx = i;
        break;
      }
    }

    if (matchIdx >= 0) {
      const ex = consolidated[matchIdx];

      const bestPass = passNum || ex.passportNumber || getEffectivePassport(ex) || '';
      const bestName = (candName && candName !== 'Candidate' && candName.length >= (ex.candidateName || '').length)
        ? candName
        : (ex.candidateName || candName);

      const bestRecruiter = (raw.recruiter && raw.recruiter !== 'Recruiter') ? raw.recruiter : (ex.recruiter || raw.recruiter || 'Recruiter');
      const bestMobile = (mobNum && mobNum !== '-' && mobNum.length >= String(ex.mobileNumber || '').length)
        ? mobNum
        : (ex.mobileNumber || mobNum || '');
      const bestAltMobile = altMobNum || ex.altMobileNumber || getEffectiveAltMobile(ex) || '';
      const bestEmail = emailStr || ex.emailId || getEffectiveEmail(ex) || '';
      const bestJobRole = jobRoleStr || ex.jobRole || getEffectiveJobRole(ex) || '';

      const isGoodUrl = (url?: string) => Boolean(url && String(url).startsWith('http') && !String(url).includes('sample_cv') && !String(url).includes('storage.googleapis.com'));
      const bestFileUrl = isGoodUrl(raw.fileUrl) ? raw.fileUrl : (isGoodUrl(ex.fileUrl) ? ex.fileUrl : (raw.fileUrl || ex.fileUrl || ''));
      const bestFileName = (raw.fileName && raw.fileName.length > (ex.fileName || '').length) ? raw.fileName : (ex.fileName || raw.fileName || `${bestName} ${bestPass}.pdf`);
      const bestRemarks = raw.remarks && raw.remarks.length > (ex.remarks || '').length ? raw.remarks : (ex.remarks || raw.remarks || '');
      const mergedDynamic = { ...(ex.dynamicAnswers || {}), ...(raw.dynamicAnswers || {}) };
      const mergedAnswers = { ...(ex.answers || {}), ...(raw.answers || {}) };

      const tsEx = getValidTimestampMs(ex.timestamp);
      const tsRaw = getValidTimestampMs(raw.timestamp);
      const normRaw = parseAndNormalizeTimestamp(raw.timestamp, false) || raw.timestamp;
      const normEx = parseAndNormalizeTimestamp(ex.timestamp, false) || ex.timestamp;

      const nowLimit = Date.now() + 24 * 60 * 60 * 1000;
      let bestTimestamp = normRaw || normEx || new Date().toISOString();
      if (tsRaw > nowLimit && tsEx <= nowLimit && tsEx > 0) {
        bestTimestamp = normEx;
      } else if (tsEx > nowLimit && tsRaw <= nowLimit && tsRaw > 0) {
        bestTimestamp = normRaw;
      } else {
        bestTimestamp = tsRaw >= tsEx ? (normRaw || normEx) : (normEx || normRaw);
      }

      const bestId = ex.id && !ex.id.startsWith('sub-raw') && !ex.id.startsWith('sub-gas') ? ex.id : (raw.id || ex.id);

      consolidated[matchIdx] = {
        ...ex,
        ...raw,
        id: bestId,
        timestamp: bestTimestamp || new Date().toISOString(),
        project: (ex.project && ex.project !== 'General') ? ex.project : projName,
        jobRole: bestJobRole,
        recruiter: bestRecruiter,
        candidateName: bestName,
        passportNumber: bestPass,
        mobileNumber: bestMobile,
        altMobileNumber: bestAltMobile,
        emailId: bestEmail,
        remarks: bestRemarks,
        fileUrl: bestFileUrl,
        fileName: bestFileName,
        dynamicAnswers: mergedDynamic,
        status: ex.status || raw.status || 'Verified',
        directFileUrl: raw.directFileUrl || ex.directFileUrl || '',
        answers: mergedAnswers
      };
    } else {
      const normTs = parseAndNormalizeTimestamp(raw.timestamp, false) || raw.timestamp;
      consolidated.push({
        ...raw,
        id: raw.id || `sub-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        timestamp: normTs || new Date().toISOString(),
        project: projName,
        jobRole: jobRoleStr,
        recruiter: raw.recruiter || 'Recruiter',
        candidateName: candName,
        passportNumber: passNum,
        mobileNumber: mobNum === '-' ? '' : mobNum,
        altMobileNumber: altMobNum,
        emailId: emailStr,
        remarks: (raw.remarks || '').toString().trim(),
        fileUrl: raw.fileUrl || '',
        fileName: raw.fileName || `${candName} ${passNum}.pdf`,
        dynamicAnswers: raw.dynamicAnswers || {},
        status: raw.status || 'Verified',
        directFileUrl: raw.directFileUrl || '',
        answers: raw.answers || {}
      });
    }
  }

  consolidated.sort((a, b) => getValidTimestampMs(b.timestamp) - getValidTimestampMs(a.timestamp));
  return consolidated;
}

function loadServerState(): ServerState {
  ensureDataDir();
  try {
    let raw = "";
    if (fs.existsSync(STATE_FILE)) {
      raw = fs.readFileSync(STATE_FILE, "utf8");
    } else if (fs.existsSync(BUNDLED_STATE_FILE)) {
      raw = fs.readFileSync(BUNDLED_STATE_FILE, "utf8");
      try {
        fs.writeFileSync(STATE_FILE, raw, "utf8");
      } catch (e) {
        // Read-only filesystem is fine, we still parsed raw
      }
    } else {
      const alternates = [
        path.resolve(process.cwd(), "data", "app_state.json"),
        path.resolve(process.cwd(), "..", "data", "app_state.json"),
        path.join("/var/task", "data", "app_state.json")
      ];
      for (const alt of alternates) {
        if (fs.existsSync(alt)) {
          raw = fs.readFileSync(alt, "utf8");
          try { fs.writeFileSync(STATE_FILE, raw, "utf8"); } catch (e) {}
          break;
        }
      }
    }

    if (raw) {
      const parsed = JSON.parse(raw);
      const rawSubs = Array.isArray(parsed.submissions) ? parsed.submissions : [];
      const cleanSubs = deduplicateServerSubmissions(rawSubs);
      const parsedRecs = (Array.isArray(parsed.recruiters) && parsed.recruiters.length > 1) ? parsed.recruiters : DEFAULT_RECRUITERS;
      return {
        config: {
          ...DEFAULT_SERVER_STATE.config,
          ...(parsed.config || {}),
          gasWebAppUrl: parsed.config?.gasWebAppUrl || process.env.VITE_GAS_WEBAPP_URL || process.env.GAS_WEBAPP_URL || DEFAULT_SERVER_STATE.config.gasWebAppUrl,
          passcode: parsed.config?.passcode || process.env.VITE_MANAGER_PASSCODE || DEFAULT_SERVER_STATE.config.passcode,
          docPasscode: parsed.config?.docPasscode || process.env.VITE_DOC_PASSCODE || DEFAULT_SERVER_STATE.config.docPasscode,
        },
        projects: Array.isArray(parsed.projects) ? parsed.projects : [],
        recruiters: parsedRecs,
        submissions: cleanSubs,
        lastUpdated: parsed.lastUpdated || new Date().toISOString()
      };
    }
  } catch (err) {
    console.warn("Error reading server state file, using baseline:", err);
  }
  return { ...DEFAULT_SERVER_STATE };
}

let lastSavedStateHash = "";

function saveServerState(state: ServerState): void {
  ensureDataDir();
  try {
    state.lastUpdated = new Date().toISOString();
    const jsonStr = JSON.stringify(state, null, 2);
    // Only write if state has actually changed to prevent excessive disk writes
    const contentToCompare = JSON.stringify({ ...state, lastUpdated: "" });
    if (contentToCompare === lastSavedStateHash) {
      return;
    }
    lastSavedStateHash = contentToCompare;
    fs.writeFileSync(STATE_FILE, jsonStr, "utf8");
  } catch (err) {
    console.warn("Error writing server state file:", err);
  }
}

// Get global shared app state across all connected devices
app.get("/api/app-state", (_req, res) => {
  try {
    const state = loadServerState();
    return res.json({ success: true, state });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || "Failed to load state" });
  }
});

// Update or merge global shared app state
app.post("/api/app-state", (req, res) => {
  try {
    const currentState = loadServerState();
    const incoming = req.body || {};

    // 1. Merge Config (protect existing non-empty remote credentials)
    if (incoming.config && typeof incoming.config === "object") {
      const incomingCfg = incoming.config;
      currentState.config = {
        ...currentState.config,
        ...(incomingCfg.gasWebAppUrl ? { gasWebAppUrl: incomingCfg.gasWebAppUrl.trim() } : {}),
        ...(incomingCfg.passcode ? { passcode: incomingCfg.passcode.trim() } : {}),
        ...(incomingCfg.docPasscode ? { docPasscode: incomingCfg.docPasscode.trim() } : {}),
        ...(Array.isArray(incomingCfg.teamEmails) ? { teamEmails: incomingCfg.teamEmails } : {}),
        ...(typeof incomingCfg.autoSyncEnabled === "boolean" ? { autoSyncEnabled: incomingCfg.autoSyncEnabled } : {}),
        ...(typeof incomingCfg.autoSyncInterval === "number" ? { autoSyncInterval: incomingCfg.autoSyncInterval } : {})
      };
    }

    // 2. Merge / Overwrite Projects
    if (typeof incoming.deletedProject === "string" && incoming.deletedProject.trim()) {
      const delProjName = incoming.deletedProject.trim().toLowerCase();
      currentState.projects = currentState.projects.filter(p => (p.name || '').trim().toLowerCase() !== delProjName);
    }

    if (incoming.overwriteProjects === true && Array.isArray(incoming.projects)) {
      currentState.projects = incoming.projects;
    } else if (Array.isArray(incoming.projects) && incoming.projects.length > 0) {
      const projectMap = new Map<string, any>();
      // Put existing first
      currentState.projects.forEach(p => {
        if (p && p.name) projectMap.set(p.name.trim().toLowerCase(), p);
      });
      // Merge incoming
      incoming.projects.forEach(p => {
        if (p && p.name) {
          const key = p.name.trim().toLowerCase();
          const existing = projectMap.get(key);
          if (existing) {
            projectMap.set(key, {
              ...existing,
              ...p,
              sheetUrl: p.sheetUrl || existing.sheetUrl || "",
              folderUrl: p.folderUrl || existing.folderUrl || "",
              totalSubmissions: Math.max(p.totalSubmissions || 0, existing.totalSubmissions || 0),
              todaySubmissions: Math.max(p.todaySubmissions || 0, existing.todaySubmissions || 0)
            });
          } else {
            projectMap.set(key, p);
          }
        }
      });
      currentState.projects = Array.from(projectMap.values());
    }

    // 3. Recruiters management (support delete, overwrite, or add)
    if (typeof incoming.deletedRecruiter === "string" && incoming.deletedRecruiter.trim()) {
      const delName = incoming.deletedRecruiter.trim().toLowerCase();
      currentState.recruiters = currentState.recruiters.filter(r => r.trim().toLowerCase() !== delName);
    }

    if (incoming.overwriteRecruiters === true && Array.isArray(incoming.recruiters)) {
      currentState.recruiters = Array.from(new Set(incoming.recruiters.map((r: any) => String(r).trim()).filter(Boolean)));
    } else if (Array.isArray(incoming.recruiters) && incoming.recruiters.length > 0) {
      const recSet = new Set<string>(currentState.recruiters.map(r => r.trim()));
      incoming.recruiters.forEach(r => {
        if (typeof r === "string" && r.trim()) {
          recSet.add(r.trim());
        }
      });
      currentState.recruiters = Array.from(recSet);
    }

    // 4. Submissions management (support delete, overwrite, or merge)
    if (incoming.deletedSubmission) {
      const del = incoming.deletedSubmission;
      const delId = typeof del === "string" ? del : del.id;
      const delProj = (del.project || "").trim().toLowerCase();
      const delPass = (del.passportNumber || "").trim().toLowerCase();
      const delName = (del.candidateName || "").trim().toLowerCase();

      currentState.submissions = currentState.submissions.filter(s => {
        if (!s) return false;
        if (delId && s.id === delId) return false;
        if (delProj && delPass && (s.project || "").trim().toLowerCase() === delProj && (s.passportNumber || "").trim().toLowerCase() === delPass) return false;
        if (delName && delPass && (s.candidateName || "").trim().toLowerCase() === delName && (s.passportNumber || "").trim().toLowerCase() === delPass) return false;
        return true;
      });
    }

    if (incoming.overwriteSubmissions === true && Array.isArray(incoming.submissions)) {
      currentState.submissions = deduplicateServerSubmissions(incoming.submissions);
    } else if (Array.isArray(incoming.submissions) && incoming.submissions.length > 0) {
      const combined = [...currentState.submissions, ...incoming.submissions];
      currentState.submissions = deduplicateServerSubmissions(combined);
    } else {
      currentState.submissions = deduplicateServerSubmissions(currentState.submissions);
    }

    saveServerState(currentState);
    return res.json({ success: true, state: currentState });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || "Failed to save state" });
  }
});

// Google Apps Script Proxy (Handles large payloads, avoids browser CORS/timeout issues, follows redirects)
app.all("/api/gas-proxy", async (req, res) => {
  try {
    const targetUrl = (req.query.url as string) || (req.body && (req.body.scriptUrl || req.body.targetUrl || req.body.url)) || DEFAULT_SERVER_STATE.config.gasWebAppUrl;
    if (!targetUrl) {
      return res.status(400).json({ success: false, error: "Missing gasWebAppUrl ('url' param or 'scriptUrl' body)" });
    }

    const payload = req.body && req.body.payload ? req.body.payload : (req.body && req.body.action ? req.body : null);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 55000); // 55s timeout (within Vercel 60s maxDuration)

    let response: any;
    if (req.method === "GET" || (req.query.action && !payload)) {
      const queryParams = new URLSearchParams();
      for (const key of Object.keys(req.query)) {
        if (key !== "url") queryParams.set(key, String(req.query[key]));
      }
      const fullUrl = targetUrl + (queryParams.toString() ? (targetUrl.includes("?") ? "&" : "?") + queryParams.toString() : "");
      response = await fetch(fullUrl, {
        method: "GET",
        headers: { "Accept": "application/json, text/plain, */*" },
        redirect: "follow",
        signal: controller.signal
      });
    } else {
      // POST payload with text/plain;charset=utf-8 so Google Apps Script handles doPost(e) cleanly
      response = await fetch(targetUrl, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(payload || {}),
        redirect: "follow",
        signal: controller.signal
      });
    }
    clearTimeout(timeout);

    const text = await response.text();
    try {
      return res.json(JSON.parse(text));
    } catch {
      return res.send(text);
    }
  } catch (err: any) {
    console.error("GAS Proxy error:", err.message);
    return res.status(504).json({ success: false, error: err.message || "Proxy request timed out or failed" });
  }
});

// Single Project Upsert
app.post("/api/save-project", (req, res) => {
  try {
    const { project, originalName } = req.body || {};
    if (!project || !project.name) {
      return res.status(400).json({ success: false, message: "Project name is required" });
    }
    const state = loadServerState();
    const cleanName = project.name.trim();
    
    if (originalName) {
      const idx = state.projects.findIndex(p => p.name.trim().toLowerCase() === originalName.trim().toLowerCase());
      if (idx >= 0) {
        state.projects[idx] = { ...state.projects[idx], ...project, name: cleanName };
      } else {
        state.projects.unshift(project);
      }
    } else {
      const idx = state.projects.findIndex(p => p.name.trim().toLowerCase() === cleanName.toLowerCase());
      if (idx >= 0) {
        state.projects[idx] = { ...state.projects[idx], ...project };
      } else {
        state.projects.unshift(project);
      }
    }
    saveServerState(state);
    return res.json({ success: true, project, projects: state.projects });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// Single Project Delete
app.post("/api/delete-project", (req, res) => {
  try {
    const { projectName } = req.body || {};
    if (!projectName) {
      return res.status(400).json({ success: false, message: "Project name is required" });
    }
    const state = loadServerState();
    state.projects = state.projects.filter(p => p.name.trim().toLowerCase() !== projectName.trim().toLowerCase());
    saveServerState(state);
    return res.json({ success: true, projects: state.projects });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// Single Submission Upsert
app.post("/api/save-submission", (req, res) => {
  try {
    const { submission } = req.body || {};
    if (!submission || !submission.project || !submission.passportNumber) {
      return res.status(400).json({ success: false, message: "Invalid submission payload" });
    }
    const state = loadServerState();
    const cleanPass = submission.passportNumber.trim().toLowerCase();
    const cleanProj = submission.project.trim().toLowerCase();
    
    const idx = state.submissions.findIndex(s => 
      s.project.trim().toLowerCase() === cleanProj && 
      s.passportNumber.trim().toLowerCase() === cleanPass
    );
    if (idx >= 0) {
      state.submissions[idx] = { ...state.submissions[idx], ...submission };
    } else {
      state.submissions.unshift(submission);
    }
    saveServerState(state);
    return res.json({ success: true, submission, total: state.submissions.length });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// Single Submission Delete
app.post("/api/delete-submission", (req, res) => {
  try {
    const { id, project, passportNumber } = req.body || {};
    const state = loadServerState();
    if (id) {
      state.submissions = state.submissions.filter(s => s.id !== id);
    } else if (project && passportNumber) {
      const cleanPass = passportNumber.trim().toLowerCase();
      const cleanProj = project.trim().toLowerCase();
      state.submissions = state.submissions.filter(s => !(s.project.trim().toLowerCase() === cleanProj && s.passportNumber.trim().toLowerCase() === cleanPass));
    }
    saveServerState(state);
    return res.json({ success: true, total: state.submissions.length });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// Fetch & Parse External Google Sheet or CSV data
app.post("/api/fetch-sheet", async (req, res) => {
  try {
    const { sheetUrl, csvContent } = req.body || {};

    if (csvContent && typeof csvContent === "string" && csvContent.trim()) {
      const parsed = parseCsvText(csvContent);
      return res.json({
        success: true,
        headers: parsed.headers,
        rows: parsed.rows,
        totalRows: parsed.totalRows
      });
    }

    if (!sheetUrl || typeof sheetUrl !== "string") {
      return res.status(400).json({ success: false, error: "Please provide a valid Google Sheet URL" });
    }

    const cleanUrl = sheetUrl.trim();
    const pubMatch = cleanUrl.match(/\/spreadsheets\/d\/e\/([a-zA-Z0-9-_]+)/);
    const standardMatch = cleanUrl.match(/(?:\/spreadsheets\/(?:u\/\d+\/)?d\/(?!e\/)|\/file\/d\/|[?&]id=|^)([a-zA-Z0-9-_]{20,})/);
    const gidMatch = cleanUrl.match(/[#&?]gid=([0-9]+)/);
    const specificGid = gidMatch ? gidMatch[1] : undefined;
    const gid = specificGid || "0";

    const candidateUrls: string[] = [];

    if (pubMatch && pubMatch[1]) {
      const pubId = pubMatch[1];
      if (cleanUrl.includes("output=csv")) {
        candidateUrls.push(cleanUrl);
      }
      if (cleanUrl.includes("/pubhtml")) {
        candidateUrls.push(cleanUrl.replace("/pubhtml", "/pub?output=csv"));
      }
      if (specificGid) {
        candidateUrls.push(`https://docs.google.com/spreadsheets/d/e/${pubId}/pub?output=csv&gid=${specificGid}`);
      }
      candidateUrls.push(
        `https://docs.google.com/spreadsheets/d/e/${pubId}/pub?output=csv`,
        `https://docs.google.com/spreadsheets/d/e/${pubId}/pub?output=csv&gid=0`
      );
    } else if (standardMatch && standardMatch[1]) {
      const sheetId = standardMatch[1];
      if (cleanUrl.includes("/export?format=csv")) {
        candidateUrls.push(cleanUrl);
      }
      // If user provided a specific tab gid, try that first
      if (specificGid) {
        candidateUrls.push(
          `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&gid=${specificGid}`,
          `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${specificGid}`
        );
      }
      // Prioritize no-gid GViz (which automatically accesses the first active tab in any spreadsheet!)
      candidateUrls.push(
        `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv`,
        `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv`,
        `https://docs.google.com/spreadsheets/d/${sheetId}/pub?output=csv`,
        `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&gid=0`,
        `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=0`
      );
    } else if (cleanUrl.startsWith("http://") || cleanUrl.startsWith("https://")) {
      candidateUrls.push(cleanUrl);
    } else {
      return res.status(400).json({ success: false, error: "Invalid sheet URL format. Please provide a full Google Sheets link." });
    }

    let csvData = "";

    for (const targetUrl of candidateUrls) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 12000);
        const response = await fetch(targetUrl, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "text/csv, text/plain, */*"
          },
          redirect: "follow",
          signal: controller.signal
        });
        clearTimeout(timer);

        if (response.ok) {
          const text = await response.text();
          if (text && !text.includes("<!DOCTYPE html") && !text.includes("<html") && !text.includes("ServiceLogin")) {
            csvData = text;
            break;
          }
        }
      } catch {
        // Try next candidate URL
      }
    }

    // Fallback: If direct CSV fetches returned HTML login and GAS Web App is configured, try GAS
    const currentState = loadServerState();
    if (!csvData && currentState.config.gasWebAppUrl) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 15000);
        const gasRes = await fetch(currentState.config.gasWebAppUrl, {
          method: "POST",
          headers: { "Content-Type": "text/plain" },
          body: JSON.stringify({
            action: "managerFetchSheetByUrl",
            args: [currentState.config.passcode, cleanUrl]
          }),
          signal: controller.signal
        });
        clearTimeout(timer);

        if (gasRes.ok) {
          const gasJson = await gasRes.json();
          if (gasJson && gasJson.success && gasJson.headers && gasJson.headers.length > 0) {
            return res.json({
              success: true,
              sheetId: standardMatch ? standardMatch[1] : undefined,
              gid,
              headers: gasJson.headers,
              rows: gasJson.rows || [],
              totalRows: gasJson.totalRows || (gasJson.rows ? gasJson.rows.length : 0)
            });
          }
        }
      } catch {
        // GAS fallback failed, proceed to return friendly instructions
      }
    }

    if (!csvData) {
      return res.status(400).json({
        success: false,
        isPrivateSheet: true,
        error: "Unable to read Google Sheet automatically. Please ensure link sharing is set to 'Anyone with the link can view' (In Google Sheets: Share → General access → Anyone with the link → Viewer), or copy and paste the sheet rows / CSV file directly."
      });
    }

    const parsed = parseCsvText(csvData);
    if (!parsed.headers || parsed.headers.length === 0) {
      return res.status(400).json({ success: false, error: "The sheet appears to be empty or has no header row." });
    }

    return res.json({
      success: true,
      sheetId: standardMatch ? standardMatch[1] : (pubMatch ? pubMatch[1] : undefined),
      gid,
      headers: parsed.headers,
      rows: parsed.rows,
      totalRows: parsed.totalRows
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || "Failed to process sheet" });
  }
});

// Health Check
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        watch: {
          ignored: ["**/data/**", "**/github-upload-ready/**", "**/dist/**", "**/.git/**"],
        },
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
    app.use("*", async (req, res, next) => {
      const url = req.originalUrl;
      try {
        const indexPath = path.resolve(process.cwd(), "index.html");
        let template = fs.readFileSync(indexPath, "utf-8");
        template = await vite.transformIndexHtml(url, template);
        res.status(200).set({ "Content-Type": "text/html" }).end(template);
      } catch (e: any) {
        vite.ssrFixStacktrace(e);
        next(e);
      }
    });
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Dynamic Document Hub running on http://0.0.0.0:${PORT}`);
  });
}

// Only start the standalone listener if not running in a serverless environment (e.g. Vercel)
if (!process.env.VERCEL && !process.env.AWS_LAMBDA_FUNCTION_NAME) {
  startServer();
}

export default app;

