// Offline API emulator with IndexedDB and audit log
// Provides the same shapes as the server's /api endpoints to let the app run fully offline.

const DB_NAME = 'zeitapp-local';
const DB_VERSION = 1;
let dbPromise;

function openDB(){
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject)=>{
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e)=>{
      const db = req.result;
      if(!db.objectStoreNames.contains('entries')){
        db.createObjectStore('entries', { keyPath: 'id' });
      }
      if(!db.objectStoreNames.contains('meta')){
        const store = db.createObjectStore('meta', { keyPath: 'key' });
        store.put({ key:'active', value:null });
      }
      if(!db.objectStoreNames.contains('audits')){
        db.createObjectStore('audits', { keyPath: 'id' });
      }
    };
    req.onsuccess = ()=> resolve(req.result);
    req.onerror = ()=> reject(req.error);
  });
  return dbPromise;
}

function tx(store, mode, runner){
  return openDB().then(db=>new Promise((resolve, reject)=>{
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    const res = runner(s);
    t.oncomplete = ()=> resolve(res);
    t.onerror = ()=> reject(t.error);
    t.onabort = ()=> reject(t.error);
  }));
}

function all(store){
  return openDB().then(db=>new Promise((resolve, reject)=>{
    const t = db.transaction(store, 'readonly');
    const s = t.objectStore(store);
    const req = s.getAll();
    req.onsuccess = ()=> resolve(req.result||[]);
    req.onerror = ()=> reject(req.error);
  }));
}

function get(store, key){
  return openDB().then(db=>new Promise((resolve, reject)=>{
    const t = db.transaction(store, 'readonly');
    const s = t.objectStore(store);
    const req = s.get(key);
    req.onsuccess = ()=> resolve(req.result);
    req.onerror = ()=> reject(req.error);
  }));
}

function put(store, value){ return tx(store, 'readwrite', s=>s.put(value)); }
function del(store, key){ return tx(store, 'readwrite', s=>s.delete(key)); }

function uuid(){
  try { return crypto.randomUUID(); } catch { return 'id-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8); }
}

async function audit(action, details){
  const rec = { id: uuid(), ts: Date.now(), action, ...details };
  await put('audits', rec);
}

export async function offlineInit(){ await openDB(); }
export function enableOffline(flag=true){ window.__USE_LOCAL_OFFLINE__ = !!flag; try { localStorage.setItem('USE_LOCAL_OFFLINE', JSON.stringify(!!flag)); } catch{} }

async function listEntries(){ return await all('entries'); }
async function createEntry(entry){ await put('entries', entry); await audit('entry.create', { entryId: entry.id, after: entry }); return entry; }
async function updateEntry(id, patch){ const before = await get('entries', id); if(!before) throw new Error('Not found'); const after = { ...before, ...patch }; await put('entries', after); await audit('entry.update', { entryId: id, before, after }); return after; }
async function deleteEntry(id){ const before = await get('entries', id); if(!before) return false; await del('entries', id); await audit('entry.delete', { entryId: id, before }); return true; }

async function getActive(){ const rec = await get('meta', 'active'); return rec ? rec.value : null; }
async function setActive(a){ await put('meta', { key:'active', value:a }); }

async function startActive(){ const cur = await getActive(); if(cur) throw new Error('Active session exists'); const a = { id: uuid(), start: Date.now(), pauseMs:0, pauseStartedAt:null, acknowledgedBreak:false, client:'', tasks:'', skills:[] }; await setActive(a); return a; }
async function pauseActive(){ const a = await getActive(); if(!a) throw new Error('No active'); if(!a.pauseStartedAt) a.pauseStartedAt = Date.now(); await setActive(a); return a; }
async function resumeActive(){ const a = await getActive(); if(!a) throw new Error('No active'); if(a.pauseStartedAt){ a.pauseMs += Date.now() - a.pauseStartedAt; a.pauseStartedAt = null; } await setActive(a); return a; }
async function updateActive(payload){ const a = await getActive(); if(!a) throw new Error('No active'); const before = { ...a }; Object.assign(a, payload||{}); await setActive(a); await audit('active.update', { before, after: a, entryId: a.id }); return a; }
async function ackBreak(){ const a = await getActive(); if(!a) throw new Error('No active'); a.acknowledgedBreak = true; await setActive(a); return a; }
async function cancelActive(){ const a = await getActive(); if(!a) throw new Error('No active'); await setActive(null); await audit('active.cancel', { entryId: a.id, before: a }); return true; }
async function finishActive(){ const a = await getActive(); if(!a) throw new Error('No active'); if(a.pauseStartedAt){ a.pauseMs += Date.now() - a.pauseStartedAt; a.pauseStartedAt = null; } const end = Date.now(); const entry = { id: uuid(), client:a.client, skills:a.skills||[], tasks:a.tasks||'', start:a.start, end, pauseMs:a.pauseMs||0, acknowledgedBreak: !!a.acknowledgedBreak }; await createEntry(entry); await audit('active.finish', { entryId: entry.id, after: entry }); await setActive(null); return entry; }

function parseUrl(url){ try { return new URL(url, location.origin); } catch { return new URL(location.origin + url); } }

export async function emulateApi(method, url, body){
  const u = parseUrl(url);
  const p = u.pathname;
  // Auth/session emulation
  if(p === '/api/session' && method === 'GET'){ return { user: 'offline' }; }
  if(p === '/api/login' && method === 'POST'){ return { success: true }; }
  if(p === '/api/logout' && method === 'POST'){ return { success: true }; }
  // Entries
  if(p === '/api/entries' && method === 'GET'){ return await listEntries(); }
  if(p === '/api/entries' && method === 'POST'){ const entry = body; if(!entry.id) entry.id = uuid(); return await createEntry(entry); }
  if(p.startsWith('/api/entries/') && method === 'PUT'){ const id = p.split('/').pop(); return await updateEntry(id, body||{}); }
  if(p.startsWith('/api/entries/') && method === 'DELETE'){ const id = p.split('/').pop(); const ok = await deleteEntry(id); if(!ok) throw new Error('Not found'); return { success:true }; }
  // Active
  if(p === '/api/active' && method === 'GET'){ return { active: await getActive() }; }
  if(p === '/api/active/start' && method === 'POST'){ return { active: await startActive() }; }
  if(p === '/api/active/pause' && method === 'POST'){ return { active: await pauseActive() }; }
  if(p === '/api/active/resume' && method === 'POST'){ return { active: await resumeActive() }; }
  if(p === '/api/active/update' && method === 'POST'){ return { active: await updateActive(body||{}) }; }
  if(p === '/api/active/ackBreak' && method === 'POST'){ return { active: await ackBreak() }; }
  if(p === '/api/active/cancel' && method === 'POST'){ await cancelActive(); return { success:true }; }
  if(p === '/api/active/finish' && method === 'POST'){ return await finishActive(); }
  throw new Error('Unsupported offline endpoint '+method+' '+p);
}

export async function getAuditLog(){ return await all('audits'); }
