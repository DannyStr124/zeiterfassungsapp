import 'dotenv/config';
import express from 'express';
import session from 'express-session';
import bcrypt from 'bcrypt';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuid } from 'uuid';
import helmet from 'helmet';
// Add persistent session store (file based)
import fileStoreFactory from 'session-file-store';
const FileStore = fileStoreFactory(session);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, 'data');
const ENTRIES_FILE = path.join(DATA_DIR, 'entries.json');
const ACTIVE_FILE = path.join(DATA_DIR, 'activeSession.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
if (!fs.existsSync(ENTRIES_FILE)) fs.writeFileSync(ENTRIES_FILE, '[]', 'utf8');
if (!fs.existsSync(ACTIVE_FILE)) fs.writeFileSync(ACTIVE_FILE, 'null', 'utf8');

// Config
const PORT = process.env.PORT || 3000;
const ADMIN_USER = process.env.ADMIN_USER || 'Daniel Streuter';
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH || '$2b$12$REPLACE_ME_WITH_HASH'; // placeholder

function loadEntries(){
  try { return JSON.parse(fs.readFileSync(ENTRIES_FILE,'utf8')); } catch { return []; }
}
function saveEntries(entries){ fs.writeFileSync(ENTRIES_FILE, JSON.stringify(entries, null, 2)); }
function loadActive(){ try { return JSON.parse(fs.readFileSync(ACTIVE_FILE,'utf8')); } catch { return null; } }
function saveActive(a){ fs.writeFileSync(ACTIVE_FILE, JSON.stringify(a, null, 2)); }

const app = express();
// Trust proxy (needed if later behind reverse proxy for secure cookies)
app.set('trust proxy', 1);
app.use(express.json());
app.use(session({
  name: 'zeit.sid',
  store: new FileStore({
    path: path.join(__dirname, '..', 'sessions'),
    retries: 1,
    ttl: 60 * 60 * 24 * 30, // 30 Tage
    fileExtension: '.json'
  }),
  secret: process.env.SESSION_SECRET || 'dev-secret-change',
  resave: false,
  saveUninitialized: false,
  rolling: true, // refresh cookie maxAge on activity
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 1000 * 60 * 60 * 24 * 30
  }
}));
app.use(helmet({
  contentSecurityPolicy:false,
  crossOriginEmbedderPolicy:false
}));
app.use((req,res,next)=>{ res.setHeader('Cache-Control','no-store'); next(); });

// Simple rate limit (very light)
const loginAttempts = new Map();
function rateLimit(req, res, next){
  const ip = req.ip;
  const rec = loginAttempts.get(ip) || { count:0, ts:Date.now() };
  if (Date.now() - rec.ts > 15*60*1000) { rec.count=0; rec.ts=Date.now(); }
  if (rec.count > 20) return res.status(429).json({error:'Too many attempts'});
  rec.count++; loginAttempts.set(ip, rec); next();
}

function requireAuth(req,res,next){ if(req.session.user===ADMIN_USER) return next(); return res.status(401).json({error:'Unauthorized'}); }

app.get('/api/session', (req,res)=>{
  if (req.session.user===ADMIN_USER) return res.json({ user: ADMIN_USER });
  res.json({ user: null });
});

app.post('/api/login', rateLimit, async (req,res)=>{
  const { user, password } = req.body || {};
  if (user !== ADMIN_USER) return res.status(401).json({error:'Invalid credentials'});
  if (!ADMIN_PASSWORD_HASH || ADMIN_PASSWORD_HASH.includes('REPLACE_ME_WITH_HASH')) {
    return res.status(500).json({error:'Server password hash not configured'});
  }
  const ok = await bcrypt.compare(password || '', ADMIN_PASSWORD_HASH);
  if (!ok) return res.status(401).json({error:'Invalid credentials'});
  // Regenerate session to prevent fixation, then set user and save
  req.session.regenerate(err => {
    if (err) return res.status(500).json({error:'Session error'});
    req.session.user = ADMIN_USER;
    req.session.save(() => res.json({ success:true }));
  });
});

app.post('/api/logout', (req,res)=>{
  req.session.destroy(()=>{ try { res.clearCookie('zeit.sid'); } catch{} res.json({ success:true }); });
});

app.get('/api/entries', requireAuth, (req,res)=>{
  const entries = loadEntries();
  res.json(entries);
});

app.post('/api/entries', requireAuth, (req,res)=>{
  const entries = loadEntries();
  const { client='', skills=[], tasks='', start, end, pauseMs=0, acknowledgedBreak=false } = req.body || {};
  if (!start || !end) return res.status(400).json({error:'Missing start/end'});
  const entry = { id: uuid(), client:String(client), skills:skills.map(s=>String(s)), tasks:String(tasks), start:Number(start), end:Number(end), pauseMs:Number(pauseMs), acknowledgedBreak: !!acknowledgedBreak };
  entries.push(entry);
  saveEntries(entries);
  res.status(201).json(entry);
});

