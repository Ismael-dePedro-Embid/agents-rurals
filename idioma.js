// Idioma de la interfície. L'app s'escriu en català; si l'usuari tria castellà, aquest fitxer tradueix
// els textos de la interfície a mesura que es pinten (text, placeholder, aria-label, title, label i diàlegs).
// No es tradueix res que sigui dins d'un element amb translate="no": preguntes, opcions, explicacions,
// cites i temari, que es mantenen en català com a l'examen.
// Diccionari: data/es.json, generat a partir de app/i18n/es.json (clau = text català; els números
// variables s'hi escriuen com {0}, {1}...).
(() => {
  let idioma = 'ca';
  try { idioma = (JSON.parse(localStorage.getItem('agents-rurals.progres.v1')) || {}).pref?.ajustos?.idioma || 'ca'; } catch {}
  window.IDIOMA = idioma;
  window.tr = t => t;
  if (idioma !== 'es') return;
  document.documentElement.lang = 'es';
  let D = null, PATRONS = [];
  const NUM = /\d+(?:[.,]\d+)*/g;
  const net = t => t.replace(/\s+/g, ' ').trim();
  function tr(t) {
    if (!D || !t || !/[A-Za-zÀ-ú]/.test(t)) return t;
    const k = net(t); if (!k) return t;
    let r = D[k];
    if (r === undefined) {
      const nums = k.match(NUM);
      let i = 0;
      const plant = nums && D[k.replace(NUM, () => `{${i++}}`)];
      if (plant !== undefined && plant !== null) r = plant.replace(/\{(\d+)\}/g, (_, n) => nums[+n] ?? '');
      else { const p = PATRONS.find(([re]) => re.test(k)); if (!p) return t; r = k.replace(p[0], p[1]); }
    }
    const ini = t.match(/^\s*/)[0], fi = t.match(/\s*$/)[0];
    return ini + r + fi;
  }
  window.tr = tr;
  const ATRS = ['placeholder', 'aria-label', 'title', 'label', 'alt'];
  const exclos = el => el && el.closest && el.closest('[translate="no"], script, style, textarea');
  function tradNode(n) {
    if (n.nodeType === 3) {
      if (exclos(n.parentElement)) return;
      const v = n.nodeValue, t = tr(v); if (t !== v) n.nodeValue = t;
      return;
    }
    if (n.nodeType !== 1 || exclos(n)) return;
    for (const a of ATRS) if (n.hasAttribute(a)) { const v = n.getAttribute(a), t = tr(v); if (t !== v) n.setAttribute(a, t); }
    const w = document.createTreeWalker(n, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
      acceptNode: x => (x.nodeType === 1 && exclos(x) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT)});
    let x; while ((x = w.nextNode())) {
      if (x.nodeType === 3) { const v = x.nodeValue, t = tr(v); if (t !== v) x.nodeValue = t; }
      else for (const a of ATRS) if (x.hasAttribute(a)) { const v = x.getAttribute(a), t = tr(v); if (t !== v) x.setAttribute(a, t); }
    }
  }
  const obs = new MutationObserver(ms => {
    for (const m of ms) {
      if (m.type === 'childList') m.addedNodes.forEach(tradNode);
      else if (m.type === 'characterData') tradNode(m.target);
      else if (m.type === 'attributes' && !exclos(m.target)) {
        const v = m.target.getAttribute(m.attributeName), t = tr(v); if (v != null && t !== v) m.target.setAttribute(m.attributeName, t);
      }
    }
    if (document.title !== tr(document.title)) document.title = tr(document.title);
  });
  const orig = {alert: window.alert, confirm: window.confirm, prompt: window.prompt};
  window.alert = m => orig.alert.call(window, tr(String(m)));
  window.confirm = m => orig.confirm.call(window, tr(String(m)));
  window.prompt = (m, d) => orig.prompt.call(window, tr(String(m)), d);
  // El diccionari es carrega abans que l'app pinti (petició síncrona: és petit i és a la memòria cau)
  try { const x = new XMLHttpRequest(); x.open('GET', 'data/es.json', false); x.send(); D = JSON.parse(x.responseText); } catch { D = {}; }
  PATRONS = (D.__patrons || []).map(([a, b]) => [new RegExp(a), b]);
  const engega = () => { tradNode(document.body); document.title = tr(document.title);
    obs.observe(document.body, {childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATRS}); };
  if (document.body) engega(); else document.addEventListener('DOMContentLoaded', engega);
})();
