'use strict';
// Jocs de geografia: comarques, rius, muntanyes, relleu i espais naturals (dades: data/geo.json,
// generades amb scripts/geo_jocs.py a partir de l'ICGC, Wikidata i els temes E21 i E14).
// Fa servir les utilitats de app.js ($, esc, barreja, P, ico, navPractica, LLETRES, quadres...).
//
// Cada element (una comarca, un riu, un cim...) té un estat de domini: nou, fallat, dubtós o dominat
// (2 encerts seguits). Les partides trien més sovint els fallats i els nous, i el mapa d'«Explora»
// pinta cada element segons aquest estat.

let GEO = null;
let JOC = null;              // partida en curs
let GEN_USATS = new Set();   // elements ja sortits a la partida
const PREGUNTES_PARTIDA = 10, SEGONS_CR = 60, KM_PER_UNITAT = 0.4; // el mapa fa 700 unitats per 280 km

const carregaGeo = async () => {
  if (GEO) return GEO;
  GEO = await (await fetch('data/geo.json')).json();
  const bb = GEO.comarques.map(c => c.bb), m = 8;
  const x0 = Math.min(...bb.map(b => b[0])) - m, y0 = Math.min(...bb.map(b => b[1])) - m;
  GEO.vista = {x: x0, y: y0, w: Math.max(...bb.map(b => b[2])) + m - x0, h: Math.max(...bb.map(b => b[3])) + m - y0};
  return GEO;
};
const nombre = n => n.toLocaleString('ca');
const llista = a => a.length === 1 ? esc(a[0]) : a.slice(0, -1).map(esc).join(', ') + ' i ' + esc(a[a.length - 1]);
function distractors(correcta, pool, n = 3, prefer = []) {
  const fora = new Set([correcta]), out = [];
  for (const ll of [barreja(prefer), barreja(pool)]) for (const x of ll) {
    if (out.length >= n) break;
    if (!fora.has(x)) { fora.add(x); out.push(x); }
  }
  return out;
}
const opcions = (correcta, dist) => { const op = barreja([correcta, ...dist]); return {op, ok: op.indexOf(correcta)}; };

// ---------------------------------------------------------------- domini dels elements
const totsEspais = () => [GEO.enp.pn, ...GEO.enp.parcs, ...GEO.enp.pnin];
const ELEMENTS = {
  comarques: () => GEO.comarques.map(c => ['com:' + c.nom, c]),
  rius: () => GEO.rius.map(r => ['riu:' + r.nom, r]),
  muntanyes: () => GEO.cims.map(c => ['cim:' + c.nom, c]),
  relleu: () => GEO.relleu.map(e => ['rel:' + e.nom, e]),
  enp: () => totsEspais().map(e => ['enp:' + e.nom, e]),
};
const estat = (id, key) => {
  const r = (P.jocs()[id]?.e || {})[key];
  return !r ? 'nou' : r.s >= 2 ? 'domina' : r.u ? 'dubte' : 'falla';
};
const PES = {falla: 6, nou: 3, dubte: 3, domina: 1};
// Tria un element ponderant pel seu estat (els fallats surten més) i sense repetir dins la partida
function triaEl(id, prefix, pool, nom = x => x.nom) {
  const cands = pool.filter(x => !GEN_USATS.has(prefix + nom(x)));
  const ll = cands.length ? cands : pool;
  const pesos = ll.map(x => PES[estat(id, prefix + nom(x))]);
  let r = Math.random() * pesos.reduce((a, b) => a + b, 0);
  for (let k = 0; k < ll.length; k++) { r -= pesos[k]; if (r <= 0) { GEN_USATS.add(prefix + nom(ll[k])); return ll[k]; } }
  return ll[ll.length - 1];
}
function resumDomini(id) {
  const els = ELEMENTS[id](), e = {domina: 0, dubte: 0, falla: 0, nou: 0};
  for (const [k] of els) e[estat(id, k)]++;
  return {...e, tot: els.length};
}
const barraDomini = (id, nomPlural) => {
  const r = resumDomini(id), w = k => (100 * r[k] / r.tot).toFixed(1), f = JOCS.find(j => j.id === id).fem;
  return `<div class="domini"><div class="domini-txt"><b>${r.domina}/${r.tot}</b> ${nomPlural} ${f ? 'dominades' : 'dominats'}${r.falla ? ` · ${r.falla} per repassar` : ''}</div>
    <div class="domini-barra"><span class="d-domina" style="width:${w('domina')}%"></span><span class="d-dubte" style="width:${w('dubte')}%"></span><span class="d-falla" style="width:${w('falla')}%"></span></div>
    <div class="domini-llegenda"><span class="d-domina"></span>dominat <span class="d-dubte"></span>dubtós <span class="d-falla"></span>fallat <span class="d-nou"></span>no vist</div></div>`;
};

