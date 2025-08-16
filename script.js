// Yam’s App v7.5.1 (base v7.4.6 + ajouts demandés)

const CATEGORIES = [
  { key: "1", label: "1 ×", max: 5, type: "multiple" },
  { key: "2", label: "2 ×", max: 10, type: "multiple" },
  { key: "3", label: "3 ×", max: 15, type: "multiple" },
  { key: "4", label: "4 ×", max: 20, type: "multiple" },
  { key: "5", label: "5 ×", max: 25, type: "multiple" },
  { key: "6", label: "6 ×", max: 30, type: "multiple" },
  { key: "brelan", label: "Brelan", min: 5, max: 30, type: "range-or-zero" },
  { key: "carre", label: "Carré", min: 5, max: 30, type: "range-or-zero" },
  { key: "full", label: "Full", value: 25, type: "fixed" },
  { key: "psuite", label: "Petite suite", value: 30, type: "fixed" },
  { key: "gsuite", label: "Grande suite", value: 40, type: "fixed" },
  { key: "yams", label: "Yam’s", value: 50, type: "fixed" },
  { key: "chance", label: "Chance", min: 5, max: 30, type: "range-or-zero" },
  { key: "total", label: "Total", readonly: true }
];

let players = JSON.parse(localStorage.getItem("players") || "[]");
let rounds  = JSON.parse(localStorage.getItem("rounds")  || "[]");
let currentRound = JSON.parse(localStorage.getItem("currentRound") || "null") || { scores: {} };

const thead = document.getElementById("thead");
const tbody = document.getElementById("tbody");
const addPlayerBtn = document.getElementById("addPlayerBtn");
const playerNameInput = document.getElementById("playerName");
const leaderboardList = document.getElementById("leaderboardList");
const closeRoundBtn = document.getElementById("closeRoundBtn");
const rankModeSelect = document.getElementById("rankMode");
const exportJsonBtn = document.getElementById("exportJsonBtn");
const exportPdfBtn  = document.getElementById("exportPdfBtn");

init();
renderTable();
renderLeaderboard();

function init(){
  // init players in currentRound
  players.forEach(p => { if (!currentRound.scores[p]) currentRound.scores[p] = {}; });
  save();
}

// EVENTS
addPlayerBtn.onclick = () => {
  const name = playerNameInput.value.trim();
  if (!name) return;
  if (players.some(n => n.toLowerCase() === name.toLowerCase())) { alert("Nom déjà présent."); return; }
  players.push(name);
  currentRound.scores[name] = {};
  playerNameInput.value = "";
  save(); renderTable(); renderLeaderboard();
};

closeRoundBtn.onclick = () => {
  // Sauve la manche (totaux + détails, y compris blocked)
  rounds.push(structuredClone(currentRound));
  // nouvelle manche vide
  currentRound = { scores: {} };
  players.forEach(p => currentRound.scores[p] = {});
  save(); renderTable(); renderLeaderboard();
};

rankModeSelect.onchange = renderLeaderboard;

