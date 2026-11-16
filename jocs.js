'use strict';
// Jocs de geografia: comarques, rius, muntanyes, relleu i espais naturals (dades: data/geo.json,
// generades amb scripts/geo_jocs.py a partir de l'ICGC, Wikidata i els temes E21 i E14).
// Fa servir les utilitats de app.js ($, esc, barreja, P, ico, navPractica, LLETRES...).

let GEO = null;
let JOC = null; // partida en curs
const PREGUNTES_PARTIDA = 10;

const carregaGeo = async () => GEO || (GEO = await (await fetch('data/geo.json')).json());
const tria = a => a[Math.floor(Math.random() * a.length)];
// Tria n distractors diferents de la resposta (i entre ells), prioritzant els del grup «prefer»
function distractors(correcta, pool, n = 3, prefer = []) {
  const fora = new Set([correcta]), out = [];
  for (const llista of [barreja(prefer), barreja(pool)]) for (const x of llista) {
    if (out.length >= n) break;
    if (!fora.has(x)) { fora.add(x); out.push(x); }
  }
  return out;
}
const opcions = (correcta, dist) => { const op = barreja([correcta, ...dist]); return {op, ok: op.indexOf(correcta)}; };
const nombre = n => n.toLocaleString('ca');

// ---------------------------------------------------------------- mapa
// Dibuixa Catalunya amb les comarques; opcionalment ressalta comarques, rius o cims.
function mapa(o = {}) {
  const G = GEO, res = new Set(o.comarques || []);
  return `<div class="mapa-joc ${o.toc ? 'toc' : ''}"><svg viewBox="0 0 ${G.w} ${G.h}" role="img" aria-label="Mapa de Catalunya">
    <path d="${G.contorn}" class="m-contorn"/>
    ${G.comarques.map((c, i) => `<path d="${c.d}" data-i="${i}" class="m-com ${res.has(c.nom) ? 'res' : ''} ${o.bona === c.nom ? 'bona' : ''} ${o.dolenta === c.nom ? 'dolenta' : ''}"/>`).join('')}
    ${(o.rius || []).map(r => `<polyline points="${r.pts}" class="m-riu ${r.res ? 'res' : ''}"/>`).join('')}
    ${o.capital ? `<circle cx="${o.capital.capx}" cy="${o.capital.capy}" r="5" class="m-cap"/>` : ''}
    ${(o.cims || []).map(c => `<g class="m-cim ${c.res ? 'res' : ''}" transform="translate(${c.x} ${c.y})"><path d="M0 -11 L9 6 L-9 6 Z"/></g>`).join('')}
    ${o.etiqueta ? `<text x="${o.etiqueta.x}" y="${o.etiqueta.y - 12}" class="m-etiq" text-anchor="middle">${esc(o.etiqueta.t)}</text>` : ''}
  </svg>
  <div class="m-zoom"><button type="button" data-z="1" aria-label="Apropar">+</button><button type="button" data-z="-1" aria-label="Allunyar">−</button><button type="button" data-z="0" aria-label="Veure-ho tot">⤢</button></div></div>`;
}
// Zoom i desplaçament: dos dits per fer zoom, un dit per moure's quan hi ha zoom, i botons +/−.
function zoomMapa(cont, enfoc) {
  const svg = cont.querySelector('svg'); if (!svg) return;
  const W = GEO.w, H = GEO.h;
  let vb = {x: 0, y: 0, w: W, h: H};
  const posa = () => {
    vb.w = Math.min(W, Math.max(W / 8, vb.w)); vb.h = vb.w * H / W;
    vb.x = Math.min(W - vb.w, Math.max(0, vb.x)); vb.y = Math.min(H - vb.h, Math.max(0, vb.y));
    svg.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
  };
  const zoom = (f, cx = vb.x + vb.w / 2, cy = vb.y + vb.h / 2) => { const nw = vb.w / f; vb.x = cx - (cx - vb.x) * nw / vb.w; vb.y = cy - (cy - vb.y) * nw / vb.w; vb.w = nw; posa(); };
  if (enfoc) { // apropa a una zona (p. ex. una comarca petita) deixant context al voltant
    const [x0, y0, x1, y1] = enfoc, m = 60, w = Math.max(x1 - x0 + 2 * m, W / 3);
    vb = {x: (x0 + x1) / 2 - w / 2, y: (y0 + y1) / 2 - w * H / W / 2, w, h: w * H / W}; posa();
  }
  cont.querySelectorAll('[data-z]').forEach(b => b.addEventListener('click', () => {
    const z = +b.dataset.z; if (z === 0) { vb = {x: 0, y: 0, w: W, h: H}; posa(); } else zoom(z > 0 ? 1.6 : 1 / 1.6);
  }));
  const pts = new Map(); let inici = null, mogut = false;
  const aSvg = (cx, cy) => { const r = svg.getBoundingClientRect(); return {x: vb.x + (cx - r.left) / r.width * vb.w, y: vb.y + (cy - r.top) / r.height * vb.h}; };
  svg.addEventListener('pointerdown', e => { pts.set(e.pointerId, {x: e.clientX, y: e.clientY}); mogut = false; inici = {vb: {...vb}, pts: new Map(pts)}; });
  svg.addEventListener('pointermove', e => {
    if (!pts.has(e.pointerId) || !inici) return;
    pts.set(e.pointerId, {x: e.clientX, y: e.clientY});
    const r = svg.getBoundingClientRect(), es = inici.vb.w / r.width;
    if (pts.size === 1 && vb.w < W) {
      const [p0] = inici.pts.values(), p = pts.get(e.pointerId);
      if (!p0) return;
      const dx = p.x - p0.x, dy = p.y - p0.y;
      if (Math.abs(dx) + Math.abs(dy) > 6) mogut = true;
      vb.x = inici.vb.x - dx * es; vb.y = inici.vb.y - dy * es; posa();
    } else if (pts.size === 2 && inici.pts.size === 2) {
      mogut = true;
      const [a0, b0] = [...inici.pts.values()], [a, b] = [...pts.values()];
      const d0 = Math.hypot(a0.x - b0.x, a0.y - b0.y), d = Math.hypot(a.x - b.x, a.y - b.y);
      const c = aSvg((a0.x + b0.x) / 2, (a0.y + b0.y) / 2);
      vb = {...inici.vb}; zoom(d / d0, c.x, c.y);
    }
    if (mogut) e.preventDefault();
  });
  const fi = e => { pts.delete(e.pointerId); inici = pts.size ? {vb: {...vb}, pts: new Map(pts)} : null; };
  svg.addEventListener('pointerup', fi); svg.addEventListener('pointercancel', fi);
  svg.addEventListener('click', e => { if (mogut) { e.stopPropagation(); e.preventDefault(); } }, true);
  svg.addEventListener('wheel', e => { e.preventDefault(); const c = aSvg(e.clientX, e.clientY); zoom(e.deltaY < 0 ? 1.25 : 0.8, c.x, c.y); }, {passive: false});
}

