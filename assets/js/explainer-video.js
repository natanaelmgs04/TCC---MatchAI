// Vídeo explicativo da home (seção "Para clientes e arquitetos").
//
// Não é um arquivo de vídeo: é um player que desenha cada quadro a partir do
// tempo t. Cada peça de cena com [data-at] recebe --p (entrada 0→1) e --x
// (saída 0→1, em cascata reversa no fim da cena); [data-s] dá um segundo
// movimento (--s); [data-out] tira a peça de cena antes da hora;
// [data-count] conta até o número. Como tudo deriva de t, pausar, arrastar a
// barra e pular capítulo é só chamar render(t) — nada fica fora do lugar.
//
// Direção de movimento (ver video/production/explicativo-home/):
// - curvas do site: --ease-out nas entradas; --ease-spring (overshoot curto)
//   só nas peças pequenas (.fx-pop, chips, [data-ease="spring"]); saídas
//   simétricas e mais curtas.
// - títulos entram palavra por palavra por máscara e "rolam" para cima ao
//   sair — o título da cena seguinte sobe no mesmo lugar (continuidade).
// - [data-on="palavra"] / [data-son="palavra"] disparam a entrada / o
//   segundo movimento quando a narração chega naquela palavra
//   ("palavra+0.3" adianta/atrasa em segundos).
// - transições: por padrão a cena sai peça por peça com o fundo contínuo;
//   [data-in="iris"|"wipe"] revela a cena por cima da anterior congelada
//   (íris a partir de [data-from] da cena anterior).
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

  // ---------- curvas do site ----------
  const ease = bezier(0.2, 0.8, 0.2, 1);        // --ease-out: entradas, câmera
  const spring = bezier(0.34, 1.56, 0.64, 1);   // --ease-spring: só peças pequenas
  const inOut = bezier(0.65, 0, 0.35, 1);       // saídas e transições
  const lens = bezier(0.7, 0, 0.2, 1);          // íris/wipe: arranca devagar, abre decidido
  const linear = (x) => clamp01(x);
  const CURVES = { spring, linear, inout: inOut };
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
      for (let i = 0; i < 8; i++) {
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
  const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

  // ---------- tempos ----------
  const CPS = 14;            // estimativa de leitura (caracteres/s) para fala sem áudio gravado
  const TYPING = 0.4;        // "digitando..." antes do balão do match.IA
  const LEAD = 0.35;         // primeiro balão da cena
  const GAP = 0.3;           // respiro entre falas
  const TAIL = 0.6;          // depois da última fala / animação
  const EXIT = 0.6;          // janela de saída no fim da cena (cascata ≤ 0,24 s + saída)
  const EXIT_D = 0.32;       // duração da saída de cada peça
  const T_IN = 0.95;         // íris / wipe

  // ---------- títulos: uma máscara por palavra ----------
  // <h3 class="xv-title fx" data-at=".2">Encontre seu <em>arquiteto ideal</em></h3>
  // vira palavras com [data-at] próprio (cascata de 55 ms); o kicker vira um
  // wipe da esquerda para a direita.
  stage.querySelectorAll('.xv-title[data-at]').forEach((title) => {
    const base = num(title.dataset.at);
    let i = 0;
    const wrap = (node) => {
      [...node.childNodes].forEach((child) => {
        if (child.nodeType === Node.TEXT_NODE) {
          const frag = document.createDocumentFragment();
          child.textContent.split(/(\s+)/).forEach((part) => {
            if (!part) return;
            if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(' ')); return; }
            const w = document.createElement('span');
            w.className = 'xw';
            w.dataset.at = (base + 0.04 + i++ * 0.055).toFixed(3);
            w.dataset.d = '0.62';
            w.innerHTML = '<span></span>';
            w.firstChild.textContent = part;
            frag.appendChild(w);
          });
          child.replaceWith(frag);
        } else if (child.nodeType === Node.ELEMENT_NODE) {
          wrap(child);
        }
      });
    };
    wrap(title);
    title.classList.remove('fx');
    delete title.dataset.at;
  });
  stage.querySelectorAll('.xv-kicker.fx').forEach((k) => { k.classList.add('fx-wipe'); k.dataset.d = k.dataset.d || '0.6'; });

  // ---------- cenas ----------
  const scenes = [...stage.querySelectorAll('.xv-scene')].map((el) => {
    const key = el.dataset.scene;
    const title = el.querySelector('.xv-title')?.textContent.replace(/\s+/g, ' ').trim() || '';
    const act = el.dataset.act != null ? num(el.dataset.act) : key === 'outro' ? 0.5 : 0;

    const fx = [...el.querySelectorAll('[data-at], [data-on], [data-s], [data-son], [data-count]')].map((node) => {
      const cl = node.classList;
      const curve = CURVES[node.dataset.ease] || (cl.contains('fx-pop') || cl.contains('xv-chip') ? spring : ease);
      return {
        node,
        base: node.dataset.at != null ? num(node.dataset.at) : null,
        at: null,
        on: node.dataset.on || null,
        d: num(node.dataset.d, 0.7),
        out: node.dataset.out != null ? num(node.dataset.out) : null,
        sBase: node.dataset.s != null ? num(node.dataset.s) : null,
        s: null,
        son: node.dataset.son || null,
        sd: num(node.dataset.sd, 0.8),
        count: node.dataset.count != null ? num(node.dataset.count) : null,
        curve,
        mb: cl.contains('fx-mb'),
        sound: node.dataset.sound != null,
        pen: node.dataset.pen ? el.querySelector(`#${node.dataset.pen}`) : null,
        len: 0,
        lp: -1, lx: -1, lv: -1, ls: -1, lc: -1,
      };
    });

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
      return { id: `${key}-${n}`, who, text, msg, audio: null, dur: text.length / CPS + 0.35, bubbleAt: 0, speakAt: 0, end: 0, lp: -1, lx: -1, typing: null, talk: null };
    });
    return {
      el, key, title, act, fx, lines, dur: 0, start: 0, exitAt: 0, lastLt: 0,
      tin: el.dataset.in || null, from: el.dataset.from || null, noExit: false, cam: -1,
      links: [...el.querySelectorAll('a, button')],
    };
  });
  if (!scenes.length) return;
  scenes.forEach((s, i) => { if (scenes[i + 1]?.tin) s.noExit = true; });
  const last = scenes.length - 1;

  // "palavra" ou "palavra+0.3": momento em que a narração da cena diz a palavra
  // (proporcional à posição no texto — a voz neural fala em ritmo constante)
  function cue(s, spec) {
    const m = spec.match(/^(.*?)([+-]\d*\.?\d+)?$/);
    const word = norm(m[1].trim());
    for (const l of s.lines) {
      const i = norm(l.text).indexOf(word);
      if (i >= 0) return l.speakAt + l.dur * (i / l.text.length) + num(m[2]);
    }
    console.warn(`[xv] palavra "${m[1]}" não está nas falas da cena ${s.key}`);
    return 0;
  }

  // tempos: cada fala encadeia na anterior; a cena dura o que a animação ou a fala pedir
  let total = 0, archStart = 0;
  const byKey = (k) => scenes.findIndex((s) => s.key === k);
  function layout() {
    total = 0;
    for (const s of scenes) {
      let cursor = LEAD;
      for (const l of s.lines) {
        l.bubbleAt = cursor;
        l.speakAt = l.who === 'ia' ? cursor + TYPING : cursor;
        l.end = l.speakAt + l.dur;
        cursor = l.end + GAP;
      }
      let animEnd = 0;
      for (const f of s.fx) {
        f.at = f.on ? cue(s, f.on) : f.base;
        f.s = f.son ? cue(s, f.son) : f.sBase;
        animEnd = Math.max(animEnd, f.at != null ? f.at + f.d : 0, f.s != null ? f.s + f.sd : 0);
      }
      const linesEnd = s.lines.length ? s.lines[s.lines.length - 1].end : 0;
      s.dur = Math.max(4, animEnd + TAIL, linesEnd + TAIL) + (s.noExit ? 0 : EXIT * 0.5);
      s.exitAt = s.dur - EXIT;
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

  const setVar = (node, name, v, prev) => {
    if (Math.abs(v - prev) > 0.001) node.style.setProperty(name, v.toFixed(3));
    return v;
  };

  // ---------- desenho de uma cena no instante lt ----------
  function drawScene(sc, lt, audible) {
    const exits = !sc.noExit && sc !== scenes[last];
    const n = sc.fx.length;
    const stag = Math.min(0.03, 0.24 / Math.max(1, n));
    const exitAt = (k) => (exits ? inOut(clamp01((lt - (sc.exitAt + k * stag)) / EXIT_D)) : 0);

    sc.cam = setVar(sc.el, '--cam', ease(clamp01(lt / sc.dur)), sc.cam);

    // balões saem primeiro (estão por cima de tudo, embaixo à esquerda)
    for (const l of sc.lines) {
      const p = ease(clamp01((lt - l.bubbleAt) / 0.45));
      l.lp = setVar(l.msg, '--p', p, l.lp);
      l.lx = setVar(l.msg, '--x', exitAt(0), l.lx);
      const typing = l.who === 'ia' && lt < l.speakAt;
      if (typing !== l.typing) { l.msg.classList.toggle('is-typing', typing); l.typing = typing; }
      const talk = playing && narrate && !!l.audio && lt >= l.speakAt && lt < l.end;
      if (talk !== l.talk) { l.msg.classList.toggle('is-speaking', talk); l.talk = talk; }
    }

    sc.fx.forEach((f, k) => {
      if (f.at != null) {
        const raw = clamp01((lt - f.at) / f.d);
        let p = f.curve(raw);
        if (f.out != null) p *= 1 - ease(clamp01((lt - f.out) / 0.5));
        f.lp = setVar(f.node, '--p', p, f.lp);
        // a última peça a entrar é a primeira a sair
        f.lx = setVar(f.node, '--x', exitAt(1 + (n - 1 - k)), f.lx);
        if (f.mb) {
          // motion blur ∝ velocidade da curva (alta no arranque, some no assentamento)
          const v = raw >= 1 ? 0 : clamp01((f.curve(Math.min(1, raw + 0.04)) - f.curve(raw)) / 0.04 / 3);
          f.lv = setVar(f.node, '--v', v, f.lv);
        }
        if (f.count != null) {
          const c = Math.round(Math.min(1, p) * f.count);
          if (c !== f.lc) { f.node.textContent = c; f.lc = c; }
        }
        if (f.pen) {
          // ponta da caneta acompanha o traço que está sendo desenhado
          f.len = f.len || f.node.getTotalLength();
          const pt = f.node.getPointAtLength(Math.min(1, p) * f.len);
          f.pen.setAttribute('cx', pt.x.toFixed(1));
          f.pen.setAttribute('cy', pt.y.toFixed(1));
          f.pen.style.opacity = raw > 0 && raw < 1 ? 1 : 0;
        }
        if (f.sound && audible && sc.lastLt < f.at && lt >= f.at && lt - f.at < 0.25) chime();
      }
      if (f.s != null) f.ls = setVar(f.node, '--s', ease(clamp01((lt - f.s) / f.sd)), f.ls);
    });
    sc.lastLt = lt;
  }

  // ---------- quadro ----------
  let t = 0, playing = false, started = false, scrubbing = false, lastNow = 0, raf = 0;
  let current = -1, under = -1;
  function show(sc, on) {
    sc.el.setAttribute('aria-hidden', String(!on));
    sc.links.forEach((a) => (on ? a.removeAttribute('tabindex') : a.setAttribute('tabindex', '-1')));
  }
  function render(time) {
    const idx = sceneAt(time);
    const sc = scenes[idx];
    const lt = time - sc.start;
    const entering = !!sc.tin && idx > 0 && lt < T_IN;
    const below = entering ? idx - 1 : -1;

    if (idx !== current) {
      const prev = scenes[current];
      if (prev) { prev.el.classList.remove('is-on'); show(prev, false); }
      sc.el.classList.add('is-on');
      show(sc, true);
      sc.lastLt = lt;
      current = idx;
      if (playing && els.live) els.live.textContent = sc.title;
      const arch = byKey('bridge');
      chapters.forEach((c) => {
        const from = byKey(c.dataset.xvJump);
        const to = from >= arch ? last + 1 : arch;
        c.classList.toggle('is-current', idx >= from && idx < to);
      });
    }
    if (below !== under) {
      if (under >= 0) scenes[under].el.classList.remove('is-under');
      if (below >= 0) scenes[below].el.classList.add('is-under');
      under = below;
    }
    if (below >= 0) {
      // a cena anterior fica congelada no último quadro enquanto a nova abre por cima
      const prev = scenes[below];
      drawScene(prev, prev.dur, false);
      const q = lens(clamp01(lt / T_IN));
      stage.style.setProperty('--tq', q.toFixed(3));
      if (sc.tin === 'iris') {
        // a íris abre a partir do objeto indicado em [data-from] (ex.: o ponto do match)
        const s = stage.getBoundingClientRect();
        const r = (sc.from && prev.el.querySelector(sc.from)?.getBoundingClientRect()) || { left: s.left + s.width / 2, top: s.top + s.height / 2, width: 0, height: 0 };
        const cx = r.left + r.width / 2 - s.left, cy = r.top + r.height / 2 - s.top;
        const far = Math.hypot(Math.max(cx, s.width - cx), Math.max(cy, s.height - cy));
        stage.style.setProperty('--ix', `${cx.toFixed(1)}px`);
        stage.style.setProperty('--iy', `${cy.toFixed(1)}px`);
        stage.style.setProperty('--ir', `${(q * far).toFixed(1)}px`);
      }
    }
    if (entering) stage.dataset.tin = sc.tin; else delete stage.dataset.tin;
    sc.el.classList.toggle('is-entering', entering);
    drawScene(sc, lt, playing && narrate && !!actx);

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
  // assinatura sonora: um sino curto e quente, bem abaixo da voz, só nos
  // momentos de impacto ([data-sound]: "Projeto fechado" e o ponto do logo)
  function chime() {
    if (!actx || actx.state !== 'running') return;
    const now = actx.currentTime;
    const out = actx.createGain();
    out.gain.setValueAtTime(0.0001, now);
    out.gain.exponentialRampToValueAtTime(0.07, now + 0.012);
    out.gain.exponentialRampToValueAtTime(0.0001, now + 1.4);
    out.connect(gain);
    [[880, 1], [1320, 0.35], [2200, 0.12]].forEach(([freq, level]) => {
      const o = actx.createOscillator(), g = actx.createGain();
      o.type = 'sine';
      o.frequency.value = freq;
      g.gain.value = level;
      o.connect(g).connect(out);
      o.start(now);
      o.stop(now + 1.5);
    });
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
    scenes.forEach((s) => { s.lastLt = Infinity; });   // pular não dispara o sino
    render(t);
    scenes.forEach((s) => { if (s.lastLt === Infinity) s.lastLt = 0; });
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
