'use strict';
// Agents Rurals · Estudi — PWA sense dependències.
// Dades: data/dades.json (generat per scripts/build_app.py). Progrés: localStorage del dispositiu.

const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const LLETRES = 'abcd';
const DIA = 864e5;
const CAIXES = [0, 1, 3, 7, 14, 30]; // dies fins al pròxim repàs segons la caixa (repetició espaiada)
const CLAU = 'agents-rurals.progres.v1';

let D = null;            // dades
let PER_ID = new Map();
let SESSIO = null;       // test en curs
let instalPrompt = null;
let ESP = null;           // joc d'espècies en curs

// ---------------------------------------------------------------- progrés
const P = (() => {
  let s;
  try { s = JSON.parse(localStorage.getItem(CLAU)) || {}; } catch { s = {}; }
  s.q = s.q || {}; s.sims = s.sims || []; s.pref = s.pref || {}; s.esp = s.esp || {}; s.dies = s.dies || {}; s.reptes = s.reptes || {}; s.logros = s.logros || {}; s.jocs = s.jocs || {};
  const desa = () => { try { localStorage.setItem(CLAU, JSON.stringify(s)); } catch (e) { alert('No s\'ha pogut desar el progrés: ' + e.message); } };
  return {
    get: id => s.q[id],
    tots: () => s.q,
    sims: () => s.sims,
    pref: (k, v) => { if (v === undefined) return s.pref[k]; s.pref[k] = v; desa(); },
    dies: () => s.dies, reptes: () => s.reptes, logros: () => s.logros,
    dia(tema, encert) { // activitat diària: total i per tema (per a la ratxa i el resum setmanal)
      const d = s.dies[avui()] = s.dies[avui()] || {n: 0, c: 0, t: {}};
      d.n++; if (encert) d.c++;
      if (tema) { const t = d.t[tema] = d.t[tema] || [0, 0]; t[0]++; if (encert) t[1]++; }
    },
    jocs: () => s.jocs,
    resJoc(id, enc, tot) { const j = s.jocs[id] = s.jocs[id] || {p: 0, n: 0, c: 0, millor: 0}; j.p++; j.n += tot; j.c += enc; j.millor = Math.max(j.millor, Math.round(100 * enc / tot)); j.l = Date.now(); desa(); },
    desaRepte(dia, res) { if (!s.reptes[dia]) { s.reptes[dia] = res; desa(); } },
    desbloqueja(id) { s.logros[id] = Date.now(); desa(); },
    respon(id, encert, tema) {
      this.dia(tema, encert);
      const r = s.q[id] || {n: 0, c: 0, w: 0, b: 0};
      r.n++; r.l = Date.now();
      if (r.s === undefined) r.s = r.u ? 1 : 0; // registres anteriors: l'últim encert compta com un
      if (encert) { r.c++; r.b = Math.min(r.b + 1, CAIXES.length - 1); r.u = 1; if (r.sd !== avui()) { r.s++; r.sd = avui(); } }
      else { r.w++; r.b = 1; r.u = 0; r.s = 0; r.sd = null; }
      r.d = Date.now() + CAIXES[r.b] * DIA;
      s.q[id] = r; desa();
    },
    esp: () => s.esp,
    respEsp(lat, encert) { const r = s.esp[lat] || {n: 0, c: 0}; r.n++; if (encert) r.c++; r.u = encert ? 1 : 0; r.l = Date.now(); s.esp[lat] = r; desa(); },
    afegeixSim(sim) { s.sims.unshift(sim); s.sims = s.sims.slice(0, 50); desa(); },
    marcaCopia() { s.copia = Date.now(); desa(); }, copia: () => s.copia,
    exporta: () => JSON.stringify({app: 'agents-rurals', versio: 1, data: new Date().toISOString(), progres: s}),
    importa(txt) {
      const o = JSON.parse(txt);
      const nou = o.progres || o;
      if (!nou || typeof nou.q !== 'object') throw new Error('El fitxer no és una còpia del progrés.');
      for (const [id, r] of Object.entries(nou.q)) {
        const a = s.q[id];
        if (!a || (r.l || 0) > (a.l || 0)) s.q[id] = r;
      }
      const vistes = new Set(s.sims.map(x => x.data));
      for (const x of nou.sims || []) if (!vistes.has(x.data)) s.sims.push(x);
      s.sims.sort((a, b) => (b.data > a.data ? 1 : -1));
      for (const [k, r] of Object.entries(nou.esp || {})) if (!s.esp[k] || (r.l || 0) > (s.esp[k].l || 0)) s.esp[k] = r;
      for (const [k, r] of Object.entries(nou.dies || {})) if (!s.dies[k] || r.n > s.dies[k].n) s.dies[k] = r;
      for (const [k, r] of Object.entries(nou.reptes || {})) if (!s.reptes[k]) s.reptes[k] = r;
      for (const [k, r] of Object.entries(nou.logros || {})) if (!s.logros[k]) s.logros[k] = r;
      for (const [k, r] of Object.entries(nou.jocs || {})) if (!s.jocs[k] || (r.l || 0) > (s.jocs[k].l || 0)) s.jocs[k] = r;
      desa();
    },
    esborra() { s = {q: {}, sims: [], esp: {}, dies: {}, reptes: {}, logros: {}, jocs: {}, pref: s.pref}; desa(); },
  };
})();