// ---------------------------------------------------------------- jocs i modes
const JOCS = [
  {id: 'comarques', nom: 'Comarques', ic: '🗺️', desc: 'Les 43 comarques al mapa, les capitals i les vegueries', modes: [
    ['quina', 'Quina comarca és?'], ['on', 'Troba-la al mapa'], ['capital', 'Capitals'], ['vegueria', 'Vegueries']]},
  {id: 'rius', nom: 'Rius', ic: '🏞️', desc: 'Els rius principals, on desemboquen i qui en gestiona la conca', modes: [
    ['quin', 'Quin riu és?'], ['desemboca', 'On desemboca?'], ['gestio', 'Qui el gestiona?']]},
  {id: 'muntanyes', nom: 'Muntanyes', ic: '⛰️', desc: 'Cims: on són, quina altitud tenen i quin és més alt', modes: [
    ['quin', 'Quin cim és?'], ['altitud', 'Altitud'], ['mesalt', 'Quin és més alt?'], ['comarca', 'A quina comarca?']]},
  {id: 'relleu', nom: 'Sistemes muntanyosos', ic: '🏔️', desc: 'Serres, massissos i planes: a quina unitat de relleu pertanyen', modes: [
    ['unitat', 'Unitat de relleu'], ['cim', 'Cims i unitats']]},
  {id: 'enp', nom: 'Espais naturals', ic: '🌳', desc: 'Parc nacional, parcs naturals i paratges: on són i quan es van declarar', modes: [
    ['quin', 'Quin parc és?'], ['on', 'On és?'], ['any', 'Any de declaració'], ['pnin', 'Paratges (PNIN)']]},
];

