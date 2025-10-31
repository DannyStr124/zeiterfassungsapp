// Bereinigte Version main.js – Backend Auth + Einträge

/** @typedef {{ id:string, client:string, skills:string[], tasks:string, start:number, end:number|null, pauseMs:number, acknowledgedBreak:boolean, pauseStartedAt?:number|null }} ActiveEntry */
/** @typedef {{ id:string, client:string, skills:string[], tasks:string, start:number, end:number, pauseMs:number, acknowledgedBreak:boolean }} Entry */

// --- State ---
let entries = []; /** @type {Entry[]} */
let active = null; /** @type {ActiveEntry|null} */
let rafId = null;
let clientSort = { key:'net', dir:-1 };
let knownClients = JSON.parse(localStorage.getItem('knownClients')||'[]');
let inlineTasks = []; // nur lokale Darstellung; Server speichert zusammengeführte tasks

// --- Elements ---
const btnStart = document.getElementById('btnStart');
const btnPause = document.getElementById('btnPause');
const btnEnd = document.getElementById('btnEnd');
const btnAcknowledgeBreak = document.getElementById('btnAcknowledgeBreak');
const btnExportCsv = document.getElementById('btnExportCsv');
const btnMail = document.getElementById('btnMail');
const btnInstall = document.getElementById('btnInstall');
const btnTheme = document.getElementById('btnTheme');
const timerDisplay = document.getElementById('timerDisplay');
const pauseInfo = document.getElementById('pauseInfo');
const activeSessionCard = document.getElementById('activeSessionCard');
const startPanel = document.getElementById('startPanel');
const startMeta = document.getElementById('startMeta');
const dangerIndicator = document.getElementById('dangerIndicator');
const alertBar = document.getElementById('alertBar');
const dashboardContent = document.getElementById('dashboardContent');
const noData = document.getElementById('noData');
// Dialog Abschluss
const finishDialog = document.getElementById('finishDialog');
const finishForm = document.getElementById('finishForm');
const clientInput = document.getElementById('clientInput');
const clientSelect = document.getElementById('clientSelect');
const skillsInput = document.getElementById('skillsInput');
const tasksInput = document.getElementById('tasksInput');
const summaryBox = document.getElementById('summaryBox');
const btnCloseDialog = document.getElementById('btnCloseDialog');
const btnCancelDialog = document.getElementById('btnCancelDialog');
// Dialog Edit
const editEntryDialog = document.getElementById('editEntryDialog');
const editEntryForm = document.getElementById('editEntryForm');
const editId = document.getElementById('editId');
const editClientInput = document.getElementById('editClientInput');
const editClientSelect = document.getElementById('editClientSelect');
const editSkillsInput = document.getElementById('editSkillsInput');
const editTasksInput = document.getElementById('editTasksInput');
const editStartInput = document.getElementById('editStartInput');
const editEndInput = document.getElementById('editEndInput');
const editPauseInput = document.getElementById('editPauseInput');
const btnDeleteEntry = document.getElementById('btnDeleteEntry');
const btnCloseEditDialog = document.getElementById('btnCloseEditDialog');
const btnCancelEditDialog = document.getElementById('btnCancelEditDialog');
// Stats
const clientStatsTable = document.getElementById('clientStatsTable');
const clientStatsBody = document.getElementById('clientStatsBody');
const noClientStats = document.getElementById('noClientStats');
// Login
const loginForm = document.getElementById('loginForm');
const userInput = document.getElementById('userInput');
const passInput = document.getElementById('passInput');
const loginError = document.getElementById('loginError');
const btnLogout = document.getElementById('btnLogout');
const btnCancelActive = document.getElementById('btnCancelActive');
// Inline capture elements
const inlineClientSelect = document.getElementById('inlineClientSelect');
const inlineClientInput = document.getElementById('inlineClientInput');
const inlineTaskInput = document.getElementById('inlineTaskInput');
const taskChips = document.getElementById('taskChips');
const btnClearTasks = document.getElementById('btnClearTasks');
const btnToggleNotes = document.getElementById('btnToggleNotes');