// ---------------------------------------------------------------- ajustos de l'usuari
const AJ_DEF = {nom: '', meta: 40, tema: 'auto', text: 'normal', barrejaOp: false, avanca: false, cita: 'oberta', nPractica: 20, simCrono: true, simAvanca: true};
// Només es desen els ajustos que l'usuari ha canviat; així un canvi de valor per defecte arriba a tothom
(() => { const a = P.pref('ajustos'); if (a && !a.v) { const n = {v: 2}; for (const k in a) if (k !== 'cita' && a[k] !== AJ_DEF[k]) n[k] = a[k]; P.pref('ajustos', n); } })();
const aj = k => ({...AJ_DEF, ...(P.pref('ajustos') || {})})[k];
function posaAjust(k, v) { const a = {...(P.pref('ajustos') || {}), v: 2}; if (v === AJ_DEF[k]) delete a[k]; else a[k] = v; P.pref('ajustos', a); aplicaAjustos(); }
function aplicaAjustos() {
  const r = document.documentElement;
  if (aj('tema') === 'auto') delete r.dataset.theme; else r.dataset.theme = aj('tema');
  if (aj('text') === 'normal') delete r.dataset.text; else r.dataset.text = aj('text');
  const fosc = aj('tema') === 'dark' || (aj('tema') === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelector('meta[name=theme-color]').content = fosc ? '#1c3324' : '#2f5d3a';
}
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', aplicaAjustos);
aplicaAjustos();

// ---------------------------------------------------------------- utilitats
const dataLocal = t => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const avui = () => dataLocal(Date.now());
const diaAbans = (dia, n = 1) => { const [y, m, d] = dia.split('-').map(Number); return dataLocal(new Date(y, m - 1, d - n, 12)); };
// Una pregunta és «fallada» si l'has fallat alguna vegada i encara no l'has encertat dues vegades seguides
// en dies diferents (un sol encert pot ser sort).
const ENCERTS_PER_SUPERAR = 2;
const seguits = r => (r.s !== undefined ? r.s : (r.u ? 1 : 0));
const esFallada = r => !!r && r.w > 0 && seguits(r) < ENCERTS_PER_SUPERAR;
const barreja = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const ordreTema = t => (t[0] === 'G' ? 0 : 100) + parseInt(t.slice(1), 10);
const temaDe = codi => D.temes.find(t => t.codi === codi);
const nomTema = codi => { const t = temaDe(codi); return t ? `${codi}. ${t.titol}` : codi; };
const pct = (a, b) => (b ? Math.round(100 * a / b) : 0);
const ara = () => Date.now();
const vigent = q => q.s === 'v';
const ESTATS = {v: 'Vigent', d: 'Desactualitzada', a: 'Anul·lada'};

function origenEtiqueta(q) {
  if (q.o !== 'o') return '<span class="etiqueta">Generada</span>';
  const e = q.ex;
  return `<span class="etiqueta oficial">Oficial · ${esc(e.c)} · ${e.y} · ${esc(e.k)}${e.res ? ' · reserva' : ''}</span>`;
}
const ICONES = {
  brot: '<path d="M12 20v-8"/><path d="M12 12c0-4 3-6 7-6 0 4-3 6-7 6zM12 14c0-3-2-5-6-5 0 3 2 5 6 5z"/>',
  llibre: '<path d="M4 5a2 2 0 012-2h13v16H6a2 2 0 00-2 2z"/><path d="M4 19V5"/>',
  muntanya: '<path d="M3 20l6-11 4 6 2-3 6 8z"/>',
  arbre: '<path d="M12 3l-6 9h4l-4 6h12l-4-6h4z"/><path d="M12 18v3"/>',
  check: '<circle cx="12" cy="12" r="9"/><path d="M8 12l3 3 5-6"/>',
  carpeta: '<path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>',
  birret: '<path d="M2 9l10-5 10 5-10 5z"/><path d="M6 11v5c3 2 9 2 12 0v-5"/>',
  document: '<path d="M6 3h9l4 4v14H6z"/><path d="M9 12h7M9 16h5"/>',
  estrella: '<path d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z"/>',
  medalla: '<circle cx="12" cy="15" r="5"/><path d="M8 3l2 7M16 3l-2 7"/>',
  columnes: '<path d="M3 9l9-5 9 5M5 9v9M10 9v9M14 9v9M19 9v9M3 20h18"/>',
  fulla: '<path d="M5 19c0-8 5-14 15-14 0 10-6 15-14 15"/><path d="M5 19l8-8"/>',
  flama: '<path d="M12 3c1 4 6 6 6 11a6 6 0 01-12 0c0-3 2-4 2-7 2 1 3 3 3 5 1-2 1-6 1-9z"/>',
  cent: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/>',
  diana: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  pujada: '<path d="M3 17l6-6 4 4 7-7"/><path d="M14 8h6v6"/>',
  obre: '<path d="M4 5a2 2 0 012-2h13v16H6a2 2 0 00-2 2z"/><path d="M4 19V5M8 7h7M8 11h5"/>',
  bandera: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
  sol: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  rellotge: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M9 2h6"/>',
  persona: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4.5-6 8-6s7 2 8 6"/>',
  descarrega: '<path d="M12 3v12M7 10l5 5 5-5"/><path d="M4 17v3h16v-3"/>',
  etiqueta: '<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.5"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
  fletxa: '<path d="M9 5l7 7-7 7"/>',
  escut: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>'
};
const ico = (n, cls = '') => `<svg class="icona ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONES[n]}</svg>`;
const punts = d => '●'.repeat(d) + '○'.repeat(4 - d);

// ---------------------------------------------------------------- constància: ratxa, repte del dia i logros
const fet = dia => (P.dies()[dia]?.n || 0) >= aj('meta');
const fraccioMeta = dia => (P.dies()[dia]?.n || 0) / aj('meta');
// Ratxa: dies seguits complint la meta. Un dia sense complir-la per setmana no la trenca (dia de descans).
function ratxa() {
  // Es recorre cap enrere des d'avui (o des d'ahir si avui encara no s'ha fet la meta)
  let dia = fet(avui()) ? avui() : diaAbans(avui()), n = 0, descans = null;
  while (n < 5000) {
    if (fet(dia)) n++;
    else if (fet(diaAbans(dia)) && (!descans || dies(descans, dia) >= 7)) descans = dia; // dia de descans
    else break;
    dia = diaAbans(dia);
  }
  return n;
}
const dies = (a, b) => Math.round((new Date(a) - new Date(b)) / DIA);
function millorRatxa() {
  const ds = Object.keys(P.dies()).filter(fet).sort();
  if (!ds.length) return 0;
  let millor = 1, act = 1, descans = null;
  for (let i = 1; i < ds.length; i++) {
    const g = dies(ds[i], ds[i - 1]);
    if (g === 1) act++;
    else if (g === 2 && (!descans || dies(ds[i], descans) >= 7)) { act++; descans = ds[i]; }
    else { act = 1; descans = null; }
    millor = Math.max(millor, act);
  }
  return Math.max(millor, ratxa());
}

// Repte del dia: 10 preguntes iguals per a tothom (llavor = data), una de cada tema més present
const INICI_REPTES = '2026-11-16';
const numRepte = dia => dies(dia, INICI_REPTES) + 1;
function llavor(txt) { let h = 2166136261; for (const c of txt) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return () => { h = Math.imul(h ^ (h >>> 15), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return ((h ^= h >>> 16) >>> 0) / 4294967296; }; }
function preguntesRepte(dia) {
  const rnd = llavor('repte-' + dia);
  const pool = D.preguntes.filter(q => vigent(q) && q.d >= 2).sort((a, b) => (a.id < b.id ? -1 : 1));
  const temes = [...new Set(pool.map(q => q.t))].sort();
  for (let i = temes.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [temes[i], temes[j]] = [temes[j], temes[i]]; }
  return temes.slice(0, 10).map(t => { const c = pool.filter(q => q.t === t); return c[Math.floor(rnd() * c.length)]; })
    .sort((a, b) => ordreTema(a.t) - ordreTema(b.t));
}
function textRepte(dia) {
  const r = P.reptes()[dia]; if (!r) return '';
  const enc = r.r.filter(x => x === 1).length;
  return `Agents Rurals · repte #${numRepte(dia)}${aj('nom') ? ' · ' + aj('nom') : ''} · ${enc}/10\n${r.r.map(x => ['✗', '✓', '·'][x]).join(' ')}\n${location.origin + location.pathname}`;
}
function blocRepte(dia) {
  const r = P.reptes()[dia]; if (!r) return '';
  return `<div class="targeta repte-fet">${quadres(r.r)}
    <p><b>${r.r.filter(x => x === 1).length}/10</b> al repte #${numRepte(dia)}. Comparteix-ho i pica't amb els companys.</p>
    <div class="botons"><button class="boto principal" data-comparteix="${dia}">Compartir el resultat</button></div></div>`;
}
document.addEventListener('click', async e => {
  const b = e.target.closest('[data-comparteix]'); if (!b) return;
  const txt = textRepte(b.dataset.comparteix);
  try {
    if (navigator.share) await navigator.share({text: txt});
    else { await navigator.clipboard.writeText(txt); avis('Resultat copiat. Enganxa\'l on vulguis.'); }
  } catch (err) { if (err.name !== 'AbortError') { try { await navigator.clipboard.writeText(txt); avis('Resultat copiat.'); } catch { prompt('Copia el resultat:', txt); } } }
});
function comencaRepte() {
  const dia = avui();
  comenca(preguntesRepte(dia), 'repte', `Repte #${numRepte(dia)}`, {dia});
}

// Logros: es calculen a partir del progrés; quan se n'aconsegueix un de nou, surt un avís
function logros() {
  const q = P.tots(), ids = Object.keys(q), sims = P.sims(), esp = P.esp(), rep = P.reptes();
  const respostes = ids.reduce((s, i) => s + q[i].n, 0);
  const temesComplets = D.temes.filter(t => D.preguntes.every(x => x.t !== t.codi || q[x.id])).length;
  const millorSim = sims.filter(x => !x.ex && (x.n || 80) >= 80).reduce((m, x) => Math.max(m, x.Q), 0);
  const examensFets = new Set(sims.filter(x => x.ex).map(x => x.ex)).size;
  const especiesBe = D.especies.filter(e => esp[e.lat]?.c > 0).length;
  const mr = millorRatxa(), nRep = Object.keys(rep).length, perfecte = Object.values(rep).some(r => r.r.every(x => x === 1));
  const L = (id, ico, nom, desc, val, obj) => ({id, ico, nom, desc, val: Math.min(val, obj), obj, ok: val >= obj});
  return [
    L('primer', '🌱', 'Primeres passes', 'Respon la primera pregunta', respostes, 1),
    L('cent', '📚', 'Cent respostes', 'Respon 100 preguntes', respostes, 100),
    L('mil', '🏔️', 'Mil respostes', 'Respon 1.000 preguntes', respostes, 1000),
    L('cinc-mil', '🌲', 'Cinc mil', 'Respon 5.000 preguntes', respostes, 5000),
    L('tema', '✅', 'Tema complet', 'Respon totes les preguntes d\'un tema', temesComplets, 1),
    L('cinc-temes', '🗂️', 'Cinc temes complets', 'Respon totes les preguntes de 5 temes', temesComplets, 5),
    L('temari', '🎓', 'Tot el banc', 'Respon totes les preguntes dels 25 temes', temesComplets, 25),
    L('aprovat', '📝', 'Aprovat', 'Treu un 11 o més en un simulacre de 80 preguntes', millorSim >= 11 ? 1 : 0, 1),
    L('notable', '⭐', 'Nota alta', 'Treu un 15 o més en un simulacre', millorSim >= 15 ? 1 : 0, 1),
    L('excel', '🏅', 'Excel·lent', 'Treu un 19 o més en un simulacre', millorSim >= 19 ? 1 : 0, 1),
    L('oficials', '🏛️', 'Historiador', `Fes els ${D.examens.length} exàmens oficials sencers`, examensFets, D.examens.length),
    L('especies', '🦉', 'Naturalista', `Encerta les ${D.especies.length} espècies almenys un cop`, especiesBe, D.especies.length),
    L('ratxa7', '🔥', 'Una setmana', 'Ratxa de 7 dies', mr, 7),
    L('ratxa30', '🔥', 'Un mes', 'Ratxa de 30 dies', mr, 30),
    L('ratxa100', '💯', 'Cent dies', 'Ratxa de 100 dies', mr, 100),
    L('repte7', '🎯', 'Reptador', 'Fes 7 reptes del dia', nRep, 7),
    L('perfecte', '🎯', 'Repte perfecte', 'Treu 10/10 en un repte del dia', perfecte ? 1 : 0, 1),
  ];
}
function comprovaLogros() {
  const ja = P.logros(); const nous = logros().filter(l => l.ok && !ja[l.id]);
  for (const l of nous) P.desbloqueja(l.id);
  if (nous.length) avis(`${nous[0].ico} Logro aconseguit: <b>${esc(nous[0].nom)}</b>${nous.length > 1 ? ` i ${nous.length - 1} més` : ''}`, '#/progres');
}
function avis(html, enllac) {
  document.querySelector('.toast')?.remove();
  const t = document.createElement(enllac ? 'a' : 'div'); t.className = 'toast'; t.innerHTML = html;
  if (enllac) t.href = enllac;
  document.body.appendChild(t); setTimeout(() => t.classList.add('fora'), 3500); setTimeout(() => t.remove(), 4000);
}
// Novetats: després d'una actualització, l'inici mostra què ha canviat (un sol cop)
function novetatsPendents() {
  const nov = D.app?.novetats || [], vista = P.pref('versioVista');
  if (!nov.length) return '';
  if (!vista) { P.pref('versioVista', nov[0].versio); return ''; } // primera instal·lació: no cal
  if (vista === nov[0].versio) return '';
  const noves = nov.slice(0, Math.max(1, nov.findIndex(v => v.versio === vista)));
  return `<div class="targeta novetats-inici"><b>Novetats de la versió ${esc(nov[0].versio)}</b>
    <ul>${noves.flatMap(v => v.canvis).slice(0, 6).map(c => `<li>${esc(c)}</li>`).join('')}</ul>
    <div class="botons"><button class="boto" id="vist">D'acord</button><a class="boto" href="#/ajustos">Totes les novetats</a></div></div>`;
}
document.addEventListener('click', e => { if (e.target.id === 'vist') { P.pref('versioVista', D.app.novetats[0].versio); e.target.closest('.novetats-inici').remove(); } });
const quadres = r => `<div class="quadres">${r.map(x => `<span class="q${x}">${x === 2 ? '' : `<svg viewBox="0 0 12 12" aria-hidden="true"><path d="${x ? 'M3 6.5l2 2 4-5' : 'M3.5 3.5l5 5M8.5 3.5l-5 5'}"/></svg>`}</span>`).join('')}</div>`;
// Anell de la meta: degradat blau→verd, xifra al centre i marca quan es completa
const anell = (fets, meta, mida = 76) => {
  const r = 30, c = 2 * Math.PI * r, f = Math.min(1, meta ? fets / meta : 0), ple = f >= 1;
  return `<svg viewBox="0 0 76 76" width="${mida}" height="${mida}" class="anell" aria-hidden="true">
    <defs><linearGradient id="g-anell" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4f8fc7"/><stop offset="1" stop-color="#3f9a5a"/></linearGradient></defs>
    <circle cx="38" cy="38" r="${r}" class="a-fons"/>
    ${f > 0 ? `<circle cx="38" cy="38" r="${r}" class="a-val" stroke="url(#g-anell)" stroke-dasharray="${c * f} ${c}" transform="rotate(-90 38 38)"/>` : ''}
    ${ple ? `<circle cx="38" cy="38" r="20" class="a-ple"/><path d="M29 38.5l6 6 12-13" class="a-check"/>`
      : `<text x="38" y="37" class="a-num" text-anchor="middle">${fets}</text><text x="38" y="51" class="a-de" text-anchor="middle">de ${meta}</text>`}
  </svg>`;
};
// Flama de la ratxa: dues capes amb degradat; grisa si la ratxa està aturada
const flama = (activa, mida = 52) => `<svg viewBox="0 0 48 56" width="${mida * 48 / 56}" height="${mida}" class="flama ${activa ? 'activa' : ''}" aria-hidden="true">
  <defs>
    <linearGradient id="g-flama" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#e2431f"/><stop offset=".55" stop-color="#f27a1a"/><stop offset="1" stop-color="#f7b733"/></linearGradient>
    <linearGradient id="g-cor" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#ffd23f"/><stop offset="1" stop-color="#fff3b0"/></linearGradient>
  </defs>
  <path class="f-ext" d="M24 2c2 9 12 14 15 24 3 10-2 26-15 28C11 52 5 42 7 32c1-6 5-9 6-15 3 3 4 7 4 10 3-8 6-15 7-25z"/>
  <path class="f-int" d="M24 26c1 5 7 8 8 14 1 7-3 12-8 12s-9-4-8-10c0-4 3-6 4-10 1 2 2 4 2 6 1-4 2-8 2-12z"/>
</svg>`;

// ---------------------------------------------------------------- encaminament
const rutes = {
  '': vistaInici, practica: vistaPractica, simulacre: vistaSimulacre, repas: vistaRepas,
  test: vistaTest, resultat: vistaResultat, especies: vistaEspecies, temari: vistaTemari, progres: vistaProgres, ajustos: vistaAjustos,
};
function navega() {
  const parts = location.hash.replace(/^#\/?/, '').split('/');
  const r = rutes[parts[0]] || vistaInici;
  const seccio = {test: SESSIO && SESSIO.mode === 'simulacre' ? 'simulacre' : 'practica', resultat: 'practica', repas: '', especies: 'practica', jocs: 'practica'}[parts[0]] ?? parts[0];
  document.querySelectorAll('.menu a, .engranatge').forEach(a => a.classList.toggle('actiu', a.getAttribute('href') === '#/' + seccio));
  if (parts[0] !== 'temari') TORNAR = null;
  $('#tornar').hidden = !(parts[0] === 'temari' && TORNAR);
  r(parts.slice(1).map(decodeURIComponent));
  if (D && parts[0] !== 'test') comprovaLogros();
  if (parts[0] !== 'temari') window.scrollTo(0, 0);
}
window.addEventListener('hashchange', navega);
let TORNAR = null; // ruta on cal tornar després de consultar els apunts des d'una pregunta
$('#tornar button').addEventListener('click', () => { location.hash = TORNAR || '#/'; });
document.addEventListener('click', e => { if (e.target.closest('[data-apunts]')) TORNAR = location.hash; });

// ---------------------------------------------------------------- inici
function vistaInici() {
  const q = P.tots(); const ids = Object.keys(q);
  const vistes = ids.length, enc = ids.reduce((s, i) => s + q[i].c, 0), tot = ids.reduce((s, i) => s + q[i].n, 0);
  const pendents = D.preguntes.filter(x => q[x.id] && q[x.id].d <= ara() && vigent(x)).length;
  const fallades = D.preguntes.filter(x => esFallada(q[x.id]) && vigent(x)).length;
  const sim = P.sims()[0];
  const darrera = {...FILTRES_DEF, ...(P.pref('darrera') || {})};
  $('#app').innerHTML = `
    ${instalPrompt ? `<div class="targeta avis-instal"><span>Instal·la l'app per fer-la servir sense connexió.</span><button class="boto principal" id="instal">Instal·lar</button></div>` : ''}
    <h1>${aj('nom') ? `Hola, ${esc(aj('nom'))}` : 'Oposició d\'agent rural'}</h1>
    ${novetatsPendents()}
    ${(() => {
      const fets = P.dies()[avui()]?.n || 0, meta = aj('meta'), fetAvui = fet(avui()), rt = ratxa(), rep = P.reptes()[avui()];
      return `<div class="constancia">
        <div class="targeta meta-dia">${anell(fets, meta)}<div><div class="xifra-petita">${fetAvui ? 'Meta feta' : 'Meta d\'avui'}</div><div class="suau">${fetAvui ? `${fets} preguntes avui` : `en falten ${meta - fets}`}</div></div></div>
        <div class="targeta ratxa ${rt ? 'activa' : ''}"><div class="foc">${flama(rt > 0)}</div><div><div class="xifra-petita">${rt} ${rt === 1 ? 'dia' : 'dies'}</div><div class="suau">${rt ? (fetAvui ? 'de ratxa' : 'de ratxa · fes la meta d\'avui') : 'comença la ratxa avui'}</div></div></div>
        <div class="targeta repte">${rep ? `${quadres(rep.r)}<div class="suau">Repte #${numRepte(avui())}: ${rep.r.filter(x => x === 1).length}/10</div><button class="boto" data-comparteix="${avui()}">Compartir</button>`
          : `<div><b>Repte del dia #${numRepte(avui())}</b><div class="suau">10 preguntes, les mateixes per a tothom</div></div><button class="boto principal" id="repte">Fer-lo</button>`}</div>
      </div>`;
    })()}
    <div class="targeta continua">
      <div><b>${P.pref('darrera') ? 'Continuar practicant' : 'Començar a practicar'}</b><div class="suau">${esc(descripcioFiltres(darrera))}</div></div>
      <div class="botons"><button class="boto principal gran" id="continua">${P.pref('darrera') ? 'Continuar' : 'Començar'}</button><a class="boto" href="#/practica">Canviar filtres</a></div>
    </div>
    ${typeof minijocDelDia === 'function' ? (() => { const j = minijocDelDia(); return `<div class="targeta minijoc"><span class="joc-ic">${j.ic}</span>
      <div class="txt"><b>Minijoc del dia: ${esc(j.nom)}</b><div class="suau">${esc(j.desc)}</div></div><button class="boto" data-minijoc="${j.id}">Jugar</button></div>`; })() : ''}
    ${pendents || fallades ? `<div class="targeta pendent"><b>Pendent</b><div class="botons">
      ${pendents ? `<a class="boto" href="#/repas">Repassar ${pendents} ${pendents === 1 ? 'pregunta' : 'preguntes'}</a>` : ''}
      ${fallades ? `<button class="boto" id="fallades">Tornar a les fallades (${fallades})</button>` : ''}</div></div>` : ''}
    <div class="targeta resum-inici">
      <div><div class="xifra-petita">${vistes.toLocaleString('ca')}<span class="suau"> / ${D.preguntes.length.toLocaleString('ca')}</span></div><div class="suau">preguntes vistes</div></div>
      <div><div class="xifra-petita">${tot ? pct(enc, tot) + ' %' : '–'}</div><div class="suau">d'encert</div></div>
      <div><div class="xifra-petita" ${sim ? `style="color:var(${sim.Q >= D.examen.minim ? '--verd' : '--vermell'})"` : ''}>${sim ? sim.Q.toFixed(2) : '–'}</div><div class="suau">darrer simulacre</div></div>
    </div>`;
  $('#repte')?.addEventListener('click', comencaRepte);
  $('#continua').addEventListener('click', () => llancaPractica(darrera));
  $('#instal')?.addEventListener('click', async () => { instalPrompt.prompt(); await instalPrompt.userChoice; instalPrompt = null; navega(); });
  $('#fallades')?.addEventListener('click', () => {
    comenca(barreja(D.preguntes.filter(x => esFallada(q[x.id]) && vigent(x))).slice(0, 40), 'practica', 'Fallades');
  });
}

// ---------------------------------------------------------------- pràctica
const navPractica = actiu => `<nav class="pestanyes" aria-label="Tipus de pràctica">
  <a href="#/practica" class="${actiu === 'preguntes' ? 'actiu' : ''}">Preguntes</a>
  <a href="#/jocs" class="${actiu === 'jocs' ? 'actiu' : ''}">Jocs</a></nav>`;
// Filtres de pràctica. Per defecte: tots els temes barrejats, totes les dificultats i orígens.
const FILTRES_DEF = {temes: [], epi: '', origen: '', cat: ['agent', 'agent major', 'sotsinspector'], dif: [1, 2, 3, 4], desact: false, mode: 'totes', n: 0, ordre: false};
const filtraPreguntes = s => D.preguntes.filter(q =>
  (!s.temes.length || s.temes.includes(q.t)) && (!s.epi || q.e === s.epi) &&
  (!s.origen || q.o === s.origen) && (q.o !== 'o' || s.cat.includes(q.ex.k)) &&
  s.dif.includes(q.d) && (s.desact || vigent(q)) &&
  (s.mode !== 'noves' || !P.get(q.id)) && (s.mode !== 'fallades' || esFallada(P.get(q.id))));
function descripcioFiltres(s) {
  const p = [];
  p.push(!s.temes.length ? 'Tots els temes' : s.temes.length === 1 ? nomTema(s.temes[0]) + (s.epi ? ` · ${s.epi}` : '') : `${s.temes.length} temes (${s.temes.join(', ')})`);
  if (s.origen) p.push(s.origen === 'o' ? 'només oficials' : 'només generades');
  if (s.dif.length < 4) p.push('dificultat ' + s.dif.map(d => ['', 'bàsica', 'mitjana', 'avançada', 'experta'][d]).join(', '));
  if (s.mode !== 'totes') p.push(s.mode === 'noves' ? 'només no vistes' : 'només fallades');
  p.push(s.ordre ? 'en ordre del temari' : 'barrejades');
  return p.join(' · ');
}
function llancaPractica(s) {
  let llista = filtraPreguntes(s);
  if (!llista.length) { alert('Cap pregunta compleix els filtres.'); return; }
  if (s.ordre) llista.sort((a, b) => ordreTema(a.t) - ordreTema(b.t) || a.e.localeCompare(b.e, 'ca', {numeric: true}));
  else { const noves = barreja(llista.filter(q => !P.get(q.id))), vistes = barreja(llista.filter(q => P.get(q.id))); llista = [...noves, ...vistes]; } // primer les no vistes
  llista = llista.slice(0, s.n || aj('nPractica') || 20);
  P.pref('darrera', s);
  comenca(llista, 'practica', s.temes.length === 1 ? nomTema(s.temes[0]) : 'Pràctica');
}
function vistaPractica() {
  const temes = D.temes.map(t => t.codi);
  const xip = (nom, val, txt, on) => `<label class="xip"><input type="checkbox" name="${nom}" value="${esc(val)}" ${on ? 'checked' : ''}><span>${esc(txt)}</span></label>`;
  const F = FILTRES_DEF;
  $('#app').innerHTML = `
    <h1>Practicar</h1>
    ${navPractica('preguntes')}
    <form id="f">
      <div class="targeta comenca">
        <div><b id="resum"></b><div class="suau" id="compte"></div></div>
        <button class="boto principal gran" type="submit">Començar</button>
      </div>
      <details class="filtres targeta" id="det-filtres"><summary>Filtres</summary>
      <fieldset><legend>Temes</legend>
        <div class="botons" style="margin:0 0 .5rem"><button type="button" class="boto petit-boto" data-tots="1">Tots</button><button type="button" class="boto petit-boto" data-tots="0">Cap</button></div>
        <div class="xips">${temes.map(c => xip('tema', c, c, true)).join('')}</div>
        <div id="epigraf"></div>
      </fieldset>
      <fieldset><legend>Dificultat</legend>
        <div class="xips">${[1, 2, 3, 4].map(d => xip('dif', d, ['', 'Bàsic', 'Mitjà', 'Avançat', 'Expert'][d], true)).join('')}</div>
      </fieldset>
      <fieldset><legend>Origen</legend>
        <label class="fila"><select name="origen"><option value="">Generades i oficials</option><option value="g">Només generades</option><option value="o">Només oficials</option></select></label>
        <div id="categories" class="xips">${F.cat.map(k => xip('cat', k, 'Oficials ' + k, true)).join('')}</div>
        <label class="fila"><input type="checkbox" name="desact"> Incloure les desactualitzades i les anul·lades</label>
      </fieldset>
      <fieldset><legend>Quines i quantes</legend>
        <label class="fila"><input type="radio" name="mode" value="totes" checked> Totes (primer les que no has vist)</label>
        <label class="fila"><input type="radio" name="mode" value="noves"> Només les no vistes</label>
        <label class="fila"><input type="radio" name="mode" value="fallades"> Només les fallades</label>
        <label class="fila">Nombre <select name="n">${[10, 20, 40, 80, 9999].map(n => `<option value="${n}" ${n === aj('nPractica') ? 'selected' : ''}>${n === 9999 ? 'Totes' : n}</option>`).join('')}</select></label>
        <label class="fila"><input type="checkbox" name="ordre"> En l'ordre del temari (sense barrejar)</label>
      </fieldset>
      <div class="botons"><button type="button" class="boto" id="reinicia">Treure els filtres</button></div>
      </details>
    </form>
`;
  const f = $('#f');
  const seleccio = () => {
    const v = n => [...f.querySelectorAll(`[name=${n}]:checked`)].map(i => i.value);
    const tm = v('tema');
    return {temes: tm.length === temes.length ? [] : tm, capTema: !tm.length, cat: v('cat'), dif: v('dif').map(Number), origen: f.origen.value,
            desact: f.desact.checked, mode: f.mode.value, n: +f.n.value, ordre: f.ordre.checked,
            epi: f.epi ? f.epi.value : ''};
  };
  const actualitza = () => {
    const s = seleccio();
    $('#categories').hidden = s.origen === 'g';
    const box = $('#epigraf');
    if (s.temes.length === 1) {
      const epis = [...new Set(D.preguntes.filter(q => q.t === s.temes[0]).map(q => q.e))].sort((a, b) => a.localeCompare(b, 'ca', {numeric: true}));
      if (!f.epi || f.epi.dataset.t !== s.temes[0]) {
        box.innerHTML = `<label class="fila">Epígraf <select name="epi" data-t="${s.temes[0]}"><option value="">Tots</option>${epis.map(e => `<option>${e}</option>`).join('')}</select></label>`;
        f.epi.addEventListener('change', actualitza);
      }
    } else box.innerHTML = '';
    const n = s.capTema ? 0 : filtraPreguntes(s).length;
    $('#resum').textContent = s.capTema ? 'Cap tema triat' : descripcioFiltres(s);
    $('#compte').textContent = s.capTema ? 'Marca almenys un tema a Filtres.' : `${n.toLocaleString('ca')} preguntes · en surten ${Math.min(n, s.n || 20)}`;
    f.querySelector('[type=submit]').disabled = !n;
  };
  f.addEventListener('change', actualitza);
  f.querySelectorAll('[data-tots]').forEach(b => b.addEventListener('click', () => {
    f.querySelectorAll('[name=tema]').forEach(i => { i.checked = b.dataset.tots === '1'; }); actualitza();
  }));
  $('#reinicia').addEventListener('click', () => { f.reset(); f.querySelectorAll('[name=dif],[name=cat],[name=tema]').forEach(i => { i.checked = true; }); actualitza(); });
  f.addEventListener('submit', e => { e.preventDefault(); llancaPractica(seleccio()); });
  actualitza();
}

// ---------------------------------------------------------------- repàs (repetició espaiada)
function vistaRepas() {
  const q = P.tots();
  const pend = D.preguntes.filter(x => q[x.id] && q[x.id].d <= ara() && vigent(x))
    .sort((a, b) => (q[a.id].b - q[b.id].b) || (q[a.id].d - q[b.id].d));
  $('#app').innerHTML = `<h1>Repàs</h1>
    <div class="targeta"><p>Les preguntes que has respost tornen a sortir segons com les has encertat: si falles, l'endemà; si encertes, al cap de 3, 7, 14 i 30 dies.</p>
    <p><b>${pend.length}</b> preguntes per repassar avui.</p>
    <div class="botons">${pend.length ? `<button class="boto principal" id="go">Repassar ${Math.min(pend.length, 30)}</button>` : '<a class="boto principal" href="#/practica">Practicar preguntes noves</a>'}</div></div>`;
  $('#go')?.addEventListener('click', () => comenca(pend.slice(0, 30), 'repas', 'Repàs'));
}

// ---------------------------------------------------------------- simulacre
function vistaSimulacre() {
  const E = D.examen;
  $('#app').innerHTML = `<h1>Simulacre d'examen</h1>
    <div class="targeta">
      <p>Com el primer exercici de la convocatòria DGAR/1/26/AG: <b>${E.n} preguntes</b>, <b>${E.minuts} minuts</b>, nota de 0 a ${E.max} (cal un ${E.minim} per aprovar). Cada error resta un quart d'encert; les preguntes en blanc no resten.</p>
      <p class="suau">Les preguntes es reparteixen per temes com als exàmens oficials. No veuràs si l'encertes fins que acabis. Font: ${esc(E.font)}.</p>
      <form id="f">
        <label class="fila">Preguntes <select name="origen"><option value="">Barreja d'oficials i generades</option><option value="o">Només oficials</option><option value="g">Només generades</option></select></label>
        <label class="fila"><input type="checkbox" name="noves"> Prioritzar les que no has vist</label>
        <div class="botons"><button class="boto principal">Començar el simulacre</button></div>
      </form>
    </div>
    <h2>Exàmens oficials sencers</h2>
    <p class="suau">Fes un examen real tal com va sortir, en el mateix ordre i amb la plantilla oficial. El temps és proporcional (${E.minuts} min per ${E.n} preguntes) i la nota es calcula com a l'actual (sobre ${E.max}, amb −¼ per error). Algunes preguntes antigues no hi són perquè queden fora del temari actual.</p>
    <div class="llista-examens">${D.examens.map(x => {
      const fets = P.sims().filter(s => s.ex === x.id), millor = fets.length ? Math.max(...fets.map(s => s.Q)) : null;
      return `<div class="targeta examen"><div><b>${esc(x.c)}</b> · ${x.y} · ${esc(x.k)}<div class="suau">${esc(x.p)} · ${x.n}${x.n < x.tot ? ` de ${x.tot}` : ''} preguntes · ${minutsExamen(x.n)} min${millor !== null ? ` · millor nota <b style="color:var(${millor >= E.minim ? '--verd' : '--vermell'})">${millor.toFixed(2)}</b>` : ''}</div></div>
        <button class="boto" data-ex="${esc(x.id)}">Fer-lo</button></div>`;
    }).join('')}</div>
    ${P.sims().length ? `<h2>Simulacres fets</h2><div class="taula-scroll"><table><tr><th>Data</th><th>Prova</th><th>Nota</th><th>Encerts</th><th>Errors</th><th>Blanc</th></tr>
      ${P.sims().slice(0, 15).map(s => `<tr><td>${new Date(s.data).toLocaleString('ca')}</td><td>${esc(s.nom || 'Simulacre')}</td><td><b style="color:var(${s.Q >= E.minim ? '--verd' : '--vermell'})">${s.Q.toFixed(2)}</b></td><td>${s.A}</td><td>${s.E}</td><td>${s.B}</td></tr>`).join('')}</table></div>` : ''}`;
  $('#f').addEventListener('submit', e => {
    e.preventDefault();
    const origen = e.target.origen.value, noves = e.target.noves.checked;
    comenca(triaSimulacre(origen, noves), 'simulacre', 'Simulacre');
  });
  document.querySelectorAll('[data-ex]').forEach(b => b.addEventListener('click', () => {
    const x = D.examens.find(e => e.id === b.dataset.ex);
    const llista = D.preguntes.filter(q => q.o === 'o' && q.ex.id === x.id && !q.ex.res).sort((a, b) => a.ex.nu - b.ex.nu);
    comenca(llista, 'simulacre', `${x.c} · ${x.y} · ${x.p}`, {ex: x.id, minuts: minutsExamen(llista.length)});
  }));
}
const minutsExamen = n => Math.max(10, Math.round(D.examen.minuts * n / D.examen.n / 5) * 5);
function triaSimulacre(origen, noves) {
  const E = D.examen;
  const pool = D.preguntes.filter(q => vigent(q) && (!origen || q.o === origen));
  const temes = Object.keys(D.pes).filter(t => pool.some(q => q.t === t));
  const total = temes.reduce((s, t) => s + D.pes[t], 0);
  // Repartiment per restes més grans
  const quotes = temes.map(t => ({t, x: E.n * D.pes[t] / total}));
  quotes.forEach(o => { o.n = Math.floor(o.x); });
  let falten = E.n - quotes.reduce((s, o) => s + o.n, 0);
  quotes.sort((a, b) => (b.x - b.n) - (a.x - a.n)).forEach(o => { if (falten > 0) { o.n++; falten--; } });
  const triades = [], usats = new Set();
  const textos = new Set();
  for (const o of quotes) {
    let cands = barreja(pool.filter(q => q.t === o.t));
    if (noves) cands.sort((a, b) => (P.get(a.id) ? 1 : 0) - (P.get(b.id) ? 1 : 0));
    for (const q of cands) {
      if (triades.filter(x => x.t === o.t).length >= o.n) break;
      if (textos.has(q.q)) continue; // evita la mateixa pregunta oficial repetida en dues convocatòries
      triades.push(q); usats.add(q.id); textos.add(q.q);
    }
  }
  for (const q of barreja(pool)) { if (triades.length >= E.n) break; if (!usats.has(q.id) && !textos.has(q.q)) { triades.push(q); usats.add(q.id); textos.add(q.q); } }
  return triades.sort((a, b) => ordreTema(a.t) - ordreTema(b.t));
}

// ---------------------------------------------------------------- sessió de test
function comenca(llista, mode, titol, opc = {}) {
  SESSIO = {dia: opc.dia, mode, titol, ids: llista.map(q => q.id), resp: {}, i: 0, inici: ara(), acabada: false, ex: opc.ex || null, perm: {}};
  // Ordre de les opcions: el de la pregunta, o barrejat si l'usuari ho ha triat (mai als exàmens oficials sencers)
  if (aj('barrejaOp') && !opc.ex) for (const q of llista) SESSIO.perm[q.id] = barreja([0, 1, 2, 3]);
  if (mode === 'simulacre') SESSIO.fi = ara() + (opc.minuts || D.examen.minuts) * 60e3;
  location.hash = '#/test';
  if (location.hash === '#/test') navega();
}

let rellotge = null;
const ordreOp = q => (SESSIO && SESSIO.perm[q.id]) || [0, 1, 2, 3];
const lletra = (q, k) => LLETRES[ordreOp(q).indexOf(k)];
let pas = null;
function vistaTest() {
  clearTimeout(pas);
  clearInterval(rellotge);
  if (!SESSIO) { location.hash = '#/practica'; return; }
  const S = SESSIO, sim = S.mode === 'simulacre';
  const q = PER_ID.get(S.ids[S.i]);
  const r = S.resp[q.id];
  const respost = r !== undefined;
  const mostra = !sim && respost;
  const fets = Object.keys(S.resp).length;
  $('#app').innerHTML = `
    <div class="capcalera-test"><b>${esc(S.titol)}</b>
      <span>${sim && aj('simCrono') ? `<span class="temps" id="temps"></span> · ` : ''}${S.i + 1} / ${S.ids.length}</span></div>
    <div class="progres-barra"><div style="width:${pct(fets, S.ids.length)}%"></div></div>
    <div class="targeta">
      <div class="etiquetes"><span class="etiqueta">${esc(q.t)} · ${esc(q.e)}</span>${origenEtiqueta(q)}${S.ex ? `<span class="etiqueta">Pregunta ${q.ex.nu} de l'examen</span>` : ''}<span class="etiqueta" title="Dificultat">${punts(q.d)}</span>
        ${q.s !== 'v' ? `<span class="etiqueta avis">${ESTATS[q.s]}</span>` : ''}</div>
      <p class="enunciat">${esc(q.q)}</p>
      <div class="opcions">${ordreOp(q).map((k, pos) => {
        let cls = '';
        if (mostra) cls = k === q.ok ? 'correcta' : (k === r ? 'errada' : '');
        else if (r === k) cls = 'triada';
        return `<button class="opcio ${cls}" data-k="${k}" ${mostra ? 'disabled' : ''}><span class="lletra">${LLETRES[pos]})</span><span>${esc(q.op[k])}</span></button>`;
      }).join('')}</div>
      ${mostra ? panellCorreccio(q, r) : ''}
      <div class="botons">
        ${S.i > 0 ? '<button class="boto" id="ant">← Anterior</button>' : ''}
        ${sim && respost ? '<button class="boto" id="blanc">Deixar en blanc</button>' : ''}
        ${S.i < S.ids.length - 1 ? `<button class="boto ${mostra || sim ? 'principal' : ''}" id="seg">${!sim && !respost ? 'Saltar' : 'Següent'} →</button>` : ''}
        ${S.i === S.ids.length - 1 || sim ? `<button class="boto ${S.i === S.ids.length - 1 ? 'principal' : ''}" id="fi">${sim ? 'Lliurar' : 'Acabar'}</button>` : ''}
      </div>
    </div>
    ${sim ? `<div class="mapa-preguntes">${S.ids.map((id, k) => `<button data-i="${k}" class="${S.resp[id] !== undefined ? 'resposta' : ''} ${k === S.i ? 'actual' : ''}">${k + 1}</button>`).join('')}</div>` : ''}`;
  document.querySelectorAll('.opcio').forEach(b => b.addEventListener('click', () => {
    const k = +b.dataset.k;
    if (sim) { S.resp[q.id] = k; if (aj('simAvanca') && S.i < S.ids.length - 1) S.i++; vistaTest(); return; }
    if (respost) return;
    S.resp[q.id] = k; P.respon(q.id, k === q.ok, q.t); vistaTest();
    if (k === q.ok && aj('avanca') && S.i < S.ids.length - 1) pas = setTimeout(() => { if (location.hash === '#/test' && SESSIO === S) { S.i++; vistaTest(); window.scrollTo(0, 0); } }, 1200);
  }));
  $('#ant')?.addEventListener('click', () => { S.i--; vistaTest(); });
  $('#seg')?.addEventListener('click', () => { S.i++; vistaTest(); });
  $('#blanc')?.addEventListener('click', () => { delete S.resp[q.id]; vistaTest(); });
  $('#fi')?.addEventListener('click', () => {
    if (sim) {
      const buides = S.ids.length - Object.keys(S.resp).length;
      if (!confirm(buides ? `Tens ${buides} preguntes en blanc. Vols lliurar l'examen?` : 'Vols lliurar l\'examen?')) return;
    }
    acaba();
  });
  document.querySelectorAll('.mapa-preguntes button').forEach(b => b.addEventListener('click', () => { S.i = +b.dataset.i; vistaTest(); }));
  enllacaApunts();
  if (sim) {
    const pinta = () => {
      const s = Math.max(0, Math.round((S.fi - ara()) / 1000));
      if (s === 0) { clearInterval(rellotge); alert('S\'ha acabat el temps.'); acaba(); return; }
      const el = $('#temps'); if (!el) return;
      el.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
      el.classList.toggle('poc', s < 600);
    };
    pinta(); rellotge = setInterval(pinta, 1000);
  }
}