// Cada generador retorna {text, mapa?, op, ok, explica} o, per al mode de tocar el mapa, {toc: nom, text, explica}
const GEN = {
  comarques: {
    quina() {
      const c = tria(GEO.comarques), mateixa = GEO.comarques.filter(x => x.veg === c.veg).map(x => x.nom);
      return {text: 'Quina comarca és la ressaltada?', mapa: {comarques: [c.nom]}, enfoc: c.km2 < 400 ? c.bb : null,
        ...opcions(c.nom, distractors(c.nom, GEO.comarques.map(x => x.nom), 3, mateixa)), explica: fitxaComarca(c), com: c.nom};
    },
    on() {
      const c = tria(GEO.comarques);
      return {toc: c.nom, text: `Toca al mapa: <b>${esc(c.nom)}</b>`, explica: fitxaComarca(c), com: c.nom};
    },
    capital() {
      const c = tria(GEO.comarques), invers = Math.random() < .5;
      if (invers) return {text: `De quina comarca és capital <b>${esc(c.cap)}</b>?`,
        ...opcions(c.nom, distractors(c.nom, GEO.comarques.map(x => x.nom), 3, GEO.comarques.filter(x => x.veg === c.veg).map(x => x.nom))),
        explica: fitxaComarca(c), mapaDespres: {comarques: [c.nom], capital: c}};
      return {text: `Quina és la capital de comarca de <b>${esc(c.nom)}</b>?`, mapa: {comarques: [c.nom]}, enfoc: c.km2 < 400 ? c.bb : null,
        ...opcions(c.cap, distractors(c.cap, GEO.comarques.map(x => x.cap), 3, GEO.comarques.filter(x => x.veg === c.veg).map(x => x.cap))),
        explica: fitxaComarca(c), mapaDespres: {comarques: [c.nom], capital: c}};
    },
    vegueria() {
      const c = tria(GEO.comarques.filter(x => x.vegs.length === 1)); // Anoia es reparteix entre dues
      const vegs = [...new Set(GEO.comarques.map(x => x.veg))];
      return {text: `A quina vegueria pertany <b>${esc(c.nom)}</b>?`, mapa: {comarques: [c.nom]}, enfoc: c.km2 < 400 ? c.bb : null,
        ...opcions(c.veg, distractors(c.veg, vegs)), explica: fitxaComarca(c)};
    },
  },
  rius: {
    quin() {
      const r = tria(GEO.rius);
      return {text: 'Quin riu és el ressaltat?', mapa: {rius: GEO.rius.map(x => ({...x, res: x === r}))},
        ...opcions(r.nom, distractors(r.nom, GEO.rius.map(x => x.nom))), explica: fitxaRiu(r)};
    },
    desemboca() {
      const r = tria(GEO.rius), llocs = ['Mar Mediterrània', 'Oceà Atlàntic', 'Riu Ebre', 'Riu Segre', 'Riu Llobregat', 'Riu Ter'];
      return {text: `On desemboca el riu <b>${esc(r.nom)}</b>?`, ...opcions(r.desemboca, distractors(r.desemboca, llocs)),
        explica: fitxaRiu(r), mapaDespres: {rius: GEO.rius.map(x => ({...x, res: x === r}))}};
    },
    gestio() {
      const r = tria(GEO.rius), NOM = {ACA: "Agència Catalana de l'Aigua (ACA)", CHE: "Confederació Hidrogràfica de l'Ebre", CHX: 'Confederació Hidrogràfica del Xúquer'};
      const tots = [...Object.values(NOM), 'Agència de Residus de Catalunya'];
      return {text: `Qui gestiona la conca del riu <b>${esc(r.nom)}</b>?`, ...opcions(NOM[r.gestio], distractors(NOM[r.gestio], tots)),
        explica: fitxaRiu(r), mapaDespres: {rius: GEO.rius.map(x => ({...x, res: x === r}))}};
    },
  },
  muntanyes: {
    quin() {
      const c = tria(GEO.cims);
      return {text: 'Quin cim és el marcat?', mapa: {cims: [{...c, res: true}]},
        ...opcions(c.nom, distractors(c.nom, GEO.cims.map(x => x.nom), 3, GEO.cims.filter(x => x.unitat === c.unitat).map(x => x.nom))),
        explica: fitxaCim(c)};
    },
    altitud() {
      const c = tria(GEO.cims), f = a => nombre(Math.round(a)) + ' m';
      const altres = barreja(GEO.cims.map(x => x.alt).filter(a => Math.abs(a - c.alt) >= 120));
      const dist = [];
      for (const a of altres) { if (dist.length >= 3) break; if (dist.every(d => Math.abs(d - a) >= 80)) dist.push(a); }
      return {text: `Quina altitud té <b>${esc(c.nom)}</b>?`, ...opcions(f(c.alt), dist.map(f)), explica: fitxaCim(c),
        mapaDespres: {cims: [{...c, res: true}]}};
    },
    mesalt() {
      let tri;
      do { tri = barreja(GEO.cims).slice(0, 4); } while (new Set(tri.map(x => Math.round(x.alt / 30))).size < 4);
      const alt = tri.reduce((a, b) => (b.alt > a.alt ? b : a));
      const op = tri.map(x => x.nom);
      return {text: 'Quin d\'aquests cims és <b>més alt</b>?', op, ok: op.indexOf(alt.nom),
        explica: tri.sort((a, b) => b.alt - a.alt).map(x => `${esc(x.nom)}: ${nombre(Math.round(x.alt))} m`).join(' · '),
        mapaDespres: {cims: tri.map(x => ({...x, res: x === alt}))}};
    },
    comarca() {
      const c = tria(GEO.cims), noms = GEO.comarques.map(x => x.nom).filter(n => !c.coms.includes(n));
      const veines = GEO.comarques.filter(x => x.veg === GEO.comarques.find(k => k.nom === c.com).veg).map(x => x.nom).filter(n => !c.coms.includes(n));
      return {text: `A quina comarca és <b>${esc(c.nom)}</b>?`, ...opcions(c.com, distractors(c.com, noms, 3, veines)),
        explica: fitxaCim(c) + (c.coms.length > 1 ? `<br>És a la ratlla entre ${c.coms.map(esc).join(', ')}.` : ''),
        mapaDespres: {cims: [{...c, res: true}], comarques: c.coms}};
    },
  },
  relleu: {
    unitat() {
      const e = tria(GEO.relleu), unitats = [...new Set(GEO.relleu.map(x => x.unitat))];
      return {text: `A quina unitat de relleu pertany: <b>${esc(e.nom)}</b>?`, ...opcions(e.unitat, distractors(e.unitat, unitats)),
        explica: `${esc(e.nom)}: ${esc(e.unitat)}. Altres elements de la mateixa unitat: ${GEO.relleu.filter(x => x.unitat === e.unitat && x !== e).map(x => esc(x.nom)).join(', ')}.`, tema: 'E21'};
    },
    cim() {
      const c = tria(GEO.cims), unitats = [...new Set(GEO.cims.map(x => x.unitat))];
      return {text: `A quina unitat de relleu pertany <b>${esc(c.nom)}</b> (${nombre(Math.round(c.alt))} m)?`, ...opcions(c.unitat, distractors(c.unitat, unitats)),
        explica: fitxaCim(c), mapaDespres: {cims: [{...c, res: true}]}};
    },
  },
  enp: {
    quin() {
      const p = tria([...GEO.enp.parcs, GEO.enp.pn]), tots = [...GEO.enp.parcs, GEO.enp.pn].map(x => x.nom);
      return {text: `Quin espai natural protegit és a ${llista(p.comarques)}?`, mapa: {comarques: p.comarques},
        ...opcions(p.nom, distractors(p.nom, tots, 3, tots.filter(n => GEO.enp.parcs.find(x => x.nom === n)?.comarques.some(c => p.comarques.includes(c))))),
        explica: fitxaEspai(p)};
    },
    on() {
      const p = tria([...GEO.enp.parcs, GEO.enp.pn]), txt = x => llista(x.comarques);
      const altres = [...GEO.enp.parcs, GEO.enp.pn].filter(x => txt(x) !== txt(p)).map(txt);
      return {text: `On és el <b>${esc(p.nom)}</b>?`, ...opcions(txt(p), distractors(txt(p), altres)),
        explica: fitxaEspai(p), mapaDespres: {comarques: p.comarques}};
    },
    any() {
      const p = tria([...GEO.enp.parcs, GEO.enp.pn]), anys = [...new Set([...GEO.enp.parcs, GEO.enp.pn].map(x => String(x.any)))];
      return {text: `Quin any es va declarar el <b>${esc(p.nom)}</b>?`, ...opcions(String(p.any), distractors(String(p.any), anys)),
        explica: fitxaEspai(p) + '<br>El més antic és el Parc Nacional (1955); el parc natural més antic, la Garrotxa (1982), i el més recent, les Capçaleres del Ter i del Freser (2015).', tema: 'E14'};
    },
    pnin() {
      const p = tria(GEO.enp.pnin), noms = GEO.comarques.map(x => x.nom);
      return {text: `A quina comarca és el paratge natural d'interès nacional <b>${esc(p.nom)}</b>?`,
        ...opcions(p.comarques[0], distractors(p.comarques[0], noms, 3, ['Alt Empordà', 'Berguedà', 'Selva', 'Conca de Barberà', 'Garrotxa', 'Baix Empordà'])),
        explica: `${esc(p.nom)}: ${esc(p.comarques[0])}, declarat el ${p.any}. Hi ha 7 PNIN; 3 són dins del Parc Natural del Cap de Creus.`,
        mapaDespres: {comarques: p.comarques}, tema: 'E14'};
    },
  },
};
const llista = a => a.length === 1 ? esc(a[0]) : a.slice(0, -1).map(esc).join(', ') + ' i ' + esc(a[a.length - 1]);
function fitxaComarca(c) {
  return `<b>${esc(c.nom)}</b> · capital: ${esc(c.cap)} · vegueria: ${c.vegs.map(esc).join(' i ')} · ${c.prov.length > 1 ? 'províncies' : 'província'}: ${c.prov.map(esc).join(' i ')} · ${nombre(c.km2)} km²`;
}
const fitxaRiu = r => `<b>${esc(r.nom)}</b> · ${r.afluent ? `afluent del ${esc(r.afluent)}` : `desemboca a: ${esc(r.desemboca)}`} · ${r.gestio === 'ACA' ? 'conques internes (ACA)' : r.gestio === 'CHE' ? (r.vessant === 'Atlàntic' ? "vessant atlàntic; gestió de la Confederació Hidrogràfica de l'Ebre" : "conca de l'Ebre (CHE)") : 'Confederació Hidrogràfica del Xúquer'}.<br>${esc(r.nota)}`;
const fitxaCim = c => `<b>${esc(c.nom)}</b> · ${nombre(Math.round(c.alt))} m · ${esc(c.massis)} · ${esc(c.unitat)} · ${c.coms.map(esc).join(' / ')}`;
const fitxaEspai = p => `<b>${esc(p.nom)}</b> · ${llista(p.comarques)} · declarat el ${p.any}`;