// ---------------------------------------------------------------- mapa
// o.comarques: ressaltades · o.domini: id de joc per pintar l'estat · o.rius / o.cims: capes ·
// o.toc: 'com' | 'riu' | 'qualsevol' (què es pot tocar) · o.punt: marca on s'ha tocat
function mapa(o = {}) {
  const G = GEO, res = new Set(o.comarques || []);
  const est = (prefix, nom) => (o.domini ? ' e-' + estat(o.domini, prefix + nom) : '');
  const fons = o.fons || 'politic', ctx = fons !== 'politic';
  const V = G.vista, botons = o.botons ?? (o.toc || o.explora);
  const ambRes = (o.rius || []).some(r => r.res) || (o.cims || []).some(c => c.res) && (o.cims || []).length > 4;
  return `<div class="mapa-joc fons-${fons} ${o.senseCom ? 'sense-com' : ''} ${ambRes ? 'amb-res' : ''} ${o.toc ? 'toc toc-' + o.toc : ''}"><svg viewBox="${V.x} ${V.y} ${V.w} ${V.h}" role="img" aria-label="Mapa de Catalunya">
    ${ctx ? `<image href="data/relleu.webp" x="0" y="0" width="${G.w}" height="${G.h}" preserveAspectRatio="none" class="m-relleu"/>` : ''}
    <path d="${G.contorn}" class="m-contorn"/>
    ${G.comarques.map((c, i) => `<path d="${c.d}" data-i="${i}" class="m-com${res.has(c.nom) ? ' res' : ''}${o.bona === c.nom ? ' bona' : ''}${o.dolenta === c.nom ? ' dolenta' : ''}${o.domini === 'comarques' ? est('com:', c.nom) : ''}"/>`).join('')}
    ${(o.rius || []).map((r, i) => `<polyline points="${r.pts}" class="m-riu${r.res ? ' res' : ''}${r.mal ? ' mal' : ''}${o.domini === 'rius' ? est('riu:', r.nom) : ''}"/>${o.toc === 'riu' || o.explora ? `<polyline points="${r.pts}" class="m-riu-toc" data-r="${i}"/>` : ''}`).join('')}
    ${ctx && !o.rius && !o.explora ? G.rius.map(r => `<polyline points="${r.pts}" class="m-riu ctx"/>`).join('') : ''}
    ${ctx && !o.cims && !o.rius && !o.explora ? G.cims.map(c => `<g class="m-cim ctx" transform="translate(${c.x} ${c.y})"><path d="M0 -6 L5 3.5 L-5 3.5 Z"/></g>`).join('') : ''}
    ${o.capital ? `<circle cx="${o.capital.capx}" cy="${o.capital.capy}" r="5" class="m-cap"/>` : ''}
    ${(o.cims || []).map(c => `<g class="m-cim${c.res ? ' res' : ''}${o.domini === 'muntanyes' ? est('cim:', c.nom) : ''}" data-c="${GEO.cims.indexOf(c.ref || c)}" transform="translate(${c.x} ${c.y})"><circle r="13" class="m-cim-toc"/><path d="M0 -11 L9 6 L-9 6 Z"/></g>`).join('')}
    ${o.punt ? `<g transform="translate(${o.punt.x} ${o.punt.y})" class="m-punt"><circle r="7"/><path d="M-4 -4 L4 4 M4 -4 L-4 4"/></g>` : ''}
    ${o.linia ? `<line x1="${o.linia[0].x}" y1="${o.linia[0].y}" x2="${o.linia[1].x}" y2="${o.linia[1].y}" class="m-linia"/>` : ''}
  </svg>
  ${botons ? '<div class="m-zoom"><button type="button" data-z="1" aria-label="Apropar">+</button><button type="button" data-z="-1" aria-label="Allunyar">−</button><button type="button" data-z="0" aria-label="Veure-ho tot">⤢</button></div>' : ''}</div>`;
}
// Zoom i desplaçament: dos dits per fer zoom, un dit per moure's quan hi ha zoom, i botons +/−.
function zoomMapa(cont, enfoc) {
  const svg = cont.querySelector('svg'); if (!svg) return;
  const V = GEO.vista, W = V.w, H = V.h;
  let vb = {...V};
  const posa = () => {
    vb.w = Math.min(W, Math.max(W / 8, vb.w)); vb.h = vb.w * H / W;
    vb.x = Math.min(V.x + W - vb.w, Math.max(V.x, vb.x)); vb.y = Math.min(V.y + H - vb.h, Math.max(V.y, vb.y));
    svg.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
    svg.style.setProperty('--z', W / vb.w); // per mantenir la mida dels símbols en fer zoom
  };
  const zoom = (f, cx = vb.x + vb.w / 2, cy = vb.y + vb.h / 2) => { const nw = vb.w / f; vb.x = cx - (cx - vb.x) * nw / vb.w; vb.y = cy - (cy - vb.y) * nw / vb.w; vb.w = nw; posa(); };
  if (enfoc) {
    const [x0, y0, x1, y1] = enfoc, m = 60, w = Math.max(x1 - x0 + 2 * m, W / 3);
    vb = {x: (x0 + x1) / 2 - w / 2, y: (y0 + y1) / 2 - w * H / W / 2, w, h: w * H / W};
  }
  posa();
  cont.querySelectorAll('[data-z]').forEach(b => b.addEventListener('click', () => {
    const z = +b.dataset.z; if (z === 0) { vb = {...V}; posa(); } else zoom(z > 0 ? 1.6 : 1 / 1.6);
  }));
  const pts = new Map(); let inici = null; cont.mogut = false;
  const aSvg = (cx, cy) => { const r = svg.getBoundingClientRect(); return {x: vb.x + (cx - r.left) / r.width * vb.w, y: vb.y + (cy - r.top) / r.height * vb.h}; };
  cont.aSvg = aSvg;
  svg.addEventListener('pointerdown', e => { pts.set(e.pointerId, {x: e.clientX, y: e.clientY}); cont.mogut = false; inici = {vb: {...vb}, pts: new Map(pts)}; });
  svg.addEventListener('pointermove', e => {
    if (!pts.has(e.pointerId) || !inici) return;
    pts.set(e.pointerId, {x: e.clientX, y: e.clientY});
    const r = svg.getBoundingClientRect(), es = inici.vb.w / r.width;
    if (pts.size === 1 && vb.w < W) {
      const [p0] = inici.pts.values(), p = pts.get(e.pointerId);
      if (!p0) return;
      const dx = p.x - p0.x, dy = p.y - p0.y;
      if (Math.abs(dx) + Math.abs(dy) > 6) cont.mogut = true;
      vb.x = inici.vb.x - dx * es; vb.y = inici.vb.y - dy * es; posa();
    } else if (pts.size === 2 && inici.pts.size === 2) {
      cont.mogut = true;
      const [a0, b0] = [...inici.pts.values()], [a, b] = [...pts.values()];
      const d0 = Math.hypot(a0.x - b0.x, a0.y - b0.y), d = Math.hypot(a.x - b.x, a.y - b.y);
      const c = aSvg((a0.x + b0.x) / 2, (a0.y + b0.y) / 2);
      vb = {...inici.vb}; zoom(d / d0, c.x, c.y);
    }
    if (cont.mogut) e.preventDefault();
  });
  const fi = e => { pts.delete(e.pointerId); inici = pts.size ? {vb: {...vb}, pts: new Map(pts)} : null; };
  svg.addEventListener('pointerup', fi); svg.addEventListener('pointercancel', fi);
  svg.addEventListener('click', e => { if (cont.mogut) { e.stopPropagation(); e.preventDefault(); } }, true);
  svg.addEventListener('wheel', e => { e.preventDefault(); const c = aSvg(e.clientX, e.clientY); zoom(e.deltaY < 0 ? 1.25 : 0.8, c.x, c.y); }, {passive: false});
}

