// Yam's v7.5.1 — 100% vanilla
(function(){
  'use strict';

  // ------------------ Constants & Categories ------------------
  const VERSION = 'v7.5.1';

  const CATS_UPPER = [
    {key:'ones',   label:'1 ×', base:1},
    {key:'twos',   label:'2 ×', base:2},
    {key:'threes', label:'3 ×', base:3},
    {key:'fours',  label:'4 ×', base:4},
    {key:'fives',  label:'5 ×', base:5},
    {key:'sixes',  label:'6 ×', base:6},
  ];
  const CATS_LOWER = [
    {key:'threeKind', label:'Brelan'},
    {key:'fourKind',  label:'Carré'},
    {key:'fullHouse', label:'Full'},
    {key:'smallStr',  label:'Petite suite'},
    {key:'largeStr',  label:'Grande suite'},
    {key:'yahtzee',   label:'Yam’s'},
    {key:'chance',    label:'Chance'},
  ];
  const ALL_CATS = [...CATS_UPPER, ...CATS_LOWER];

  // ------------------ Storage Keys ------------------
  const STATE_KEY  = 'yams-state-v7.5.1';
  const ROUNDS_KEY = 'yams-rounds-v7.5.1';
  const THEME_KEY  = 'yams-theme-mode';
  const UI_KEY     = 'yams-ui-v7';

  // ------------------ Helpers ------------------
  const $ = (sel, root=document) => root.querySelector(sel);
  const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));
  const escapeHtml = (str) => String(str).replace(/[&<>\"']/g, (s)=>({"&":"&amp;","<":"&lt;","&gt":"&gt;","\"":"&quot;","'":"&#39;"}[s]));

  const canonicalName = (name) => (name||'').replace(/\s+/g,' ').trim().toLowerCase();
  const clamp = (v,min,max)=> Math.max(min, Math.min(max, v));

  const deepClone = (obj) => JSON.parse(JSON.stringify(obj));

  // ------------------ Error overlay ------------------
  (function(){
    const overlay = $('#errOverlay');
    const txt = $('#errText');
    const btnCopy = $('#btnCopy');
    const btnClear = $('#btnClear');
    const btnReload = $('#btnReload');
    function showErr(message, source, lineno, colno, error){
      overlay.style.display = 'block';
      txt.textContent = [message, source?(' @ '+source+':'+lineno+':'+colno):'', error && error.stack ? ('\n'+error.stack) : ''].join(' ');
    }
    window.addEventListener('error', (e)=>{ showErr(e.message, e.filename, e.lineno, e.colno, e.error); });
    window.addEventListener('unhandledrejection', (e)=>{ showErr('Unhandled Promise rejection', '', 0, 0, e.reason); });
    btnCopy?.addEventListener('click', ()=> navigator.clipboard.writeText(txt.textContent||''));
    btnClear?.addEventListener('click', async ()=>{
      try{
        const keys = await caches.keys(); await Promise.all(keys.map((k)=> caches.delete(k)));
        if (navigator.serviceWorker){ const regs = await navigator.serviceWorker.getRegistrations(); await Promise.all(regs.map((r)=> r.unregister())); }
      }catch{}
      location.reload();
    });
    btnReload?.addEventListener('click', ()=> location.reload());
  })();

  // ------------------ Theme & UI preset ------------------
  const mql = window.matchMedia('(prefers-color-scheme: dark)');
  function applyTheme(mode){
    let theme = mode; if (mode === 'auto'){ theme = mql.matches ? 'dark' : 'light'; }
    document.documentElement.setAttribute('data-theme', theme);
    $$('input[name="themeMode"]').forEach(r => r.checked = (r.value === mode));
  }
  (function initTheme(){
    const mode = localStorage.getItem(THEME_KEY) || 'auto'; applyTheme(mode);
    mql.addEventListener?.('change', ()=>{ if ((localStorage.getItem(THEME_KEY) || 'auto') === 'auto') applyTheme('auto'); });
    $$('input[name="themeMode"]').forEach(radio => {
      radio.addEventListener('change', (e)=>{
        localStorage.setItem(THEME_KEY, e.target.value);
        applyTheme(e.target.value);
      });
    });
  })();

  function applyUIPreset(preset){
    let conf = { scale:1, dense:0, colMin:150 };
    if (preset === 'serre') conf = { scale:0.95, dense:1, colMin:140 };
    if (preset === 'tres-serre') conf = { scale:0.90, dense:2, colMin:130 };
    document.documentElement.setAttribute('data-scale', String(conf.scale));
    document.documentElement.setAttribute('data-dense', String(conf.dense));
    document.documentElement.style.setProperty('--col-min', conf.colMin + 'px');
    localStorage.setItem(UI_KEY, JSON.stringify(conf));
  }
  (function initUI(){
    let ui = { scale:1, dense:0, colMin:150 };
    try{ ui = Object.assign(ui, JSON.parse(localStorage.getItem(UI_KEY) || '{}')); }catch{}
    document.documentElement.setAttribute('data-scale', String(ui.scale||1));
    document.documentElement.setAttribute('data-dense', String(ui.dense||0));
    document.documentElement.style.setProperty('--col-min', (ui.colMin||150) + 'px');
    const select = $('#presetDisplay');
    if (select){
      let preset = 'standard';
      if (ui.dense === 1 && Math.abs((ui.scale||1) - 0.95) < 0.02) preset = 'serre';
      if (ui.dense === 2 && (ui.scale||1) <= 0.91) preset = 'tres-serre';
      select.value = preset;
      select.addEventListener('change', (e)=> applyUIPreset(e.target.value));
    }
  })();

  // ------------------ State & Rounds ------------------
  function emptyScore(){ return { score: '', blocked: false }; }

  let state = loadState();
  let rounds = loadRounds();

  function loadState(){
    // New model: { players: [{id,name}], scores: { [pid]: { [catKey]: {score, blocked} } } }
    let st = null;
    try{ st = JSON.parse(localStorage.getItem(STATE_KEY) || 'null'); }catch{}
    if (st && Array.isArray(st.players) && st.scores) return migrateState(st);

    // Migration from older versions (players had p.scores as numbers/strings)
    try{
      const old = JSON.parse(localStorage.getItem('yams-app-pages-v6.1-table') || 'null');
      if (old && Array.isArray(old.players)){
        const scores = {};
        old.players.forEach(p => {
          const pid = p.id || crypto.randomUUID();
          scores[pid] = {};
          ALL_CATS.forEach(c => {
            let v = (p.scores && p.scores[c.key] != null) ? p.scores[c.key] : '';
            if (typeof v === 'object' && v){ // already blocked/score
              scores[pid][c.key] = { score: Number(v.score)||'', blocked: !!v.blocked };
            } else {
              const n = (v === '' || v == null) ? '' : Number(v)||0;
              scores[pid][c.key] = { score: n, blocked: false };
            }
          });
          p.id = pid; p.scores = undefined;
        });
        const fresh = { players: old.players.map(({id,name})=>({id,name})), scores };
        localStorage.setItem(STATE_KEY, JSON.stringify(fresh));
        return fresh;
      }
    }catch{}
    const fresh = { players: [], scores: {} };
    localStorage.setItem(STATE_KEY, JSON.stringify(fresh));
    return fresh;
  }
  function migrateState(st){
    // Ensure each pid & cat has {score,blocked}
    st.players = st.players || [];
    st.scores = st.scores || {};
    st.players.forEach(p => {
      if (!p.id) p.id = crypto.randomUUID?.() || String(Date.now())+Math.random();
      if (!st.scores[p.id]) st.scores[p.id] = {};
      ALL_CATS.forEach(c => {
        const cur = st.scores[p.id][c.key];
        if (!cur || typeof cur !== 'object'){
          const num = (cur===''||cur==null) ? '' : Number(cur)||0;
          st.scores[p.id][c.key] = { score: num, blocked:false };
        } else {
          if (!('blocked' in cur)) cur.blocked = false;
          if (!('score' in cur)) cur.score = '';
        }
      });
    });
    return st;
  }
  function saveState(){ localStorage.setItem(STATE_KEY, JSON.stringify(state)); }

  function loadRounds(){
    let r = [];
    try{ r = JSON.parse(localStorage.getItem(ROUNDS_KEY) || '[]'); }catch{}
    // retro-compat: if scores missing blocked, fill false
    r.forEach(R => {
      if (!R.scores) return;
      Object.keys(R.scores).forEach(pid => {
        const byCat = R.scores[pid];
        Object.keys(byCat).forEach(k => {
          const v = byCat[k];
          if (typeof v === 'object' && v){
            if (!('blocked' in v)) v.blocked = false;
            if (!('score' in v)) v.score = Number(v)||0;
          } else {
            byCat[k] = { score: Number(v)||0, blocked:false };
          }
        });
      });
    });
    return r;
  }
  function saveRounds(){ localStorage.setItem(ROUNDS_KEY, JSON.stringify(rounds)); }

  // ------------------ Validation ------------------
  function isUpperKey(k){ return !!CATS_UPPER.find(c => c.key===k); }
  function upperBase(k){ const c = CATS_UPPER.find(c=>c.key===k); return c ? c.base : 0; }

  function allowedUpperValues(base){ return [0, base, 2*base, 3*base, 4*base, 5*base]; }

  // Returns {valid:boolean, normalized:number}
  function validateValue(key, raw){
    if (raw === '' || raw == null) return { valid:true, normalized:'' };
    let n = Number(raw);
    if (!isFinite(n)) return { valid:false, normalized:0 };

    if (isUpperKey(key)){
      const vals = allowedUpperValues(upperBase(key));
      const nearest = vals.reduce((a,b)=> Math.abs(b-n) < Math.abs(a-n) ? b : a, vals[0]);
      const valid = vals.includes(n);
      return { valid, normalized: valid ? n : nearest };
    }
    if (key==='fullHouse')  return { valid: (n===0 || n===25),  normalized: (n===25?25:0) };
    if (key==='smallStr')   return { valid: (n===0 || n===30),  normalized: (n===30?30:0) };
    if (key==='largeStr')   return { valid: (n===0 || n===40),  normalized: (n===40?40:0) };
    if (key==='yahtzee')    return { valid: (n===0 || n===50),  normalized: (n===50?50:0) };
    // Brelan / Carré / Chance: 0 ou [5..30]
    if (key==='threeKind' || key==='fourKind' || key==='chance'){
      if (n===0) return { valid:true, normalized:0 };
      const clamped = clamp(Math.round(n), 5, 30);
      const valid = (n>=5 && n<=30);
      return { valid, normalized: valid ? n : clamped };
    }
    return { valid:true, normalized:n };
  }

  // ------------------ Totals ------------------
  function upperSum(pid){
    let s = 0;
    CATS_UPPER.forEach(c => { const v = state.scores[pid]?.[c.key]?.score || 0; s += Number(v)||0; });
    return s;
  }
  function lowerSum(pid){
    let s = 0;
    CATS_LOWER.forEach(c => { const v = state.scores[pid]?.[c.key]?.score || 0; s += Number(v)||0; });
    return s;
  }
  function bonus63(u){ return u>=63 ? 35 : 0; }
  function totalsFor(pid){
    const u = upperSum(pid);
    const b = bonus63(u);
    const l = lowerSum(pid);
    return { upper:u, bonus:b, lower:l, total:u+b+l };
  }

  function countFilled(pid){
    let c=0;
    ALL_CATS.forEach(ca => { const v = state.scores[pid]?.[ca.key]; if (v && v.score!=='' && !v.blocked) c++; });
    return c;
  }

  // ------------------ DOM build ------------------
  const thead = $('#thead');
  const tbody = $('#tbody');
  const lbList = $('#lbList');
  const lbView = $('#lbView');

  function buildTable(){
    thead.innerHTML = '';
    const trHead = document.createElement('tr');
    const thCat = document.createElement('th'); thCat.textContent = 'Catégorie'; trHead.appendChild(thCat);

    state.players.forEach(p => {
      const th = document.createElement('th');
      th.className = 'player'; th.dataset.playerId = p.id;
      th.innerHTML = `<div class="player-head">
        <span class="name">${escapeHtml(p.name||'Sans nom')}</span>
        <button data-action="stats" title="Statistiques">📈</button>
        <button data-action="rename" title="Renommer">✎</button>
        <button data-action="delete" class="danger" title="Supprimer">✕</button>
      </div>`;
      th.querySelector('[data-action="stats"]').addEventListener('click', ()=> openPlayerStats(p.id));
      th.querySelector('[data-action="rename"]').addEventListener('click', ()=>{
        const current = p.name || '';
        const newName = prompt('Nouveau nom du joueur :', current);
        if (newName !== null){
          const trimmed = newName.trim();
          if (!trimmed){ alert('Le nom ne peut pas être vide.'); return; }
          if (nameExists(trimmed, p.id)){ alert('Ce prénom existe déjà.'); return; }
          p.name = trimmed; th.querySelector('.name').textContent = p.name; saveState(); renderLeaderboard();
        }
      });
      th.querySelector('[data-action="delete"]').addEventListener('click', ()=>{
        if (confirm('Supprimer '+(p.name||'ce joueur')+' ?')){
          delete state.scores[p.id];
          state.players = state.players.filter(pl => pl.id !== p.id);
          saveState(); buildTable(); renderLeaderboard();
        }
      });
      trHead.appendChild(th);
      if (!state.scores[p.id]) state.scores[p.id] = {};
      ALL_CATS.forEach(c => { if (!state.scores[p.id][c.key]) state.scores[p.id][c.key] = emptyScore(); });
    });
    thead.appendChild(trHead);

    // Body
    tbody.innerHTML = '';
    function addRow(label, key, className, isLast){
      const tr = document.createElement('tr'); if (isLast) tr.classList.add('last-row');
      const tdCat = document.createElement('td'); tdCat.className = (className||''); tdCat.innerHTML = label; tr.appendChild(tdCat);

      state.players.forEach(p => {
        const td = document.createElement('td'); td.className = 'cell '+(className||''); td.dataset.pid = p.id; td.dataset.key = key;
        if (key.charAt(0) !== '_'){
          const input = document.createElement('input');
          input.type = 'text'; input.setAttribute('inputmode','numeric'); input.setAttribute('pattern','[0-9]*');
          const cur = state.scores[p.id][key];
          input.value = (cur.score === '' ? '' : String(cur.score));
          updateFillClasses(input, cur);
          setBlockVisual(td, cur.blocked);

          input.addEventListener('input', ()=>{
            // enforce digits only
            const digits = input.value.replace(/[^\d]/g,'');
            if (digits !== input.value) input.value = digits;
            const val = digits === '' ? '' : Number(digits)||0;
            const { valid } = validateValue(key, val === '' ? '' : val);
            markValidity(input, val, valid, cur.blocked);
            // live store raw number (not normalized yet), unless blocked
            if (!cur.blocked){
              state.scores[p.id][key].score = (digits === '' ? '' : Number(digits));
              saveState(); refreshComputedFor(p.id); renderLeaderboard();
            }
          });
          input.addEventListener('blur', ()=>{
            if (cur.blocked) return;
            const raw = input.value === '' ? '' : Number(input.value)||0;
            const v = validateValue(key, raw);
            state.scores[p.id][key].score = v.normalized;
            input.value = (v.normalized === '' ? '' : String(v.normalized));
            markValidity(input, v.normalized, true, false);
            saveState(); refreshComputedFor(p.id); renderLeaderboard();
          });

          // Blocking gestures
          installBlockGestures(td, ()=> toggleBlock(p.id, key));

          td.appendChild(input);
        } else { td.textContent = ''; }
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    }

    CATS_UPPER.forEach(cat => addRow(`${cat.label} <span class="muted">(multiples)</span>`, cat.key));
    addRow('Sous-total (1→6)', '_upper', 'subtotal');
    addRow('Bonus (≥63)', '_bonus', 'subtotal');
    CATS_LOWER.forEach(cat => {
      let hint = '';
      if (cat.key==='fullHouse') hint='0 ou 25';
      if (cat.key==='smallStr') hint='0 ou 30';
      if (cat.key==='largeStr') hint='0 ou 40';
      if (cat.key==='yahtzee')  hint='0 ou 50';
      if (cat.key==='threeKind'||cat.key==='fourKind'||cat.key==='chance') hint='0 ou [5..30]';
      addRow(`${cat.label} ${hint?`<span class="muted">(${hint})</span>`:''}`, cat.key);
    });
    addRow('Total', '_total', 'total-row', true);

    state.players.forEach(p => refreshComputedFor(p.id));
  }

  function setBlockVisual(td, blocked){
    td.classList.toggle('blocked', !!blocked);
    const input = td.querySelector('input');
    if (input){
      input.readOnly = !!blocked;
      input.tabIndex = blocked ? -1 : 0;
    }
  }

  function updateFillClasses(input, cur){
    if (cur.blocked){ input.classList.remove('is-empty','is-filled','is-invalid'); return; }
    const val = input.value;
    if (val==='' || val==null){ input.classList.add('is-empty'); input.classList.remove('is-filled','is-invalid'); }
    else { input.classList.remove('is-empty'); input.classList.add('is-filled'); input.classList.remove('is-invalid'); }
  }
  function markValidity(input, value, valid, blocked){
    if (blocked){ input.classList.remove('is-invalid'); updateFillClasses(input, {blocked:true}); return; }
    if (value==='' || value==null){ input.classList.remove('is-invalid'); input.classList.add('is-empty'); input.classList.remove('is-filled'); return; }
    if (!valid){ input.classList.add('is-invalid'); input.classList.remove('is-empty'); input.classList.remove('is-filled'); }
    else { input.classList.remove('is-invalid'); if (Number(value)>0) input.classList.add('is-filled'); else input.classList.remove('is-filled'); }
  }

  // Double click + long press + double tap
  function installBlockGestures(el, onToggle){
    // dblclick for mouse
    el.addEventListener('dblclick', (e)=>{ e.preventDefault(); onToggle(); });
    // long press 600ms
    let t=null, startX=0, startY=0, lastTap=0;
    const LONG_MS = 600, TAP_MS = 300, MOVE_TOL=10;
    el.addEventListener('pointerdown', (e)=>{
      if (e.pointerType === 'mouse') return;
      startX = e.clientX; startY = e.clientY;
      t = setTimeout(()=>{ onToggle(); t=null; }, LONG_MS);
    });
    const clear = ()=>{ if (t){ clearTimeout(t); t=null; } };
    el.addEventListener('pointermove', (e)=>{
      if (!t) return;
      if (Math.hypot(e.clientX-startX, e.clientY-startY) > MOVE_TOL) clear();
    });
    el.addEventListener('pointerup', (e)=>{
      if (t){ // treat as tap
        clear();
        const now = performance.now();
        if (now - lastTap < TAP_MS){ onToggle(); lastTap = 0; }
        else lastTap = now;
      }
    });
    el.addEventListener('pointercancel', clear);
    el.addEventListener('pointerleave', clear);
  }

  function toggleBlock(pid, key){
    const cur = state.scores[pid][key];
    const td = tbody.querySelector(`td.cell[data-pid="${pid}"][data-key="${key}"]`);
    const input = td?.querySelector('input');
    if (!cur || !td || !input) return;
    if (!cur.blocked){
      // block
      cur.blocked = true;
      cur.score = 0;
      input.value = '';
    } else {
      cur.blocked = false;
      // keep score 0 (user can edit now)
    }
    setBlockVisual(td, cur.blocked);
    updateFillClasses(input, cur);
    saveState(); refreshComputedFor(pid); renderLeaderboard();
  }

  function nameExists(name, exceptId){
    const cn = canonicalName(name);
    return state.players.some(p => canonicalName(p.name) === cn && p.id !== exceptId);
  }

  function refreshComputedFor(pid){
    const t = totalsFor(pid);
    const colIdx = state.players.findIndex(x=>x.id===pid);
    const rows = tbody.querySelectorAll('tr');
    const subtotalRow = rows[CATS_UPPER.length];
    const bonusRow    = rows[CATS_UPPER.length + 1];
    const totalRow    = rows[CATS_UPPER.length + 1 + CATS_LOWER.length + 1];
    function setCellText(tr, idx, text, cls){
      const td = tr?.children[idx + 1]; if (!td) return; td.textContent = String(text); td.className = 'cell ' + (cls || '');
    }
    setCellText(subtotalRow, colIdx, t.upper, 'subtotal');
    setCellText(bonusRow,    colIdx, t.bonus, 'subtotal');
    setCellText(totalRow,    colIdx, t.total, 'total-row');
  }

  // ------------------ Leaderboard ------------------
  function renderLeaderboard(){
    const view = lbView.value;
    lbList.innerHTML = '';
    if (view === 'current'){
      const cur = state.players.map(p => ({ id:p.id, name:p.name||'Sans nom', total: totalsFor(p.id).total }))
        .sort((a,b)=> b.total - a.total);
      cur.forEach((r,i)=>{ const s=document.createElement('span'); s.textContent=`${i+1}. ${r.name} — ${r.total}`; lbList.appendChild(s); });
    } else if (view === 'avg'){
      const arr = state.players.map(p => {
        const st = statsAllRoundsFor(p.id);
        return { id:p.id, name:p.name||'Sans nom', avg: st.avg || 0, best: st.best || 0 };
      }).sort((a,b)=> b.avg - a.avg);
      arr.forEach((r,i)=>{ const s=document.createElement('span'); s.textContent=`${i+1}. ${r.name} — moy ${r.avg} (max ${r.best})`; lbList.appendChild(s); });
    } else if (view === 'wins'){
      const wmap = winsTable();
      const wr = state.players.map(p => ({ id:p.id, name:p.name||'Sans nom', w: wmap[p.id]||0 })).sort((a,b)=> b.w - a.w);
      wr.forEach((r,i)=>{ const s=document.createElement('span'); s.textContent=`${i+1}. ${r.name} — ${r.w} vic.`; lbList.appendChild(s); });
    }
  }
  function winsTable(){
    const wins = {}; state.players.forEach(p => wins[p.id]=0);
    rounds.forEach(r => {
      let best=-Infinity, bestId=null;
      Object.keys(r.totals).forEach(pid => { const v=Number(r.totals[pid])||0; if (v>best){ best=v; bestId=pid; } });
      if (bestId && wins[bestId]!=null) wins[bestId]++;
    });
    return wins;
  }

  // ------------------ History ------------------
  const historyModal = $('#historyModal');
  const historyList = $('#historyList');
  $('#openHistoryBtn').addEventListener('click', ()=>{ renderHistory(); $('#backdrop').classList.add('open'); historyModal.classList.add('open'); });
  $('#closeHistory').addEventListener('click', ()=>{ $('#backdrop').classList.remove('open'); historyModal.classList.remove('open'); });
  $('#clearHistoryBtn').addEventListener('click', ()=>{
    if (!rounds.length) return; if (!confirm('Effacer tout l’historique des manches ?')) return;
    rounds = []; saveRounds(); renderHistory(); renderLeaderboard();
  });
  function renderHistory(){
    historyList.innerHTML = '';
    if (!rounds.length){ historyList.innerHTML = "<div class='muted' style='padding:8px'>Aucune manche enregistrée.</div>"; return; }
    for (let i=rounds.length-1; i>=0; i--){
      const r = rounds[i];
      const div = document.createElement('div'); div.className = 'history-item';
      const date = new Date(r.time).toLocaleString();
      const arr = Object.keys(r.totals).map(id=>{
        const found = state.players.find(p=>p.id===id);
        return {id, name: found ? (found.name||'Joueur') : 'Joueur', t: Number(r.totals[id])||0};
      }).sort((a,b)=> b.t-a.t).slice(0,3);
      const summary = arr.map((x,idx)=> `${idx+1}. ${x.name} ${x.t}`).join(' • ');
      div.innerHTML = `<div><strong>Partie ${i+1}</strong> — ${date}<br><span class='muted'>${summary}</span></div>`;
      historyList.appendChild(div);
    }
  }

  // ------------------ Round button ------------------
  $('#roundToggleBtn').addEventListener('click', ()=>{
    if (!state.players.length){ alert('Aucun joueur.'); return; }
    // Build totals and deep copy scores (with blocked)
    const totalsMap = {}; const scoresMap = {};
    state.players.forEach(p => {
      totalsMap[p.id] = totalsFor(p.id).total;
      scoresMap[p.id] = {};
      ALL_CATS.forEach(c => { scoresMap[p.id][c.key] = { score: Number(state.scores[p.id][c.key].score)||0, blocked: !!state.scores[p.id][c.key].blocked }; });
    });
    rounds.push({ time: new Date().toISOString(), totals: totalsMap, scores: scoresMap });
    saveRounds();
    alert('Manche clôturée et enregistrée ! Nouvelle manche lancée.');

    // Reset all scores & blocks
    state.players.forEach(p => { ALL_CATS.forEach(c => { state.scores[p.id][c.key] = emptyScore(); }); });
    saveState(); buildTable(); renderLeaderboard();
    window.__roundDates = rounds.map(r => r.time);
  });

  // ------------------ Stats (per player) ------------------
  const playerStatsModal = $('#playerStatsModal');
  const playerStatsContent = $('#playerStatsContent');
  $('#closePlayerStats').addEventListener('click', ()=>{ $('#backdrop').classList.remove('open'); playerStatsModal.classList.remove('open'); });

  function statsAllRoundsFor(pid){
    const scores=[];
    rounds.forEach(r => { const v = r.totals[pid]; if (typeof v === 'number') scores.push(v); });
    const count = scores.length;
    if (!count) return {avg:null, best:null, worst:null, count:0, scores:[], wins:0, podiums:0, winRate:0, recentAvg:null, trend:null, bestStreak:0};
    const sum = scores.reduce((a,b)=>a+b,0);
    const avg = Math.round(sum / count);
    const best = Math.max(...scores);
    const worst = Math.min(...scores);
    let wins=0, podiums=0;
    rounds.forEach(r => {
      const arr = Object.keys(r.totals).map(pid2 => ({pid:pid2, t:Number(r.totals[pid2])||0})).sort((a,b)=> b.t-a.t);
      const rank = arr.findIndex(x=>x.pid===pid);
      if (rank===0) wins++;
      if (rank>-1 && rank<3) podiums++;
    });
    const winRate = Math.round((wins / count) * 100);
    const last5 = scores.slice(-5);
    const recentAvg = last5.length ? Math.round(last5.reduce((a,b)=>a+b,0)/last5.length) : null;
    const trend = (recentAvg!=null ? recentAvg - avg : null);
    let bestStreak=0, cur=0;
    rounds.forEach(r => {
      const arr = Object.keys(r.totals).map(pid2 => ({pid:pid2, t:Number(r.totals[pid2])||0})).sort((a,b)=> b.t-a.t);
      if (arr[0] && arr[0].pid===pid){ cur++; bestStreak=Math.max(bestStreak,cur); } else cur=0;
    });
    return {avg,best,worst,count,scores,wins,podiums,winRate,recentAvg,trend,bestStreak};
  }

  function makeChart(values, xlabel, ylabel){
    if (!values || !values.length){
      return `<svg viewBox="0 0 420 180" width="420" height="180">
        <line x1="30" y1="150" x2="400" y2="150" stroke="currentColor" />
        <line x1="30" y1="20" x2="30" y2="150" stroke="currentColor" />
        <text x="210" y="14" font-size="11" text-anchor="middle">${escapeHtml(ylabel)}</text>
        <text x="210" y="172" font-size="11" text-anchor="middle">${escapeHtml(xlabel)}</text>
        <text x="210" y="95" font-size="12" text-anchor="middle" opacity="0.6">Aucune partie</text>
      </svg>`;
    }
    const w=420,h=180,p=30;
    const max = Math.max(...values, 1), min = Math.min(...values, 0);
    const range = Math.max(1, max-min);
    const step = (w-2*p)/Math.max(1, values.length-1);
    let pts = "";
    values.forEach((v,i)=>{
      const x = p + i*step;
      const y = h - p - ((v-min)/range)*(h-2*p);
      pts += (i?" ":"") + x + "," + y;
    });
    const y0 = h-p, x0 = p;
    const yTicks = 5; let grid = "";
    for(let i=0;i<=yTicks;i++){
      const val = min + (range * i / yTicks);
      const y = h - p - ((val-min)/range)*(h-2*p);
      grid += `<text x="${x0-6}" y="${y+4}" font-size="10" text-anchor="end">${Math.round(val)}</text>`;
      grid += `<line x1="${x0}" y1="${y}" x2="${w-p}" y2="${y}" stroke="currentColor" opacity="0.14"/>`;
    }
    let xlabels = "";
    const showEvery = values.length <= 12 ? 1 : Math.ceil(values.length/12);
    const dates = (window.__roundDates || []);
    for(let j=0;j<values.length;j+=showEvery){
      const x = p + j*step; const n = j+1;
      let d = ""; try{ const raw = dates[j]; if (raw){ const dt = new Date(raw); d = " ("+dt.toLocaleDateString()+")"; } }catch{}
      xlabels += `<text x="${x}" y="${h-6}" font-size="10" text-anchor="middle">${n}${d}</text>`;
    }
    return `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">
      <line x1="${x0}" y1="${y0}" x2="${w-p}" y2="${y0}" stroke="currentColor" />
      <line x1="${x0}" y1="${p/2}" x2="${x0}" y2="${y0}" stroke="currentColor" />
      ${grid}
      ${xlabels}
      <polyline fill="none" stroke="currentColor" stroke-width="2" points="${pts}"></polyline>
      <text x="${(w/2)}" y="${(p/2 - 6)}" font-size="11" text-anchor="middle">${escapeHtml(ylabel)}</text>
      <text x="${(w/2)}" y="${(h-2)}" font-size="11" text-anchor="middle">${escapeHtml(xlabel)}</text>
    </svg>`;
  }

  function openPlayerStats(pid){
    const p = state.players.find(x=>x.id===pid); if (!p) return;
    const name = escapeHtml(p.name||'Joueur');
    const cur = totalsFor(pid);
    const currentSorted = state.players.map(x => ({id:x.id, total: totalsFor(x.id).total})).sort((a,b)=> b.total-a.total);
    const rank = (currentSorted.findIndex(x => x.id===pid) + 1) || '-';
    const leader = currentSorted[0]; const me = currentSorted.find(x => x.id===pid) || {total:0};
    const diffLeader = leader ? (leader.total - me.total) : 0;
    const filled = countFilled(pid); const totalCells = ALL_CATS.length;
    const up = cur.upper, lo = cur.lower, bon = cur.bonus, need = Math.max(0, 63 - upperSum(pid));

    const all = statsAllRoundsFor(pid);
    const svg = makeChart(all.scores, 'Numéro de manche (date)', 'Score total');

    $('#playerStatsContent').innerHTML = `
      <div class="stats-grid mini player-card">
        <div class="card">
          <h4>Manche actuelle — ${name}</h4>
          <div class="kv">
            <b>Total</b><span>${cur.total} (Haut ${up}+${bon}, Bas ${lo})</span>
            <b>Rang</b><span>${rank} / ${state.players.length} — Écart 1er: ${diffLeader>0?('-'+diffLeader):'—'}</span>
            <b>Remplissage</b><span>${filled}/${totalCells} — Bonus 63: ${bon?'✅':'❌ ('+need+' pts)'}</span>
          </div>
        </div>
        <div class="card">
          <h4>Toutes les manches — ${name}</h4>
          <div class="kv">
            <b>Parties</b><span>${(all.count||0)}</span>
            <b>Victoires</b><span>${(all.wins||0)} (${(all.winRate||0)}%)</span>
            <b>Podiums</b><span>${(all.podiums||0)}</span>
            <b>Moyenne</b><span>${(all.avg!=null?all.avg:'-')}</span>
            <b>Meilleur / Pire</b><span>${(all.best!=null?all.best:'-')} / ${(all.worst!=null?all.worst:'-')}</span>
            <b>5 dernières</b><span>${(all.recentAvg!=null?all.recentAvg:'-')}</span>
            <b>Tendance</b><span>${(all.trend!=null?(all.trend>0?('+'+all.trend):all.trend):'-')}</span>
            <b>Série (wins)</b><span>${(all.bestStreak||0)}</span>
          </div>
          <div class="chart">${svg}</div>
          <div class="legend" style="display:flex;flex-wrap:wrap;gap:8px 12px;">
            <span>Abscisse&nbsp;: <em>n° de manche</em> (date courte)</span>
            <span>Ordonnée&nbsp;: <em>score total</em></span>
          </div>
        </div>
      </div>`;
    $('#backdrop').classList.add('open'); $('#playerStatsModal').classList.add('open');
  }

  // ------------------ Export / Import / PDF ------------------
  $('#exportBtn').addEventListener('click', ()=>{
    const normalized = state.players.map(p => ({
      playerId: p.id, name: p.name||'Joueur',
      categories: Object.fromEntries(ALL_CATS.map(c => [c.key, { score: Number(state.scores[p.id][c.key].score)||0, blocked: !!state.scores[p.id][c.key].blocked }]))
    }));
    const payload = { version: VERSION, state, rounds, export_normalise: normalized };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {type:'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'yams-donnees.json';
    document.body.appendChild(a); a.click();
    setTimeout(()=>{ document.body.removeChild(a); URL.revokeObjectURL(url); }, 0);
  });

  const importFile = $('#importFile');
  $('#importBtn').addEventListener('click', ()=> importFile.click());
  importFile.addEventListener('change', ()=>{
    const file = importFile.files && importFile.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = ()=>{
      try{
        const data = JSON.parse(String(reader.result));
        // accept both {state,rounds} or legacy {etat,historique_manches}
        const st = data.state || data.etat;
        const rd = data.rounds || data.historique_manches || [];
        if (!st || !Array.isArray(st.players)) throw new Error('Format invalide');
        state = migrateState(st); saveState();
        rounds = Array.isArray(rd) ? rd : []; rounds = loadRounds(); saveRounds();
        buildTable(); renderLeaderboard();
      }catch(err){ alert('Fichier invalide : '+err.message); }
    };
    reader.readAsText(file);
  });

  $('#exportPdfBtn').addEventListener('click', ()=>{ buildPrintView(); window.print(); });

  function buildPrintView(){
    const wrapLB = $('#printLeaderboards');
    const wrapRounds = $('#printRounds');
    const wrapRoundDetails = $('#printRoundDetails');
    const wrapPlayers = $('#printPlayers');
    wrapLB.innerHTML = ''; wrapRounds.innerHTML = ''; wrapPlayers.innerHTML = ''; wrapRoundDetails.innerHTML = '';

    const lbCurrent = state.players.map(p => ({ id:p.id, name:p.name||'Sans nom', total: totalsFor(p.id).total })).sort((a,b)=> b.total - a.total);
    const lbAvg = state.players.map(p => { const st = statsAllRoundsFor(p.id); return { name:p.name||'Sans nom', avg: st.avg || 0, best: st.best || 0 }; }).sort((a,b)=> b.avg - a.avg);
    const wmap = winsTable(); const lbWins = state.players.map(p => ({ name:p.name||'Sans nom', w: wmap[p.id]||0 })).sort((a,b)=> b.w - a.w);
    wrapLB.innerHTML = `
      <div><strong>Manche actuelle :</strong> ${ (lbCurrent.map((r,i)=> `${i+1}. ${r.name} — ${r.total}`).join(' • ') || "<em>Aucun joueur</em>") }</div>
      <div><strong>Moyenne (toutes manches) :</strong> ${ (lbAvg.map((r,i)=> `${i+1}. ${r.name} — moy ${r.avg} (max ${r.best})`).join(' • ') || "<em>Aucun joueur</em>") }</div>
      <div><strong>Par victoires :</strong> ${ (lbWins.map((r,i)=> `${i+1}. ${r.name} — ${r.w} vic.`).join(' • ') || "<em>Aucun joueur</em>") }</div>`;

    const players = state.players.slice();
    window.__roundDates = rounds.map(r => r.time);

    // Totaux par partie (only closed rounds = all in rounds)
    let head = `<tr><th>Partie</th>${players.map(p=>`<th>${escapeHtml(p.name||'Joueur')}</th>`).join('')}</tr>`;
    let rowsHtml = "";
    rounds.forEach((r,i)=>{
      const date = new Date(r.time).toLocaleString();
      const tds = players.map(p => `<td style="text-align:right">${(r.totals[p.id] != null ? r.totals[p.id] : "")}</td>`).join("");
      rowsHtml += `<tr><td>${i+1} — ${date}</td>${tds}</tr>`;
    });
    if (!rowsHtml) rowsHtml = `<tr><td colspan="${players.length+1}"><em>Aucune partie</em></td></tr>`;
    wrapRounds.innerHTML = `<table border="1" cellspacing="0" cellpadding="4" style="border-collapse:collapse;width:100%">${head}${rowsHtml}</table>`;

    // Détail par manche
    let detailAll = "";
    rounds.forEach((R, rIdx)=>{
      const header = `<tr><th>Catégorie</th>${players.map(p=>`<th>${escapeHtml(p.name||'Joueur')}</th>`).join('')}</tr>`;
      let rowsD = "";
      ALL_CATS.forEach(cat => {
        let tds='';
        players.forEach(p => {
          const cell = (R.scores && R.scores[p.id] && R.scores[p.id][cat.key]) ? R.scores[p.id][cat.key] : {score:'',blocked:false};
          const val = (cell && cell.blocked) ? '<span class="pdf-x">X</span>' : (cell && cell.score!=='' ? String(cell.score) : '');
          tds += `<td style="text-align:center">${val}</td>`;
        });
        rowsD += `<tr><td>${cat.label}</td>${tds}</tr>`;
      });
      detailAll += `<div style="margin:10px 0;page-break-inside:avoid"><strong>Partie ${rIdx+1} — ${ new Date(R.time).toLocaleString() }</strong><br>
                   <table border="1" cellspacing="0" cellpadding="4" style="border-collapse:collapse;width:100%">${header}${rowsD}</table></div>`;
    });
    wrapRoundDetails.innerHTML = detailAll || "<em>Aucune partie</em>";

    // Stats cartes joueurs
    let statsHtml = "";
    state.players.forEach(p => {
      const all = statsAllRoundsFor(p.id); const svg = makeChart(all.scores, 'Numéro de manche (date)', 'Score total');
      statsHtml += `<div class="player-card" style="margin:8px 0;padding:8px;border:1px solid #999">
        <strong>${escapeHtml(p.name||'Joueur')}</strong>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
          <div>
            <u>Toutes les manches</u><br>
            Moyenne ${(all.avg!=null?all.avg:"-")} • Meilleur ${(all.best!=null?all.best:"-")} • Pire ${(all.worst!=null?all.worst:"-")}<br>
            Parties ${(all.count||0)} • Victoires ${(all.wins||0)} (${(all.winRate||0)}%) • Podiums ${(all.podiums||0)}<br>
            5 dernières ${(all.recentAvg!=null?all.recentAvg:"-")} • Tendance ${(all.trend!=null?(all.trend>0?("+"+all.trend):all.trend):"-")} • Série ${(all.bestStreak||0)}
          </div>
          <div>
            ${svg}
            <div class="legend" style="font-size:12px;color:#555;display:flex;flex-wrap:wrap;gap:6px 12px;">
              <span>Abscisse&nbsp;: n° de manche (date courte)</span>
              <span>Ordonnée&nbsp;: score total</span>
            </div>
          </div>
        </div>
      </div>`;
    });
    wrapPlayers.innerHTML = statsHtml;
  }

  // ------------------ Toolbar & Settings ------------------
  $('#addPlayerBtn').addEventListener('click', ()=>{
    const nameInput = $('#playerName');
    const name = (nameInput.value||'').trim();
    if (!name){ alert('Entrez un nom de joueur.'); nameInput.focus(); return; }
    if (nameExists(name)){ alert('Ce prénom existe déjà.'); return; }
    const pid = crypto.randomUUID?.() || (String(Date.now())+Math.random());
    state.players.push({ id: pid, name });
    state.scores[pid] = {}; ALL_CATS.forEach(c => state.scores[pid][c.key] = emptyScore());
    saveState(); buildTable(); renderLeaderboard();
    nameInput.value = '';
  });
  $('#playerName').addEventListener('keydown', (e)=>{ if (e.key === 'Enter') $('#addPlayerBtn').click(); });

  const settingsBtn = $('#settingsBtn');
  const backdrop = $('#backdrop');
  const modal = $('#settingsModal');
  const closeSettings = $('#closeSettings');
  function openSettings(){ backdrop.classList.add('open'); modal.classList.add('open'); }
  function closeSettingsModal(){ backdrop.classList.remove('open'); modal.classList.remove('open'); }
  settingsBtn.addEventListener('click', openSettings);
  closeSettings.addEventListener('click', closeSettingsModal);
  backdrop.addEventListener('click', ()=>{ closeSettingsModal(); $('#historyModal').classList.remove('open'); $('#playerStatsModal').classList.remove('open'); });

  // Clear caches + unregister SW
  $('#clearCacheBtn').addEventListener('click', async ()=>{
    try{
      const keys = await caches.keys(); await Promise.all(keys.map(k => caches.delete(k)));
      if (navigator.serviceWorker){ const regs = await navigator.serviceWorker.getRegistrations(); await Promise.all(regs.map(r => r.unregister())); }
      alert('Caches et SW supprimés. Recharge la page.');
    }catch(e){ alert('Impossible de vider les caches : ' + e.message); }
  });

  // ------------------ Init ------------------
  buildTable(); renderLeaderboard();
  window.__roundDates = rounds.map(r => r.time);

  // ------------------ Service Worker ------------------
  if ('serviceWorker' in navigator){
    window.addEventListener('load', ()=> navigator.serviceWorker.register('./sw.js'));
  }
})();