// ---------------------------------------------------------------- vistes
async function vistaJocs([id]) {
  $('#app').innerHTML = '<p class="carregant">Carregant els mapes…</p>';
  try { await carregaGeo(); } catch { $('#app').innerHTML = '<p>No s\'han pogut carregar les dades dels jocs.</p>'; return; }
  if (id === 'partida' && JOC) return pintaPregunta();
  const st = P.jocs();
  const joc = JOCS.find(j => j.id === id);
  if (joc) return vistaModes(joc);
  const espSt = P.esp(), espN = Object.values(espSt).reduce((a, r) => a + r.n, 0), espC = Object.values(espSt).reduce((a, r) => a + r.c, 0);
  $('#app').innerHTML = `<h1>Practicar</h1>${navPractica('jocs')}
    <p class="suau">Minijocs per conèixer el territori. Ajuden a l'examen (temes E5, E7, E8, E14 i E21), però no compten per a la meta diària.</p>
    <div class="jocs">${JOCS.map(j => { const s = st[j.id]; return `<a class="targeta joc" href="#/jocs/${j.id}">
      <span class="joc-ic">${j.ic}</span><span class="txt"><b>${esc(j.nom)}</b><span class="suau">${esc(j.desc)}</span>
      ${s ? `<span class="joc-st">${s.p} ${s.p === 1 ? 'partida' : 'partides'} · ${pct(s.c, s.n)} % d'encert · millor ${s.millor} %</span>` : ''}</span></a>`; }).join('')}
      <a class="targeta joc" href="#/especies"><span class="joc-ic">🦉</span><span class="txt"><b>Espècies amb foto</b><span class="suau">Fauna protegida, pesca, invasores i flora del temari</span>
      ${espN ? `<span class="joc-st">${pct(espC, espN)} % d'encert · ${Object.keys(espSt).length} de ${D.especies.length} vistes</span>` : ''}</span></a>
    </div>
    <p class="suau petit">${esc(GEO.font)}</p>`;
}
function vistaModes(joc) {
  const pr = (P.pref('jocModes') || {})[joc.id] || 'barrejat';
  $('#app').innerHTML = `<h1>Practicar</h1>${navPractica('jocs')}<a class="tornar-ajustos" href="#/jocs">← Jocs</a>
    <h2 style="margin-top:.2rem">${joc.ic} ${esc(joc.nom)}</h2><p class="suau">${esc(joc.desc)}</p>
    <div class="targeta"><b>Què vols practicar?</b>
      <div class="modes">${[['barrejat', 'Una mica de tot'], ...joc.modes].map(([m, t]) => `<label class="xip"><input type="radio" name="mode" value="${m}" ${m === pr ? 'checked' : ''}><span>${esc(t)}</span></label>`).join('')}</div>
      <div class="botons"><button class="boto principal gran" id="comenca-joc">Començar (${PREGUNTES_PARTIDA} preguntes)</button></div></div>
    ${joc.id === 'comarques' ? `<div class="targeta">${mapa({})}</div><p class="suau petit">Pots fer zoom amb dos dits o amb els botons, i moure el mapa amb un dit.</p>` : ''}`;
  if (joc.id === 'comarques') zoomMapa($('.mapa-joc'));
  $('#comenca-joc').addEventListener('click', () => {
    const mode = document.querySelector('[name=mode]:checked').value;
    P.pref('jocModes', {...(P.pref('jocModes') || {}), [joc.id]: mode});
    comencaJoc(joc.id, mode);
  });
}
function comencaJoc(id, mode) {
  const joc = JOCS.find(j => j.id === id), modes = joc.modes.map(m => m[0]);
  const preg = [], vistos = new Set();
  for (let k = 0; preg.length < PREGUNTES_PARTIDA && k < 200; k++) {
    const m = mode === 'barrejat' ? modes[preg.length % modes.length] : mode;
    const q = GEN[id][m]();
    const clau = q.text + (q.op ? q.op[q.ok] : q.toc);
    if (vistos.has(clau)) continue; // sense repetir pregunta dins la partida
    vistos.add(clau); preg.push(q);
  }
  JOC = {id, mode, preg: mode === 'barrejat' ? barreja(preg) : preg, i: 0, resp: []};
  if (location.hash === '#/jocs/partida') pintaPregunta(); else location.hash = '#/jocs/partida';
}
function pintaPregunta() {
  const G = JOC, joc = JOCS.find(j => j.id === G.id);
  if (G.i >= G.preg.length) return resultatJoc();
  const q = G.preg[G.i], r = G.resp[G.i], respost = r !== undefined;
  let mapaHtml = '';
  if (q.toc) mapaHtml = mapa(respost ? {bona: q.toc, dolenta: r.ok ? null : r.tocada, toc: false} : {toc: true});
  else if (respost && q.mapaDespres) mapaHtml = mapa(q.mapaDespres);
  else if (q.mapa) mapaHtml = mapa(q.mapa);
  $('#app').innerHTML = `
    <div class="capcalera-test"><b>${joc.ic} ${esc(joc.nom)}</b><span>${G.i + 1} / ${G.preg.length}</span></div>
    <div class="progres-barra"><div style="width:${pct(G.i + (respost ? 1 : 0), G.preg.length)}%"></div></div>
    <div class="targeta">
      <p class="enunciat">${q.text}</p>
      ${mapaHtml}
      ${q.op ? `<div class="opcions">${q.op.map((o, k) => {
        const cls = respost ? (k === q.ok ? 'correcta' : (k === r.k ? 'errada' : '')) : '';
        return `<button class="opcio ${cls}" data-k="${k}" ${respost ? 'disabled' : ''}><span class="lletra">${LLETRES[k]})</span><span>${esc(o)}</span></button>`;
      }).join('')}</div>` : ''}
      ${respost ? `<p class="resultat ${r.ok ? 'be' : 'malament'}">${r.ok ? 'Correcta' : q.toc ? `Incorrecta: has tocat ${esc(r.tocada || '—')}` : 'Incorrecta'}</p>
        <div class="explicacio">${q.explica}</div>
        <div class="botons">${q.tema ? `<a class="boto" data-apunts href="#/temari/${D.temes.find(t => t.codi === q.tema).fitxer}">${ico('obre')} Obrir el tema ${q.tema}</a>` : ''}
          <button class="boto principal" id="seg-joc">${G.i < G.preg.length - 1 ? 'Següent →' : 'Veure el resultat'}</button></div>` : ''}
    </div>`;
  const m = $('.mapa-joc');
  if (m) zoomMapa(m, q.enfoc);
  if (q.toc && !respost) m.querySelectorAll('.m-com').forEach(p => p.addEventListener('click', () => {
    const nom = GEO.comarques[+p.dataset.i].nom;
    G.resp[G.i] = {ok: nom === q.toc, tocada: nom}; pintaPregunta();
  }));
  document.querySelectorAll('.opcio[data-k]').forEach(b => b.addEventListener('click', () => {
    if (respost) return; const k = +b.dataset.k; G.resp[G.i] = {k, ok: k === q.ok}; pintaPregunta();
  }));
  $('#seg-joc')?.addEventListener('click', () => { G.i++; pintaPregunta(); window.scrollTo(0, 0); });
}
function resultatJoc() {
  const G = JOC, joc = JOCS.find(j => j.id === G.id), enc = G.resp.filter(r => r && r.ok).length;
  if (!G.desat) { P.resJoc(G.id, enc, G.preg.length); G.desat = true; }
  const fallades = G.preg.filter((_, k) => !G.resp[k]?.ok);
  $('#app').innerHTML = `<h1>${joc.ic} ${esc(joc.nom)}</h1>
    <div class="targeta repte-fet">${quadres(G.resp.map(r => (r && r.ok ? 1 : 0)))}
      <p><b>${enc}/${G.preg.length}</b> · millor resultat: ${P.jocs()[G.id].millor} %</p>
      <div class="botons"><button class="boto principal" id="altra">Una altra partida</button><a class="boto" href="#/jocs">Altres jocs</a></div></div>
    ${fallades.length ? `<h2>Per repassar</h2>${fallades.map(q => `<div class="targeta"><p>${q.text.replace(/^Toca al mapa: /, 'On és ')}</p><div class="explicacio">${q.explica}</div></div>`).join('')}` : ''}`;
  $('#altra').addEventListener('click', () => comencaJoc(G.id, G.mode));
}

// Minijoc del dia (a l'inici): un joc diferent cada dia
const minijocDelDia = () => JOCS[numRepte(avui()) % JOCS.length];
document.addEventListener('click', async e => {
  const b = e.target.closest('[data-minijoc]'); if (!b) return;
  await carregaGeo(); comencaJoc(b.dataset.minijoc, 'barrejat');
});
rutes.jocs = vistaJocs;