function panellCorreccio(q, r) {
  const be = r === q.ok;
  const oficialAltra = q.o === 'o' && q.ex.r !== 'anul·lada' && LLETRES.indexOf(q.ex.r) !== q.ok;
  return `
    ${r !== undefined ? `<p class="resultat ${be ? 'be' : 'malament'}">${be ? 'Correcta' : `Incorrecta. La correcta és la ${lletra(q, q.ok)})`}</p>` : `<p class="resultat malament">En blanc. La correcta és la ${lletra(q, q.ok)})</p>`}
    ${(() => {
      const st = P.get(q.id); if (!st || !st.w || r === undefined) return '';
      if (r !== q.ok) return `<p class="avis-fallada">Afegida a les fallades. En sortirà quan l'encertis ${ENCERTS_PER_SUPERAR} vegades seguides, en dies diferents.</p>`;
      const n = seguits(st);
      return n >= ENCERTS_PER_SUPERAR ? '<p class="avis-fallada be">Superada: ja no és a les fallades.</p>'
        : `<p class="avis-fallada">Encert ${n} de ${ENCERTS_PER_SUPERAR}. Si l'encertes un altre dia, deixarà de ser fallada.</p>`;
    })()}
    ${q.s === 'a' ? '<p class="suau">El tribunal va anul·lar aquesta pregunta. Es marca la resposta que avui es considera correcta.</p>' : ''}
    ${q.s === 'd' ? '<p class="suau">La norma ha canviat des de l\'examen: la resposta oficial és la marcada, però llegeix l\'explicació.</p>' : ''}
    ${oficialAltra ? `<p class="suau">Resposta de la plantilla oficial: ${esc(q.ex.r)}) de l'examen original</p>` : ''}
    <div class="explicacio">${esc(q.x)}</div>
    <details class="plega" ${aj('cita') === 'oberta' ? 'open' : ''}><summary><b>${esc(q.n)}</b>${q.art ? `, art. ${esc(q.art)}` : ''} · cita</summary>
      <div class="cita">${esc(q.c)}</div></details>
    <div class="botons"><a class="boto" data-apunts href="#/temari/${encodeURIComponent(q.f)}/${encodeURIComponent(q.a)}">${ico('obre')} Obrir als apunts</a>
      <button type="button" class="boto" data-report="${esc(q.id)}" data-r="${r ?? ''}">${ico('bandera')} Reportar un error</button></div>`;
}
// ---------------------------------------------------------------- reportar un error
const TIPUS_ERROR = [
  ['resposta', 'La resposta marcada com a correcta no ho és'],
  ['explicacio', 'L\'explicació o la cita són incorrectes'],
  ['apunts', '«Obrir als apunts» no porta al lloc correcte'],
  ['redaccio', 'Pregunta ambigua, mal redactada o amb dues respostes possibles'],
  ['desactualitzada', 'La norma ha canviat (dada desactualitzada)'],
  ['altre', 'Una altra cosa'],
];
document.addEventListener('click', e => {
  const b = e.target.closest('[data-report]'); if (!b) return;
  obreReport(PER_ID.get(b.dataset.report), b.dataset.r === '' ? undefined : +b.dataset.r);
});
function obreReport(q, r) {
  document.getElementById('dlg-report')?.remove();
  const d = document.createElement('dialog'); d.id = 'dlg-report'; d.className = 'dialeg';
  d.innerHTML = `<form method="dialog" id="fr">
    <h2>Reportar un error</h2>
    <p class="suau">${esc(q.id)} · ${esc(q.q.length > 110 ? q.q.slice(0, 110) + '…' : q.q)}</p>
    <fieldset><legend>Què hi falla?</legend>
      ${TIPUS_ERROR.map(([v, t], k) => `<label class="fila"><input type="radio" name="tipus" value="${v}" ${k === 0 ? 'checked' : ''}> ${t}</label>`).join('')}
    </fieldset>
    <label class="fila" id="fr-bona">Quina creus que és la correcta?
      <select name="bona"><option value="">No ho sé</option>${q.op.map((o, k) => k === q.ok ? '' : `<option value="${k}">${lletra(q, k)}) ${esc(o.length > 50 ? o.slice(0, 50) + '…' : o)}</option>`).join('')}</select></label>
    <label class="camp">Explica-ho <span class="suau">(si pots, indica la norma, l'article o l'apartat del temari)</span>
      <textarea name="text" rows="5" required placeholder="Per exemple: segons l'art. 33.2 de la Llei 22/2009 el màxim són 8 nanses, no 6."></textarea></label>
    <p class="suau">S'obrirà GitHub amb l'informe ja emplenat; només cal prémer «Create». Cal tenir-hi un compte (és gratuït).</p>
    <div class="botons"><button class="boto principal" value="envia">Enviar</button><button class="boto" value="cancel" formnovalidate>Cancel·lar</button></div>
  </form>`;
  document.body.appendChild(d);
  const f = d.querySelector('form');
  const bona = () => { d.querySelector('#fr-bona').hidden = f.tipus.value !== 'resposta'; };
  f.addEventListener('change', bona); bona();
  d.addEventListener('close', () => {
    if (d.returnValue === 'envia') {
      const tipus = TIPUS_ERROR.find(t => t[0] === f.tipus.value);
      window.open(urlReport(q, r, tipus, f.bona.value === '' ? null : +f.bona.value, f.text.value.trim()), '_blank', 'noopener');
    }
    d.remove();
  });
  d.showModal();
}
function urlReport(q, r, tipus, bona, text) {
  const cos = [`**Tipus:** ${tipus[1]}`, '', `**Pregunta:** ${q.id} (${q.t} · ${q.e})`, '', `> ${q.q}`, '',
    ...q.op.map((o, k) => `- ${lletra(q, k)}) ${o}${k === q.ok ? '  ← marcada com a correcta' : ''}${k === r ? '  ← la meva resposta' : ''}${k === bona ? '  ← la que crec correcta' : ''}`), '',
    `**Font:** ${q.n}${q.art ? ', art. ' + q.art : ''}`, '', '**Explicació:**', '', text || '(sense text)', '',
    `<sub>Versió de les dades: ${D.versio || '?'}</sub>`].join('\n');
  const titol = `[${tipus[0]}] ${q.id}: ${tipus[1]}`;
  return `${D.repo}/issues/new?labels=error-pregunta&title=${encodeURIComponent(titol)}&body=${encodeURIComponent(cos)}`;
}
function enllacaApunts() { /* els enllaços ja porten la ruta; el botó de tornar apareix sol */ }

function acaba() {
  clearInterval(rellotge);
  const S = SESSIO; S.acabada = true;
  if (S.mode === 'simulacre') {
    let A = 0, E = 0;
    for (const id of S.ids) {
      const q = PER_ID.get(id), r = S.resp[id];
      if (r === undefined) continue;
      if (r === q.ok) A++; else E++;
      P.respon(id, r === q.ok, q.t);
    }
    const B = S.ids.length - A - E;
    const Q = Math.max(0, (A - E * D.examen.penalitzacio) * D.examen.max / S.ids.length);
    S.nota = {A, E, B, Q};
    P.afegeixSim({data: new Date().toISOString(), A, E, B, Q: Math.round(Q * 100) / 100, minuts: Math.round((ara() - S.inici) / 60e3),
      n: S.ids.length, ...(S.ex ? {ex: S.ex, nom: S.titol} : {})});
  }
  if (S.mode === 'repte') P.desaRepte(S.dia, {r: S.ids.map(id => S.resp[id] === undefined ? 2 : (S.resp[id] === PER_ID.get(id).ok ? 1 : 0)), min: Math.max(1, Math.round((ara() - S.inici) / 60e3))});
  location.hash = '#/resultat';
}

function vistaResultat() {
  const S = SESSIO;
  if (!S) { location.hash = '#/'; return; }
  const sim = S.mode === 'simulacre';
  let A = 0, E = 0;
  for (const id of S.ids) { const r = S.resp[id]; if (r === undefined) continue; if (r === PER_ID.get(id).ok) A++; else E++; }
  const B = S.ids.length - A - E;
  const perTema = {};
  for (const id of S.ids) {
    const q = PER_ID.get(id), r = S.resp[id];
    const o = perTema[q.t] = perTema[q.t] || {n: 0, a: 0};
    o.n++; if (r === q.ok) o.a++;
  }
  const fallades = S.ids.filter(id => S.resp[id] !== PER_ID.get(id).ok);
  $('#app').innerHTML = `
    <h1>${sim ? 'Resultat del simulacre' : S.mode === 'repte' ? 'Repte del dia' : 'Resultat'}</h1>
    ${S.mode === 'repte' ? blocRepte(S.dia) : ''}
    <div class="graella">
      ${sim ? `<div class="targeta"><div class="xifra" style="color:var(${S.nota.Q >= D.examen.minim ? '--verd' : '--vermell'})">${S.nota.Q.toFixed(2)}</div><div class="suau">sobre ${D.examen.max} · ${S.nota.Q >= D.examen.minim ? 'aprovat' : 'suspès'} (mínim ${D.examen.minim})</div></div>` : ''}
      <div class="targeta"><div class="xifra">${A}</div><div class="suau">encerts (${pct(A, S.ids.length)} %)</div></div>
      <div class="targeta"><div class="xifra">${E}</div><div class="suau">errors</div></div>
      <div class="targeta"><div class="xifra">${B}</div><div class="suau">en blanc o saltades</div></div>
    </div>
    <div class="botons">
      ${fallades.length ? '<button class="boto principal" id="repfall">Repetir les fallades</button>' : ''}
      <a class="boto" href="#/practica">Nova pràctica</a><a class="boto" href="#/">Inici</a>
    </div>
    <h2>Per temes</h2>
    <div class="taula-scroll"><table><tr><th>Tema</th><th>Encerts</th><th></th></tr>
      ${Object.entries(perTema).sort((a, b) => ordreTema(a[0]) - ordreTema(b[0])).map(([t, o]) => `<tr><td>${esc(nomTema(t))}</td><td>${o.a}/${o.n}</td><td><div class="barra-tema"><div style="width:${pct(o.a, o.n)}%;background:var(${pct(o.a, o.n) >= 50 ? '--verd' : '--vermell'})"></div></div></td></tr>`).join('')}
    </table></div>
    <h2>Revisió</h2>
    <div class="mapa-preguntes">${S.ids.map((id, k) => { const r = S.resp[id]; return `<button data-i="${k}" class="${r === undefined ? '' : (r === PER_ID.get(id).ok ? 'be' : 'malament')}">${k + 1}</button>`; }).join('')}</div>
    <div id="revisio"></div>`;
  const mostra = k => {
    const q = PER_ID.get(S.ids[k]), r = S.resp[q.id];
    $('#revisio').innerHTML = `<div class="targeta"><div class="etiquetes"><span class="etiqueta">${k + 1} · ${esc(q.t)} · ${esc(q.e)}</span>${origenEtiqueta(q)}</div>
      <p class="enunciat">${esc(q.q)}</p>
      <div class="opcions">${ordreOp(q).map((j, pos) => `<div class="opcio ${j === q.ok ? 'correcta' : (j === r ? 'errada' : '')}"><span class="lletra">${LLETRES[pos]})</span><span>${esc(q.op[j])}</span></div>`).join('')}</div>
      ${panellCorreccio(q, r)}</div>`;
    S.i = k;
  };
  document.querySelectorAll('.mapa-preguntes button').forEach(b => b.addEventListener('click', () => mostra(+b.dataset.i)));
  $('#repfall')?.addEventListener('click', () => comenca(fallades.map(id => PER_ID.get(id)), 'practica', 'Fallades del test'));
  if (fallades.length) mostra(S.ids.indexOf(fallades[0]));
}

// ---------------------------------------------------------------- espècies (identificació amb foto)
function vistaEspecies([pas]) {
  if (pas === 'joc' && ESP) return jocEspecies();
  const temes = [...new Set(D.especies.map(e => e.t))].sort((a, b) => ordreTema(a) - ordreTema(b));
  const st = P.esp(), pr = P.pref('especies') || {};
  const vistes = D.especies.filter(e => st[e.lat]);
  const fallades = D.especies.filter(e => st[e.lat] && st[e.lat].u === 0);
  $('#app').innerHTML = `<h1>Practicar</h1>${navPractica('jocs')}<a class="tornar-ajustos" href="#/jocs">← Jocs</a><h2 style="margin-top:.2rem">Espècies amb foto</h2>
    <p class="suau">${D.especies.length} espècies de les fitxes del temari (fauna protegida, pesca, invasores i flora). Has vist ${vistes.length}; ${fallades.length} fallades la darrera vegada.</p>
    <form id="f">
      <fieldset><legend>Temes</legend><div class="xips">${temes.map(t => `<label class="xip"><input type="checkbox" name="tema" value="${t}" ${!pr.temes || pr.temes.includes(t) ? 'checked' : ''}><span>${esc(nomTema(t))} (${D.especies.filter(e => e.t === t).length})</span></label>`).join('')}</div></fieldset>
      <fieldset><legend>Joc</legend>
        <label class="fila"><input type="radio" name="mode" value="foto" ${pr.mode !== 'nom' ? 'checked' : ''}> Veus la foto, tries el nom</label>
        <label class="fila"><input type="radio" name="mode" value="nom" ${pr.mode === 'nom' ? 'checked' : ''}> Veus el nom, tries la foto</label>
        <label class="fila"><input type="checkbox" name="fall"> Només les fallades</label>
        <label class="fila">Nombre <select name="n"><option>10</option><option selected>20</option><option value="0">Totes</option></select></label>
      </fieldset>
      <button class="boto principal">Començar</button>
    </form>`;
  $('#f').addEventListener('submit', e => {
    e.preventDefault();
    const f = e.target, sel = [...f.querySelectorAll('[name=tema]:checked')].map(i => i.value);
    P.pref('especies', {temes: sel, mode: f.mode.value});
    let ll = D.especies.filter(x => sel.includes(x.t) && (!f.fall.checked || (st[x.lat] && st[x.lat].u === 0)));
    if (!ll.length) { alert('No hi ha cap espècie amb aquests filtres.'); return; }
    ll = barreja(ll); if (+f.n.value) ll = ll.slice(0, +f.n.value);
    ESP = {mode: f.mode.value, ll: ll.map(x => ({e: x, op: opcionsEspecie(x)})), i: 0, resp: []};
    location.hash = '#/especies/joc';
  });
}
function opcionsEspecie(x) {
  // Distractors: primer del mateix tema i grup, després del mateix tema, i si cal de qualsevol
  const cands = [D.especies.filter(e => e.t === x.t && e.g === x.g), D.especies.filter(e => e.t === x.t), D.especies];
  const tri = [x];
  for (const c of cands) for (const e of barreja(c)) { if (tri.length >= 4) break; if (!tri.some(t => t.lat === e.lat || t.nom === e.nom)) tri.push(e); }
  return barreja(tri);
}
function jocEspecies() {
  const G = ESP;
  if (G.i >= G.ll.length) {
    const enc = G.resp.filter(r => r && r.ok).length;
    const fall = G.ll.filter((_, k) => !(G.resp[k] && G.resp[k].ok));
    $('#app').innerHTML = `<h1>Espècies: resultat</h1>
      <div class="graella"><div class="targeta"><div class="xifra">${enc} / ${G.ll.length}</div><div class="suau">encerts (${pct(enc, G.ll.length)} %)</div></div></div>
      ${fall.length ? `<h2>Per repassar</h2><div class="galeria-joc">${fall.map(({e}) => `<a class="fitxa" data-apunts href="#/temari/${e.f}/${encodeURIComponent(e.a)}"><img src="${esc(e.img)}" alt="" loading="lazy"><b>${esc(e.nom)}</b><i>${esc(e.lat)}</i></a>`).join('')}</div>` : ''}
      <div class="botons">${fall.length ? '<button class="boto principal" id="rep">Repetir les fallades</button>' : ''}<a class="boto" href="#/especies">Nou joc</a></div>`;
    $('#rep')?.addEventListener('click', () => { ESP = {mode: G.mode, ll: barreja(fall).map(({e}) => ({e, op: opcionsEspecie(e)})), i: 0, resp: []}; jocEspecies(); });
    return;
  }
  const {e, op} = G.ll[G.i], r = G.resp[G.i], respost = r !== undefined;
  const foto = G.mode === 'foto';
  $('#app').innerHTML = `
    <div class="capcalera-test"><b>Espècies</b><span>${G.i + 1} / ${G.ll.length}</span></div>
    <div class="progres-barra"><div style="width:${pct(G.i + (respost ? 1 : 0), G.ll.length)}%"></div></div>
    <div class="targeta">
      <div class="etiquetes"><span class="etiqueta">${esc(nomTema(e.t))}</span></div>
      ${foto ? `<img class="foto-joc" src="${esc(e.img)}" alt="Foto de l'espècie a identificar">` : `<p class="enunciat">Quina és la foto de: <b>${esc(e.nom)}</b> <i>(${esc(e.lat)})</i>?</p>`}
      <div class="${foto ? 'opcions' : 'opcions-foto'}">${op.map((o, k) => {
        let cls = '';
        if (respost) cls = o.lat === e.lat ? 'correcta' : (k === r.k ? 'errada' : '');
        return foto
          ? `<button class="opcio ${cls}" data-k="${k}" ${respost ? 'disabled' : ''}><span class="lletra">${LLETRES[k]})</span><span>${esc(o.nom)}${respost ? ` <i class="suau">(${esc(o.lat)})</i>` : ''}</span></button>`
          : `<button class="opcio-foto ${cls}" data-k="${k}" ${respost ? 'disabled' : ''}><img src="${esc(o.img)}" alt="Opció ${LLETRES[k]}">${respost ? `<span>${esc(o.nom)}</span>` : ''}</button>`;
      }).join('')}</div>
      ${respost ? `<p class="resultat ${r.ok ? 'be' : 'malament'}">${r.ok ? 'Correcta' : 'Incorrecta'}</p>
        <div class="explicacio"><b>${esc(e.nom)}</b> · <i>${esc(e.lat)}</i>${e.cat ? `<br>${esc(e.cat)}` : ''}</div>
        <div class="botons"><a class="boto" data-apunts href="#/temari/${e.f}/${encodeURIComponent(e.a)}">${ico('obre')} Obrir la fitxa als apunts</a>
          <button class="boto principal" id="seg">${G.i < G.ll.length - 1 ? 'Següent →' : 'Veure el resultat'}</button></div>` : ''}
    </div>`;
  document.querySelectorAll('[data-k]').forEach(b => b.addEventListener('click', () => {
    if (respost) return;
    const k = +b.dataset.k, ok = op[k].lat === e.lat;
    G.resp[G.i] = {k, ok}; P.respEsp(e.lat, ok); jocEspecies();
  }));
  $('#seg')?.addEventListener('click', () => { G.i++; jocEspecies(); window.scrollTo(0, 0); });
}

// ---------------------------------------------------------------- temari
const CAU_TEMA = {};
async function vistaTemari([fitxer, ancora]) {
  if (!fitxer) {
    $('#app').innerHTML = `<h1>Temari</h1><div class="targeta temari-llista">${D.temes.map(t => `<a href="#/temari/${t.fitxer}"><b>${t.codi}</b>${esc(t.titol)}</a>`).join('')}</div>`;
    return;
  }
  const t = D.temes.find(x => x.fitxer === fitxer);
  if (!t) { location.hash = '#/temari'; return; }
  if (!CAU_TEMA[fitxer]) {
    $('#app').innerHTML = '<p class="carregant">Carregant el tema…</p>';
    try { CAU_TEMA[fitxer] = await (await fetch(`temari/${fitxer}.html`)).text(); }
    catch { $('#app').innerHTML = '<p>No s\'ha pogut carregar el tema.</p>'; return; }
  }
  const i = D.temes.indexOf(t);
  $('#app').innerHTML = `
    <div class="botons" style="margin-top:0"><a class="boto" href="#/temari">← Temes</a>
      ${i > 0 ? `<a class="boto" href="#/temari/${D.temes[i - 1].fitxer}">${D.temes[i - 1].codi}</a>` : ''}
      ${i < D.temes.length - 1 ? `<a class="boto" href="#/temari/${D.temes[i + 1].fitxer}">${D.temes[i + 1].codi}</a>` : ''}
      <button class="boto" id="test-tema">Practicar el ${t.codi}</button></div>
    <details class="targeta index"><summary>Índex del tema</summary><div class="index-tema">
      ${t.index.filter(h => h.n > 1 || true).map(h => `<a class="n${h.n}" href="#/temari/${fitxer}/${h.a}">${esc(h.t)}</a>`).join('')}</div></details>
    <article class="apunts">${CAU_TEMA[fitxer]}</article>`;
  $('#test-tema').addEventListener('click', () => {
    comenca(barreja(D.preguntes.filter(q => q.t === t.codi && vigent(q))).slice(0, 20), 'practica', nomTema(t.codi));
  });
  if (ancora) {
    const el = document.getElementById(ancora);
    if (el) {
      requestAnimationFrame(() => { const h = $('.barra').offsetHeight; window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - h - 12); el.classList.add('ressalt'); setTimeout(() => el.classList.remove('ressalt'), 2500); });
    }
  } else window.scrollTo(0, 0);
  // Els enllaços interns (#ancora) del tema han de quedar dins de la ruta de l'app
  $('.apunts').addEventListener('click', e => {
    const a = e.target.closest('a[href^="#"]');
    if (a && !a.getAttribute('href').startsWith('#/')) { e.preventDefault(); location.hash = `#/temari/${fitxer}/${a.getAttribute('href').slice(1)}`; }
  });
}

