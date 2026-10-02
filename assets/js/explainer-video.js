// Vídeo explicativo da home (seção "Para clientes e arquitetos").
//
// Não é um arquivo de vídeo: é um player que desenha cada quadro a partir do
// tempo t. Cada peça de cena com [data-at] recebe --p (entrada 0→1, com a
// curva --ease-out do site); [data-s] dá um segundo movimento (--s);
// [data-out] tira a peça de cena; [data-count] conta até o número. Como
// tudo deriva de t, pausar, arrastar a barra e pular capítulo é só chamar
// render(t) — nada fica fora do lugar.
//
// As falas vêm da transcrição logo abaixo do player (fonte única) e viram
// balões de conversa. A voz é gravada (voz neural, gerada por
// assets/audio/dev/build_narration.py) e tocada pela Web Audio API seguindo o
// mesmo relógio: pausar, voltar ou pular capítulo retoma a fala do ponto
// exato. Sem os arquivos de áudio, o vídeo roda igual, só com as legendas.
(() => {
  const root = document.querySelector('[data-xv]');
  if (!root) return;

  const stage = root.querySelector('[data-xv-stage]');
  const script = document.querySelector('[data-xv-script]');
  const els = {
    poster: root.querySelector('[data-xv-poster]'),
    toggle: root.querySelector('[data-xv-toggle]'),
    sound: root.querySelector('[data-xv-sound]'),
    full: root.querySelector('[data-xv-full]'),
    range: root.querySelector('[data-xv-range]'),
    fill: root.querySelector('[data-xv-fill]'),
    ticks: root.querySelector('[data-xv-ticks]'),
    time: root.querySelector('[data-xv-time]'),
    total: root.querySelector('[data-xv-total]'),
    length: root.querySelector('[data-xv-length]'),
    live: root.querySelector('[data-xv-live]'),
  };
  const chapters = [...document.querySelectorAll('[data-xv-jump]')];
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const NARRATION = 'assets/audio/explainer/narration.json';

  // ---------- curva --ease-out do site: cubic-bezier(.2, .8, .2, 1) ----------
  const ease = bezier(0.2, 0.8, 0.2, 1);
  function bezier(x1, y1, x2, y2) {
    const ax = 3 * x1 - 3 * x2 + 1, bx = 3 * x2 - 6 * x1, cx = 3 * x1;
    const ay = 3 * y1 - 3 * y2 + 1, by = 3 * y2 - 6 * y1, cy = 3 * y1;
    const sx = (u) => ((ax * u + bx) * u + cx) * u;
    const sy = (u) => ((ay * u + by) * u + cy) * u;
    const dx = (u) => (3 * ax * u + 2 * bx) * u + cx;
    return (x) => {
      if (x <= 0) return 0;
      if (x >= 1) return 1;
      let u = x;
      for (let i = 0; i < 6; i++) {
        const d = dx(u);
        if (Math.abs(d) < 1e-6) break;
        u -= (sx(u) - x) / d;
      }
      return sy(Math.min(1, Math.max(0, u)));
    };
  }
  const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
  const num = (v, d = 0) => (v == null || v === '' ? d : parseFloat(v));
  const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

  // ---------- cenas ----------
  const CPS = 14;            // estimativa de leitura (caracteres/s) para fala sem áudio gravado
  const TYPING = 0.6;        // "digitando..." antes do balão do match.IA
  const FADE_IN = 0.45, FADE_OUT = 0.4;

  const scenes = [...stage.querySelectorAll('.xv-scene')].map((el) => {
    const key = el.dataset.scene;
    const title = el.querySelector('.xv-title')?.textContent.trim() || '';
    const act = el.dataset.act != null ? num(el.dataset.act) : key === 'outro' ? 0.5 : 0;

    const fx = [...el.querySelectorAll('[data-at], [data-s], [data-count]')].map((node) => ({
      node,
      at: node.dataset.at != null ? num(node.dataset.at) : null,
      d: num(node.dataset.d, 0.7),
      out: node.dataset.out != null ? num(node.dataset.out) : null,
      s: node.dataset.s != null ? num(node.dataset.s) : null,
      sd: num(node.dataset.sd, 0.8),
      count: node.dataset.count != null ? num(node.dataset.count) : null,
      lp: -1, ls: -1, lc: -1,
    }));
    const animEnd = fx.reduce((m, f) => Math.max(m, f.at != null ? f.at + f.d : 0, f.s != null ? f.s + f.sd : 0), 0);

    // falas da transcrição → balões de conversa
    const chat = el.querySelector('[data-chat]');
    const lines = [...(script?.querySelectorAll(`[data-line="${key}"]`) || [])].map((p, n) => {
      const who = p.dataset.who === 'voce' ? 'voce' : 'ia';
      const text = p.textContent.trim();
      const msg = document.createElement('div');
      msg.className = `xv-msg xv-msg--${who}`;
      msg.innerHTML = who === 'ia'
        ? '<span class="xv-msg-av"><img src="assets/img/mark.png" alt="" width="20" height="20"></span><div class="xv-bubble xv-glass"><span class="xv-dots"><i></i><i></i><i></i></span><span class="xv-text"></span></div>'
        : '<span class="xv-msg-av">Você</span><div class="xv-bubble"><span class="xv-text"></span></div>';
      msg.querySelector('.xv-text').textContent = text;
      chat?.appendChild(msg);
      return { id: `${key}-${n}`, who, text, msg, audio: null, dur: text.length / CPS + 0.35, bubbleAt: 0, speakAt: 0, end: 0, lp: -1, typing: null, talk: null };
    });
    return { el, key, title, act, fx, animEnd, lines, dur: 0, start: 0, sp: -1, links: [...el.querySelectorAll('a, button')] };
  });
  if (!scenes.length) return;

  // tempos: cada fala encadeia na anterior; a cena dura o que a animação ou a fala pedir
  let total = 0, archStart = 0;
  const byKey = (k) => scenes.findIndex((s) => s.key === k);
  function layout() {
    total = 0;
    for (const s of scenes) {
      let cursor = 0.5;
      for (const l of s.lines) {
        l.bubbleAt = cursor;
        l.speakAt = l.who === 'ia' ? cursor + TYPING : cursor;
        l.end = l.speakAt + l.dur;
        cursor = l.end + 0.4;
      }
      const linesEnd = s.lines.length ? s.lines[s.lines.length - 1].end : 0;
      s.dur = Math.max(4.5, s.animEnd + 1, linesEnd + 1);
      s.start = total;
      total += s.dur;
    }
    archStart = scenes[byKey('bridge')]?.start ?? total;
    els.range.max = total.toFixed(1);
    els.total.textContent = fmt(total);
    if (els.length) els.length.textContent = `${fmt(total)} · com narração e legendas`;
    els.ticks.textContent = '';
    scenes.slice(1).forEach((s) => {
      const i = document.createElement('i');
      i.style.left = `${(s.start / total) * 100}%`;
      els.ticks.appendChild(i);
    });
  }
  layout();
  const sceneAt = (t) => {
    for (let i = scenes.length - 1; i >= 0; i--) if (t >= scenes[i].start) return i;
    return 0;
  };

  // ---------- desenho de um quadro ----------
  let t = 0, playing = false, started = false, scrubbing = false, lastNow = 0, raf = 0;
  let current = -1;
  function render(time) {
    const idx = sceneAt(time);
    if (idx !== current) {
      const prev = scenes[current];
      if (prev) { prev.el.classList.remove('is-on'); prev.el.setAttribute('aria-hidden', 'true'); prev.links.forEach((a) => a.setAttribute('tabindex', '-1')); }
      const next = scenes[idx];
      next.el.classList.add('is-on');
      next.el.removeAttribute('aria-hidden');
      next.links.forEach((a) => a.removeAttribute('tabindex'));
      current = idx;
      if (playing && els.live) els.live.textContent = next.title;
      const arch = byKey('bridge'), last = scenes.length - 1;
      chapters.forEach((c) => {
        const from = byKey(c.dataset.xvJump);
        const to = from >= arch ? last : arch;
        c.classList.toggle('is-current', idx >= from && idx < to);
      });
    }
    const sc = scenes[idx];
    const lt = time - sc.start;

    const fin = idx === 0 && !started ? 1 : clamp01(lt / FADE_IN);
    const fout = idx === scenes.length - 1 ? 1 : clamp01((sc.dur - lt) / FADE_OUT);
    const sp = ease(fin) * ease(fout);
    if (Math.abs(sp - sc.sp) > 0.001) { sc.el.style.setProperty('--sp', sp.toFixed(3)); sc.sp = sp; }

    for (const f of sc.fx) {
      if (f.at != null) {
        let p = ease(clamp01((lt - f.at) / f.d));
        if (f.out != null) p *= 1 - ease(clamp01((lt - f.out) / 0.5));
        if (Math.abs(p - f.lp) > 0.001) { f.node.style.setProperty('--p', p.toFixed(3)); f.lp = p; }
        if (f.count != null) {
          const c = Math.round(p * f.count);
          if (c !== f.lc) { f.node.textContent = c; f.lc = c; }
        }
      }
      if (f.s != null) {
        const s = ease(clamp01((lt - f.s) / f.sd));
        if (Math.abs(s - f.ls) > 0.001) { f.node.style.setProperty('--s', s.toFixed(3)); f.ls = s; }
      }
    }
    for (const l of sc.lines) {
      const p = ease(clamp01((lt - l.bubbleAt) / 0.45));
      if (Math.abs(p - l.lp) > 0.001) { l.msg.style.setProperty('--p', p.toFixed(3)); l.lp = p; }
      const typing = l.who === 'ia' && lt < l.speakAt;
      if (typing !== l.typing) { l.msg.classList.toggle('is-typing', typing); l.typing = typing; }
      const talk = playing && narrate && !!l.audio && lt >= l.speakAt && lt < l.end;
      if (talk !== l.talk) { l.msg.classList.toggle('is-speaking', talk); l.talk = talk; }
    }

    // fundo: o terracota cede lugar à sálvia quando o vídeo passa a falar com o arquiteto
    const prevAct = idx > 0 ? scenes[idx - 1].act : sc.act;
    const act = prevAct + (sc.act - prevAct) * ease(clamp01(lt / 1.2));
    stage.style.setProperty('--act', act.toFixed(3));
    if (!reduceMotion) {
      stage.style.setProperty('--dx', `${(Math.sin(time * 0.21) * 4).toFixed(2)}%`);
      stage.style.setProperty('--dy', `${(Math.cos(time * 0.17) * 3).toFixed(2)}%`);
    }

    // barra (na capa, antes do play, ela fica zerada)
    const shown = started ? time : 0;
    const f = (shown / total) * 100, split = (archStart / total) * 100;
    const a = Math.min(f, split), b = Math.max(f, split);
    els.fill.style.background = `linear-gradient(90deg, var(--terracotta) 0 ${a}%, color-mix(in srgb, var(--terracotta) 22%, transparent) ${a}% ${split}%, var(--sage) ${split}% ${b}%, color-mix(in srgb, var(--sage) 26%, transparent) ${b}% 100%)`;
    if (!scrubbing) els.range.value = shown.toFixed(1);
    els.range.setAttribute('aria-valuetext', `${fmt(shown)} de ${fmt(total)}: ${sc.title}`);
    els.time.textContent = fmt(shown);
  }

  // ---------- narração (áudio gravado + Web Audio) ----------
  const AC = window.AudioContext || window.webkitAudioContext;
  let narrate = !!AC, actx = null, gain = null;
  let voice = null;                       // { line, src } — fala tocando agora
  const bytes = new Map();                // id → ArrayBuffer baixado (antes do play)
  const buffers = new Map();              // id → AudioBuffer decodificado (depois do play)
  const allLines = scenes.flatMap((s) => s.lines);

  // o manifesto traz a duração real de cada fala; o texto precisa bater com o da
  // transcrição (fala editada sem regravar fica só na legenda)
  const manifest = fetch(NARRATION).then((r) => (r.ok ? r.json() : null)).catch(() => null).then((m) => {
    if (m) {
      for (const l of allLines) {
        const e = m[l.id];
        if (e && e.text === l.text) { l.audio = { src: e.src, start: e.start || 0 }; l.dur = e.dur; }
      }
      if (!started) { layout(); render(posterTime()); }
    }
    syncSoundButton();
    return m;
  });

  function fetchAudio() {
    manifest.then(() => allLines.forEach((l) => {
      if (!l.audio || bytes.has(l.id)) return;
      bytes.set(l.id, null);
      fetch(l.audio.src).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject())).then((ab) => { bytes.set(l.id, ab); decode(l); }).catch(() => { l.audio = null; });
    }));
  }
  function decode(l) {
    const ab = bytes.get(l.id);
    if (!actx || !ab || buffers.has(l.id)) return;
    buffers.set(l.id, null);
    // forma com callbacks: funciona também no Safari antigo
    actx.decodeAudioData(ab.slice(0), (buf) => buffers.set(l.id, buf), () => { l.audio = null; });
  }
  function unlockAudio() {            // só dentro de um clique: navegadores bloqueiam áudio sem gesto
    if (!AC) return;
    if (!actx) {
      actx = new AC();
      gain = actx.createGain();
      gain.connect(actx.destination);
      allLines.forEach(decode);
    }
    if (actx.state === 'suspended') actx.resume();
  }
  function stopVoice() {
    if (!voice) return;
    try { voice.src.stop(); } catch { /* já tinha terminado */ }
    voice = null;
  }
  // a cada quadro: qual fala deveria estar soando agora? se não for a que está tocando, troca
  function syncVoice(time) {
    if (!playing || !narrate || !actx) { stopVoice(); return; }
    const sc = scenes[sceneAt(time)], lt = time - sc.start;
    const l = sc.lines.find((x) => x.audio && lt >= x.speakAt && lt < x.end - 0.05);
    if (!l) { if (voice && !sc.lines.includes(voice.line)) stopVoice(); return; }
    if (voice?.line === l) return;
    const buf = buffers.get(l.id);
    if (!buf) return;                  // ainda decodificando: entra no próximo quadro
    stopVoice();
    const offset = lt - l.speakAt;
    const src = actx.createBufferSource();
    src.buffer = buf;
    src.connect(gain);
    src.start(0, l.audio.start + offset, Math.max(0.05, l.dur - offset));
    const entry = { line: l, src };
    src.onended = () => { if (voice === entry) voice = null; };
    voice = entry;
  }

  function syncSoundButton() {
    const available = !!AC && (allLines.some((l) => l.audio) || !manifestDone);
    els.sound.disabled = !available;
    const on = available && narrate;
    root.classList.toggle('is-muted', !on);
    els.sound.setAttribute('aria-pressed', String(on));
    els.sound.setAttribute('aria-label', !available ? 'Narração indisponível (as legendas continuam)' : on ? 'Desligar narração' : 'Ligar narração');
    els.sound.title = els.sound.getAttribute('aria-label');
  }
  let manifestDone = false;
  manifest.then(() => { manifestDone = true; syncSoundButton(); });
  syncSoundButton();

  // ---------- relógio ----------
  function frame(now) {
    if (!playing) return;
    t = Math.min(total, t + Math.min(0.1, (now - lastNow) / 1000));
    lastNow = now;
    render(t);
    syncVoice(t);
    if (t >= total) { end(); return; }
    raf = requestAnimationFrame(frame);
  }

  function play() {
    unlockAudio();
    fetchAudio();
    if (started && t >= total) t = 0;
    if (!started) {
      started = true;
      root.classList.add('is-started');
      t = 0;
      current = -1;
      scenes[0].sp = -1;
    }
    playing = true;
    root.classList.add('is-playing');
    els.toggle.setAttribute('aria-label', 'Pausar');
    lastNow = performance.now();
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(frame);
  }
  function pause() {
    if (!playing) return;
    playing = false;
    cancelAnimationFrame(raf);
    root.classList.remove('is-playing');
    els.toggle.setAttribute('aria-label', 'Reproduzir');
    stopVoice();
    render(t);
  }
  function end() {
    playing = false;
    root.classList.remove('is-playing');
    els.toggle.setAttribute('aria-label', 'Assistir de novo');
    stopVoice();
  }
  function seek(to) {
    t = Math.max(0, Math.min(total, to));
    stopVoice();                       // o próximo quadro retoma a fala do ponto certo
    render(t);
  }
  function begin() {
    if (started) return;
    started = true;
    root.classList.add('is-started');
  }
  function jump(key) {
    const i = byKey(key);
    if (i < 0) return;
    begin();
    seek(scenes[i].start);
    play();
    const r = root.getBoundingClientRect();
    if (r.top < 0 || r.bottom > innerHeight) root.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
  }

  // ---------- controles ----------
  els.poster.addEventListener('click', () => { play(); root.focus({ preventScroll: true }); });
  els.toggle.addEventListener('click', () => (playing ? pause() : play()));
  stage.addEventListener('click', (e) => {
    if (!started || e.target.closest('a, button')) return;
    playing ? pause() : play();
  });
  root.querySelector('[data-xv-replay]')?.addEventListener('click', () => { seek(0); play(); });
  chapters.forEach((c) => c.addEventListener('click', () => jump(c.dataset.xvJump)));

  let wasPlaying = false;
  els.range.addEventListener('input', () => {
    if (!scrubbing) { scrubbing = true; wasPlaying = playing; if (playing) { playing = false; cancelAnimationFrame(raf); } }
    begin();
    seek(parseFloat(els.range.value));
  });
  els.range.addEventListener('change', () => {
    scrubbing = false;
    seek(parseFloat(els.range.value));
    if (wasPlaying) play();
  });

  els.sound.addEventListener('click', () => {
    narrate = !narrate;
    if (narrate) { unlockAudio(); fetchAudio(); } else stopVoice();
    syncSoundButton();
    render(t);
  });

  els.full.addEventListener('click', () => {
    const fsEl = document.fullscreenElement || document.webkitFullscreenElement;
    if (fsEl) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    else (root.requestFullscreen || root.webkitRequestFullscreen)?.call(root);
  });
  if (!(root.requestFullscreen || root.webkitRequestFullscreen)) els.full.hidden = true;

  root.addEventListener('keydown', (e) => {
    if (e.target.closest('a') || e.altKey || e.ctrlKey || e.metaKey) return;
    const onRange = e.target === els.range;
    const k = e.key.toLowerCase();
    if (k === ' ' || k === 'k') {
      if (e.target.closest('button') && k === ' ') return;     // o próprio botão já trata o espaço
      e.preventDefault(); playing ? pause() : play();
    } else if (!onRange && (k === 'arrowright' || k === 'arrowleft')) {
      e.preventDefault();
      begin();
      seek(t + (k === 'arrowright' ? 5 : -5));
    } else if (k === 'm') { els.sound.click(); }
    else if (k === 'f') { els.full.click(); }
  });

  // fotos, amostras e falas: baixa quando o player chega perto da tela,
  // pra nada aparecer vazio (ou mudo) no meio do vídeo
  let preloaded = false;
  function preload() {
    if (preloaded) return;
    preloaded = true;
    stage.querySelectorAll('[style*="background-image"]').forEach((node) => {
      const m = node.getAttribute('style').match(/url\(['"]?([^'")]+)['"]?\)/);
      if (m) new Image().src = m[1];
    });
    fetchAudio();
  }

  // pausa sozinho quando sai da tela ou a aba fica em segundo plano
  new IntersectionObserver(([entry]) => { if (entry.isIntersecting) preload(); }, { rootMargin: '400px' }).observe(root);
  new IntersectionObserver(([entry]) => { if (!entry.isIntersecting) pause(); }, { threshold: 0.2 }).observe(root);
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });

  // capa: o primeiro quadro já montado por trás do botão de play
  const posterTime = () => Math.min(3.4, scenes[0].dur - 0.6);
  render(posterTime());
})();