// ---------------------------------------------------------------- jocs i modes
const JOCS = [
  {id: 'comarques', nom: 'Comarques', plural: 'comarques', fem: true, ic: '🗺️', desc: 'Les 43 comarques al mapa, les capitals i les vegueries', modes: [
    ['quina', 'Quina comarca és?', 'Se\'n ressalta una al mapa i tries el nom'],
    ['on', 'Toca-la al mapa', 'Et diem el nom i la toques'],
    ['capital', 'Capitals', 'La capital de cada comarca, i al revés'],
    ['vegueria', 'Vegueries', 'A quina vegueria pertany cada comarca']]},
  {id: 'rius', nom: 'Rius', plural: 'rius', ic: '🏞️', desc: 'Els rius principals, on desemboquen i qui en gestiona la conca', modes: [
    ['quin', 'Quin riu és?', 'Se\'n ressalta un al mapa i tries el nom'],
    ['toca', 'Toca\'l al mapa', 'Et diem el nom i el toques'],
    ['desemboca', 'On desemboca?', 'Al mar, a l\'Atlàntic o en un altre riu'],
    ['gestio', 'Qui el gestiona?', 'ACA, Confederació de l\'Ebre o del Xúquer']]},
  {id: 'muntanyes', nom: 'Muntanyes', plural: 'cims', ic: '⛰️', desc: 'Cims: on són, quina altitud tenen i quin és més alt', modes: [
    ['quin', 'Quin cim és?', 'Se\'n marca un al mapa i tries el nom'],
    ['toca', 'Situa\'l al mapa', 'Toques on és; val si encertes a menys de 10 km'],
    ['comarca', 'A quina comarca?', 'La comarca de cada cim'],
    ['altitud', 'Altitud', 'Quants metres fa'],
    ['mesalt', 'Quin és més alt?', 'Entre quatre cims']]},
  {id: 'relleu', nom: 'Sistemes muntanyosos', plural: 'elements', ic: '🏔️', desc: 'Serres, massissos i planes: a quina unitat de relleu pertanyen', modes: [
    ['unitat', 'Unitat de relleu', 'Serres, massissos, altiplans i planes'],
    ['cim', 'Cims i unitats', 'A quina unitat pertany cada cim']]},
  {id: 'enp', nom: 'Espais naturals', plural: 'espais', ic: '🌳', desc: 'Parc nacional, parcs naturals i paratges: on són i quan es van declarar', modes: [
    ['quin', 'Quin parc és?', 'Se\'n ressalten les comarques i tries el parc'],
    ['on', 'On és?', 'Les comarques de cada parc'],
    ['any', 'Any de declaració', 'Quan es va declarar cada parc'],
    ['pnin', 'Paratges (PNIN)', 'A quina comarca és cada paratge natural d\'interès nacional']]},
];

