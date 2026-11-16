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
  s.q = s.q || {}; s.sims = s.sims || []; s.pref = s.pref || {}; s.esp = s.esp || {};
  const desa = () => { try { localStorage.setItem(CLAU, JSON.stringify(s)); } catch (e) { alert('No s\'ha pogut desar el progrés: ' + e.message); } };
  return {
    get: id => s.q[id],
    tots: () => s.q,
    sims: () => s.sims,
    pref: (k, v) => { if (v === undefined) return s.pref[k]; s.pref[k] = v; desa(); },
    respon(id, encert) {
      const r = s.q[id] || {n: 0, c: 0, w: 0, b: 0};
      r.n++; r.l = Date.now();
      if (encert) { r.c++; r.b = Math.min(r.b + 1, CAIXES.length - 1); r.u = 1; }
      else { r.w++; r.b = 1; r.u = 0; }
      r.d = Date.now() + CAIXES[r.b] * DIA;
      s.q[id] = r; desa();
    },
    esp: () => s.esp,
    respEsp(lat, encert) { const r = s.esp[lat] || {n: 0, c: 0}; r.n++; if (encert) r.c++; r.u = encert ? 1 : 0; r.l = Date.now(); s.esp[lat] = r; desa(); },
    afegeixSim(sim) { s.sims.unshift(sim); s.sims = s.sims.slice(0, 50); desa(); },
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
      desa();
    },
    esborra() { s = {q: {}, sims: [], esp: {}, pref: s.pref}; desa(); },
  };
})();

// ---------------------------------------------------------------- utilitats
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
const punts = d => '●'.repeat(d) + '○'.repeat(4 - d);