// --- Known Clients Helpers (after elements to avoid TDZ errors) ---
function saveKnownClients(){ try { localStorage.setItem('knownClients', JSON.stringify(knownClients.slice(0,200))); } catch{} }
function refreshClientSelects(){ const opts = '<option value="">(Auswählen)</option>' + knownClients.map(c=>`<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join(''); if(clientSelect) clientSelect.innerHTML=opts; if(editClientSelect) editClientSelect.innerHTML=opts; if(inlineClientSelect) inlineClientSelect.innerHTML=opts; }
function addKnownClient(name){ name=(name||'').trim(); if(!name) return; if(!knownClients.includes(name)){ knownClients.unshift(name); knownClients=knownClients.slice(0,200); saveKnownClients(); refreshClientSelects(); }}
refreshClientSelects();
clientSelect?.addEventListener('change', ()=>{ if(clientSelect.value) clientInput.value=clientSelect.value; });
editClientSelect?.addEventListener('change', ()=>{ if(editClientSelect.value) editClientInput.value=editClientSelect.value; });
inlineClientSelect?.addEventListener('change', ()=>{ if(inlineClientSelect.value) inlineClientInput.value=inlineClientSelect.value; syncInlineClient(); });
inlineClientInput?.addEventListener('input', ()=>syncInlineClient());

// --- Inline tasks helpers ---
function renderTaskChips(){ if(!taskChips) return; taskChips.innerHTML = inlineTasks.map((t,i)=>`<div class="taskChip" data-i="${i}">${escapeHtml(t)} <button title="Entfernen" data-remove="${i}">×</button></div>`).join(''); taskChips.querySelectorAll('button[data-remove]').forEach(btn=>btn.addEventListener('click', e=>{ const idx=Number(btn.dataset.remove); inlineTasks.splice(idx,1); renderTaskChips(); syncInlineTasks(); })); }
function syncInlineTasks(){ if(!active) return; active.tasks = inlineTasks.join('\n'); scheduleActiveChanges({ tasks: active.tasks }); }
function syncInlineClient(){ if(!active) return; const val = (inlineClientInput?.value||'').trim() || (inlineClientSelect?.value||'').trim(); if(val!==active.client){ active.client = val; if(val) addKnownClient(val); scheduleActiveChanges({ client: val }); }}
inlineTaskInput?.addEventListener('keydown', async e=>{ if(e.key==='Enter'){ e.preventDefault(); const v=inlineTaskInput.value.trim(); if(v){ inlineTasks.push(v); inlineTaskInput.value=''; renderTaskChips(); // send incremental addTask to avoid race merging
 try { await updateActiveServer({ addTask: v }); } catch{} active.tasks = (active.tasks?active.tasks+'\n':'') + v; } } });
btnClearTasks?.addEventListener('click', e=>{ e.preventDefault(); if(!inlineTasks.length) return; if(!confirm('Alle aktuellen Notizen/Aufgaben zurücksetzen?')) return; inlineTasks=[]; renderTaskChips(); syncInlineTasks(); });
btnToggleNotes?.addEventListener('click', ()=>{ document.body.classList.toggle('inlinePanel-hidden'); });

// --- API Helper ---
import { emulateApi, enableOffline, offlineInit } from './offlineApi.js';

let useOffline = false;
(async function initOffline(){ try { await offlineInit(); useOffline = JSON.parse(localStorage.getItem('USE_LOCAL_OFFLINE')||'true'); } catch{} })();

async function api(method, url, body){
  if(useOffline){ return await emulateApi(method, url, body); }
  try {
    const res = await fetch(url, { method, headers: { 'Content-Type':'application/json' }, body: body?JSON.stringify(body):undefined, credentials:'include' });
    if(!res.ok){ let msg='Fehler'; try{ const j=await res.json(); msg=j.error||msg; }catch{} throw new Error(msg); }
    try { return await res.json(); } catch { return null; }
  } catch(err){
    // Fallback to offline emulation when network/server not available
    console.warn('[API] Falling back to offline mode due to error:', err.message);
    useOffline = true; enableOffline(true);
    return await emulateApi(method, url, body);
  }
}

window.enableOffline = (flag)=>{ useOffline = !!flag; enableOffline(flag); console.log('Offline mode', useOffline?'enabled':'disabled'); };

async function loadEntries(){ entries = await api('GET','/api/entries'); }
async function getActive(){ try { const r = await api('GET','/api/active'); return r.active; } catch { return null; } }
async function startActiveOnServer(){ try { const r= await api('POST','/api/active/start'); return r.active; } catch(e){ if(e.message.includes('exists')) return await getActive(); throw e; } }
async function pauseActive(){ if(!active) return; const r = await api('POST','/api/active/pause'); active = r.active; }
async function resumeActive(){ if(!active) return; const r = await api('POST','/api/active/resume'); active = r.active; }
async function updateActiveServer(payload){ if(!active) return; try { const r=await api('POST','/api/active/update', payload); active=r.active; } catch(e){ console.warn('[Active update failed]', e.message); } }
async function ackBreakServer(){ if(!active) return; try { const r=await api('POST','/api/active/ackBreak'); active=r.active; } catch{} }
async function cancelActiveServer(){ if(!active) return; try { await api('POST','/api/active/cancel'); } catch{} }
async function finishActiveServer(payload){ if(!active) return null; if(payload) await updateActiveServer(payload); try { return await api('POST','/api/active/finish'); } catch(e){ alert('Abschließen fehlgeschlagen: '+e.message); return null; } }
// createEntry/updateEntry/deleteEntry remain for legacy editing
async function createEntry(e){ return await api('POST','/api/entries', e); }
async function updateEntry(e){ return await api('PUT',`/api/entries/${e.id}`, e); }
async function deleteEntry(id){ await api('DELETE',`/api/entries/${id}`); entries = entries.filter(x=>x.id!==id); }

// --- Debounced Active Updates (re-added) ---
function debounce(fn, wait){ let t; return function(...a){ clearTimeout(t); t=setTimeout(()=>fn.apply(this,a), wait); }; }
let pendingChanges = {}; const flushActiveChanges = debounce(()=>{ if(!active) { pendingChanges={}; return;} const changes = pendingChanges; pendingChanges={}; updateActiveServer(changes); }, 600);
function scheduleActiveChanges(ch){ if(!active) return; Object.assign(pendingChanges, ch); flushActiveChanges(); }

// --- Formatting ---
function formatDuration(ms){ const s=Math.floor(ms/1000); const h=String(Math.floor(s/3600)).padStart(2,'0'); const m=String(Math.floor(s%3600/60)).padStart(2,'0'); const sec=String(s%60).padStart(2,'0'); return `${h}:${m}:${sec}`; }
function formatDate(ts){ return new Date(ts).toLocaleDateString('de-DE'); }
function formatTime(ts){ return new Date(ts).toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'}); }
function escapeHtml(s){ return s.replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c])); }

// --- Active Work ---
async function startWork(){
  if(active){ console.log('[startWork] already active id', active.id); renderState(); return; }
  console.log('[startWork] starting...');
  try { active = await startActiveOnServer(); }
  catch(e){
    console.warn('[startWork] startActiveOnServer error', e.message);
    if(String(e.message).includes('Active session exists')){
      active = await getActive();
    } else {
      alert('Start fehlgeschlagen: '+e.message); return;
    }
  }
  if(!active){ alert('Konnte aktive Session nicht laden'); return; }
  inlineTasks=[]; renderTaskChips();
  if(active.client && inlineClientInput) inlineClientInput.value=active.client;
  renderState();
  loop();
}
async function endWork(){
  if(!active) return;
  active = await getActive() || active;
  active.end = Date.now();
  if(clientInput) clientInput.value = active.client;
  if(tasksInput) tasksInput.value = active.tasks;
  updateSummaryBox();
  finishDialog.showModal();
  clientInput?.focus();
}
async function confirmEntry(){
  if(!active || !active.end){ console.warn('[App] confirmEntry ohne aktive Session'); return; }
  const chosen = (clientInput?.value||'').trim() || (clientSelect?.value||'').trim() || active.client.trim();
  if(!chosen){ alert('Bitte Auftraggeber angeben'); return; }
  const finalTasks = (tasksInput?.value||'').trim() || active.tasks;
  const skills = (skillsInput?.value||'').split(',').map(s=>s.trim()).filter(Boolean);
  // Update + Finish auf Server
  const entry = await finishActiveServer({ client: chosen, tasks: finalTasks, skills });
  if(!entry) return; entries.push(entry); addKnownClient(chosen);
  active=null; inlineTasks=[]; finishForm?.reset(); finishDialog?.close(); renderState(); buildDashboard(); buildClientStats();
}
async function togglePause(){
  if(!active) return;
  if(!active.pauseStartedAt){ // -> pause
    try { await api('POST','/api/active/pause'); } catch(e){ alert('Pause fehlgeschlagen: '+e.message); return; }
    active.pauseStartedAt = Date.now();
    btnPause.textContent='Pause beenden'; btnPause.classList.add('danger');
  } else {
    try { await api('POST','/api/active/resume'); } catch(e){ alert('Fortsetzen fehlgeschlagen: '+e.message); return; }
    // server hat pauseMs addiert, setze lokal
    active = await getActive() || active;
    btnPause.textContent='Pause starten'; btnPause.classList.remove('danger');
  }
  updatePauseInfo();
}
async function acknowledgeBreak(){ if(!active) return; await ackBreakServer(); alertBar.style.display='none'; dangerIndicator.style.display='none'; }
async function cancelActive(){ if(!active) return; if(!confirm('Laufende Zeitmessung ohne Speichern verwerfen?')) return; await cancelActiveServer(); active=null; inlineTasks=[]; renderTaskChips(); renderState(); }

// --- UI Updates ---
function updatePauseInfo(){ if(!active){ pauseInfo.textContent='Pause: 00:00:00'; return; } let eff = active.pauseMs||0; if(active.pauseStartedAt) eff += Date.now()-active.pauseStartedAt; pauseInfo.textContent='Pause: '+formatDuration(eff); }
function renderState(){
  if(!activeSessionCard || !startPanel) return;
  if(active){
    activeSessionCard.style.display='block';
    startPanel.style.display='none';
    try { startMeta.textContent = `Gestartet: ${formatDate(active.start)} ${formatTime(active.start)}`; } catch{}
    document.body.classList.remove('inlinePanel-hidden');
  } else {
    activeSessionCard.style.display='none';
    startPanel.style.display='block';
    alertBar && (alertBar.style.display='none');
    dangerIndicator && (dangerIndicator.style.display='none');
    document.body.classList.add('inlinePanel-hidden');
  }
}
function loop(){ if(!active){ if(rafId) cancelAnimationFrame(rafId); rafId=null; return; } const now=Date.now(); const elapsed=now-active.start; timerDisplay.textContent=formatDuration(elapsed); updatePauseInfo(); if(elapsed>=21600000 && !active.acknowledgedBreak){ dangerIndicator.style.display='block'; alertBar.style.display='flex'; } rafId=requestAnimationFrame(loop); }
function updateSummaryBox(){ if(!active || !active.end){ summaryBox.textContent=''; return; } const gross=active.end-active.start; let pauseTotal=active.pauseMs||0; if(active.pauseStartedAt) pauseTotal += active.end-active.pauseStartedAt; const net=gross-pauseTotal; summaryBox.innerHTML = `Datum: <strong>${formatDate(active.start)}</strong><br>Start: ${formatTime(active.start)}<br>Ende: ${formatTime(active.end)}<br>Brutto: ${formatDuration(gross)}<br>Pause: ${formatDuration(pauseTotal)}<br>Netto: <strong>${formatDuration(net)}</strong>`; }

// --- Dashboard & Stats ---
function buildDashboard(){ if(!entries.length){ dashboardContent.innerHTML=''; noData.style.display='block'; return; } noData.style.display='none'; const groups=entries.reduce((a,e)=>{(a[e.client||'—'] ||= []).push(e); return a;},{}); const clients=Object.keys(groups).sort((a,b)=>a.localeCompare(b,'de')); dashboardContent.innerHTML=''; clients.forEach(c=>{ const list=groups[c].slice().sort((a,b)=>b.start-a.start); const total=list.reduce((s,e)=>s+(e.end-e.start-e.pauseMs),0); const div=document.createElement('div'); div.className='clientGroup'; div.innerHTML=`<div class="clientHeader">${c} <span class="pill">${formatDuration(total)}</span></div>`; const table=document.createElement('table'); table.innerHTML='<thead><tr><th>Datum</th><th>Start</th><th>Ende</th><th>Dauer (netto)</th><th>Pause</th><th>Fähigkeiten</th><th>Aufgaben</th></tr></thead><tbody></tbody>'; const tbody=table.querySelector('tbody'); list.forEach(e=>{ const tr=document.createElement('tr'); tr.dataset.id=e.id; tr.style.cursor='pointer'; tr.title='Zum Bearbeiten tippen'; tr.innerHTML=`<td>${formatDate(e.start)}</td><td>${formatTime(e.start)}</td><td>${formatTime(e.end)}</td><td>${formatDuration(e.end-e.start-e.pauseMs)}</td><td>${formatDuration(e.pauseMs)}</td><td>${e.skills.map(s=>`<span class='badge'>${escapeHtml(s)}</span>`).join('')}</td><td style='min-width:160px'>${e.tasks?escapeHtml(e.tasks).replace(/\n/g,'<br>'):''}</td>`; tr.addEventListener('click',()=>openEditDialog(e.id)); tbody.appendChild(tr); }); div.appendChild(table); dashboardContent.appendChild(div); }); }
function buildClientStats(){ if(!entries.length){ clientStatsTable.style.display='none'; noClientStats.style.display='block'; return; } const map=new Map(); for(const e of entries){ const key=e.client||'—'; const gross=e.end-e.start; const net=gross-e.pauseMs; let o=map.get(key); if(!o){ o={client:key,entries:0,gross:0,pause:0,net:0,first:e.start,last:e.start}; map.set(key,o); } o.entries++; o.gross+=gross; o.pause+=e.pauseMs; o.net+=net; if(e.start<o.first) o.first=e.start; if(e.start>o.last) o.last=e.start; } let arr=[...map.values()]; arr.sort((a,b)=>{ const k=clientSort.key; const dir=clientSort.dir; if(k==='client') return a.client.localeCompare(b.client,'de')*dir; return (b[k]-a[k])*dir; }); clientStatsBody.innerHTML=''; arr.forEach(o=>{ const avg=o.net/o.entries; const tr=document.createElement('tr'); tr.innerHTML=`<td>${o.client}</td><td>${o.entries}</td><td>${formatDuration(o.gross)}</td><td>${formatDuration(o.pause)}</td><td>${formatDuration(o.net)}</td><td>${formatDuration(avg)}</td><td>${formatDate(o.first)}</td><td>${formatDate(o.last)}</td>`; clientStatsBody.appendChild(tr); }); clientStatsTable.style.display='table'; noClientStats.style.display='none'; clientStatsTable.querySelectorAll('th').forEach(th=>{ const k=th.dataset.sort; if(!k) return; th.style.cursor='pointer'; th.textContent=th.textContent.replace(/[▲▼]/g,''); if(k===clientSort.key) th.textContent += clientSort.dir===1?' ▲':' ▼'; th.onclick=()=>{ if(clientSort.key===k) clientSort.dir*=-1; else { clientSort.key=k; clientSort.dir=k==='client'?1:-1; } buildClientStats(); }; }); }

// --- Edit Dialog ---
function openEditDialog(id){ const e=entries.find(x=>x.id===id); if(!e) return; editId.value=e.id; editClientInput.value=e.client; editSkillsInput.value=e.skills.join(', '); editTasksInput.value=e.tasks; editStartInput.value=toLocalInput(e.start); editEndInput.value=toLocalInput(e.end); editPauseInput.value=Math.round(e.pauseMs/60000); editEntryDialog.showModal(); }
function toLocalInput(ts){ const d=new Date(ts); d.setMinutes(d.getMinutes()-d.getTimezoneOffset()); return d.toISOString().slice(0,16); }
function fromLocalInput(v){ return new Date(v).getTime(); }

// --- CSV / Mail ---
function exportCsv(){ const header=['ID','Auftraggeber','Datum','Start','Ende','Brutto_Min','Pause_Min','Netto_Min','Netto (hh:mm:ss)','Fähigkeiten','Aufgaben']; const rows=entries.map(e=>{ const gross=e.end-e.start; const net=gross-e.pauseMs; const grossMin=Math.round(gross/60000); const pauseMin=Math.round(e.pauseMs/60000); const netMin=Math.round(net/60000); return [e.id, escCsv(e.client), new Date(e.start).toISOString().slice(0,10), formatTime(e.start), formatTime(e.end), grossMin, pauseMin, netMin, formatDuration(net), escCsv(e.skills.join('; ')), escCsv(e.tasks.replace(/\n/g,' | '))]; }); const csv=[header.join(';')].concat(rows.map(r=>r.join(';'))).join('\n'); const blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8;'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download='zeiterfassung.csv'; a.click(); setTimeout(()=>URL.revokeObjectURL(url),4000); }
function escCsv(s){ return '"'+s.replace(/"/g,'""')+'"'; }
function sendMail(){ if(!entries.length){ alert('Keine Daten'); return; } const rows=entries.slice(-20).map(e=>{ const gross=e.end-e.start; const net=gross-e.pauseMs; const netMin=Math.round(net/60000); return `${formatDate(e.start)} ${formatTime(e.start)}-${formatTime(e.end)} Netto:${netMin}min (${e.client})`; }).join('%0D%0A'); location.href=`mailto:danielstreuter@me.com?subject=Zeiterfassung%20Export&body=${rows}`; }

// --- Auth / Session ---
async function initAfterAuth(){
  try { await loadEntries(); } catch(e){ loginError.textContent='Laden fehlgeschlagen: '+e.message; return; }
  try { active = await getActive(); } catch{}
  const set = new Set(knownClients); entries.forEach(e=>{ if(e.client) set.add(e.client); }); if(active?.client) set.add(active.client); knownClients=[...set]; saveKnownClients(); refreshClientSelects();
  if(active){ if(inlineClientInput) inlineClientInput.value=active.client||''; inlineTasks = active.tasks ? active.tasks.split('\n').filter(Boolean) : []; renderTaskChips(); }
  showAuthenticated();
  renderState(); buildDashboard(); buildClientStats(); if(active) loop();
  document.addEventListener('visibilitychange', async ()=>{ if(document.visibilityState==='visible'){ const prevPaused=!!active?.pauseStartedAt; const latest=await getActive(); if(latest){ active=latest; if(prevPaused!==!!active.pauseStartedAt) updatePauseInfo(); renderState(); } else if(active){ active=null; renderState(); } }});
  setInterval(async ()=>{ if(!active) return; const latest=await getActive(); if(latest){ active.pauseMs=latest.pauseMs; active.pauseStartedAt=latest.pauseStartedAt; active.acknowledgedBreak=latest.acknowledgedBreak; } },60000);
}
async function checkSession(){
  try {
    const s=await api('GET','/api/session');
    if(s.user){ await initAfterAuth(); }
    // wenn keine Session: nichts erzwingen -> Login bleibt sichtbar ohne Logout Zwang
  } catch(err){ console.warn('[Session check failed]', err.message); }
}
loginForm?.addEventListener('submit', async e=>{ e.preventDefault(); loginError.textContent=''; try { await api('POST','/api/login',{user:userInput.value.trim(), password:passInput.value}); passInput.value=''; await initAfterAuth(); } catch(err){ loginError.textContent= err.message || 'Login fehlgeschlagen'; } });
btnLogout?.addEventListener('click', async ()=>{ if(!confirm('Logout?')) return; try { await api('POST','/api/logout'); } catch{} hideAuthenticated();
  // location.reload();
  // Statt Reload: UI zurücksetzen
  entries=[]; active=null; inlineTasks=[]; renderTaskChips(); renderState(); dashboardContent.innerHTML=''; noData.style.display='block'; loginForm.reset();
});

// --- Auth UI helper
function showAuthenticated(){ document.body.classList.add('authenticated'); if(btnLogout) btnLogout.style.display='inline-flex'; }
function hideAuthenticated(){ document.body.classList.remove('authenticated'); if(btnLogout) btnLogout.style.display='none'; active=null; }

// --- Events ---
btnStart?.addEventListener('click', ()=>startWork());
btnEnd?.addEventListener('click', ()=>endWork());
btnPause?.addEventListener('click', ()=>togglePause());
btnAcknowledgeBreak?.addEventListener('click', ()=>acknowledgeBreak());
btnCancelActive?.addEventListener('click', ()=>cancelActive());
finishForm?.addEventListener('submit', e=>{ e.preventDefault(); confirmEntry(); });
btnCloseDialog?.addEventListener('click', ()=>finishDialog.close());
btnCancelDialog?.addEventListener('click', ()=>finishDialog.close());
editEntryForm?.addEventListener('submit', async e=>{ e.preventDefault(); const entry=entries.find(en=>en.id===editId.value); if(!entry) return; const startTs=fromLocalInput(editStartInput.value); const endTs=fromLocalInput(editEndInput.value); if(endTs<=startTs){ alert('Ende muss nach Start liegen'); return; } entry.client=editClientInput.value.trim() || editClientSelect.value.trim(); if(!entry.client){ alert('Bitte Auftraggeber angeben'); return; } addKnownClient(entry.client); entry.skills=editSkillsInput.value.split(',').map(s=>s.trim()).filter(Boolean); entry.tasks=editTasksInput.value.trim(); entry.start=startTs; entry.end=endTs; entry.pauseMs=Math.max(0,parseInt(editPauseInput.value||'0',10))*60000; try { await updateEntry(entry); } catch(err){ alert('Update fehlgeschlagen: '+err.message); return; } buildDashboard(); buildClientStats(); editEntryDialog.close(); });
btnDeleteEntry?.addEventListener('click', async ()=>{ if(!confirm('Eintrag wirklich löschen?')) return; const id=editId.value; try { await deleteEntry(id); } catch(err){ alert('Löschen fehlgeschlagen: '+err.message); return; } buildDashboard(); buildClientStats(); editEntryDialog.close(); });
btnCloseEditDialog?.addEventListener('click', ()=>editEntryDialog.close());
btnCancelEditDialog?.addEventListener('click', ()=>editEntryDialog.close());
btnExportCsv?.addEventListener('click', exportCsv);
btnMail?.addEventListener('click', sendMail);
btnTheme?.addEventListener('click', ()=>{
  const dark = document.body.classList.toggle('theme-dark');
  localStorage.setItem('theme', dark?'dark':'light');
  btnTheme.textContent = dark ? '☀️' : '🌙';
});
(function initTheme(){
  const pref = localStorage.getItem('theme');
  if(pref==='dark' || (!pref && window.matchMedia('(prefers-color-scheme: dark)').matches)){
    document.body.classList.add('theme-dark'); btnTheme && (btnTheme.textContent='☀️');
  }
})();

// --- PWA Install ---
let deferredPrompt; window.addEventListener('beforeinstallprompt', e=>{ e.preventDefault(); deferredPrompt=e; btnInstall.style.display='inline-flex'; }); btnInstall.addEventListener('click', async ()=>{ if(!deferredPrompt) return; deferredPrompt.prompt(); await deferredPrompt.userChoice; deferredPrompt=null; btnInstall.style.display='none'; });
if('serviceWorker' in navigator){ window.addEventListener('load', ()=>navigator.serviceWorker.register('/sw.js').catch(console.error)); }
(function swUpdateHelper(){ if('serviceWorker' in navigator){ navigator.serviceWorker.getRegistration().then(reg=>{ if(reg) reg.update().catch(()=>{}); }); } })();

// --- Start ---
checkSession(); // prüft ob Session aktiv
// (App Inhalte werden erst nach Login geladen)