app.put('/api/entries/:id', requireAuth, (req,res)=>{
  const entries = loadEntries();
  const idx = entries.findIndex(e=>e.id===req.params.id);
  if (idx===-1) return res.status(404).json({error:'Not found'});
  const cur = entries[idx];
  const { client, skills, tasks, start, end, pauseMs, acknowledgedBreak } = req.body || {};
  if (start && end && Number(end) <= Number(start)) return res.status(400).json({error:'End must be after start'});
  if (client!==undefined) cur.client=String(client);
  if (skills!==undefined) cur.skills=Array.isArray(skills)?skills.map(s=>String(s)):cur.skills;
  if (tasks!==undefined) cur.tasks=String(tasks);
  if (start!==undefined) cur.start=Number(start);
  if (end!==undefined) cur.end=Number(end);
  if (pauseMs!==undefined) cur.pauseMs=Number(pauseMs);
  if (acknowledgedBreak!==undefined) cur.acknowledgedBreak=!!acknowledgedBreak;
  saveEntries(entries);
  res.json(cur);
});

app.delete('/api/entries/:id', requireAuth, (req,res)=>{
  let entries = loadEntries();
  const lenBefore = entries.length;
  entries = entries.filter(e=>e.id!==req.params.id);
  if (entries.length === lenBefore) return res.status(404).json({error:'Not found'});
  saveEntries(entries);
  res.json({ success:true });
});

app.get('/api/active', requireAuth, (req,res)=>{
  const a = loadActive();
  if(!a) return res.json({active:null});
  res.json({ active: a });
});
app.post('/api/active/start', requireAuth, (req,res)=>{
  const cur = loadActive();
  if(cur) return res.status(409).json({error:'Active session exists'});
  const a = { id: uuid(), start: Date.now(), pauseMs:0, pauseStartedAt:null, acknowledgedBreak:false, client:'', tasks:'', skills:[] };
  saveActive(a);
  res.status(201).json({ active: a });
});
app.post('/api/active/pause', requireAuth, (req,res)=>{
  const a = loadActive();
  if(!a) return res.status(404).json({error:'No active'});
  if(!a.pauseStartedAt){ a.pauseStartedAt = Date.now(); saveActive(a); }
  res.json({ active:a });
});
app.post('/api/active/resume', requireAuth, (req,res)=>{
  const a = loadActive();
  if(!a) return res.status(404).json({error:'No active'});
  if(a.pauseStartedAt){ a.pauseMs += Date.now() - a.pauseStartedAt; a.pauseStartedAt = null; saveActive(a); }
  res.json({ active:a });
});
app.post('/api/active/update', requireAuth, (req,res)=>{
  const a = loadActive();
  if(!a) return res.status(404).json({error:'No active'});
  const { client, tasks, addTask, skills, acknowledgedBreak } = req.body || {};
  if(client!==undefined) a.client = String(client);
  if(tasks!==undefined) a.tasks = String(tasks);
  if(addTask){ const line = String(addTask).trim(); if(line){ a.tasks = (a.tasks? a.tasks+"\n":"") + line; } }
  if(skills!==undefined) a.skills = Array.isArray(skills)? skills.map(s=>String(s)) : a.skills;
  if(acknowledgedBreak!==undefined) a.acknowledgedBreak = !!acknowledgedBreak;
  saveActive(a);
  res.json({ active:a });
});
app.post('/api/active/ackBreak', requireAuth, (req,res)=>{
  const a = loadActive(); if(!a) return res.status(404).json({error:'No active'}); a.acknowledgedBreak=true; saveActive(a); res.json({ active:a }); });
app.post('/api/active/cancel', requireAuth, (req,res)=>{ const a = loadActive(); if(!a) return res.status(404).json({error:'No active'}); saveActive(null); res.json({success:true}); });
app.post('/api/active/finish', requireAuth, (req,res)=>{
  const a = loadActive();
  if(!a) return res.status(404).json({error:'No active'});
  const entries = loadEntries();
  if(a.pauseStartedAt){ a.pauseMs += Date.now() - a.pauseStartedAt; a.pauseStartedAt=null; }
  const end = Date.now();
  const entry = { id: uuid(), client:a.client, skills:a.skills, tasks:a.tasks, start:a.start, end, pauseMs:a.pauseMs, acknowledgedBreak:a.acknowledgedBreak };
  entries.push(entry);
  saveEntries(entries);
  saveActive(null);
  res.json(entry);
});

// Serve production build (dist) if present
const DIST_DIR = path.join(__dirname, '..', 'dist');
if (fs.existsSync(DIST_DIR)) {
  console.log('Static build gefunden, wird ausgeliefert aus:', DIST_DIR);
  // Static assets
  app.use(express.static(DIST_DIR));
  // SPA Fallback (alles außer /api/* -> index.html)
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(DIST_DIR, 'index.html'));
  });
} else {
  console.log('Kein dist/ gefunden. Für Single-Port Produktion zuerst: npm run build');
}

app.listen(PORT, ()=>{
  console.log('Server listening on '+PORT);
  if (ADMIN_PASSWORD_HASH.includes('REPLACE_ME_WITH_HASH')) {
    console.warn('\nIMPORTANT: Set ADMIN_PASSWORD_HASH env var (bcrypt hash of your password).');
  }
});
console.log('[Startup] server.js loaded (cwd=', process.cwd(), ')');