// ---------------------------------------------------------------- encaminament
const rutes = {
  '': vistaInici, practica: vistaPractica, simulacre: vistaSimulacre, repas: vistaRepas,
  test: vistaTest, resultat: vistaResultat, especies: vistaEspecies, temari: vistaTemari, progres: vistaProgres, ajustos: vistaAjustos,
};
function navega() {
  const parts = location.hash.replace(/^#\/?/, '').split('/');
  const r = rutes[parts[0]] || vistaInici;
  document.querySelectorAll('.menu a').forEach(a => a.classList.toggle('actiu', a.getAttribute('href') === '#/' + parts[0]));
  if (parts[0] !== 'temari') TORNAR = null;
  $('#tornar').hidden = !(parts[0] === 'temari' && TORNAR);
  r(parts.slice(1).map(decodeURIComponent));
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
  const fallades = D.preguntes.filter(x => q[x.id] && q[x.id].u === 0 && vigent(x)).length;
  const sim = P.sims()[0];
  const nOf = D.preguntes.filter(x => x.o === 'o').length;
  $('#app').innerHTML = `
    ${instalPrompt ? `<div class="targeta avis-instal"><span>Instal·la l'app per fer-la servir sense connexió.</span><button class="boto principal" id="instal">Instal·lar</button></div>` : ''}
    <h1>Oposició d'agent rural</h1>
    <div class="graella">
      <div class="targeta"><div class="xifra">${vistes}<span class="suau"> / ${D.preguntes.length}</span></div><div class="suau">preguntes vistes</div></div>
      <div class="targeta"><div class="xifra">${pct(enc, tot)} %</div><div class="suau">d'encerts (${tot} respostes)</div></div>
      <div class="targeta"><div class="xifra">${pendents}</div><div class="suau">per repassar avui</div></div>
      <div class="targeta"><div class="xifra">${sim ? sim.Q.toFixed(2) : '–'}</div><div class="suau">${sim ? `darrer simulacre (${sim.Q >= D.examen.minim ? 'aprovat' : 'suspès'})` : 'cap simulacre fet'}</div></div>
    </div>
    <div class="botons">
      <a class="boto principal" href="#/practica">Practicar per temes</a>
      <a class="boto" href="#/simulacre">Simulacre d'examen</a>
      <a class="boto" href="#/repas">Repàs (${pendents})</a>
      ${fallades ? `<button class="boto" id="fallades">Fallades (${fallades})</button>` : ''}
      <a class="boto" href="#/especies">Espècies amb foto</a>
      <a class="boto" href="#/temari">Temari</a>
    </div>
    <p class="suau">${D.preguntes.length} preguntes: ${D.preguntes.length - nOf} generades a partir del temari i ${nOf} d'exàmens oficials (agent, agent major i sotsinspector). El progrés es desa en aquest dispositiu; a <a href="#/ajustos">Ajustos</a> en pots fer una còpia.</p>`;
  $('#instal')?.addEventListener('click', async () => { instalPrompt.prompt(); await instalPrompt.userChoice; instalPrompt = null; navega(); });
  $('#fallades')?.addEventListener('click', () => {
    comenca(barreja(D.preguntes.filter(x => q[x.id] && q[x.id].u === 0 && vigent(x))).slice(0, 40), 'practica', 'Fallades');
  });
}

// ---------------------------------------------------------------- pràctica
function vistaPractica() {
  const temes = D.temes.map(t => t.codi);
  const pr = P.pref('filtres') || {};
  const xip = (nom, val, txt, on) => `<label class="xip"><input type="checkbox" name="${nom}" value="${esc(val)}" ${on ? 'checked' : ''}><span>${esc(txt)}</span></label>`;
  $('#app').innerHTML = `
    <h1>Practicar</h1>
    <form id="f">
      <fieldset><legend>Temes</legend>
        <div class="xips">${temes.map(c => xip('tema', c, c, (pr.temes || []).includes(c))).join('')}</div>
        <div class="botons"><button type="button" class="boto" data-tots="1">Tots</button><button type="button" class="boto" data-tots="0">Cap</button></div>
        <div id="epigraf"></div>
      </fieldset>
      <fieldset><legend>Preguntes</legend>
        <label class="fila">Origen <select name="origen">
          <option value="">Totes</option><option value="g">Generades</option><option value="o">Oficials</option></select></label>
        <div id="categories" class="xips">${['agent', 'agent major', 'sotsinspector'].map(k => xip('cat', k, 'Oficials ' + k, !(pr.cat) || pr.cat.includes(k))).join('')}</div>
        <p class="suau" style="margin:.6rem 0 .2rem">Dificultat</p>
        <div class="xips">${[1, 2, 3, 4].map(d => xip('dif', d, ['', 'Bàsic', 'Mitjà', 'Avançat', 'Expert'][d], !(pr.dif) || pr.dif.includes(d))).join('')}</div>
        <label class="fila"><input type="checkbox" name="desact" ${pr.desact ? 'checked' : ''}> Incloure les desactualitzades i les anul·lades</label>
      </fieldset>
      <fieldset><legend>Quines</legend>
        <label class="fila"><input type="radio" name="mode" value="totes" checked> Totes</label>
        <label class="fila"><input type="radio" name="mode" value="noves"> Només les no vistes</label>
        <label class="fila"><input type="radio" name="mode" value="fallades"> Només les fallades</label>
        <label class="fila">Nombre <select name="n"><option>10</option><option selected>20</option><option>40</option><option>80</option><option value="0">Totes</option></select></label>
        <label class="fila"><input type="checkbox" name="ordre"> En l'ordre del temari (sense barrejar)</label>
      </fieldset>
      <p id="compte" class="suau"></p>
      <button class="boto principal" type="submit">Començar</button>
    </form>`;
  const f = $('#f');
  if (pr.origen) f.origen.value = pr.origen;
  const seleccio = () => {
    const v = n => [...f.querySelectorAll(`[name=${n}]:checked`)].map(i => i.value);
    return {temes: v('tema'), cat: v('cat'), dif: v('dif').map(Number), origen: f.origen.value,
            desact: f.desact.checked, mode: f.mode.value, n: +f.n.value, ordre: f.ordre.checked,
            epi: f.epi ? f.epi.value : ''};
  };
  const filtra = s => D.preguntes.filter(q =>
    (!s.temes.length || s.temes.includes(q.t)) && (!s.epi || q.e === s.epi) &&
    (!s.origen || q.o === s.origen) && (q.o !== 'o' || s.cat.includes(q.ex.k)) &&
    s.dif.includes(q.d) && (s.desact || vigent(q)) &&
    (s.mode !== 'noves' || !P.get(q.id)) && (s.mode !== 'fallades' || (P.get(q.id) && P.get(q.id).u === 0)));
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
    $('#compte').textContent = `${filtra(seleccio()).length} preguntes compleixen els filtres.`;
  };
  f.addEventListener('change', actualitza);
  f.querySelectorAll('[data-tots]').forEach(b => b.addEventListener('click', () => {
    f.querySelectorAll('[name=tema]').forEach(i => { i.checked = b.dataset.tots === '1'; }); actualitza();
  }));
  f.addEventListener('submit', e => {
    e.preventDefault();
    const s = seleccio();
    P.pref('filtres', {temes: s.temes, cat: s.cat, dif: s.dif, origen: s.origen, desact: s.desact});
    let llista = filtra(s);
    if (!llista.length) { alert('Cap pregunta compleix els filtres.'); return; }
    llista = s.ordre ? llista.sort((a, b) => ordreTema(a.t) - ordreTema(b.t) || a.e.localeCompare(b.e, 'ca', {numeric: true})) : barreja(llista);
    if (s.n) llista = llista.slice(0, s.n);
    comenca(llista, 'practica', s.temes.length === 1 ? nomTema(s.temes[0]) : 'Pràctica');
  });
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
  SESSIO = {mode, titol, ids: llista.map(q => q.id), resp: {}, i: 0, inici: ara(), acabada: false, ex: opc.ex || null};
  if (mode === 'simulacre') SESSIO.fi = ara() + (opc.minuts || D.examen.minuts) * 60e3;
  location.hash = '#/test';
  if (location.hash === '#/test') navega();
}