// ---------------------------------------------------------------- progrés
function vistaProgres() {
  const q = P.tots();
  const files = D.temes.map(t => {
    const ps = D.preguntes.filter(x => x.t === t.codi);
    const vistes = ps.filter(x => q[x.id]);
    const n = vistes.reduce((s, x) => s + q[x.id].n, 0), c = vistes.reduce((s, x) => s + q[x.id].c, 0);
    const fall = vistes.filter(x => esFallada(q[x.id]) && vigent(x)).length;
    return {t, total: ps.length, vistes: vistes.length, enc: pct(c, n), n, fall};
  });
  const febles = files.filter(f => f.n >= 5).sort((a, b) => a.enc - b.enc).slice(0, 5);
  const E = D.examen, sims = P.sims().slice().reverse();
  // Previsió: encert per tema ponderat amb el pes del tema a l'examen; els temes sense dades prenen la mitjana global
  const totN = files.reduce((s, f) => s + f.n, 0), totC = files.reduce((s, f) => s + f.n * f.enc / 100, 0);
  let prev = null;
  if (totN >= 30) {
    const glob = totC / totN; let num = 0, den = 0;
    for (const f of files) { const w = D.pes[f.t.codi] || 0; const p = f.n >= 5 ? f.enc / 100 : glob; num += w * p; den += w; }
    const p = num / den; prev = Math.max(0, E.max * (p - (1 - p) * E.penalitzacio));
  }
  const darrers = sims.slice(-5), mitjana = darrers.length ? darrers.reduce((s, x) => s + x.Q, 0) / darrers.length : null;
  const esp = P.esp(), espN = Object.values(esp).reduce((s, r) => s + r.n, 0), espC = Object.values(esp).reduce((s, r) => s + r.c, 0);
  $('#app').innerHTML = `<h1>Progrés</h1>
    <div class="graella">
      <div class="targeta"><div class="xifra" ${prev !== null ? `style="color:var(${prev >= E.minim ? '--verd' : '--vermell'})"` : ''}>${prev !== null ? prev.toFixed(1) : '–'}</div><div class="suau">${prev !== null ? 'nota prevista si contestes totes les preguntes, segons el teu encert per temes' : 'respon almenys 30 preguntes per tenir una previsió'}</div></div>
      <div class="targeta"><div class="xifra">${mitjana !== null ? mitjana.toFixed(1) : '–'}</div><div class="suau">${mitjana !== null ? `mitjana dels darrers ${darrers.length} simulacres` : 'encara no has fet cap simulacre'}</div></div>
      <div class="targeta"><div class="xifra">${espN ? pct(espC, espN) + ' %' : '–'}</div><div class="suau">${espN ? `encert identificant espècies (${Object.keys(esp).length} de ${D.especies.length} vistes)` : '<a href="#/especies">identificació d\'espècies</a> encara sense fer'}</div></div>
    </div>
    <h2>Aquesta setmana</h2>${resumSetmana()}
    ${sims.length ? `<h2>Evolució dels simulacres</h2><div class="targeta">${graficaSims(sims)}</div>` : ''}
    ${febles.length ? `<div class="targeta"><b>Punts febles:</b> ${febles.map(f => `${f.t.codi} (${f.enc} %)`).join(' · ')}</div>` : ''}
    <h2>Per temes</h2>
    <div class="temes-progres">${files.map(f => `<a class="tema-progres" href="#" data-fall="${f.t.codi}" data-n="${f.fall}">
      <span class="codi">${esc(f.t.codi)}</span><span class="nom">${esc(f.t.titol)}</span>
      <span class="xifres">${f.n ? `<b>${f.enc} %</b>` : '–'} · ${f.vistes}/${f.total}${f.fall ? ` · ${f.fall} fallades` : ''}</span>
      <div class="barra-tema"><div style="width:${f.enc}%;background:var(${f.enc >= 50 ? '--verd' : '--vermell'})"></div></div></a>`).join('')}</div>
    <p class="suau">Toca un tema per repassar-ne les fallades (o practicar-lo si no en tens).</p>
    <h2>Logros <span class="suau">${logros().filter(l => l.ok).length}/${logros().length}</span></h2>
    <div class="logros">${logros().sort((a, b) => (b.ok - a.ok) || (b.val / b.obj - a.val / a.obj)).map(l => `<div class="logro ${l.ok ? 'ok' : ''}" title="${esc(l.desc)}"><div class="ico">${l.ico}</div>
      <div><b>${esc(l.nom)}</b><div class="suau">${esc(l.desc)}</div>${l.ok ? '' : `<div class="barra-tema"><div style="width:${pct(l.val, l.obj)}%;background:var(--verd)"></div></div><div class="suau petit">${l.val.toLocaleString('ca')} / ${l.obj.toLocaleString('ca')}</div>`}</div></div>`).join('')}</div>`;
  document.querySelectorAll('[data-fall]').forEach(b => b.addEventListener('click', e => {
    e.preventDefault();
    const t = b.dataset.fall;
    if (+b.dataset.n) comenca(barreja(D.preguntes.filter(x => x.t === t && esFallada(q[x.id]) && vigent(x))), 'practica', 'Fallades ' + t);
    else comenca(barreja(D.preguntes.filter(x => x.t === t && vigent(x))).slice(0, aj('nPractica') || 20), 'practica', nomTema(t));
  }));
}