// Cada generador retorna {text, el, op, ok, explica, mapa?, mapaDespres?, enfoc?} o una pregunta de tocar
// el mapa: {toc: 'com' | 'riu' | 'qualsevol', bona, text, el, explica}
const GEN = {
  comarques: {
    quina() {
      const c = triaEl('comarques', 'com:', GEO.comarques), mateixa = GEO.comarques.filter(x => x.veg === c.veg).map(x => x.nom);
      return {el: 'com:' + c.nom, text: 'Quina comarca és la ressaltada?', mapa: {comarques: [c.nom]}, enfoc: c.km2 < 400 ? c.bb : null,
        ...opcions(c.nom, distractors(c.nom, GEO.comarques.map(x => x.nom), 3, mateixa)), explica: fitxaComarca(c)};
    },
    on() {
      const c = triaEl('comarques', 'com:', GEO.comarques);
      return {el: 'com:' + c.nom, toc: 'com', bona: c.nom, text: `Toca al mapa: <b>${esc(c.nom)}</b>`, explica: fitxaComarca(c)};
    },
    capital() {
      const c = triaEl('comarques', 'com:', GEO.comarques), mateixa = GEO.comarques.filter(x => x.veg === c.veg);
      if (Math.random() < .5) return {el: 'com:' + c.nom, text: `De quina comarca és capital <b>${esc(c.cap)}</b>?`,
        ...opcions(c.nom, distractors(c.nom, GEO.comarques.map(x => x.nom), 3, mateixa.map(x => x.nom))),
        explica: fitxaComarca(c), mapaDespres: {comarques: [c.nom], capital: c}};
      return {el: 'com:' + c.nom, text: `Quina és la capital de comarca de <b>${esc(c.nom)}</b>?`, mapa: {comarques: [c.nom]}, enfoc: c.km2 < 400 ? c.bb : null,
        ...opcions(c.cap, distractors(c.cap, GEO.comarques.map(x => x.cap), 3, mateixa.map(x => x.cap))),
        explica: fitxaComarca(c), mapaDespres: {comarques: [c.nom], capital: c}};
    },
    vegueria() {
      const c = triaEl('comarques', 'com:', GEO.comarques.filter(x => x.vegs.length === 1)); // Anoia es reparteix entre dues
      return {el: 'com:' + c.nom, text: `A quina vegueria pertany <b>${esc(c.nom)}</b>?`, mapa: {comarques: [c.nom]}, enfoc: c.km2 < 400 ? c.bb : null,
        ...opcions(c.veg, distractors(c.veg, [...new Set(GEO.comarques.map(x => x.veg))])), explica: fitxaComarca(c)};
    },
  },
  rius: {
    quin() {
      const r = triaEl('rius', 'riu:', GEO.rius);
      return {el: 'riu:' + r.nom, text: 'Quin riu és el ressaltat?', mapa: {rius: GEO.rius.map(x => ({...x, res: x === r}))},
        ...opcions(r.nom, distractors(r.nom, GEO.rius.map(x => x.nom))), explica: fitxaRiu(r)};
    },
    toca() {
      const r = triaEl('rius', 'riu:', GEO.rius);
      return {el: 'riu:' + r.nom, toc: 'riu', bona: r.nom, text: `Toca al mapa el riu <b>${esc(r.nom)}</b>`, explica: fitxaRiu(r)};
    },
    desemboca() {
      const r = triaEl('rius', 'riu:', GEO.rius), llocs = ['Mar Mediterrània', 'Oceà Atlàntic', 'Riu Ebre', 'Riu Segre', 'Riu Llobregat', 'Riu Ter'];
      return {el: 'riu:' + r.nom, text: `On desemboca el riu <b>${esc(r.nom)}</b>?`, ...opcions(r.desemboca, distractors(r.desemboca, llocs)),
        explica: fitxaRiu(r), mapaDespres: {rius: GEO.rius.map(x => ({...x, res: x === r}))}};
    },
    gestio() {
      const r = triaEl('rius', 'riu:', GEO.rius), NOM = {ACA: "Agència Catalana de l'Aigua (ACA)", CHE: "Confederació Hidrogràfica de l'Ebre", CHX: 'Confederació Hidrogràfica del Xúquer'};
      return {el: 'riu:' + r.nom, text: `Qui gestiona la conca del riu <b>${esc(r.nom)}</b>?`,
        ...opcions(NOM[r.gestio], distractors(NOM[r.gestio], [...Object.values(NOM), 'Agència de Residus de Catalunya'])),
        explica: fitxaRiu(r), mapaDespres: {rius: GEO.rius.map(x => ({...x, res: x === r}))}};
    },
  },
  muntanyes: {
    quin() {
      const c = triaEl('muntanyes', 'cim:', GEO.cims);
      return {el: 'cim:' + c.nom, text: 'Quin cim és el marcat?', mapa: {cims: [{...c, ref: c, res: true}]},
        ...opcions(c.nom, distractors(c.nom, GEO.cims.map(x => x.nom), 3, GEO.cims.filter(x => x.unitat === c.unitat).map(x => x.nom))),
        explica: fitxaCim(c)};
    },
    toca() {
      const c = triaEl('muntanyes', 'cim:', GEO.cims);
      return {el: 'cim:' + c.nom, toc: 'qualsevol', cim: c, text: `On és <b>${esc(c.nom)}</b>? Toca el mapa`, explica: fitxaCim(c)};
    },
    altitud() {
      const c = triaEl('muntanyes', 'cim:', GEO.cims), f = a => nombre(Math.round(a)) + ' m';
      const dist = [];
      for (const a of barreja(GEO.cims.map(x => x.alt).filter(a => Math.abs(a - c.alt) >= 120))) {
        if (dist.length >= 3) break; if (dist.every(d => Math.abs(d - a) >= 80)) dist.push(a);
      }
      return {el: 'cim:' + c.nom, text: `Quina altitud té <b>${esc(c.nom)}</b>?`, ...opcions(f(c.alt), dist.map(f)), explica: fitxaCim(c),
        mapaDespres: {cims: [{...c, ref: c, res: true}]}};
    },
    mesalt() {
      let tri;
      do { tri = barreja(GEO.cims).slice(0, 4); } while (new Set(tri.map(x => Math.round(x.alt / 30))).size < 4);
      const alt = tri.reduce((a, b) => (b.alt > a.alt ? b : a)), op = tri.map(x => x.nom);
      return {text: 'Quin d\'aquests cims és <b>més alt</b>?', op, ok: op.indexOf(alt.nom),
        explica: [...tri].sort((a, b) => b.alt - a.alt).map(x => `${esc(x.nom)}: ${nombre(Math.round(x.alt))} m`).join(' · '),
        mapaDespres: {cims: tri.map(x => ({...x, ref: x, res: x === alt}))}};
    },
    comarca() {
      const c = triaEl('muntanyes', 'cim:', GEO.cims), noms = GEO.comarques.map(x => x.nom).filter(n => !c.coms.includes(n));
      const veg = GEO.comarques.find(k => k.nom === c.com).veg;
      return {el: 'cim:' + c.nom, text: `A quina comarca és <b>${esc(c.nom)}</b>?`,
        ...opcions(c.com, distractors(c.com, noms, 3, GEO.comarques.filter(x => x.veg === veg).map(x => x.nom).filter(n => !c.coms.includes(n)))),
        explica: fitxaCim(c) + (c.coms.length > 1 ? `<br>És a la ratlla entre ${llista(c.coms)}.` : ''),
        mapaDespres: {cims: [{...c, ref: c, res: true}], comarques: c.coms}};
    },
  },
  relleu: {
    unitat() {
      const e = triaEl('relleu', 'rel:', GEO.relleu), unitats = [...new Set(GEO.relleu.map(x => x.unitat))];
      return {el: 'rel:' + e.nom, text: `A quina unitat de relleu pertany: <b>${esc(e.nom)}</b>?`, ...opcions(e.unitat, distractors(e.unitat, unitats)),
        explica: `${esc(e.nom)}: <b>${esc(e.unitat)}</b>. Altres elements de la mateixa unitat: ${GEO.relleu.filter(x => x.unitat === e.unitat && x !== e).map(x => esc(x.nom)).join(', ')}.`, tema: 'E21'};
    },
    cim() {
      const c = tria(GEO.cims), unitats = [...new Set(GEO.cims.map(x => x.unitat))];
      return {text: `A quina unitat de relleu pertany <b>${esc(c.nom)}</b> (${nombre(Math.round(c.alt))} m)?`, ...opcions(c.unitat, distractors(c.unitat, unitats)),
        explica: fitxaCim(c), mapaDespres: {cims: [{...c, ref: c, res: true}]}};
    },
  },
  enp: {
    quin() {
      const p = triaEl('enp', 'enp:', [GEO.enp.pn, ...GEO.enp.parcs]), tots = [GEO.enp.pn, ...GEO.enp.parcs].map(x => x.nom);
      const veins = GEO.enp.parcs.filter(x => x.comarques.some(c => p.comarques.includes(c))).map(x => x.nom);
      return {el: 'enp:' + p.nom, text: `Quin espai natural protegit és a ${llista(p.comarques)}?`, mapa: {comarques: p.comarques},
        ...opcions(p.nom, distractors(p.nom, tots, 3, veins)), explica: fitxaEspai(p)};
    },
    on() {
      const p = triaEl('enp', 'enp:', [GEO.enp.pn, ...GEO.enp.parcs]), txt = x => llista(x.comarques);
      return {el: 'enp:' + p.nom, text: `On és el <b>${esc(p.nom)}</b>?`,
        ...opcions(txt(p), distractors(txt(p), [GEO.enp.pn, ...GEO.enp.parcs].filter(x => txt(x) !== txt(p)).map(txt))),
        explica: fitxaEspai(p), mapaDespres: {comarques: p.comarques}};
    },
    any() {
      const p = triaEl('enp', 'enp:', [GEO.enp.pn, ...GEO.enp.parcs]), anys = [...new Set([GEO.enp.pn, ...GEO.enp.parcs].map(x => String(x.any)))];
      return {el: 'enp:' + p.nom, text: `Quin any es va declarar el <b>${esc(p.nom)}</b>?`, ...opcions(String(p.any), distractors(String(p.any), anys)),
        explica: fitxaEspai(p) + '<br>El més antic és el Parc Nacional (1955); el parc natural més antic, la Garrotxa (1982), i el més recent, les Capçaleres del Ter i del Freser (2015).', tema: 'E14'};
    },
    pnin() {
      const p = triaEl('enp', 'enp:', GEO.enp.pnin);
      return {el: 'enp:' + p.nom, text: `A quina comarca és el paratge natural d'interès nacional <b>${esc(p.nom)}</b>?`,
        ...opcions(p.comarques[0], distractors(p.comarques[0], GEO.comarques.map(x => x.nom), 3, ['Alt Empordà', 'Berguedà', 'Selva', 'Conca de Barberà', 'Garrotxa', 'Baix Empordà'])),
        explica: fitxaEspai(p) + '<br>Hi ha 7 PNIN; 3 són dins del Parc Natural del Cap de Creus.', mapaDespres: {comarques: p.comarques}, tema: 'E14'};
    },
  },
};
const tria = a => a[Math.floor(Math.random() * a.length)];
function fitxaComarca(c) {
  return `<b>${esc(c.nom)}</b> · capital: ${esc(c.cap)} · vegueria: ${c.vegs.map(esc).join(' i ')} · ${c.prov.length > 1 ? 'províncies' : 'província'}: ${c.prov.map(esc).join(' i ')} · ${nombre(c.km2)} km²`;
}
const del = nom => (/^[AEIOUÀÈÉÍÒÓÚ]/i.test(nom) ? "de l'" : 'del ') + nom; // «de l'Ebre», «del Segre»
const fitxaRiu = r => `<b>${esc(r.nom)}</b> · ${r.afluent ? `afluent ${esc(del(r.afluent))}` : `desemboca a: ${esc(r.desemboca)}`} · ${r.gestio === 'ACA' ? 'conques internes (ACA)' : r.gestio === 'CHE' ? (r.vessant === 'Atlàntic' ? "vessant atlàntic; gestió de la Confederació Hidrogràfica de l'Ebre" : "conca de l'Ebre (CHE)") : 'Confederació Hidrogràfica del Xúquer'}.<br>${esc(r.nota)}`;
const fitxaCim = c => `<b>${esc(c.nom)}</b> · ${nombre(Math.round(c.alt))} m · ${esc(c.massis)} · ${esc(c.unitat)} · ${c.coms.map(esc).join(' / ')}`;
const fitxaEspai = p => `<b>${esc(p.nom)}</b> · ${llista(p.comarques)} · declarat el ${p.any}${GEO.enp.pnin.includes(p) ? ' · paratge natural d\'interès nacional' : ''}`;