let rellotge = null;
function vistaTest() {
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
      <span>${sim ? `<span class="temps" id="temps"></span> · ` : ''}${S.i + 1} / ${S.ids.length}</span></div>
    <div class="progres-barra"><div style="width:${pct(fets, S.ids.length)}%"></div></div>
    <div class="targeta">
      <div class="etiquetes"><span class="etiqueta">${esc(q.t)} · ${esc(q.e)}</span>${origenEtiqueta(q)}${S.ex ? `<span class="etiqueta">Pregunta ${q.ex.nu} de l'examen</span>` : ''}<span class="etiqueta" title="Dificultat">${punts(q.d)}</span>
        ${q.s !== 'v' ? `<span class="etiqueta avis">${ESTATS[q.s]}</span>` : ''}</div>
      <p class="enunciat">${esc(q.q)}</p>
      <div class="opcions">${q.op.map((o, k) => {
        let cls = '';
        if (mostra) cls = k === q.ok ? 'correcta' : (k === r ? 'errada' : '');
        else if (r === k) cls = 'triada';
        return `<button class="opcio ${cls}" data-k="${k}" ${mostra ? 'disabled' : ''}><span class="lletra">${LLETRES[k]})</span><span>${esc(o)}</span></button>`;
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
    if (sim) { S.resp[q.id] = k; if (S.i < S.ids.length - 1) S.i++; vistaTest(); return; }
    if (respost) return;
    S.resp[q.id] = k; P.respon(q.id, k === q.ok); vistaTest();
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
      const el = $('#temps'); if (!el) return;
      el.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
      el.classList.toggle('poc', s < 600);
      if (s === 0) { clearInterval(rellotge); alert('S\'ha acabat el temps.'); acaba(); }
    };
    pinta(); rellotge = setInterval(pinta, 1000);
  }
}

function panellCorreccio(q, r) {
  const be = r === q.ok;
  const oficialAltra = q.o === 'o' && q.ex.r !== 'anul·lada' && LLETRES.indexOf(q.ex.r) !== q.ok;
  return `
    ${r !== undefined ? `<p class="resultat ${be ? 'be' : 'malament'}">${be ? 'Correcta' : `Incorrecta. La correcta és la ${LLETRES[q.ok]})`}</p>` : `<p class="resultat malament">En blanc. La correcta és la ${LLETRES[q.ok]})</p>`}
    ${q.s === 'a' ? '<p class="suau">El tribunal va anul·lar aquesta pregunta. Es marca la resposta que avui es considera correcta.</p>' : ''}
    ${q.s === 'd' ? '<p class="suau">La norma ha canviat des de l\'examen: la resposta oficial és la marcada, però llegeix l\'explicació.</p>' : ''}
    ${oficialAltra ? `<p class="suau">Resposta de la plantilla oficial: ${esc(q.ex.r)})</p>` : ''}
    <div class="explicacio">${esc(q.x)}</div>
    <div class="suau"><b>${esc(q.n)}</b>${q.art ? `, art. ${esc(q.art)}` : ''}</div>
    <div class="cita">${esc(q.c)}</div>
    <div class="botons"><a class="boto" data-apunts href="#/temari/${encodeURIComponent(q.f)}/${encodeURIComponent(q.a)}">📖 Obrir als apunts</a>
      <a class="boto" target="_blank" rel="noopener" href="${esc(urlReport(q, r))}">⚑ Reportar un error</a></div>`;
}
function urlReport(q, r) {
  const cos = [`**Pregunta:** ${q.id} (${q.t} · ${q.e})`, '', `> ${q.q}`, '',
    ...q.op.map((o, k) => `- ${LLETRES[k]}) ${o}${k === q.ok ? '  ← marcada com a correcta' : ''}${k === r ? '  ← la meva resposta' : ''}`), '',
    `**Font:** ${q.n}${q.art ? ', art. ' + q.art : ''}`, '', '**Què hi falla?**', '', '(Explica-ho aquí. Si pots, indica la norma o l\'apartat del temari.)', '',
    `<sub>Versió de les dades: ${D.versio || '?'}</sub>`].join('\n');
  return `${D.repo}/issues/new?labels=error-pregunta&title=${encodeURIComponent(`Error a la pregunta ${q.id}`)}&body=${encodeURIComponent(cos)}`;
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
      P.respon(id, r === q.ok);
    }
    const B = S.ids.length - A - E;
    const Q = Math.max(0, (A - E * D.examen.penalitzacio) * D.examen.max / S.ids.length);
    S.nota = {A, E, B, Q};
    P.afegeixSim({data: new Date().toISOString(), A, E, B, Q: Math.round(Q * 100) / 100, minuts: Math.round((ara() - S.inici) / 60e3),
      n: S.ids.length, ...(S.ex ? {ex: S.ex, nom: S.titol} : {})});
  }
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
    <h1>${sim ? 'Resultat del simulacre' : 'Resultat'}</h1>
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
      <div class="opcions">${q.op.map((o, j) => `<div class="opcio ${j === q.ok ? 'correcta' : (j === r ? 'errada' : '')}"><span class="lletra">${LLETRES[j]})</span><span>${esc(o)}</span></div>`).join('')}</div>
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
  $('#app').innerHTML = `<h1>Espècies amb foto</h1>
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
        <div class="botons"><a class="boto" data-apunts href="#/temari/${e.f}/${encodeURIComponent(e.a)}">📖 Obrir la fitxa als apunts</a>
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
    const fall = vistes.filter(x => q[x.id].u === 0 && vigent(x)).length;
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
    ${sims.length ? `<h2>Evolució dels simulacres</h2><div class="targeta">${graficaSims(sims)}</div>` : ''}
    ${febles.length ? `<div class="targeta"><b>Punts febles:</b> ${febles.map(f => `${f.t.codi} (${f.enc} %)`).join(' · ')}</div>` : ''}
    <div class="taula-scroll"><table><tr><th>Tema</th><th>Vistes</th><th>Encerts</th><th>Fallades</th><th></th></tr>
    ${files.map(f => `<tr><td><a href="#/temari/${f.t.fitxer}">${esc(f.t.codi)}</a> ${esc(f.t.titol)}</td><td>${f.vistes}/${f.total}</td>
      <td>${f.n ? f.enc + ' %' : '–'}<div class="barra-tema"><div style="width:${f.enc}%;background:var(${f.enc >= 50 ? '--verd' : '--vermell'})"></div></div></td>
      <td>${f.fall}</td><td>${f.fall ? `<button class="boto" data-fall="${f.t.codi}">Repassar</button>` : ''}</td></tr>`).join('')}
    </table></div>
    <div class="botons"><a class="boto" href="#/ajustos">Còpia del progrés</a></div>`;
  document.querySelectorAll('[data-fall]').forEach(b => b.addEventListener('click', () => {
    const t = b.dataset.fall;
    comenca(barreja(D.preguntes.filter(x => x.t === t && q[x.id] && q[x.id].u === 0 && vigent(x))), 'practica', 'Fallades ' + t);
  }));
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
function vistaAjustos() {
  $('#app').innerHTML = `<h1>Ajustos</h1>
    <div class="targeta"><h2 style="margin-top:0">Còpia del progrés</h2>
      <p>El progrés es desa només en aquest dispositiu. Descarrega'n una còpia per guardar-la o per passar-la a un altre dispositiu.</p>
      <div class="botons"><button class="boto principal" id="exp">Descarregar còpia</button>
      <label class="boto">Importar còpia<input type="file" id="imp" accept="application/json,.json" hidden></label></div></div>
    <div class="targeta"><h2 style="margin-top:0">Esborrar</h2><p>Esborra totes les respostes i simulacres d'aquest dispositiu.</p>
      <button class="boto perill" id="del">Esborrar el progrés</button></div>
    <p class="suau">Versió de les dades: ${D.preguntes.length} preguntes, ${D.temes.length} temes.</p>`;
  $('#exp').addEventListener('click', () => {
    const blob = new Blob([P.exporta()], {type: 'application/json'});
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `agents-rurals-progres-${new Date().toISOString().slice(0, 10)}.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  $('#imp').addEventListener('change', async e => {
    const f = e.target.files[0]; if (!f) return;
    try { P.importa(await f.text()); alert('Progrés importat.'); navega(); } catch (err) { alert('No s\'ha pogut importar: ' + err.message); }
  });
  $('#del').addEventListener('click', () => { if (confirm('Segur que vols esborrar tot el progrés?')) { P.esborra(); alert('Progrés esborrat.'); } });
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