function resumSetmana() {
  const ds = P.dies(), meta = aj('meta');
  const set = [...Array(7)].map((_, k) => diaAbans(avui(), 6 - k)), ant = [...Array(7)].map((_, k) => diaAbans(avui(), 13 - k));
  const suma = ll => ll.reduce((a, d) => { const x = ds[d]; if (x) { a.n += x.n; a.c += x.c; for (const [t, [n, c]] of Object.entries(x.t || {})) { const o = a.t[t] = a.t[t] || [0, 0]; o[0] += n; o[1] += c; } } return a; }, {n: 0, c: 0, t: {}});
  const A = suma(set), B = suma(ant);
  const barres = set.map(d => { const f = Math.min(1, fraccioMeta(d)); return `<div class="dia-barra ${fet(d) ? 'fet' : ''}" title="${ds[d]?.n || 0} preguntes"><div class="col"><div style="height:${Math.round(100 * f)}%"></div></div><span>${['dg', 'dl', 'dt', 'dc', 'dj', 'dv', 'ds'][new Date(d + 'T12:00').getDay()]}</span></div>`; }).join('');
  const temes = Object.entries(A.t).filter(([t, [n]]) => t !== 'esp' && n >= 5).map(([t, [n, c]]) => ({t, p: c / n, d: B.t[t] && B.t[t][0] >= 5 ? c / n - B.t[t][1] / B.t[t][0] : null}));
  const millora = temes.filter(x => x.d !== null).sort((a, b) => b.d - a.d)[0];
  const fluix = temes.filter(x => x !== millora || temes.length === 1).sort((a, b) => a.p - b.p)[0];
  const dif = B.n ? Math.round(100 * (A.n - B.n) / B.n) : null;
  return `<div class="targeta"><div class="setmana">${barres}</div>
    <div class="resum-xifres">
      <div><b>${A.n}</b> <span class="suau">respostes${dif !== null ? ` (${dif >= 0 ? '+' : ''}${dif} % vs. setmana anterior)` : ''}</span></div>
      <div><b>${A.n ? pct(A.c, A.n) + ' %' : '–'}</b> <span class="suau">d'encert${B.n && A.n ? ` (abans ${pct(B.c, B.n)} %)` : ''}</span></div>
      ${millora && millora.d > 0 ? `<div class="amb-icona">${ico('pujada')} <span class="suau">Més millora:</span> ${esc(nomTema(millora.t))} (+${Math.round(100 * millora.d)} punts)</div>` : ''}
      ${fluix && fluix !== millora && fluix.p < .7 ? `<div class="amb-icona">${ico('diana')} <span class="suau">A reforçar:</span> ${esc(nomTema(fluix.t))} (${Math.round(100 * fluix.p)} %)</div>` : ''}
      <div class="suau petit">Cada barra és el que has fet de la meta del dia (${meta} preguntes); en verd, els dies complerts. Millor ratxa: ${millorRatxa()} dies.</div>
    </div></div>`;
}
function graficaSims(sims) {
  const E = D.examen, ll = sims.slice(-30), W = 600, H = 220, m = {e: 34, d: 12, s: 12, i: 26};
  const x = k => m.e + (ll.length === 1 ? (W - m.e - m.d) / 2 : k * (W - m.e - m.d) / (ll.length - 1));
  const y = v => m.s + (1 - v / E.max) * (H - m.s - m.i);
  const punts = ll.map((s, k) => `${x(k).toFixed(1)},${y(s.Q).toFixed(1)}`).join(' ');
  const eixos = [0, 5.5, 11, 16.5, 22].map(v => `<line x1="${m.e}" x2="${W - m.d}" y1="${y(v)}" y2="${y(v)}" class="g-reixa${v === E.minim ? ' g-tall' : ''}"/><text x="${m.e - 6}" y="${y(v) + 4}" class="g-text" text-anchor="end">${v}</text>`).join('');
  const dates = [0, ll.length - 1].filter((k, i, a) => a.indexOf(k) === i).map(k => `<text x="${x(k)}" y="${H - 6}" class="g-text" text-anchor="${k === 0 && ll.length > 1 ? 'start' : 'end'}">${new Date(ll[k].data).toLocaleDateString('ca', {day: 'numeric', month: 'short'})}</text>`).join('');
  return `<svg viewBox="0 0 ${W} ${H}" class="grafica" role="img" aria-label="Notes dels darrers ${ll.length} simulacres">
    ${eixos}<text x="${W - m.d}" y="${y(E.minim) - 5}" class="g-text g-tall-text" text-anchor="end">aprovat (${E.minim})</text>
    ${ll.length > 1 ? `<polyline points="${punts}" class="g-linia"/>` : ''}
    ${ll.map((s, k) => `<circle cx="${x(k)}" cy="${y(s.Q)}" r="4" class="g-punt ${s.Q >= E.minim ? 'be' : 'malament'}"><title>${new Date(s.data).toLocaleString('ca')} · ${esc(s.nom || 'Simulacre')}: ${s.Q.toFixed(2)}</title></circle>`).join('')}
    ${dates}</svg>`;
}