// ---------------------------------------------------------------- vistes
async function vistaJocs([id]) {
  $('#app').innerHTML = '<p class="carregant">Carregant els mapes…</p>';
  try { await carregaGeo(); } catch { $('#app').innerHTML = '<p>No s\'han pogut carregar les dades dels jocs.</p>'; return; }
  if (id === 'partida' && JOC) return pintaPregunta();
  const joc = JOCS.find(j => j.id === id);
  if (joc) return vistaJoc(joc);
  const st = P.jocs();
  const espSt = P.esp(), espN = Object.values(espSt).reduce((a, r) => a + r.n, 0), espC = Object.values(espSt).reduce((a, r) => a + r.c, 0);
  $('#app').innerHTML = `<h1>Practicar</h1>${navPractica('jocs')}
    <p class="suau">Minijocs per conèixer el territori. Ajuden a l'examen (temes E5, E7, E8, E14 i E21), però no compten per a la meta diària.</p>
    <div class="jocs">${JOCS.map(j => { const s = st[j.id], r = resumDomini(j.id); return `<a class="targeta joc" href="#/jocs/${j.id}">
      <span class="joc-ic">${j.ic}</span><span class="txt"><b>${esc(j.nom)}</b><span class="suau">${esc(j.desc)}</span>
      ${s ? `<span class="joc-st">${r.domina}/${r.tot} ${j.plural} ${j.fem ? 'dominades' : 'dominats'}${s.rec ? ` · rècord ${s.rec} en 60 s` : ''}</span>` : ''}</span></a>`; }).join('')}
      <a class="targeta joc" href="#/especies"><span class="joc-ic">🦉</span><span class="txt"><b>Espècies amb foto</b><span class="suau">Fauna protegida, pesca, invasores i flora del temari</span>
      ${espN ? `<span class="joc-st">${pct(espC, espN)} % d'encert · ${Object.keys(espSt).length} de ${D.especies.length} vistes</span>` : ''}</span></a>
    </div>
    <p class="suau petit">${esc(GEO.font)}</p>`;
}

// Pàgina d'un joc: «Jugar» (una mica de tot), la llista de modes i la contrarellotge
function vistaJoc(joc) {
  const s = P.jocs()[joc.id], capa = {comarques: 'comarques', rius: 'rius', muntanyes: 'muntanyes', enp: 'enp', relleu: 'relleu'}[joc.id];
  $('#app').innerHTML = `<h1>Practicar</h1>${navPractica('jocs')}<a class="tornar-ajustos" href="#/jocs">← Jocs</a>
    <h2 class="joc-titol">${joc.ic} ${esc(joc.nom)}</h2>
    ${barraDomini(joc.id, joc.plural)}
    <button class="targeta joc-jugar" data-mode="barrejat"><span><b>Jugar</b><span class="suau">${PREGUNTES_PARTIDA} preguntes de tots els modes. Les que falles tornen fins que les domines.</span></span><span class="joc-play">▶</span></button>
    <h3 class="modes-titol">Practicar un mode</h3>
    <div class="targeta llista-modes">${joc.modes.map(([m, t, d]) => `<button data-mode="${m}"><span><b>${esc(t)}</b><span class="suau">${esc(d)}</span></span>${ico('fletxa', 'chevron')}</button>`).join('')}
      <button data-cr="1"><span><b>⏱️ Contrarellotge</b><span class="suau">Tantes com puguis en ${SEGONS_CR} segons${s?.rec ? ` · el teu rècord: ${s.rec}` : ''}</span></span>${ico('fletxa', 'chevron')}</button></div>
    <div class="botons"><a class="boto" href="#/mapa/${capa}">${ico('obre')} ${joc.id === 'relleu' ? 'Repassar les unitats' : 'Veure al mapa'}</a></div>`;
  document.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => comencaJoc(joc.id, b.dataset.mode)));
  $('[data-cr]').addEventListener('click', () => comencaJoc(joc.id, 'barrejat', true));
}

// ---------------------------------------------------------------- Temari → Mapa
// Un sol mapa amb capes (comarques, rius, cims), fons polític/físic/mixt, colors de domini,
// cercador i fitxa de tot el que toques. També hi ha els espais naturals i les unitats de relleu.
const navTemari = actiu => `<nav class="pestanyes" aria-label="Temari"><a href="#/temari" class="${actiu === 'temes' ? 'actiu' : ''}">Temes</a><a href="#/mapa" class="${actiu === 'mapa' ? 'actiu' : ''}">Mapa de Catalunya</a></nav>`;
let MAPA = null;
async function vistaMapa([capa]) {
  $('#app').innerHTML = '<p class="carregant">Carregant el mapa…</p>';
  try { await carregaGeo(); } catch { $('#app').innerHTML = '<p>No s\'ha pogut carregar el mapa.</p>'; return; }
  const pr = P.pref('mapa') || {};
  MAPA = {fons: pr.fons || 'mixt', capes: pr.capes || {com: true, rius: true, cims: true}, domini: pr.domini || '', sel: null, enfoc: null};
  if (capa === 'comarques') Object.assign(MAPA, {domini: 'comarques', capes: {...MAPA.capes, com: true}});
  if (capa === 'rius') Object.assign(MAPA, {domini: 'rius', capes: {...MAPA.capes, rius: true}});
  if (capa === 'muntanyes') Object.assign(MAPA, {domini: 'muntanyes', capes: {...MAPA.capes, cims: true}});
  const noms = [...GEO.comarques.map(c => c.nom), ...GEO.comarques.map(c => c.cap + ' (capital)'), ...GEO.rius.map(r => 'Riu ' + r.nom), ...GEO.cims.map(c => c.nom), ...totsEspais().map(e => e.nom)];
  const xip = (k, t) => `<label class="xip"><input type="checkbox" name="capa" value="${k}" ${MAPA.capes[k] ? 'checked' : ''}><span>${t}</span></label>`;
  $('#app').innerHTML = `<h1>Temari</h1>${navTemari('mapa')}
    <input type="search" id="cerca-mapa" class="cerca" list="llista-mapa" placeholder="Busca una comarca, capital, riu, cim o parc" autocomplete="off">
    <datalist id="llista-mapa">${noms.map(n => `<option value="${esc(n)}">`).join('')}</datalist>
    <div class="controls-mapa">${selectorFons(MAPA.fons)}
      <div class="xips">${xip('com', 'Comarques')}${xip('rius', 'Rius')}${xip('cims', 'Cims')}</div>
      <label class="fila petit">Colors del meu domini <select id="domini"><option value="">Cap</option><option value="comarques">Comarques</option><option value="rius">Rius</option><option value="muntanyes">Cims</option></select></label></div>
    <div id="mapa-gran"></div>
    <div id="fitxa" class="explicacio" hidden></div>
    <details class="targeta llista-explora" id="det-enp" ${capa === 'enp' ? 'open' : ''}><summary><b>🌳 Espais naturals protegits</b></summary>
      ${[['Parc nacional', [GEO.enp.pn]], ['Parcs naturals', GEO.enp.parcs], ["Paratges naturals d'interès nacional", GEO.enp.pnin]].map(([t, ll]) =>
        `<div class="grup"><b>${t}</b><div>${ll.map(e => `<button type="button" class="xip-est e-${estat('enp', 'enp:' + e.nom)}" data-e="${esc(e.nom)}">${esc(e.nom.replace(/^Parc Natural (de la |del |dels |de les |de l'|de )/, ''))}</button>`).join('')}</div></div>`).join('')}
      <p class="suau petit">Toca'n un i se'n ressalten les comarques al mapa.</p></details>
    <details class="targeta llista-explora" id="det-relleu" ${capa === 'relleu' ? 'open' : ''}><summary><b>🏔️ Unitats de relleu</b></summary>
      ${[...new Set(GEO.relleu.map(x => x.unitat))].map(u => `<div class="grup"><b>${esc(u)}</b><div>${GEO.relleu.filter(x => x.unitat === u).map(x => `<span class="xip-est e-${estat('relleu', 'rel:' + x.nom)}">${esc(x.nom)}</span>`).join('')}</div></div>`).join('')}
      <p class="suau petit">Els colors indiquen el teu domini al joc de sistemes muntanyosos.</p></details>
    <p class="suau petit">${esc(GEO.font)} Relleu: ICGC (model d'elevacions).</p>`;
  $('#domini').value = MAPA.domini;
  const desa = () => P.pref('mapa', {fons: MAPA.fons, capes: MAPA.capes, domini: MAPA.domini});
  document.querySelectorAll('[name=fons]').forEach(i => i.addEventListener('change', () => { MAPA.fons = i.value; desa(); pintaMapa(); }));
  document.querySelectorAll('[name=capa]').forEach(i => i.addEventListener('change', () => { MAPA.capes[i.value] = i.checked; desa(); pintaMapa(); }));
  $('#domini').addEventListener('change', e => { MAPA.domini = e.target.value; desa(); pintaMapa(); });
  $('#cerca-mapa').addEventListener('change', e => cercaMapa(e.target.value));
  $('#cerca-mapa').addEventListener('keydown', e => { if (e.key === 'Enter') cercaMapa(e.target.value); });
  document.querySelectorAll('[data-e]').forEach(b => b.addEventListener('click', () => {
    const e = totsEspais().find(x => x.nom === b.dataset.e);
    document.querySelectorAll('[data-e].sel').forEach(x => x.classList.remove('sel')); b.classList.add('sel');
    selecciona({tipus: 'enp', obj: e}, true); $('#mapa-gran').scrollIntoView({behavior: 'smooth', block: 'center'});
  }));
  pintaMapa();
}
const bbCom = noms => { const bb = GEO.comarques.filter(c => noms.includes(c.nom)).map(c => c.bb); return [Math.min(...bb.map(b => b[0])), Math.min(...bb.map(b => b[1])), Math.max(...bb.map(b => b[2])), Math.max(...bb.map(b => b[3]))]; };
function bbRiu(r) { const p = r.pts.split(' ').map(x => x.split(',').map(Number)); return [Math.min(...p.map(a => a[0])), Math.min(...p.map(a => a[1])), Math.max(...p.map(a => a[0])), Math.max(...p.map(a => a[1]))]; }
function cercaMapa(txt) {
  const t = txt.trim().toLowerCase(); if (!t) return;
  const eq = a => a.toLowerCase() === t, conte = a => a.toLowerCase().includes(t);
  const prova = f => GEO.comarques.find(c => f(c.nom)) && {tipus: 'com', obj: GEO.comarques.find(c => f(c.nom))}
    || GEO.comarques.find(c => f(c.cap + ' (capital)') || f(c.cap)) && {tipus: 'com', obj: GEO.comarques.find(c => f(c.cap + ' (capital)') || f(c.cap))}
    || GEO.rius.find(r => f('Riu ' + r.nom) || f(r.nom)) && {tipus: 'riu', obj: GEO.rius.find(r => f('Riu ' + r.nom) || f(r.nom))}
    || GEO.cims.find(c => f(c.nom)) && {tipus: 'cim', obj: GEO.cims.find(c => f(c.nom))}
    || totsEspais().find(e => f(e.nom)) && {tipus: 'enp', obj: totsEspais().find(e => f(e.nom))};
  const r = prova(eq) || prova(conte);
  if (!r) { avis('No l\'he trobat al mapa.'); return; }
  if (r.tipus === 'riu') MAPA.capes.rius = true;
  if (r.tipus === 'cim') MAPA.capes.cims = true;
  document.querySelectorAll('[name=capa]').forEach(i => { i.checked = !!MAPA.capes[i.value]; });
  selecciona(r, true);
}
function selecciona(r, enfoca) {
  MAPA.sel = r;
  if (enfoca) {
    const o = r.obj;
    MAPA.enfoc = r.tipus === 'com' ? o.bb : r.tipus === 'riu' ? bbRiu(o) : r.tipus === 'cim' ? [o.x - 25, o.y - 25, o.x + 25, o.y + 25] : bbCom(o.comarques);
    pintaMapa();
  }
  const f = $('#fitxa'), o = r.obj;
  f.innerHTML = r.tipus === 'com' ? fitxaComarca(o) + estatTxt('comarques', 'com:' + o.nom)
    : r.tipus === 'riu' ? fitxaRiu(o) + estatTxt('rius', 'riu:' + o.nom)
    : r.tipus === 'cim' ? fitxaCim(o) + estatTxt('muntanyes', 'cim:' + o.nom)
    : fitxaEspai(o) + estatTxt('enp', 'enp:' + o.nom);
  f.hidden = false;
}
function pintaMapa() {
  const M = MAPA, sel = M.sel;
  $('#mapa-gran').innerHTML = mapa({
    fons: M.fons, domini: M.domini, explora: true, senseCom: !M.capes.com,
    comarques: sel && (sel.tipus === 'com' ? [sel.obj.nom] : sel.tipus === 'enp' ? sel.obj.comarques : []),
    rius: M.capes.rius ? GEO.rius.map(r => ({...r, res: sel?.tipus === 'riu' && sel.obj === r})) : null,
    cims: M.capes.cims ? GEO.cims.map(c => ({...c, ref: c, res: sel?.tipus === 'cim' && sel.obj === c})) : null,
    capital: sel?.tipus === 'com' ? sel.obj : null,
  });
  const m = $('#mapa-gran .mapa-joc');
  zoomMapa(m, M.enfoc); M.enfoc = null;
  const marca = el => { m.querySelectorAll('.sel').forEach(x => x.classList.remove('sel')); el.classList.add('sel'); };
  if (M.capes.com) m.querySelectorAll('.m-com').forEach(p => p.addEventListener('click', () => { marca(p); selecciona({tipus: 'com', obj: GEO.comarques[+p.dataset.i]}); }));
  m.querySelectorAll('.m-riu-toc').forEach(p => p.addEventListener('click', e => { e.stopPropagation(); marca(p.previousElementSibling); selecciona({tipus: 'riu', obj: GEO.rius[+p.dataset.r]}); }));
  m.querySelectorAll('.m-cim:not(.ctx)').forEach(g => g.addEventListener('click', e => { e.stopPropagation(); marca(g); selecciona({tipus: 'cim', obj: GEO.cims[+g.dataset.c]}); }));
}
const selectorFons = f => `<div class="segmentat fons-sel" role="radiogroup" aria-label="Tipus de mapa">${[['politic', 'Polític'], ['fisic', 'Físic'], ['mixt', 'Mixt']].map(([v, t]) =>
  `<label><input type="radio" name="fons" value="${v}" ${v === f ? 'checked' : ''}><span>${t}</span></label>`).join('')}</div>`;
const estatTxt = (id, key) => { const f = JOCS.find(j => j.id === id).fem, a = f ? 'ada' : 'at';
  return ({nou: '<br><span class="suau">Encara no t\'ha sortit en cap partida.</span>', domina: `<br><span class="est-txt e-domina">Domin${a}</span>`,
    dubte: `<br><span class="est-txt e-dubte">Encert${a}, però encara no domin${a}</span>`, falla: `<br><span class="est-txt e-falla">Fall${a} la darrera vegada</span>`})[estat(id, key)]; };

function genera(id, mode) {
  const modes = JOCS.find(j => j.id === id).modes.map(m => m[0]);
  for (let k = 0; k < 50; k++) {
    const m = mode === 'barrejat' ? tria(modes) : mode;
    const q = GEN[id][m]();
    const clau = q.text + (q.op ? q.op[q.ok] : q.bona || q.cim?.nom);
    if (!JOC || !JOC.claus.has(clau)) { JOC?.claus.add(clau); return q; }
  }
  return GEN[id][mode === 'barrejat' ? modes[0] : mode]();
}
function comencaJoc(id, mode, cr = false) {
  clearInterval(rellotgeJoc);
  GEN_USATS = new Set();
  JOC = {id, mode, cr, preg: [], i: 0, resp: [], claus: new Set(), fi: cr ? Date.now() + SEGONS_CR * 1000 : 0};
  if (!cr) for (let k = 0; k < PREGUNTES_PARTIDA; k++) JOC.preg.push(genera(id, mode));
  else JOC.preg.push(genera(id, mode));
  if (location.hash === '#/jocs/partida') pintaPregunta(); else location.hash = '#/jocs/partida';
}
let rellotgeJoc = null;
function respon(r) {
  const G = JOC, q = G.preg[G.i];
  G.resp[G.i] = r;
  if (q.el) P.resElem(G.id, q.el, r.ok);
  pintaPregunta();
  if (G.cr) setTimeout(() => { if (JOC === G && G.resp[G.i] && Date.now() < G.fi) { G.i++; G.preg.push(genera(G.id, G.mode)); pintaPregunta(); } }, r.ok ? 450 : 1100);
}
function pintaPregunta() {
  const G = JOC, joc = JOCS.find(j => j.id === G.id);
  if (!G.cr && G.i >= G.preg.length) return resultatJoc();
  if (G.cr && Date.now() >= G.fi) return resultatJoc();
  const q = G.preg[G.i], r = G.resp[G.i], respost = r !== undefined;
  let mo = null;
  if (q.toc === 'com') mo = respost ? {bona: q.bona, dolenta: r.ok ? null : r.tocada} : {toc: 'com'};
  else if (q.toc === 'riu') mo = respost ? {rius: GEO.rius.map(x => ({...x, res: x.nom === q.bona, mal: !r.ok && x.nom === r.tocada}))} : {toc: 'riu', rius: GEO.rius};
  else if (q.toc === 'qualsevol') mo = respost ? {cims: [{...q.cim, ref: q.cim, res: true}], punt: r.punt, linia: [r.punt, q.cim]} : {toc: 'qualsevol'};
  else if (respost && q.mapaDespres) mo = q.mapaDespres;
  else if (q.mapa) mo = q.mapa;
  if (mo && !mo.fons && (G.id === 'muntanyes' || G.id === 'rius' || G.id === 'relleu')) mo = {...mo, fons: 'mixt'};
  const s = Math.max(0, Math.ceil((G.fi - Date.now()) / 1000));
  $('#app').innerHTML = `
    <div class="capcalera-test"><b>${joc.ic} ${esc(joc.nom)}</b><span>${G.cr ? `<span class="temps" id="t-cr">${s} s</span> · ${G.resp.filter(x => x && x.ok).length} encerts` : `${G.i + 1} / ${G.preg.length}`}</span></div>
    <div class="progres-barra"><div style="width:${G.cr ? 100 * s / SEGONS_CR : pct(G.i + (respost ? 1 : 0), G.preg.length)}%"></div></div>
    <div class="targeta">
      <p class="enunciat">${q.text}</p>
      ${mo ? mapa(mo) : ''}
      ${q.op ? `<div class="opcions">${q.op.map((o, k) => {
        const cls = respost ? (k === q.ok ? 'correcta' : (k === r.k ? 'errada' : '')) : '';
        return `<button class="opcio ${cls}" data-k="${k}" ${respost ? 'disabled' : ''}><span class="lletra">${LLETRES[k]})</span><span>${esc(o)}</span></button>`;
      }).join('')}</div>` : ''}
      ${respost ? `<p class="resultat ${r.ok ? 'be' : 'malament'}">${r.ok ? 'Correcta' : 'Incorrecta'}${r.txt ? ': ' + r.txt : ''}</p>
        ${G.cr ? '' : `<div class="explicacio">${q.explica}</div>
        <div class="botons">${q.tema ? `<a class="boto" data-apunts href="#/temari/${D.temes.find(t => t.codi === q.tema).fitxer}">${ico('obre')} Obrir el tema ${q.tema}</a>` : ''}
          <button class="boto principal" id="seg-joc">${G.i < G.preg.length - 1 ? 'Següent →' : 'Veure el resultat'}</button></div>`}` : ''}
    </div>`;
  const m = $('.mapa-joc');
  if (m) zoomMapa(m, respost && q.toc === 'qualsevol' ? null : q.enfoc);
  if (!respost && q.toc === 'com') m.querySelectorAll('.m-com').forEach(p => p.addEventListener('click', () => {
    const nom = GEO.comarques[+p.dataset.i].nom; respon({ok: nom === q.bona, tocada: nom, txt: nom === q.bona ? '' : `has tocat ${esc(nom)}`});
  }));
  if (!respost && q.toc === 'riu') m.querySelectorAll('.m-riu-toc').forEach(p => p.addEventListener('click', e => {
    e.stopPropagation(); const nom = GEO.rius[+p.dataset.r].nom; respon({ok: nom === q.bona, tocada: nom, txt: nom === q.bona ? '' : `aquest és el ${esc(nom)}`});
  }));
  if (!respost && q.toc === 'qualsevol') m.querySelector('svg').addEventListener('click', e => {
    if (m.mogut) return;
    const p = m.aSvg(e.clientX, e.clientY), km = Math.hypot(p.x - q.cim.x, p.y - q.cim.y) * KM_PER_UNITAT;
    respon({ok: km <= 10, punt: p, txt: `${km <= 10 ? 'a' : 'has tocat a'} ${nombre(Math.round(km))} km${km <= 10 ? '' : ' del cim'}`});
  });
  document.querySelectorAll('.opcio[data-k]').forEach(b => b.addEventListener('click', () => {
    if (respost) return; const k = +b.dataset.k; respon({k, ok: k === q.ok});
  }));
  $('#seg-joc')?.addEventListener('click', () => { G.i++; pintaPregunta(); window.scrollTo(0, 0); });
  clearInterval(rellotgeJoc);
  if (G.cr) rellotgeJoc = setInterval(() => {
    const t = Math.max(0, Math.ceil((G.fi - Date.now()) / 1000)), el = $('#t-cr');
    if (!el || JOC !== G) { clearInterval(rellotgeJoc); return; }
    el.textContent = t + ' s'; el.classList.toggle('poc', t <= 10);
    document.querySelector('.progres-barra div').style.width = (100 * t / SEGONS_CR) + '%';
    if (t <= 0) { clearInterval(rellotgeJoc); resultatJoc(); }
  }, 250);
}
function resultatJoc() {
  clearInterval(rellotgeJoc);
  const G = JOC, joc = JOCS.find(j => j.id === G.id);
  const resp = G.cr ? G.resp.filter(Boolean) : G.resp, enc = resp.filter(r => r && r.ok).length;
  let rec = false;
  if (!G.desat) { G.desat = true; if (G.cr) rec = P.recJoc(G.id, enc); else P.resJoc(G.id, enc, G.preg.length); G.recNou = rec; }
  const fallades = G.preg.filter((_, k) => G.resp[k] && !G.resp[k].ok || (!G.cr && !G.resp[k]?.ok));
  const comparteix = G.cr ? `Agents Rurals · contrarellotge ${joc.nom}: ${enc} encerts en ${SEGONS_CR} s` : '';
  $('#app').innerHTML = `<h1>${joc.ic} ${esc(joc.nom)}</h1>
    <div class="targeta repte-fet">
      ${G.cr ? `<div class="xifra">${enc}</div><p>encerts en ${SEGONS_CR} s${resp.length - enc ? ` · ${resp.length - enc} errors` : ''} · rècord: <b>${P.jocs()[G.id].rec}</b>${G.recNou ? ' · <b>nou rècord!</b>' : ''}</p>`
        : `${quadres(G.resp.map(r => (r && r.ok ? 1 : 0)))}<p><b>${enc}/${G.preg.length}</b></p>`}
      ${barraDomini(G.id, joc.plural)}
      <div class="botons"><button class="boto principal" id="altra">${G.cr ? 'Una altra contrarellotge' : 'Una altra partida'}</button>
        ${G.cr ? '<button class="boto" id="comp-cr">Compartir</button>' : ''}<a class="boto" href="#/mapa/${G.id}">Veure al mapa</a></div></div>
    ${fallades.length ? `<h2>Per repassar</h2>${fallades.map(q => `<div class="targeta"><p>${q.text.replace(/^Toca al mapa: /, 'On és ').replace(/^Toca al mapa el riu /, 'On és el riu ').replace(/ Toca el mapa$/, '')}</p><div class="explicacio">${q.explica}</div></div>`).join('')}` : ''}`;
  $('#altra').addEventListener('click', () => comencaJoc(G.id, G.mode, G.cr));
  $('#comp-cr')?.addEventListener('click', async () => {
    const txt = comparteix + '\n' + location.origin + location.pathname;
    try { if (navigator.share) await navigator.share({text: txt}); else { await navigator.clipboard.writeText(txt); avis('Resultat copiat.'); } } catch {}
  });
}

// Minijoc del dia (a l'inici): un joc diferent cada dia
const minijocDelDia = () => JOCS[numRepte(avui()) % JOCS.length];
document.addEventListener('click', async e => {
  const b = e.target.closest('[data-minijoc]'); if (!b) return;
  await carregaGeo(); comencaJoc(b.dataset.minijoc, 'barrejat');
});
rutes.jocs = vistaJocs;
rutes.mapa = vistaMapa;