exportJsonBtn.onclick = () => {
  const export_normalise = players.map(p => {
    const out = { player: p, categories: {} };
    CATEGORIES.forEach(c => {
      if (!c.readonly) {
        const cell = currentRound.scores[p]?.[c.key] || { score: 0, blocked: false };
        const score = typeof cell === "object" ? (cell.score || 0) : (typeof cell === "number" ? cell : 0);
        const blocked = typeof cell === "object" ? !!cell.blocked : false;
        out.categories[c.key] = { score, blocked };
      }
    });
    return out;
  });
  const payload = { version: "v7.5.1", state: { players, currentRound }, rounds, export_normalise };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {type:"application/json"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = "yams-donnees.json"; a.click();
  setTimeout(()=>URL.revokeObjectURL(url),0);
};

exportPdfBtn.onclick = () => {
  const w = window.open("", "_blank");
  const css = `@page{{size:A4;margin:14mm}}body{{font-family:system-ui}}table{{width:100%;border-collapse:collapse;font-size:12px}}th,td{{border:1px solid #999;padding:4px;text-align:center}}td.blocked{{position:relative;background:#fee}}td.blocked::before,td.blocked::after{{content:"";position:absolute;inset:2px;border-top:2px solid #c00}}td.blocked::before{{transform:rotate(45deg)}}td.blocked::after{{transform:rotate(-45deg)}}`;
  w.document.write(`<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><title>Export Yam’s</title><style>${css}</style></head><body>`);
  w.document.write(`<h1>Feuille de scores</h1>`);
  // Classement courant
  w.document.write(`<h2>Classement — ${rankModeSelect.value==="current"?"manche actuelle":"global"}</h2>`);
  const lb = document.getElementById("leaderboardList").innerHTML;
  w.document.write(`<div>${lb}</div>`);
  // Tableau courant
  w.document.write(`<h2>Tableau scores (manche courante)</h2>`);
  w.document.write(renderTableHtmlForPdf());
  w.document.write(`</body></html>`);
  w.document.close(); w.focus(); w.print();
};

// TABLE RENDER
function renderTable() {
  thead.innerHTML = ""; tbody.innerHTML = "";
  const trh = document.createElement("tr");
  trh.innerHTML = `<th>Catégorie</th>` + players.map(p => `<th>${escapeHtml(p)}</th>`).join("");
  thead.appendChild(trh);

  CATEGORIES.forEach(cat => {
    const tr = document.createElement("tr");
    tr.appendChild(stickyCell(cat.label));
    players.forEach(p => {
      const td = document.createElement("td");
      if (cat.readonly) {
        td.textContent = calcTotal(p);
      } else {
        const input = document.createElement("input");
        input.type = "text"; input.inputMode = "numeric"; input.pattern = "[0-9]*"; input.autocomplete="off";
        const cell = normalizeCell(currentRound.scores[p]?.[cat.key]);
        if (cell.blocked) { td.classList.add("blocked"); input.value = ""; input.readOnly = true; }
        else { input.value = (cell.score === 0 ? "" : String(cell.score)); }
        input.addEventListener("input", () => onInput(input, p, cat));
        input.addEventListener("blur",  () => onBlur(input, p, cat));
        td.addEventListener("dblclick", () => toggleBlock(td, input, p, cat));
        td.appendChild(input);
      }
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
}

function stickyCell(text){
  const td = document.createElement("td"); td.textContent = text; td.style.position="sticky"; td.style.left="0"; td.style.background="#fff"; td.style.fontWeight="700"; return td;
}

function onInput(input, player, cat){
  // chiffres uniquement
  const digits = String(input.value).replace(/[^\d]/g,"");
  if (digits !== input.value) input.value = digits;
  const n = digits==="" ? "" : parseInt(digits,10);
  if (n===""){ input.classList.remove("is-invalid"); return; }
  const { valid } = validateValue(cat, n);
  input.classList.toggle("is-invalid", !valid);
}

function onBlur(input, player, cat){
  const raw = String(input.value).replace(/[^\d]/g,"");
  if (raw===""){
    setCell(player, cat.key, {score:0, blocked:false});
    input.classList.remove("is-invalid");
    renderLeaderboard();
    return;
  }
  let n = parseInt(raw,10);
  const { value } = validateValue(cat, n); // normalisation
  setCell(player, cat.key, {score:value, blocked:false});
  input.value = value ? String(value) : "";
  input.classList.remove("is-invalid");
  renderLeaderboard();
}

function toggleBlock(td, input, player, cat){
  const cur = normalizeCell(currentRound.scores[player]?.[cat.key]);
  const newBlocked = !cur.blocked;
  setCell(player, cat.key, {score:0, blocked:newBlocked});
  if (newBlocked){ td.classList.add("blocked"); input.value=""; input.readOnly=true; }
  else { td.classList.remove("blocked"); input.readOnly=false; }
  renderLeaderboard();
}

function setCell(player, key, obj){
  if (!currentRound.scores[player]) currentRound.scores[player] = {};
  currentRound.scores[player][key] = obj;
  save(); // persist
}

function normalizeCell(v){
  if (!v) return {score:0, blocked:false};
  if (typeof v === "number") return {score:v, blocked:false};
  return {score: Number(v.score || 0), blocked: !!v.blocked};
}

// VALIDATION + NORMALISATION
function validateValue(cat, n){
  const cfg = CATEGORIES.find(c => c.key === cat.key);
  if (!cfg) return {value:n, valid:true};
  if (cfg.type==="multiple"){
    const base = parseInt(cfg.key,10);
    const allowed = [0, base, base*2, base*3, base*4, base*5];
    // choisir la plus proche
    let closest = allowed[0], d = Math.abs(n-closest);
    allowed.forEach(v=>{ const dd=Math.abs(n-v); if (dd<d){ d=dd; closest=v; }});
    return { value: closest, valid: allowed.includes(n) };
  }
  if (cfg.type==="fixed"){
    const near = Math.abs(n-cfg.value) < Math.abs(n-0) ? cfg.value : 0;
    return { value: near, valid: (n===0 || n===cfg.value) };
  }
  if (cfg.type==="range-or-zero"){
    if (n===0) return {value:0, valid:true};
    if (n < cfg.min) return {value:0, valid:false};
    if (n > cfg.max) return {value:cfg.max, valid:false};
    return {value:n, valid:true};
  }
  return {value:n, valid:true};
}

// CALCULS
function calcTotal(player){
  let tot = 0;
  for (const c of CATEGORIES){
    if (c.readonly) continue;
    const v = normalizeCell(currentRound.scores[player]?.[c.key]);
    if (!v.blocked) tot += Number(v.score||0);
  }
  return tot;
}
function calcTotalAll(player){
  let total = 0;
  rounds.forEach(r => {
    for (const c of CATEGORIES){
      if (c.readonly) continue;
      const cell = r.scores[player]?.[c.key];
      if (!cell) continue;
      const v = (typeof cell === "object") ? (cell.blocked ? 0 : (cell.score||0)) : (typeof cell==="number"?cell:0);
      total += Number(v||0);
    }
  });
  return total;
}

// CLASSEMENT
function renderLeaderboard(){
  const list = [];
  if (rankModeSelect.value === "current"){
    players.forEach(p => list.push({ name:p, score: calcTotal(p) }));
  } else {
    players.forEach(p => list.push({ name:p, score: calcTotalAll(p) }));
  }
  list.sort((a,b)=> b.score - a.score);
  leaderboardList.innerHTML = "";
  list.forEach((row, i) => {
    const span = document.createElement("span");
    span.textContent = `${i+1}. ${row.name} — ${row.score}`;
    leaderboardList.appendChild(span);
  });
}

// UTILS
function escapeHtml(s){ return String(s).replace(/[&<>\"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
function save(){
  localStorage.setItem("players", JSON.stringify(players));
  localStorage.setItem("rounds", JSON.stringify(rounds));
  localStorage.setItem("currentRound", JSON.stringify(currentRound));
}