// ---------------------------------------------------------------- ajustos
function dispositiu() {
  const ua = navigator.userAgent;
  const so = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) ? 'iPad'
    : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Mac OS X/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : 'Dispositiu';
  const nav = /EdgA?\//.test(ua) ? 'Edge' : /SamsungBrowser/.test(ua) ? 'Samsung Internet' : /Firefox|FxiOS/.test(ua) ? 'Firefox'
    : /CriOS|Chrome/.test(ua) ? 'Chrome' : /Safari/.test(ua) ? 'Safari' : 'navegador';
  const app = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  return {so, nav, app};
}
const dataCa = d => new Date(d).toLocaleDateString('ca', {day: 'numeric', month: 'long', year: 'numeric'});
// Categories d'Ajustos: llista com als ajustos del mòbil; en tocar-ne una, s'hi entra
const CATEGORIES_AJUSTOS = [
  ['aparenca', 'Aparença', 'sol', () => `${{auto: 'Automàtic', light: 'Clar', dark: 'Fosc'}[aj('tema')]} · text ${{petit: 'petit', normal: 'normal', gran: 'gran', 'molt-gran': 'molt gran'}[aj('text')]}`],
  ['constancia', 'Constància', 'flama', () => `Meta: ${aj('meta')} preguntes al dia`],
  ['practica', 'Pràctica', 'check', () => `${aj('nPractica')} preguntes per sessió${aj('barrejaOp') ? ' · opcions barrejades' : ''}`],
  ['simulacre', 'Simulacre', 'rellotge', () => `Cronòmetre ${aj('simCrono') ? 'visible' : 'amagat'}`],
  ['perfil', 'Perfil', 'persona', () => aj('nom') ? `${aj('nom')} · ${dispositiu().so}` : `Nom, dispositiu i on es desa el progrés`],
  ['copia', 'Còpia del progrés', 'descarrega', () => P.copia() ? `Darrera còpia: ${dataCa(P.copia())}` : 'Encara no n\'has fet cap còpia'],
  ['versio', 'Versió', 'etiqueta', () => `${D.app?.novetats?.[0]?.versio || ''} · historial de novetats`],
  ['quant-a', 'Quant a', 'info', () => 'Contingut, autor i drets'],
];
function vistaAjustos([cat] = []) {
  const seg = (k, ops) => `<div class="segmentat" role="radiogroup">${ops.map(([v, t]) => `<label><input type="radio" name="${k}" value="${v}" ${String(aj(k)) === String(v) ? 'checked' : ''}><span>${t}</span></label>`).join('')}</div>`;
  const int = k => `<input type="checkbox" class="interruptor" name="${k}" ${aj(k) ? 'checked' : ''}>`;
  const fila = (t, d, ctl) => `<div class="ajust"><div><div>${t}</div>${d ? `<div class="desc">${d}</div>` : ''}</div>${ctl}</div>`;
  const nq = Object.keys(P.tots()).length, ns = P.sims().length;
  const dv = dispositiu(), primer = Object.keys(P.dies()).sort()[0];
  const nov = D.app?.novetats || [], act = nov[0];
  const C = CATEGORIES_AJUSTOS.find(c => c[0] === cat);
  $('#app').innerHTML = `${C ? `<a class="tornar-ajustos" href="#/ajustos">← Ajustos</a><h1>${esc(C[1])}</h1>` : '<h1>Ajustos</h1>'}
    ${C ? '' : `<div class="targeta llista-ajustos">${CATEGORIES_AJUSTOS.map(([id, nom, ic, sub]) => `<a href="#/ajustos/${id}">
      <span class="ic">${ico(ic)}</span><span class="txt"><b>${esc(nom)}</b><span class="suau">${esc(sub())}</span></span>${ico('fletxa', 'chevron')}</a>`).join('')}</div>`}
    <div id="ajustos">
    <div class="seccio-ajustos"><h2>Aparença</h2><div class="targeta">
      ${fila('Tema', '', seg('tema', [['auto', 'Automàtic'], ['light', 'Clar'], ['dark', 'Fosc']]))}
      ${fila('Mida del text', '', seg('text', [['petit', 'A−'], ['normal', 'A'], ['gran', 'A+'], ['molt-gran', 'A++']]))}
    </div></div>
    <div class="seccio-ajustos"><h2>Constància</h2><div class="targeta">
      ${fila('Meta diària', 'Preguntes al dia per mantenir la ratxa. Compten les preguntes de pràctica, repàs, simulacres i el repte del dia; els jocs no. Un dia per setmana sense fer-la no trenca la ratxa.', seg('meta', [[20, '20'], [30, '30'], [40, '40'], [60, '60']]))}
    </div></div>
    <div class="seccio-ajustos"><h2>Pràctica</h2><div class="targeta">
      ${fila('Barrejar l\'ordre de les opcions', 'Per no memoritzar la lletra. No s\'aplica als exàmens oficials sencers.', int('barrejaOp'))}
      ${fila('Passar sol a la següent quan encertes', 'Si falles, s\'atura perquè llegeixis l\'explicació.', int('avanca'))}
      ${fila('Cita de la norma', 'El text literal de la norma sota l\'explicació.', seg('cita', [['oberta', 'Visible'], ['plegada', 'Plegada']]))}
      ${fila('Preguntes per sessió', '', seg('nPractica', [[10, '10'], [20, '20'], [40, '40'], [80, '80']]))}
    </div></div>
    <div class="seccio-ajustos"><h2>Simulacre</h2><div class="targeta">
      ${fila('Mostrar el cronòmetre', 'El temps compta igualment.', int('simCrono'))}
      ${fila('Saltar a la següent en respondre', '', int('simAvanca'))}
    </div></div>
    <div class="seccio-ajustos"><h2>Perfil</h2><div class="targeta">
      ${fila('El teu nom', 'Opcional. Surt a la salutació de l\'inici i al resultat del repte que comparteixes.', `<input type="text" name="nom" class="camp-text" maxlength="30" placeholder="Nom" value="${esc(aj('nom') || '')}">`)}
      ${fila('Dispositiu', `${dv.so} · ${dv.nav} · ${dv.app ? 'instal·lada com a app' : 'oberta al navegador'}`, '')}
      ${fila('On es desa el progrés', `Només en aquest dispositiu i navegador${dv.app ? '' : ' (si instal·les l\'app, fes-hi una còpia i importa-la)'}. No s'envia enlloc.`, '')}
      ${fila('Espai ocupat', '<span id="espai">calculant…</span>', '<button class="boto" id="protegeix" hidden>Protegir</button>')}
      ${fila('Estudiant des de', primer ? dataCa(primer + 'T12:00') : 'avui', '')}
    </div></div>
    <div class="seccio-ajustos"><h2>Còpia del progrés</h2><div class="targeta">
      ${fila('Les teves dades', `${nq} preguntes respostes i ${ns} simulacres. ${P.copia() ? `Darrera còpia: ${dataCa(P.copia())}.` : 'Encara no n\'has fet cap còpia.'}`, '')}
      <div class="botons" style="margin:0 0 .8rem"><button class="boto principal" id="exp">Descarregar còpia</button>
        <label class="boto">Importar còpia<input type="file" id="imp" accept="application/json,.json" hidden></label></div>
      ${fila('Esborrar el progrés', 'Esborra respostes, simulacres, ratxa i logros d\'aquest dispositiu. Els ajustos es mantenen.', '<button class="boto perill" id="del">Esborrar</button>')}
    </div></div>
    <div class="seccio-ajustos"><h2>Versió</h2><div class="targeta">
      ${fila(`Versió ${esc(act?.versio || '')}`, `Darrera actualització: ${act ? dataCa(act.data + 'T12:00') : '–'}`, '<button class="boto" id="cerca-act">Buscar actualitzacions</button>')}
      ${fila('Versió de les dades', `${esc(D.versio || '–')} (preguntes i temari)`, '')}
      <details class="plega novetats"><summary>Historial de novetats</summary>
        ${nov.map(v => `<div class="versio"><b>${esc(v.versio)}</b> <span class="suau">· ${dataCa(v.data + 'T12:00')}</span><ul>${v.canvis.map(c => `<li>${esc(c)}</li>`).join('')}</ul></div>`).join('')}
      </details>
    </div></div>
    <div class="seccio-ajustos"><h2>Quant a</h2><div class="targeta">
      ${fila('Agents Rurals · Estudi', 'Temari, banc de preguntes i app per preparar l\'oposició d\'agent rural (escala bàsica) del Cos d\'Agents Rurals de la Generalitat de Catalunya. App no oficial.', '')}
      ${fila('Contingut', (() => {
        const of = D.preguntes.filter(q => q.o === 'o'), cat = k => of.filter(q => q.ex.k === k).length, n = x => x.toLocaleString('ca');
        return `<ul class="contingut">
          <li><b>${n(D.temes.length)} temes</b>: ${D.temes.filter(t => t.codi[0] === 'G').length} generals i ${D.temes.filter(t => t.codi[0] === 'E').length} específics</li>
          <li><b>${n(D.preguntes.length)} preguntes</b>: ${n(D.preguntes.length - of.length)} generades a partir del temari i ${n(of.length)} d'exàmens oficials (${n(cat('agent'))} d'agent, ${n(cat('agent major'))} d'agent major i ${n(cat('sotsinspector'))} de sotsinspector)</li>
          <li><b>${n(D.examens.length)} exàmens oficials</b> sencers, del ${Math.min(...D.examens.map(e => e.y))} al ${Math.max(...D.examens.map(e => e.y))}</li>
          <li><b>${n(D.especies.length)} espècies</b> amb foto</li></ul>`;
      })(), '')}
      ${fila('Autor', 'Ismael de Pedro', '')}
      ${fila('Has trobat un error?', 'Cada pregunta té el botó «Reportar un error».', `<a class="boto" href="${esc(D.repo)}/issues" target="_blank" rel="noopener">Veure'ls</a>`)}
      <p class="suau drets">© ${new Date().getFullYear()} Ismael de Pedro. Tots els drets reservats sobre el temari, les preguntes generades i l'app.
        Els textos normatius i els exàmens oficials són de les administracions que els publiquen. Les fotos de les espècies són dels seus autors,
        amb llicències Creative Commons indicades a cada fitxa del temari.</p>
    </div></div></div>`;
  document.querySelectorAll('#ajustos .seccio-ajustos').forEach(sc => {
    const nom = sc.querySelector('h2').textContent;
    sc.hidden = !C || nom !== C[1];
    sc.querySelector('h2').hidden = true;
  });
  navigator.storage?.estimate?.().then(e => {
    const el = $('#espai'); if (!el) return;
    el.textContent = `${(e.usage / 1e6).toFixed(1)} MB (temari, imatges i preguntes desats per funcionar sense connexió)`;
  }).catch(() => { const el = $('#espai'); if (el) el.textContent = 'no disponible'; });
  navigator.storage?.persisted?.().then(p => {
    const b = $('#protegeix'); if (!b) return;
    if (p) { $('#espai').insertAdjacentHTML('afterend', '<br>Dades protegides: el navegador no les esborrarà per alliberar espai.'); return; }
    b.hidden = false;
    b.addEventListener('click', async () => {
      const ok = await navigator.storage.persist().catch(() => false);
      avis(ok ? 'Dades protegides' : 'El navegador no ho ha permès. Instal·lar l\'app sol ajudar-hi; fes còpies de tant en tant.');
      if (ok) b.hidden = true;
    });
  });
  $('#cerca-act').addEventListener('click', async () => {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (!reg) { avis('Les actualitzacions només funcionen amb l\'app publicada.'); return; }
    await reg.update().catch(() => {});
    avis(reg.installing || reg.waiting ? 'S\'està descarregant la versió nova…' : 'Ja tens la darrera versió.');
  });
  $('#ajustos').addEventListener('change', e => {
    const el = e.target; if (!el.name || el.id === 'imp') return;
    const v = el.type === 'checkbox' ? el.checked : (['nPractica', 'meta'].includes(el.name) ? +el.value : (el.name === 'nom' ? el.value.trim() : el.value));
    posaAjust(el.name, v);
  });
  $('#exp').addEventListener('click', () => {
    const blob = new Blob([P.exporta()], {type: 'application/json'});
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `agents-rurals-progres-${new Date().toISOString().slice(0, 10)}.json`; a.click(); P.marcaCopia();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  $('#imp').addEventListener('change', async e => {
    const f = e.target.files[0]; if (!f) return;
    try { P.importa(await f.text()); alert('Progrés importat.'); navega(); } catch (err) { alert('No s\'ha pogut importar: ' + err.message); }
  });
  $('#del').addEventListener('click', () => { if (confirm('Segur que vols esborrar tot el progrés?')) { P.esborra(); navega(); } });
}

// ---------------------------------------------------------------- arrencada
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); instalPrompt = e; if (!location.hash || location.hash === '#/') navega(); });
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  const teniaVersio = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('sw.js').catch(() => {});
  // Quan s'instal·la una versió nova de l'app (preguntes corregides, millores), avisa per recarregar
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!teniaVersio || $('#avis-versio')) return;
    const d = document.createElement('div'); d.id = 'avis-versio'; d.className = 'avis-versio';
    d.innerHTML = '<span>Hi ha una versió nova de l\'app.</span><button class="boto principal">Actualitzar</button>';
    d.querySelector('button').addEventListener('click', () => location.reload());
    document.body.appendChild(d);
  });
}

fetch('data/dades.json').then(r => r.json()).then(d => {
  D = d;
  PER_ID = new Map(D.preguntes.map(q => [q.id, q]));
  navega();
}).catch(err => { $('#app').innerHTML = `<p>No s'han pogut carregar les dades (${esc(err.message)}).</p>`; });
