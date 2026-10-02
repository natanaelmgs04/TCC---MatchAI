/**
 * Interface sobre a maquete — a mesma coreografia do vídeo de referência,
 * com a identidade do match.IA:
 *  - painel "Defina o clima" (presets, medidores, frase viva, moodboard 3×3);
 *  - etiquetas flutuantes ligadas por um fio até a peça;
 *  - bandeja de materiais com abas (arrastar até uma superfície ou clicar);
 *  - painel "Luz do dia" (miniaturas reais + barra) e o sol arrastável no arco;
 *  - barra de ferramentas, modo ambiente (sem UI), resumo final "Seu projeto".
 *
 * A UI nunca mexe na cena: só chama o store (ou a `api` do main.js) e
 * redesenha quando o store avisa (update()). Tudo é gerado a partir de
 * data/options.js — nada de opções repetidas no HTML.
 */
import { SURFACES, FLOATING_LABELS, TABS, MATERIALS, MATERIAL_BY_ID, PRESETS, DAYLIGHT, DAY_START, DAY_END, MOOD_WORDS } from './data/options.js';
import { computeMood, describe, formatTime, daylightLabel } from './preferences.js';
import { swatchURL, meanColor } from './textures.js';

const SURFACE_BY_ID = Object.fromEntries(SURFACES.map((s) => [s.id, s]));
const TAB_LABEL = Object.fromEntries(TABS.map((t) => [t.id, t.label.toLowerCase()]));
const ROOM_ORDER = ['sala', 'jantar', 'quarto', 'escritorio'];
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const listPt = (arr) => (arr.length > 1 ? `${arr.slice(0, -1).join(', ')} ou ${arr[arr.length - 1]}` : arr[0]);

const ICONS = {
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
  redo: '<path d="m15 14 5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/>',
  save: '<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  camera: '<rect x="2" y="6" width="14" height="12" rx="2"/><path d="m16 13 5 3V8l-5 3"/>',
  help: '<circle cx="12" cy="12" r="9.5"/><path d="M9.2 9.2a2.9 2.9 0 0 1 5.6 1c0 1.9-2.8 2.7-2.8 2.7"/><path d="M12 17h.01"/>',
  sunrise: '<path d="M12 3v5"/><path d="m9 5 3-3 3 3"/><path d="m4.9 10.9 1.4 1.4"/><path d="m19.1 10.9-1.4 1.4"/><path d="M2 18h2M20 18h2M3 21h18"/><path d="M16 18a4 4 0 0 0-8 0"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  lamp: '<path d="M8 3h8l3 8H5z"/><path d="M12 11v8"/><path d="M8 21h8"/>',
  moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z"/>',
  left: '<path d="M19 12H5"/><path d="m12 19-7-7 7-7"/>',
  right: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  drop: '<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/>',
  move: '<path d="M12 2v20M2 12h20"/><path d="m9 5 3-3 3 3M9 19l3 3 3-3M5 9l-3 3 3 3M19 9l3 3-3 3"/>',
  sliders: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
};
const icon = (name) => `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${ICONS[name]}</svg>`;

export function createUI(host, api) {
  const { store, gsap, reduceMotion, house } = api;
  const root = host.querySelector('[data-x3-ui]');
  const stage = host.querySelector('[data-x3-stage]');
  const live = host.querySelector('[data-x3-live]');
  const canvas = stage.querySelector('canvas');
  const cleanups = [];
  const on = (el, ev, fn, opt) => { el.addEventListener(ev, fn, opt); cleanups.push(() => el.removeEventListener(ev, fn, opt)); };

  let selectedSurface = 'piso';
  let tab = 'madeira';
  let labelsOn = true;
  let room = null;
  let movingFurniture = null; // escolhido pela bandeja (teclado)
  let shownTime = store.get().time;

  // ------------------------------------------------------------------ DOM
  const strip = (p) => ['paredes', 'piso', 'estofados', 'detalhes'].map((k) => `<i style="background:${meanColor(MATERIAL_BY_ID[p.surfaces[k]])}"></i>`).join('');
  root.innerHTML = `
    <aside class="x3-panel x3-mood" aria-label="Clima e moodboard">
      <div class="x3-mood-top">
        <a class="x3-logo" href="index.html" aria-label="match.IA, página inicial">match<span>.IA</span></a>
        <button type="button" class="x3-textbtn" data-act="back">${icon('left')}Formulário</button>
        <button type="button" class="x3-sheet-close" data-act="close-sheet" aria-label="Fechar painel">${icon('x')}</button>
      </div>
      <p class="x3-eyebrow">Se esta fosse a sua casa</p>
      <h1 class="x3-title">Defina o <em>clima</em></h1>
      <p class="x3-lead">Como você organizaria as coisas? Que estilo colocaria? Arraste madeira, pedra, tecido e tinta para qualquer superfície, mova os móveis e puxe o sol pelo céu.</p>
      <div class="x3-presets" role="radiogroup" aria-label="Climas prontos">
        ${PRESETS.map((p) => `<button type="button" class="x3-preset" role="radio" aria-checked="false" data-preset="${p.id}"><span class="x3-strip">${strip(p)}</span><b>${p.label}</b><small>${p.sub}</small></button>`).join('')}
      </div>
      <div class="x3-meters" aria-label="Medidor de clima">
        ${['cozy', 'bright', 'moody'].map((k) => `<div class="x3-meter" data-meter="${k}"><span>${MOOD_WORDS[k]}</span><b>0%</b><i><s></s></i></div>`).join('')}
      </div>
      <p class="x3-sentence" data-sentence></p>
      <section class="x3-board" aria-labelledby="x3BoardTitle">
        <header><h2 id="x3BoardTitle">Moodboard</h2><span>clique numa superfície</span></header>
        <div class="x3-board-grid">
          ${SURFACES.map((s) => `<button type="button" class="x3-cell" data-surface="${s.id}" aria-pressed="false"><img alt="" data-swatch draggable="false"><small>${s.label}</small><b data-mat></b></button>`).join('')}
        </div>
      </section>
    </aside>

    <aside class="x3-panel x3-day" aria-label="Luz do dia">
      <header><h2>Luz do dia</h2><b data-clock></b><button type="button" class="x3-sheet-close" data-act="close-sheet" aria-label="Fechar painel">${icon('x')}</button></header>
      <div class="x3-day-list">
        ${DAYLIGHT.map((d) => `<button type="button" class="x3-dayopt" data-day="${d.id}" data-time="${d.time}" aria-pressed="false"><span class="x3-dayicon">${icon(d.icon)}</span><span class="x3-daythumb"><img alt="" data-thumb="${d.id}" hidden></span><span class="x3-daytxt"><b>${d.label}</b><small>${formatTime(d.time)}</small></span></button>`).join('')}
      </div>
      <label class="x3-range"><span class="x3-sr">Horário do dia</span><input type="range" min="${DAY_START}" max="${DAY_END}" step="5" data-time-range></label>
    </aside>

    <div class="x3-mhead" aria-hidden="true"><span class="x3-logo">match<span>.IA</span></span><b>Defina o <em>clima</em></b></div>

    <div class="x3-toolbar" role="toolbar" aria-label="Ferramentas">
      <button type="button" data-act="undo" aria-label="Desfazer (Ctrl+Z)" title="Desfazer">${icon('undo')}</button>
      <button type="button" data-act="redo" aria-label="Refazer (Ctrl+Shift+Z)" title="Refazer">${icon('redo')}</button>
      <span class="x3-sep" aria-hidden="true"></span>
      <button type="button" data-act="save" aria-label="Salvar imagem" title="Salvar imagem">${icon('save')}</button>
      <button type="button" data-act="link" aria-label="Copiar link desta combinação" title="Copiar link">${icon('link')}</button>
      <button type="button" data-act="labels" aria-label="Mostrar etiquetas" aria-pressed="true" title="Etiquetas">${icon('eye')}</button>
      <button type="button" data-act="camera" aria-label="Percorrer os ambientes" title="Ambientes">${icon('camera')}</button>
      <button type="button" data-act="help" aria-label="Como usar" title="Como usar">${icon('help')}</button>
    </div>

    <div class="x3-tray">
      <div class="x3-tabs" role="tablist" aria-label="Materiais e móveis">
        ${TABS.map((t) => `<button type="button" role="tab" id="x3tab-${t.id}" aria-controls="x3TrayPanel" aria-selected="false" tabindex="-1" data-tab="${t.id}">${t.label}</button>`).join('')}
      </div>
      <p class="x3-tray-hint" data-hint></p>
      <div class="x3-swatches" id="x3TrayPanel" role="tabpanel" data-swatches></div>
    </div>

    <div class="x3-dock">
      <button type="button" class="x3-mbtn" data-act="sheet-mood">${icon('sliders')}Clima</button>
      <button type="button" class="x3-mbtn" data-act="sheet-day">${icon('sun')}Luz</button>
      <button type="button" class="x3-finish" data-act="finish">Concluir${icon('right')}</button>
    </div>

    <div class="x3-roombar" data-roombar hidden>
      <button type="button" data-act="overview">${icon('left')}Voltar à maquete</button>
      <b data-room></b>
      <button type="button" data-act="next-room" aria-label="Próximo ambiente">${icon('right')}</button>
    </div>

    <div class="x3-toast" data-toast aria-hidden="true"></div>`;

  // Camadas presas à cena (etiquetas, fios, arco do sol): não recebem foco — o moodboard e a barra de luz são o caminho acessível.
  const overlay = document.createElement('div');
  overlay.className = 'x3-overlay';
  overlay.setAttribute('aria-hidden', 'true');
  overlay.innerHTML = `
    <svg class="x3-sunarc" data-sunarc><path data-arc /></svg>
    <svg class="x3-leaders" data-leaders>${FLOATING_LABELS.map((id) => `<g data-leader="${id}"><line /><circle r="3.8" /></g>`).join('')}</svg>
    ${FLOATING_LABELS.map((id) => `<button type="button" class="x3-flabel" tabindex="-1" data-flabel="${id}"><img alt="" draggable="false"><b></b><small>${SURFACE_BY_ID[id].label}</small></button>`).join('')}
    <div class="x3-sun" data-sun><span class="x3-sun-dot" data-sun-icon></span><b data-sun-time></b></div>`;
  stage.appendChild(overlay);

  const $ = (sel, el = root) => el.querySelector(sel);
  const $$ = (sel, el = root) => [...el.querySelectorAll(sel)];
  const els = {
    mood: $('.x3-mood'), day: $('.x3-day'), tray: $('.x3-tray'), toolbar: $('.x3-toolbar'), dock: $('.x3-dock'),
    presets: $$('[data-preset]'), meters: $$('[data-meter]'), sentence: $('[data-sentence]'), cells: $$('[data-surface]'),
    clock: $('[data-clock]'), dayopts: $$('[data-day]'), range: $('[data-time-range]'),
    tabs: $$('[data-tab]'), hint: $('[data-hint]'), swatches: $('[data-swatches]'),
    undo: $('[data-act="undo"]'), redo: $('[data-act="redo"]'), labels: $('[data-act="labels"]'),
    roombar: $('[data-roombar]'), roomName: $('[data-room]'), toast: $('[data-toast]'),
    flabels: Object.fromEntries(FLOATING_LABELS.map((id) => [id, overlay.querySelector(`[data-flabel="${id}"]`)])),
    leaders: Object.fromEntries(FLOATING_LABELS.map((id) => [id, overlay.querySelector(`[data-leader="${id}"]`)])),
    leaderSvg: overlay.querySelector('[data-leaders]'), arc: overlay.querySelector('[data-arc]'), arcSvg: overlay.querySelector('[data-sunarc]'),
    sun: overlay.querySelector('[data-sun]'), sunIcon: overlay.querySelector('[data-sun-icon]'), sunTime: overlay.querySelector('[data-sun-time]'),
  };

  // ------------------------------------------------------------------ avisos
  let liveTimer = null;
  function announce(msg) {
    clearTimeout(liveTimer);
    live.textContent = '';
    liveTimer = setTimeout(() => { live.textContent = msg; }, 40);
  }
  let toastTimer = null;
  function toast(msg) {
    els.toast.textContent = msg;
    els.toast.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => els.toast.classList.remove('is-on'), 2400);
    announce(msg);
  }

  // ------------------------------------------------------------------ superfície escolhida + bandeja
  function selectSurface(id, { pulse = true } = {}) {
    selectedSurface = id;
    const s = SURFACE_BY_ID[id];
    if (tab === 'moveis' || !s.accepts.includes(tab)) setTab(s.accepts[0], { keepSurface: true });
    els.cells.forEach((c) => { const sel = c.dataset.surface === id; c.classList.toggle('is-selected', sel); c.setAttribute('aria-pressed', String(sel)); });
    Object.entries(els.flabels).forEach(([k, el]) => el.classList.toggle('is-selected', k === id));
    renderHint();
    if (pulse) { api.hover(id); clearTimeout(selectSurface.t); selectSurface.t = setTimeout(() => api.hover(null), 900); }
  }

  function setTab(next, { keepSurface = false, focus = false } = {}) {
    tab = next;
    els.tabs.forEach((b) => { const sel = b.dataset.tab === tab; b.setAttribute('aria-selected', String(sel)); b.tabIndex = sel ? 0 : -1; if (sel && focus) b.focus(); });
    els.swatches.setAttribute('aria-labelledby', `x3tab-${tab}`);
    if (tab !== 'moveis' && !keepSurface && !SURFACE_BY_ID[selectedSurface].accepts.includes(tab)) {
      selectSurface(SURFACES.find((s) => s.accepts.includes(tab)).id, { pulse: false });
    }
    renderSwatches();
    renderHint();
  }

  function renderSwatches() {
    if (tab === 'moveis') {
      els.swatches.innerHTML = [...house.furniture.values()].map((f) =>
        `<button type="button" class="x3-furn${movingFurniture === f.id ? ' is-active' : ''}" data-furn="${f.id}" aria-pressed="${movingFurniture === f.id}"><b>${esc(f.label)}</b><small>${esc(f.area || '')}</small></button>`).join('');
      return;
    }
    const used = new Set(Object.values(store.get().surfaces));
    const ids = MATERIALS.filter((m) => m.tab === tab).map((m) => m.id);
    setTimeout(() => api.prefetch?.(ids), 1200); // depois do carregamento inicial
    els.swatches.innerHTML = MATERIALS.filter((m) => m.tab === tab).map((m) =>
      `<button type="button" class="x3-swatch${used.has(m.id) ? ' is-used' : ''}" data-mat="${m.id}"><img src="${swatchURL(m)}" alt="" draggable="false"><span>${esc(m.label)}</span><em class="x3-sr">${used.has(m.id) ? ' (em uso)' : ''}</em></button>`).join('');
    if (!reduceMotion) gsap.from(els.swatches.children, { opacity: 0, y: 8, duration: 0.35, stagger: 0.035, ease: 'matchOut' });
  }

  function renderHint() {
    if (tab === 'moveis') {
      els.hint.innerHTML = movingFurniture
        ? `Movendo <b>${esc(house.furniture.get(movingFurniture).label)}</b> — use as setas, <kbd>Enter</kbd> para soltar`
        : 'Arraste os móveis direto na maquete — ou escolha um aqui e mova com as setas';
      return;
    }
    els.hint.innerHTML = `Arraste até uma superfície ou clique para aplicar em <b>${esc(SURFACE_BY_ID[selectedSurface].label)}</b>`;
  }

  function refreshUsed(state) {
    if (tab === 'moveis') return;
    const used = new Set(Object.values(state.surfaces));
    $$('[data-mat]', els.swatches).forEach((b) => {
      const u = used.has(b.dataset.mat);
      b.classList.toggle('is-used', u);
      b.querySelector('em').textContent = u ? ' (em uso)' : '';
    });
  }

  function applyMaterial(matId, surfaceId = selectedSurface, meta = {}) {
    const mat = MATERIAL_BY_ID[matId], s = SURFACE_BY_ID[surfaceId];
    if (!s.accepts.includes(mat.tab)) { toast(`${s.label} aceita ${listPt(s.accepts.map((t) => TAB_LABEL[t]))}.`); return false; }
    if (!store.setSurface(surfaceId, matId, meta)) { toast(`${mat.label} já está em ${s.label.toLowerCase()}.`); return false; }
    return true;
  }

  // ------------------------------------------------------------------ arrastar amostra → superfície
  let drag = null;
  let suppressClick = false;
  let raf = 0;

  function onSwatchDown(e) {
    const btn = e.target.closest('[data-mat]');
    if (!btn || e.button !== 0) return;
    drag = { mat: MATERIAL_BY_ID[btn.dataset.mat], btn, id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, active: false, touch: e.pointerType !== 'mouse', pick: null };
  }
  function onPointerMove(e) {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x0, dy = e.clientY - drag.y0;
    if (!drag.active) {
      if (Math.hypot(dx, dy) < 6) return;
      // No toque, gesto lateral rola a bandeja; só "para cima" vira arraste.
      if (drag.touch && !(dy < 0 && Math.abs(dy) > Math.abs(dx))) { drag = null; return; }
      startDrag();
    }
    drag.x = e.clientX; drag.y = e.clientY;
    if (!raf) raf = requestAnimationFrame(dragFrame);
  }
  function startDrag() {
    drag.active = true;
    document.body.classList.add('x3-dragging');
    drag.ghost = document.createElement('div');
    drag.ghost.className = 'x3-ghost';
    drag.ghost.innerHTML = `<div class="x3-ghost-in"><img src="${swatchURL(drag.mat)}" alt=""><span>${esc(drag.mat.label)}</span></div>`;
    drag.tip = document.createElement('div');
    drag.tip.className = 'x3-tip';
    host.append(drag.ghost, drag.tip);
    if (!reduceMotion) gsap.from(drag.ghost.firstElementChild, { scale: 0.6, opacity: 0, duration: 0.25, ease: 'matchSpring' });
  }
  function pickAt(x, y) {
    const under = document.elementFromPoint(x, y);
    if (under !== canvas) return null;
    return api.pickSurface(x, y);
  }
  function dragFrame() {
    raf = 0;
    if (!drag?.active) return;
    const { x, y, mat } = drag;
    drag.ghost.style.transform = `translate3d(${x - 34}px, ${y - 44}px, 0) rotate(-5deg)`;
    drag.tip.style.transform = `translate3d(${x + 22}px, ${y + 18}px, 0)`;
    const pick = drag.pick = pickAt(x, y);
    if (!pick) { api.hover(null); drag.tip.classList.remove('is-on'); return; }
    const s = SURFACE_BY_ID[pick.surface];
    const ok = s.accepts.includes(mat.tab);
    api.hover(ok ? s.id : null);
    drag.tip.classList.add('is-on');
    drag.tip.classList.toggle('is-no', !ok);
    drag.tip.innerHTML = ok
      ? `<b>${esc(s.label)}</b><span>solte para aplicar ${esc(mat.label.toLowerCase())} aqui</span>`
      : `<b>${esc(s.label)}</b><span>aceita ${listPt(s.accepts.map((t) => TAB_LABEL[t]))}</span>`;
  }
  function onPointerUp(e) {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag;
    drag = null;
    if (!d.active) return; // foi um clique: o handler de click aplica
    suppressClick = true;
    setTimeout(() => { suppressClick = false; }, 0);
    document.body.classList.remove('x3-dragging');
    cancelAnimationFrame(raf); raf = 0;
    api.hover(null);
    d.tip.remove();
    const pick = pickAt(e.clientX, e.clientY);
    const s = pick && SURFACE_BY_ID[pick.surface];
    if (s && s.accepts.includes(d.mat.tab)) {
      selectSurface(s.id, { pulse: false });
      if (applyMaterial(d.mat.id, s.id, { point: pick.point, source: 'drop' })) dropEffect(e.clientX, e.clientY, d.mat);
      d.ghost.remove();
      return;
    }
    // Sem destino: a amostra volta para a bandeja.
    const r = d.btn.getBoundingClientRect();
    if (reduceMotion) { d.ghost.remove(); return; }
    const g = { x: e.clientX - 34, y: e.clientY - 44, s: 1, o: 1 };
    gsap.to(g, {
      x: r.left, y: r.top, s: 0.7, o: 0, duration: 0.35, ease: 'matchOut',
      onUpdate: () => { d.ghost.style.transform = `translate3d(${g.x}px, ${g.y}px, 0) rotate(-5deg) scale(${g.s})`; d.ghost.style.opacity = g.o; },
      onComplete: () => d.ghost.remove(),
    });
  }
  function onPointerCancel(e) {
    if (!drag || e.pointerId !== drag.id) return;
    drag.ghost?.remove(); drag.tip?.remove();
    document.body.classList.remove('x3-dragging');
    api.hover(null);
    drag = null;
  }
  /** Ladrilho com anel de luz no ponto onde a amostra foi solta. */
  function dropEffect(x, y, mat) {
    if (reduceMotion) return;
    const el = document.createElement('div');
    el.className = 'x3-drop';
    el.style.left = `${x}px`; el.style.top = `${y}px`;
    el.innerHTML = `<img src="${swatchURL(mat)}" alt=""><i></i><i></i>`;
    host.appendChild(el);
    setTimeout(() => el.remove(), 1100);
  }

  on(els.swatches, 'pointerdown', onSwatchDown);
  on(window, 'pointermove', onPointerMove);
  on(window, 'pointerup', onPointerUp);
  on(window, 'pointercancel', onPointerCancel);
  on(els.swatches, 'click', (e) => {
    if (suppressClick) return;
    const mat = e.target.closest('[data-mat]');
    if (mat) { applyMaterial(mat.dataset.mat); return; }
    const furn = e.target.closest('[data-furn]');
    if (furn) toggleFurniture(furn.dataset.furn);
  });
  // Arrastar a imagem nativa do <img> atrapalharia o arraste próprio.
  on(els.swatches, 'dragstart', (e) => e.preventDefault());

  // ------------------------------------------------------------------ móveis pelo teclado
  function toggleFurniture(id) {
    if (movingFurniture === id) { api.dropFurniture(); movingFurniture = null; }
    else {
      if (room) api.overview();
      movingFurniture = api.selectFurniture(id) ? id : null;
      if (movingFurniture) announce(`Movendo ${house.furniture.get(id).label.toLowerCase()}. Use as setas e Enter para soltar.`);
    }
    renderSwatches(); renderHint();
    els.swatches.querySelector(`[data-furn="${id}"]`)?.focus();
  }

  // ------------------------------------------------------------------ abas (setas como em um tablist)
  on(els.tabs[0].parentElement, 'click', (e) => { const b = e.target.closest('[data-tab]'); if (b) { if (movingFurniture) toggleFurniture(movingFurniture); setTab(b.dataset.tab); } });
  on(els.tabs[0].parentElement, 'keydown', (e) => {
    const d = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
    if (!d) return;
    e.preventDefault();
    const i = TABS.findIndex((t) => t.id === tab);
    setTab(TABS[(i + d + TABS.length) % TABS.length].id, { focus: true });
  });

  // ------------------------------------------------------------------ moodboard, etiquetas, clique no 3D
  on(els.mood, 'click', (e) => {
    const cell = e.target.closest('[data-surface]');
    if (cell) { selectSurface(cell.dataset.surface); return; }
    const p = e.target.closest('[data-preset]');
    if (p) { store.applyPreset(p.dataset.preset); }
  });
  on(els.presets[0].parentElement, 'keydown', (e) => {
    const d = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!d) return;
    e.preventDefault();
    const i = els.presets.indexOf(document.activeElement);
    els.presets[(i + d + els.presets.length) % els.presets.length].focus();
  });
  on(overlay, 'click', (e) => { const l = e.target.closest('[data-flabel]'); if (l) selectSurface(l.dataset.flabel); });
  let downAt = null;
  on(canvas, 'pointerdown', (e) => { downAt = { x: e.clientX, y: e.clientY }; });
  on(canvas, 'pointerup', (e) => {
    const start = downAt;
    downAt = null; // arraste de móvel não passa pelo pointerdown do canvas (interaction.js para a propagação)
    if (!start || Math.hypot(e.clientX - start.x, e.clientY - start.y) > 5) return;
    const pick = api.pickSurface(e.clientX, e.clientY);
    if (pick) selectSurface(pick.surface);
  });

  // ------------------------------------------------------------------ luz do dia
  let dayTween = null;
  function tweenTime(target) {
    dayTween?.kill();
    const from = store.get().time;
    if (reduceMotion) { store.setTime(target); return; }
    const o = { t: from };
    dayTween = gsap.to(o, {
      t: target, duration: 1.1, ease: 'matchOut',
      onUpdate: () => store.setTime(o.t, { transient: true }),
      onComplete: () => { dayTween = null; store.commitTime(from); },
    });
  }
  on(els.day, 'click', (e) => { const b = e.target.closest('[data-day]'); if (b) tweenTime(Number(b.dataset.time)); });
  let rangeFrom = null;
  on(els.range, 'input', () => {
    dayTween?.kill();
    if (rangeFrom == null) rangeFrom = store.get().time;
    store.setTime(Number(els.range.value), { transient: true });
  });
  on(els.range, 'change', () => { if (rangeFrom != null) store.commitTime(rangeFrom); rangeFrom = null; });

  // Sol arrastável no arco
  const TH0 = Math.PI - 0.12, TH1 = Math.PI * 2 + 0.42;
  let arc = { cx: 0, cy: 0, rx: 1, ry: 1 };
  const uOf = (t) => (t - DAY_START) / (DAY_END - DAY_START);
  const arcPoint = (u) => { const th = TH0 + u * (TH1 - TH0); return { x: arc.cx + arc.rx * Math.cos(th), y: arc.cy + arc.ry * Math.sin(th) }; };
  function layoutArc() {
    const W = stage.clientWidth, H = stage.clientHeight;
    const dayLeft = els.day.getBoundingClientRect().left - stage.getBoundingClientRect().left;
    arc = { cx: W * 0.5, cy: H * 0.6, rx: clamp(dayLeft - 40 - W * 0.5, W * 0.24, W * 0.42), ry: H * 0.5 };
    els.arcSvg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    els.leaderSvg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    let d = '';
    for (let i = 0; i <= 72; i++) { const p = arcPoint(i / 72); d += `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`; }
    els.arc.setAttribute('d', d);
  }
  let sunDrag = null;
  on(els.sun, 'pointerdown', (e) => {
    e.preventDefault();
    dayTween?.kill();
    els.sun.setPointerCapture(e.pointerId);
    sunDrag = { id: e.pointerId, from: store.get().time };
    els.sun.classList.add('is-dragging');
  });
  on(els.sun, 'pointermove', (e) => {
    if (!sunDrag || e.pointerId !== sunDrag.id) return;
    const r = stage.getBoundingClientRect();
    let th = Math.atan2((e.clientY - r.top - arc.cy) / arc.ry, (e.clientX - r.left - arc.cx) / arc.rx);
    if (th < 1.72) th += Math.PI * 2;
    const u = clamp((th - TH0) / (TH1 - TH0), 0, 1);
    store.setTime(DAY_START + u * (DAY_END - DAY_START), { transient: true });
  });
  const endSun = (e) => {
    if (!sunDrag || e.pointerId !== sunDrag.id) return;
    store.commitTime(sunDrag.from);
    sunDrag = null;
    els.sun.classList.remove('is-dragging');
  };
  on(els.sun, 'pointerup', endSun);
  on(els.sun, 'pointercancel', endSun);

  /** Tudo que depende só da hora (chamado também a cada quadro do tween de preset). */
  function daylight(t) {
    shownTime = t;
    const m = Math.round(t);
    els.clock.textContent = formatTime(m);
    if (rangeFrom == null) els.range.value = String(m);
    els.range.style.setProperty('--p', `${(uOf(t) * 100).toFixed(2)}%`);
    els.range.setAttribute('aria-valuetext', `${formatTime(m)}, ${daylightLabel(m)}`);
    const near = DAYLIGHT.reduce((a, b) => (Math.abs(b.time - t) < Math.abs(a.time - t) ? b : a));
    els.dayopts.forEach((b) => { const on = b.dataset.day === near.id && Math.abs(near.time - t) <= 40; b.classList.toggle('is-active', on); b.setAttribute('aria-pressed', String(on)); });
    const p = arcPoint(uOf(t));
    els.sun.style.transform = `translate3d(${p.x}px, ${p.y}px, 0)`;
    els.sunTime.textContent = formatTime(m);
    const night = t >= 19.5 * 60;
    if (els.sunIcon.dataset.kind !== String(night)) { els.sunIcon.dataset.kind = String(night); els.sunIcon.innerHTML = icon(night ? 'moon' : 'sun'); }
    host.style.setProperty('--x3-night', String(clamp((t - 1110) / 150, 0, 1)));
  }

  // ------------------------------------------------------------------ etiquetas flutuantes (seguem a câmera)
  let bounds = { min: 0, max: 0, top: 64 };
  function layoutBounds() {
    const r = stage.getBoundingClientRect();
    const mood = els.mood.getBoundingClientRect(), day = els.day.getBoundingClientRect();
    bounds = { min: mood.right - r.left + 56, max: day.left - r.left - 56, top: Math.max(64, els.toolbar.getBoundingClientRect().bottom - r.top + 12) };
  }
  const CARD_H = 100, GAP = 112;
  function placeLabels() {
    if (!labelsOn || room || stage.clientWidth < 900) return;
    const items = FLOATING_LABELS.map((id) => ({ id, p: api.project(house.anchors[id]) })).filter((i) => i.p.visible);
    items.sort((a, b) => a.p.x - b.p.x);
    const xs = items.map((i) => clamp(i.p.x, bounds.min, bounds.max));
    for (let i = 1; i < xs.length; i++) xs[i] = Math.max(xs[i], xs[i - 1] + GAP);
    if (xs.length) xs[xs.length - 1] = Math.min(xs[xs.length - 1], bounds.max);
    for (let i = xs.length - 2; i >= 0; i--) xs[i] = Math.min(xs[i], xs[i + 1] - GAP);
    const top = bounds.top;
    items.forEach(({ id, p }, i) => {
      const x = xs[i];
      els.flabels[id].style.transform = `translate3d(${x - 42}px, ${top}px, 0)`;
      const g = els.leaders[id], line = g.firstElementChild, dot = g.lastElementChild;
      const show = p.y > top + CARD_H + 12;
      g.style.opacity = show ? '' : '0';
      line.setAttribute('x1', x); line.setAttribute('y1', top + CARD_H + 4);
      line.setAttribute('x2', p.x); line.setAttribute('y2', p.y);
      dot.setAttribute('cx', p.x); dot.setAttribute('cy', p.y);
    });
  }
  const stopRender = api.ctx.onRender(placeLabels);
  const ro = new ResizeObserver(() => { layoutBounds(); layoutArc(); daylight(shownTime); placeLabels(); });
  ro.observe(host);

  // ------------------------------------------------------------------ ferramentas
  const actions = {
    back: () => api.back(),
    undo: () => { if (store.canUndo()) { store.undo(); announce('Alteração desfeita.'); } },
    redo: () => { if (store.canRedo()) { store.redo(); announce('Alteração refeita.'); } },
    save: () => {
      api.capture(1800).toBlob((blob) => {
        if (!blob) return;
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'match-ia-minha-casa.png';
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1500);
        toast('Imagem salva.');
      }, 'image/png');
    },
    link: async () => {
      const s = store.get();
      const json = JSON.stringify({ preset: s.preset, surfaces: s.surfaces, time: s.time, furniture: s.furniture });
      const b64 = btoa(String.fromCharCode(...new TextEncoder().encode(json))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      const url = `${location.origin}${location.pathname}#cfg=${b64}`;
      history.replaceState(null, '', `#cfg=${b64}`);
      try { await navigator.clipboard.writeText(url); toast('Link desta combinação copiado.'); }
      catch { toast('Link pronto na barra de endereço.'); }
    },
    labels: () => {
      labelsOn = !labelsOn;
      els.labels.setAttribute('aria-pressed', String(labelsOn));
      els.labels.setAttribute('aria-label', labelsOn ? 'Esconder etiquetas' : 'Mostrar etiquetas');
      host.classList.toggle('no-labels', !labelsOn);
      if (labelsOn) placeLabels();
    },
    camera: () => {
      const i = room ? ROOM_ORDER.indexOf(room.id) : -1;
      if (i === ROOM_ORDER.length - 1) api.overview();
      else api.enterRoom(ROOM_ORDER[i + 1]);
    },
    'next-room': () => actions.camera(),
    overview: () => api.overview(),
    help: () => openHelp(),
    finish: () => openSummary(),
    'sheet-mood': () => toggleSheet('mood'),
    'sheet-day': () => toggleSheet('day'),
    'close-sheet': () => toggleSheet(null),
  };
  on(root, 'click', (e) => {
    const b = e.target.closest('[data-act]');
    if (b && actions[b.dataset.act]) actions[b.dataset.act]();
  });
  function toggleSheet(which) {
    const cur = host.dataset.sheet || '';
    const next = which && cur !== which ? which : '';
    host.dataset.sheet = next;
    if (next) (next === 'mood' ? els.mood : els.day).querySelector('button')?.focus();
  }

  // ------------------------------------------------------------------ teclado global
  on(window, 'keydown', (e) => {
    const typing = e.target.closest?.('input, textarea, select');
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !typing) { e.preventDefault(); e.shiftKey ? actions.redo() : actions.undo(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y' && !typing) { e.preventDefault(); actions.redo(); return; }
    if (dialog) return; // diálogos cuidam do próprio teclado
    if (movingFurniture && !typing) {
      const step = e.shiftKey ? 0.05 : 0.2;
      const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
      if (d) { e.preventDefault(); api.nudge(d[0], d[1]); return; }
      if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); toggleFurniture(movingFurniture); return; }
    }
    if (e.key === 'Escape') {
      if (host.dataset.sheet) toggleSheet(null);
      else if (room) api.overview();
    }
  });

  // ------------------------------------------------------------------ diálogos (ajuda e resumo)
  let dialog = null;
  function openDialog(html, cls, labelledby) {
    closeDialog();
    const last = document.activeElement;
    const el = document.createElement('div');
    el.className = `x3-dialog ${cls}`;
    el.innerHTML = `<div class="x3-dialog-card" role="dialog" aria-modal="true" aria-labelledby="${labelledby}">${html}</div>`;
    host.appendChild(el);
    const keydown = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); closeDialog(); return; }
      if (e.key !== 'Tab') return;
      const f = [...el.querySelectorAll('button, a[href], [tabindex="0"]')].filter((x) => !x.disabled);
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    };
    el.addEventListener('keydown', keydown);
    el.addEventListener('click', (e) => { if (e.target === el || e.target.closest('[data-close]')) closeDialog(); });
    dialog = { el, last };
    host.classList.add('has-dialog');
    requestAnimationFrame(() => el.classList.add('is-open'));
    (el.querySelector('[data-autofocus]') || el.querySelector('button'))?.focus();
    return el;
  }
  function closeDialog() {
    if (!dialog) return;
    const { el, last } = dialog;
    dialog = null;
    host.classList.remove('has-dialog');
    el.classList.remove('is-open');
    setTimeout(() => el.remove(), reduceMotion ? 0 : 320);
    last?.focus?.();
  }

  function openHelp() {
    openDialog(`
      <button type="button" class="x3-dialog-x" data-close aria-label="Fechar">${icon('x')}</button>
      <p class="x3-eyebrow">Como usar</p>
      <h2 id="x3HelpTitle">Monte a casa do seu jeito</h2>
      <ul class="x3-help">
        <li>${icon('drop')}<span><b>Materiais</b> Arraste uma amostra da bandeja até o piso, as paredes, o sofá… ou escolha a superfície no moodboard e clique na amostra.</span></li>
        <li>${icon('move')}<span><b>Móveis</b> Clique num móvel e arraste: ele se levanta e pousa onde você soltar. Pela aba Móveis dá para mover com as setas.</span></li>
        <li>${icon('sun')}<span><b>Luz</b> Puxe o sol pelo arco ou use a barra de Luz do dia para ver a casa de manhã, à tarde ou à noite.</span></li>
        <li>${icon('camera')}<span><b>Ambientes</b> Dê dois cliques no piso de um cômodo (ou use o botão da câmera) para entrar nele. Esc volta à maquete.</span></li>
        <li>${icon('undo')}<span><b>Desfazer</b> Ctrl+Z desfaz e Ctrl+Shift+Z refaz.</span></li>
      </ul>
      <button type="button" class="x3-btn x3-btn--primary" data-close data-autofocus>Entendi</button>`, 'x3-dialog--help', 'x3HelpTitle');
  }

  function openSummary() {
    if (movingFurniture) toggleFurniture(movingFurniture);
    const exp = api.experience();
    const p = exp.payload;
    const img = api.capture(1400).toDataURL('image/jpeg', 0.88);
    const moved = p.furniture.map((f) => f.label);
    const el = openDialog(`
      <button type="button" class="x3-dialog-x" data-close aria-label="Continuar ajustando">${icon('x')}</button>
      <div class="x3-sum-media">
        <img src="${img}" alt="A casa como você montou">
        <span class="x3-sum-name">${esc(api.projectName || 'Meu projeto')}</span>
      </div>
      <div class="x3-sum-body">
        <p class="x3-eyebrow">Seu projeto</p>
        <h2 id="x3SumTitle">Gostou do que <em>imaginou?</em></h2>
        <p class="x3-sum-sentence">${esc(p.summary)}</p>
        <div class="x3-sum-pills">${exp.styles.map((s, i) => `<span class="${i === 0 ? 'is-lead' : ''}">${esc(s)}</span>`).join('')}</div>
        <ul class="x3-sum-list">
          ${SURFACES.map((s) => { const m = MATERIAL_BY_ID[store.get().surfaces[s.id]]; return `<li><img src="${swatchURL(m)}" alt=""><span><small>${esc(s.label)}</small><b>${esc(m.label)}</b></span></li>`; }).join('')}
        </ul>
        <dl class="x3-sum-meta">
          <div><dt>Clima</dt><dd>${['cozy', 'bright', 'moody'].map((k) => `${MOOD_WORDS[k]} ${p.mood[k]}%`).join(' · ')}</dd></div>
          <div><dt>Luz</dt><dd>${esc(p.timeLabel)}, ${p.time}</dd></div>
          ${moved.length ? `<div><dt>Móveis</dt><dd>${esc(moved.join(', '))} no lugar que você escolheu</dd></div>` : ''}
        </dl>
        <p class="x3-sum-note">O arquiteto recebe tudo isso junto com o seu formulário — e pode perguntar ao assistente sobre cada escolha.</p>
        <div class="x3-sum-actions">
          <button type="button" class="x3-btn x3-btn--primary" data-create data-autofocus>Vamos transformar isso em projeto${icon('right')}</button>
          <button type="button" class="x3-btn x3-btn--ghost" data-close>Continuar ajustando</button>
        </div>
        <p class="x3-sum-error" role="alert" data-error></p>
      </div>`, 'x3-dialog--summary', 'x3SumTitle');
    const btn = el.querySelector('[data-create]');
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      btn.firstChild.textContent = 'Criando o seu projeto…';
      el.querySelector('[data-error]').textContent = '';
      try { await api.finish(exp); }
      catch (err) {
        el.querySelector('[data-error]').textContent = err?.message || 'Não foi possível criar o projeto agora. Tente de novo.';
        btn.disabled = false;
        btn.firstChild.textContent = 'Vamos transformar isso em projeto';
      }
    });
    if (!reduceMotion) gsap.from(el.querySelectorAll('.x3-sum-body > *'), { opacity: 0, y: 14, duration: 0.5, stagger: 0.05, delay: 0.12, ease: 'matchOut' });
  }

  // ------------------------------------------------------------------ estado → interface
  const lastMat = {};
  function update(state, change) {
    els.presets.forEach((b) => { const on = b.dataset.preset === state.preset; b.classList.toggle('is-active', on); b.setAttribute('aria-checked', String(on)); b.tabIndex = on || (!state.preset && b === els.presets[0]) ? 0 : -1; });
    const mood = computeMood(state);
    els.meters.forEach((m) => { const v = mood[m.dataset.meter]; m.querySelector('b').textContent = `${v}%`; m.style.setProperty('--v', `${v}%`); });
    const d = describe(state, mood);
    els.sentence.innerHTML = `${esc(d.text)} <span>O clima é <em>${d.word}</em>.</span>`;

    for (const s of SURFACES) {
      const mat = MATERIAL_BY_ID[state.surfaces[s.id]];
      if (lastMat[s.id] === mat.id) continue;
      lastMat[s.id] = mat.id;
      const cell = els.cells.find((c) => c.dataset.surface === s.id);
      cell.querySelector('img').src = swatchURL(mat);
      cell.querySelector('[data-mat]').textContent = mat.label;
      cell.setAttribute('aria-label', `${s.label}: ${mat.label}`);
      const fl = els.flabels[s.id];
      if (fl) { fl.querySelector('img').src = swatchURL(mat); fl.querySelector('b').textContent = mat.label; }
      if (change.type !== 'init' && !reduceMotion) {
        gsap.fromTo(cell.querySelector('img'), { scale: 0.7 }, { scale: 1, duration: 0.45, ease: 'matchSpring' });
        if (fl) gsap.fromTo(fl, { '--pop': 1.08 }, { '--pop': 1, duration: 0.5, ease: 'matchOut' });
      }
    }
    refreshUsed(state);
    els.undo.disabled = !store.canUndo();
    els.redo.disabled = !store.canRedo();
    if (change.type !== 'preset' && change.type !== 'history') daylight(state.time);

    if (change.type === 'surface') {
      const s = SURFACE_BY_ID[change.surfaces[0]];
      announce(`${s.label}: ${MATERIAL_BY_ID[state.surfaces[s.id]].label}.`);
    } else if (change.type === 'preset') {
      announce(`Clima ${PRESETS.find((p) => p.id === state.preset).label.toLowerCase()} aplicado.`);
    } else if (change.type === 'time' && change.settled) {
      announce(`Luz das ${formatTime(state.time)}, ${daylightLabel(state.time).toLowerCase()}.`);
    } else if (change.type === 'furniture') {
      announce(`${house.furniture.get(change.id)?.label || 'Móvel'}: nova posição.`);
    }
  }

  // ------------------------------------------------------------------ estado inicial
  setTab(tab);
  selectSurface(selectedSurface, { pulse: false });
  layoutBounds(); layoutArc();

  return {
    update,
    daylight,
    setThumbs(map) {
      Object.entries(map).forEach(([id, src]) => { const im = root.querySelector(`[data-thumb="${id}"]`); if (im) { im.src = src; im.hidden = false; } });
    },
    roomMode(r) {
      room = r;
      host.classList.toggle('is-room', !!r);
      els.roombar.hidden = !r;
      if (r) { els.roomName.textContent = r.label; els.roombar.querySelector('[data-act="overview"]').focus({ preventScroll: true }); announce(`${r.label}. Esc volta à maquete.`); }
      else { announce('Visão geral da casa.'); setTimeout(placeLabels, 50); }
    },
    furnitureLifted(f, lifted) {
      host.classList.toggle('is-moving', lifted);
    },
    /** Entrada coreografada dos painéis (depois da introdução). */
    reveal() {
      host.classList.add('is-ready');
      layoutBounds(); layoutArc(); daylight(shownTime);
      if (reduceMotion) return;
      // clearProps: nada de estilo inline sobrando (o modo ambiente esconde os painéis via CSS).
      const tl = gsap.timeline({ defaults: { ease: 'matchOut', duration: 0.7, clearProps: 'transform,opacity' }, delay: 0.5 });
      tl.from(els.mood, { x: -28, opacity: 0 }, 0)
        .from(els.mood.children, { y: 12, opacity: 0, stagger: 0.06, duration: 0.5 }, 0.1)
        .from(els.day, { x: 28, opacity: 0 }, 0.12)
        .from(els.toolbar, { y: -14, opacity: 0 }, 0.2)
        .from(els.tray, { y: 24, opacity: 0 }, 0.26)
        .from(els.dock, { y: 24, opacity: 0 }, 0.32)
        .fromTo(overlay, { opacity: 0 }, { opacity: 1, duration: 0.9 }, 0.9);
    },
    dispose() {
      cleanups.forEach((fn) => fn());
      stopRender();
      ro.disconnect();
      dayTween?.kill();
      clearTimeout(toastTimer); clearTimeout(liveTimer);
      overlay.remove();
      root.innerHTML = '';
    },
  };
}
