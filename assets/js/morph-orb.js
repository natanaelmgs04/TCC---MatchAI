/**
 * "Orbe que pensa" do assistente de IA (cliente e arquiteto) — adaptação, em
 * JS puro e nas cores da marca, do componente MorphOrb: a pílula do
 * compositor encolhe numa bola, voa até o meio da conversa, vira uma esfera
 * de pontos que "pensa" (Pensando → Buscando → Analisando → Escrevendo)
 * enquanto a resposta chega, se condensa num ponto da marca e se desdobra
 * no balão da resposta, que aparece palavra por palavra. A pílula volta.
 *
 * Uso (assistente.js / architect-assistente.js):
 *   const orb = MorphOrb.attach(card, { compose, thread });
 *   const answer = await orb.think(promiseDaResposta);   // lança + pensa
 *   await orb.unfold(bubbleEl);                           // desdobra no balão
 *   orb.cancel();                                         // erro: volta a pílula
 *
 * Tudo é dirigido por linhas do tempo (canais → variáveis CSS), uma escrita
 * no DOM por quadro, e nada lê layout durante a animação (medidas são
 * tiradas uma vez no começo de cada fase).
 */
const MorphOrb = (() => {
  const LABELS = ['Pensando', 'Buscando', 'Analisando', 'Escrevendo'];
  const DONE = 'Pronto';
  const SPEED = 1.3;                    // um pouco mais rápido que o original: é um chat, não uma vitrine
  const MIN_THINK = 1300;
  const BALL = 56, ORB_D = 128, FLY_D = 134, ORB_R = 62, CANVAS = 220;

  /* ---------- curvas ---------- */
  function cubicBezier(x1, y1, x2, y2) {
    const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
    const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
    const sx = (t) => ((ax * t + bx) * t + cx) * t;
    const sy = (t) => ((ay * t + by) * t + cy) * t;
    const dx = (t) => (3 * ax * t + 2 * bx) * t + cx;
    const solve = (x) => {
      let t = x;
      for (let i = 0; i < 8; i++) {
        const e = sx(t) - x;
        if (Math.abs(e) < 1e-6) return t;
        const d = dx(t);
        if (Math.abs(d) < 1e-6) break;
        t -= e / d;
      }
      let lo = 0, hi = 1; t = x;
      for (let i = 0; i < 40; i++) {
        const e = sx(t);
        if (Math.abs(e - x) < 1e-6) break;
        if (x > e) lo = t; else hi = t;
        t = (hi - lo) / 2 + lo;
      }
      return t;
    };
    return (x) => (x <= 0 ? 0 : x >= 1 ? 1 : sy(solve(x)));
  }
  const E = {
    out: cubicBezier(0.2, 0.8, 0.2, 1),        // --ease-out do site
    io: cubicBezier(0.65, 0, 0.35, 1),
    in: cubicBezier(0.4, 0, 1, 1),
    fly: cubicBezier(0.5, 0, 0.1, 1),
    grow: cubicBezier(0.3, 0, 0.2, 1),
    vortex: cubicBezier(0.6, 0, 0.2, 1),
    spring: cubicBezier(0.34, 1.56, 0.64, 1),  // --ease-spring do site
    card: cubicBezier(0.65, 0, 0.2, 1),
  };
  const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const bez = (t, p0, c, p2) => (1 - t) * (1 - t) * p0 + 2 * (1 - t) * t * c + t * t * p2;
  const fmt = (v) => String(Math.round(v * 1e3) / 1e3);
  const TAU = Math.PI * 2;
  const T = (ch, from, to, t0, t1, ease = E.io) => ({ ch, from, to, t0, t1, ease });
  const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isDark = () => {
    const t = document.documentElement.dataset.theme;
    if (t === 'dark') return true;
    if (t === 'light') return false;
    return matchMedia('(prefers-color-scheme: dark)').matches;
  };

  /* ---------- esfera de pontos (canvas) ---------- */
  const RINGS = 16;
  const DOTS = (() => {
    let s = 7;
    const rand = () => { s |= 0; s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const out = [];
    for (let k = 0; k < RINGS; k++) {
      const y = 1 - ((k + 0.5) / RINGS) * 2, r = Math.sqrt(1 - y * y), m = Math.max(4, Math.round(30 * r));
      for (let j = 0; j < m; j++) {
        const a = (j / m) * TAU + k * 0.35;
        out.push({ x: Math.cos(a) * r, y, z: Math.sin(a) * r, u: (1 - y) / 2, seed: rand() * TAU });
      }
    }
    return out;
  })();
  const N = DOTS.length;
  const DX = Float32Array.from(DOTS, (d) => d.x), DY = Float32Array.from(DOTS, (d) => d.y), DZ = Float32Array.from(DOTS, (d) => d.z);
  const DU = Float32Array.from(DOTS, (d) => d.u), DS = Float32Array.from(DOTS, (d) => d.seed);
  const G_STEPS = 24, A_STEPS = 48;

  // pontos em grafite (ou off-white no escuro) que, ao terminar, viram terracota
  function palette() {
    const base = isDark() ? [240, 237, 232] : [51, 51, 51];
    const done = isDark() ? [217, 161, 131] : [176, 117, 90];
    const out = [];
    for (let gi = 0; gi <= G_STEPS; gi++) {
      const g = gi / G_STEPS;
      const r = Math.round(lerp(base[0], done[0], g)), gg = Math.round(lerp(base[1], done[1], g)), b = Math.round(lerp(base[2], done[2], g));
      for (let ai = 0; ai <= A_STEPS; ai++) out.push(`rgba(${r},${gg},${b},${(ai / A_STEPS).toFixed(3)})`);
    }
    return out;
  }

  function createOrb(canvas) {
    const P = { k: 0, alpha: 0, spin: 0, rot: 0, sweep: 0, pop: 1, vortex: 0, gain: 1, floor: 0, rad: 0, prog: 0 };
    const ctx = canvas.getContext('2d');
    const lit = new Float32Array(N), SX = new Float32Array(N), SY = new Float32Array(N), SR = new Float32Array(N), SD = new Float32Array(N);
    const SC = new Int16Array(N);
    const pw = [1, 0, 0, 0];
    let COLORS = palette(), time = 0, raf = 0, last = 0, dead = false;
    const reset = () => {
      Object.assign(P, { k: 0, alpha: 0, spin: 0, rot: 0, sweep: 0, pop: 1, vortex: 0, gain: 1, floor: 0, rad: 0, prog: 0 });
      lit.fill(0); pw[0] = 1; pw[1] = pw[2] = pw[3] = 0; time = 0;
      COLORS = palette();
    };
    if (!ctx) return { P, ensure() {}, reset, destroy() {} };
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(CANVAS * dpr); canvas.height = Math.round(CANVAS * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const S = 0.6, CP = Math.cos(0.35), SP = Math.sin(0.35), C0 = CANVAS / 2;

    const draw = (dt) => {
      ctx.clearRect(0, 0, CANVAS, CANVAS);
      time += dt;
      P.rot += P.spin * dt;
      const yaw = P.rot + P.vortex, cyw = Math.cos(yaw), syw = Math.sin(yaw);
      const stepW = dt / 0.35;
      for (let q = 0; q < 4; q++) {
        const d = (q === P.prog ? 1 : 0) - pw[q];
        pw[q] += Math.abs(d) <= stepW ? d : d > 0 ? stepW : -stepW;
      }
      const decay = Math.exp(-dt / 0.5);
      const h0 = (time * 300) % N, h3 = (time * 480) % N;
      const a1 = time * 0.8, b1 = Math.sin(time * 0.5) * 0.9;
      const f1x = Math.cos(b1) * Math.cos(a1), f1y = Math.sin(b1), f1z = Math.cos(b1) * Math.sin(a1);
      const a2 = time * 0.55 + 2.1, b2 = Math.cos(time * 0.42) * 0.9;
      const f2x = Math.cos(b2) * Math.cos(a2), f2y = Math.sin(b2), f2z = Math.cos(b2) * Math.sin(a2);
      const lat = Math.sin(time * 2.2), swirlK = P.vortex * 1.5;

      for (let n = 0; n < N; n++) {
        const dx = DX[n], dy = DY[n], dz = DZ[n], u = DU[n];
        // programas de luz: cada fase acende os pontos de um jeito
        let pulse = 0;
        if (pw[0] > 0.001) { let dd = Math.abs(n - h0); if (dd > N - dd) dd = N - dd; const v = Math.max(0, 1 - dd / 16); pulse = Math.max(pulse, v * v * pw[0]); }
        if (pw[1] > 0.001) {
          const v = Math.max(Math.max(0, (dx * f1x + dy * f1y + dz * f1z - 0.72) / 0.28), Math.max(0, (dx * f2x + dy * f2y + dz * f2z - 0.72) / 0.28));
          pulse = Math.max(pulse, v * v * pw[1]);
        }
        if (pw[2] > 0.001) { const e = dy - lat; const v = Math.max(0, 1 - (e * e) / 0.02); pulse = Math.max(pulse, v * v * pw[2]); }
        if (pw[3] > 0.001) { let dd = Math.abs(n - h3); if (dd > N - dd) dd = N - dd; const v = Math.max(0, 1 - dd / 22); pulse = Math.max(pulse, v * v * pw[3]); }
        const l = Math.max(lit[n] * decay, pulse * P.gain);
        lit[n] = l;

        const ki = clamp01(P.k * (1 + S) - S * u);
        if (ki <= 0.001) { SC[n] = -1; continue; }
        const eo = E.out(ki), kk = eo * P.pop;
        const x1 = dx * cyw + dz * syw, z1 = -dx * syw + dz * cyw;
        const y2 = dy * CP - z1 * SP, z2 = dy * SP + z1 * CP;
        const f = 2.8 / (2.8 - z2), depth = (z2 + 1) / 2;
        let ox = x1 * ORB_R * kk * f, oy = -y2 * ORB_R * kk * f;
        if (swirlK > 0.001) {
          const sw = (1 - ki) * swirlK, cc = Math.cos(sw), ss = Math.sin(sw);
          const tx = ox * cc - oy * ss; oy = ox * ss + oy * cc; ox = tx;
        }
        const g = clamp01((P.sweep * 1.4 - u) / 0.4);
        let a = 0.1 + 0.035 * Math.sin(DS[n] + time * 1.6) * (1 - g) + 0.32 * depth * depth + 0.75 * l * (1 - g) + g * (0.55 + 0.4 * depth) + 2 * g * (1 - g);
        a = Math.max(a, P.floor * (0.7 + 0.3 * depth));
        if (a > 1) a = 1;
        a *= eo * P.alpha;
        SX[n] = C0 + ox; SY[n] = C0 + oy; SD[n] = depth;
        SR[n] = (1.15 * (0.45 + 0.75 * depth) * f + 0.9 * l + g * 0.25) * (1 + P.rad) * (0.4 + 0.6 * eo);
        const ai = Math.round(a * A_STEPS), gi = Math.round(g * G_STEPS);
        SC[n] = ai <= 0 ? -1 : gi * (A_STEPS + 1) + ai;
      }
      for (let pass = 0; pass < 2; pass++) {       // metade de trás primeiro
        for (let n = 0; n < N; n++) {
          const c = SC[n];
          if (c < 0 || (SD[n] >= 0.5) !== (pass === 1)) continue;
          ctx.fillStyle = COLORS[c];
          ctx.beginPath(); ctx.arc(SX[n], SY[n], SR[n], 0, TAU); ctx.fill();
        }
      }
    };
    const frame = (now) => {
      raf = 0;
      if (dead) return;
      const dt = reducedMotion() ? 0.016 : Math.max(0, Math.min(0.05, (now - last) / 1000)) * SPEED;
      last = now;
      draw(dt);
      if (P.alpha > 0.002) raf = requestAnimationFrame(frame);
      else ctx.clearRect(0, 0, CANVAS, CANVAS);
    };
    return {
      P, reset,
      ensure() { if (raf || dead || P.alpha <= 0.002) return; last = performance.now(); raf = requestAnimationFrame(frame); },
      destroy() { dead = true; if (raf) cancelAnimationFrame(raf); raf = 0; },
    };
  }

  /* ---------- linhas do tempo ---------- */
  const ASSEMBLE = [
    T('oBall', 1, 0, 0, 260, E.out),
    T('orb.k', 0, 1, 0, 800, E.out), T('orb.alpha', 0, 1, 0, 800, E.out), T('orb.spin', 0, 0.9, 0, 800, E.out),
    T('orb.pop', 1, 1.05, 0, 420, E.out), T('orb.pop', 1.05, 1, 420, 800, E.io),
    T('halo', 0, 1, 0, 600, E.out),
    T('sOp', 0, 1, 300, 620, E.out), T('sTy', 6, 0, 300, 620, E.out),
  ];
  const RESOLVE = [
    T('orb.sweep', 0, 1, 0, 700, E.io), T('orb.spin', 0.9, 0.3, 0, 700, E.out), T('orb.gain', 1, 0, 0, 700, E.out),
    T('orb.floor', 0, 0.95, 400, 900, E.out), T('orb.rad', 0, 0.15, 400, 900, E.out),
    T('orb.pop', 1, 1.04, 600, 800, E.out), T('orb.pop', 1.04, 1, 800, 900, E.out),
  ];
  const CONDENSE = [
    T('orb.pop', 1, 1.06, 0, 120, E.out),
    T('sOp', 1, 0, 0, 160, E.in), T('sTy', 0, -6, 0, 160, E.in),
    T('orb.k', 1, 0, 120, 640, E.vortex), T('orb.vortex', 0, 1.6, 120, 640, E.vortex),
    T('oDot', 0, 1, 260, 700, E.spring), T('ds', 0.55, 1, 260, 700, E.spring),
    T('pulse', 0, 1, 320, 760, E.out),
    T('orb.alpha', 1, 0, 500, 800, E.out),
  ];

  function attach(card, { compose, thread }) {
    const layer = document.createElement('div');
    layer.className = 'mo-layer';
    layer.setAttribute('aria-hidden', 'true');
    layer.innerHTML = `
      ${'<span class="mo-trail"></span>'.repeat(5)}
      <div class="mo-halo"></div>
      <div class="mo-actor">
        <div class="mo-surface"><i></i><i></i><i></i></div>
        <div class="mo-ball"></div>
        <div class="mo-dot"></div>
        <div class="mo-card"></div>
        <canvas class="mo-orb"></canvas>
        <div class="mo-pulse"></div>
      </div>
      <div class="mo-status"><span class="mo-lab"></span></div>`;
    card.append(layer);
    const actor = layer.querySelector('.mo-actor');
    const halo = layer.querySelector('.mo-halo');
    const status = layer.querySelector('.mo-status');
    const lab = layer.querySelector('.mo-lab');
    const pulseEl = layer.querySelector('.mo-pulse');
    const ghosts = [...layer.querySelectorAll('.mo-trail')];
    const orb = createOrb(layer.querySelector('.mo-orb'));
    const live = document.createElement('p');
    live.className = 'mo-live'; live.setAttribute('role', 'status'); live.setAttribute('aria-live', 'polite');
    card.append(live);

    const vals = {}, dirty = new Set();
    let geo = null, dir = -1, ctl = null, hist = [];
    let curX = 0, curY = 0, curD = BALL;

    const rel = (el) => {
      const c = card.getBoundingClientRect(), r = el.getBoundingClientRect();
      return { x: r.left - c.left, y: r.top - c.top, w: r.width, h: r.height, cx: r.left - c.left + r.width / 2, cy: r.top - c.top + r.height / 2 };
    };

    /* canais: cada um escreve uma variável CSS (ou um parâmetro da esfera) */
    const placeActor = () => {
      let x, y;
      if (geo.mode === 'fly') {
        const u = vals.u ?? 0;
        x = bez(u, geo.from.cx, (geo.from.cx + geo.to.cx) / 2 + dir * 0.3 * geo.H, geo.to.cx);
        y = bez(u, geo.from.cy, geo.to.cy + 0.6 * (geo.from.cy - geo.to.cy), geo.to.cy) + (vals.yOff ?? 0);
      } else {
        const m = vals.m ?? 0;
        x = lerp(geo.to.cx, geo.card?.cx ?? geo.to.cx, m);
        y = lerp(geo.to.cy, geo.card?.cy ?? geo.to.cy, m);
      }
      curX = x; curY = y;
      actor.style.transform = `translate3d(${fmt(x)}px,${fmt(y)}px,0) translate(-50%,-50%)`;
      halo.style.transform = `translate3d(${fmt(geo.to.cx)}px,${fmt(geo.to.cy)}px,0) translate(-50%,-50%)`;
      status.style.transform = `translate3d(${fmt(geo.to.cx)}px,${fmt(geo.to.cy + ORB_D / 2 + 22)}px,0) translate(-50%,0)`;
      const now = performance.now();
      hist.push({ t: now, x, y, d: curD });
      while (hist.length > 2 && hist[0].t < now - 500) hist.shift();
      renderTrail();
    };
    const renderTrail = () => {
      const vis = vals.trail ?? 0, now = performance.now();
      ghosts.forEach((g, i) => {
        if (vis <= 0.001 || !hist.length) { g.style.opacity = '0'; return; }
        const t = now - (i + 1) * 45;
        let s = hist[0];
        for (let k = hist.length - 1; k >= 0; k--) if (hist[k].t <= t) { s = hist[k]; break; }
        const k = (s.d * (1 - 0.1 * (i + 1))) / 100;
        g.style.transform = `translate3d(${fmt(s.x)}px,${fmt(s.y)}px,0) translate(-50%,-50%) scale(${fmt(k)})`;
        g.style.opacity = fmt(0.3 * Math.pow(1 - i / 5, 1.5) * vis);
      });
    };
    const CH = {
      w: (v) => { actor.style.setProperty('--w', fmt(v) + 'px'); curD = v; },
      h: (v) => actor.style.setProperty('--h', fmt(v) + 'px'),
      r: (v) => actor.style.setProperty('--r', fmt(v) + 'px'),
      u: placeActor, m: placeActor, yOff: placeActor,
      trail: renderTrail,
      comp: (v) => {
        compose.style.opacity = fmt(v);
        compose.style.filter = v >= 0.999 ? '' : `blur(${fmt((1 - v) * 10)}px)`;
        compose.style.transform = v >= 0.999 ? '' : `scale(${fmt(0.96 + 0.04 * v)}) translateY(${fmt(vals.cY ?? 0)}px)`;
      },
      cY: () => CH.comp(vals.comp ?? 1),
      halo: (v) => { halo.style.opacity = fmt(v * 0.9); },
      sOp: (v) => status.style.setProperty('--sOp', fmt(v)),
      sTy: (v) => status.style.setProperty('--sTy', fmt(v) + 'px'),
      pulse: (v) => {
        if (v <= 0 || v >= 1) { pulseEl.style.opacity = '0'; return; }
        pulseEl.style.opacity = fmt(0.5 * (1 - v));
        pulseEl.style.transform = `translate(-50%,-50%) scale(${fmt(1 + v)})`;
      },
    };
    ['oPill', 'oBall', 'oDot', 'ds', 'oCard'].forEach((n) => { CH[n] = (v) => actor.style.setProperty('--' + n, fmt(v)); });
    ['k', 'alpha', 'spin', 'sweep', 'pop', 'vortex', 'gain', 'floor', 'rad'].forEach((n) => {
      CH['orb.' + n] = (v) => { orb.P[n] = v; if (n === 'alpha') orb.ensure(); };
    });
    const setNow = (ch, v) => { vals[ch] = v; CH[ch]?.(v); };
    const flush = () => { dirty.forEach((ch) => CH[ch]?.(vals[ch])); dirty.clear(); };

    const play = (tracks, sig) => new Promise((res) => {
      if (sig.aborted) return res();
      const end = tracks.reduce((mx, k) => Math.max(mx, k.t1), 0);
      const done = new Set();
      let raf = 0, t = 0, last = performance.now();
      // aba em segundo plano não recebe quadros: a fase pula direto pro fim
      // (senão a resposta ficaria presa atrás do orbe até a pessoa voltar)
      // e, se o navegador parar de entregar quadros sem avisar (janela coberta),
      // um timer assume em 120 ms — a animação nunca fica presa no meio
      let timer = 0;
      const next = (fn) => {
        if (document.hidden) return setTimeout(() => fn(performance.now()), 0);
        let done = false;
        const run = (now) => { if (done) return; done = true; cancelAnimationFrame(id); clearTimeout(timer); fn(now); };
        const id = requestAnimationFrame(run);
        timer = setTimeout(() => run(performance.now()), 120);
        return id;
      };
      const stop = () => { cancelAnimationFrame(raf); clearTimeout(raf); clearTimeout(timer); res(); };
      sig.addEventListener('abort', stop, { once: true });
      const step = (now) => {
        t += Math.max(0, Math.min(100, now - last)) * SPEED;
        if (document.hidden) t = end;
        last = now;
        for (const k of tracks) {
          if (done.has(k) || t < k.t0) continue;
          const p = Math.min(1, (t - k.t0) / Math.max(1, k.t1 - k.t0));
          vals[k.ch] = k.from + (k.to - k.from) * k.ease(p);
          dirty.add(k.ch);
          if (p === 1) done.add(k);
        }
        flush();
        if (t >= end) { sig.removeEventListener('abort', stop); res(); } else raf = next(step);
      };
      raf = next(step);
    });
    const sleep = (ms, sig) => new Promise((res) => {
      if (sig.aborted) return res();
      const id = setTimeout(res, Math.max(0, ms));
      sig.addEventListener('abort', () => { clearTimeout(id); res(); }, { once: true });
    });

    let labelIdx = 0;
    const setLabel = (text, done) => {
      const old = lab.cloneNode(true);
      old.classList.add('is-out');
      lab.parentNode.append(old);
      setTimeout(() => old.remove(), 320);
      lab.classList.remove('is-in'); void lab.offsetWidth; lab.classList.add('is-in');
      lab.classList.toggle('is-done', !!done);
      lab.innerHTML = done ? `<b>${text}</b>` : `${text}<span class="mo-dots"><i></i><i></i><i></i></span>`;
    };

    const resetAll = () => {
      orb.reset();
      hist = [];
      ['oPill', 'oBall', 'oDot', 'oCard', 'halo', 'sOp', 'trail', 'u', 'm', 'yOff'].forEach((c) => setNow(c, 0));
      setNow('ds', 0.55); setNow('sTy', 6); setNow('pulse', 0);
      layer.classList.remove('is-active');
    };

    return {
      /** pílula → bola → voo → esfera pensando; resolve com a resposta da promessa */
      async think(promise) {
        ctl?.abort();
        ctl = new AbortController();
        const sig = ctl.signal;
        const reduced = reducedMotion();
        const from = rel(compose), area = rel(thread);
        // o orbe pousa no espaço livre logo abaixo da última mensagem; sem espaço, no meio da conversa
        const lastMsg = thread.lastElementChild ? rel(thread.lastElementChild) : null;
        const free = lastMsg ? area.y + area.h - (lastMsg.y + lastMsg.h) : 0;
        const cy = free >= ORB_D + 70
          ? lastMsg.y + lastMsg.h + Math.min(free, ORB_D + 110) / 2
          : area.y + Math.min(area.h * 0.46, area.h - ORB_D / 2 - 40);
        const to = { cx: area.cx, cy };
        geo = { mode: 'fly', from, to, H: Math.max(80, from.cy - to.cy) };
        dir = -dir;
        resetAll();
        layer.classList.add('is-active');
        setNow('w', from.w); setNow('h', from.h); setNow('r', Math.min(from.h / 2, 30)); setNow('oPill', 1); setNow('u', 0);
        labelIdx = 0; setLabel(LABELS[0]);
        live.textContent = 'O assistente está pensando';

        if (!reduced) {
          await play([
            T('comp', 1, 0, 0, 180, E.in),
            T('w', from.w, from.w - 12, 0, 100, E.out),
            T('w', from.w - 12, BALL, 100, 560, E.io),
            T('h', from.h, from.h + 6, 380, 500, E.out), T('h', from.h + 6, BALL, 500, 620, E.out),
            T('r', Math.min(from.h / 2, 30), BALL / 2, 100, 560, E.io),
            T('oPill', 1, 0, 300, 560, E.out), T('oBall', 0, 1, 300, 560, E.out),
            T('u', 0, 1, 620, 1500, E.fly),
            T('w', BALL, FLY_D, 620, 1300, E.grow), T('h', BALL, FLY_D, 620, 1300, E.grow), T('r', BALL / 2, FLY_D / 2, 620, 1300, E.grow),
            T('w', FLY_D, ORB_D, 1300, 1500, E.out), T('h', FLY_D, ORB_D, 1300, 1500, E.out), T('r', FLY_D / 2, ORB_D / 2, 1300, 1500, E.out),
            T('trail', 0, 1, 700, 800, E.out), T('trail', 1, 0, 1300, 1500, E.in),
          ], sig);
          if (sig.aborted) return null;
          await play(ASSEMBLE, sig);
        } else {
          setNow('u', 1); setNow('w', ORB_D); setNow('h', ORB_D); setNow('r', ORB_D / 2); setNow('oPill', 0);
          setNow('orb.k', 1); setNow('sTy', 0);
          await play([T('comp', 1, 0.35, 0, 200, E.out), T('orb.alpha', 0, 1, 0, 200, E.out), T('sOp', 0, 1, 0, 200, E.out), T('halo', 0, 1, 0, 200, E.out)], sig);
        }
        if (sig.aborted) return null;

        // pensa até a resposta chegar E o tempo mínimo passar
        const t0 = performance.now();
        let stop = false;
        (async () => {
          while (!stop && !sig.aborted) {
            await sleep(1150 / SPEED, sig);
            if (stop || sig.aborted) return;
            labelIdx = (labelIdx + 1) % LABELS.length;
            orb.P.prog = labelIdx % 4;
            setLabel(LABELS[labelIdx]);
          }
        })();
        let result, failed = null;
        try { result = await promise; } catch (err) { failed = err; }
        await sleep(MIN_THINK / SPEED - (performance.now() - t0), sig);
        stop = true;
        if (sig.aborted) return null;
        if (failed) throw failed;

        setLabel(DONE, true);
        if (!reduced) {
          await play(RESOLVE, sig);
          await play(CONDENSE, sig);
        } else {
          await play([T('orb.sweep', 0, 1, 0, 250, E.io), T('orb.floor', 0, 0.95, 0, 250, E.out)], sig);
          await play([T('oDot', 0, 1, 0, 250, E.out), T('orb.alpha', 1, 0, 0, 250, E.out), T('sOp', 1, 0, 0, 250, E.out)], sig);
          setNow('ds', 1);
        }
        return result;
      },

      /** o ponto se desdobra no balão da resposta (que precisa já estar no DOM, invisível) */
      async unfold(bubble, extra) {
        const sig = ctl?.signal || new AbortController().signal;
        const reduced = reducedMotion();
        const view = rel(thread);
        const b = rel(bubble);
        const top = Math.max(b.y, view.y + 8), bottom = Math.min(b.y + b.h, view.y + view.h - 6);
        const h = Math.max(48, bottom - top);
        geo.mode = 'card';
        geo.card = { cx: b.cx, cy: top + h / 2 };
        setNow('m', 0);
        const words = wrapWords(bubble);
        if (!reduced) {
          await play([
            T('w', ORB_D, 120, 0, 90, E.in), T('h', ORB_D, 120, 0, 90, E.in),
            T('w', 120, b.w, 90, 700, E.card), T('h', 120, h, 90, 700, E.out), T('r', ORB_D / 2, 18, 90, 700, E.io),
            T('m', 0, 1, 90, 700, E.card),
            T('oDot', 1, 0, 200, 560, E.out), T('oCard', 0, 1, 200, 560, E.out),
            T('halo', 1, 0, 300, 700, E.out),
          ], sig);
        } else {
          setNow('w', b.w); setNow('h', h); setNow('r', 18); setNow('m', 1);
          await play([T('oDot', 1, 0, 0, 160, E.out), T('oCard', 0, 1, 0, 160, E.out), T('halo', 1, 0, 0, 160, E.out)], sig);
        }
        // troca: o balão de verdade aparece por baixo do card e as palavras entram em cascata
        bubble.closest('.ai-msg')?.classList.remove('mo-pending');
        revealWords(words, reduced);
        extra?.forEach((n) => n.classList.add('mo-extra-in'));
        live.textContent = 'Resposta pronta';
        await play([T('oCard', 1, 0, 120, 380, E.out)], sig);
        await this.restore(true);
      },

      /** a pílula do compositor volta (subindo 8px) */
      async restore(fromAnswer) {
        const sig = (ctl = new AbortController()).signal;
        const reduced = reducedMotion();
        await play([
          T('cY', fromAnswer ? 8 : 0, 0, 0, 420, E.out),
          T('comp', vals.comp ?? 0, 1, 0, reduced ? 160 : 420, E.out),
          T('oDot', vals.oDot ?? 0, 0, 0, 200, E.out), T('oCard', vals.oCard ?? 0, 0, 0, 200, E.out),
          T('orb.alpha', orb.P.alpha, 0, 0, 200, E.out), T('sOp', vals.sOp ?? 0, 0, 0, 200, E.out), T('halo', vals.halo ?? 0, 0, 0, 200, E.out),
          T('oBall', vals.oBall ?? 0, 0, 0, 200, E.out),
        ], sig);
        compose.style.opacity = compose.style.filter = compose.style.transform = '';
        resetAll();
      },

      /** erro ou troca de projeto: some tudo e volta a pílula */
      cancel() { ctl?.abort(); return this.restore(false); },

      destroy() { ctl?.abort(); orb.destroy(); layer.remove(); live.remove(); },
    };
  }

  // palavras do balão viram spans (mantendo quebras e espaços) para a cascata
  function wrapWords(bubble) {
    const text = bubble.textContent;
    bubble.textContent = '';
    const words = [];
    text.split(/(\s+)/).forEach((part) => {
      if (!part) return;
      if (/^\s+$/.test(part)) { bubble.append(part); return; }
      const w = document.createElement('span');
      w.className = 'mo-w';
      w.textContent = part;
      bubble.append(w);
      words.push(w);
    });
    return words;
  }
  function revealWords(words, reduced) {
    const n = words.length;
    const stagger = reduced ? 0 : n > 1 ? Math.min(28, 520 / (n - 1)) : 0;
    words.forEach((w, i) => {
      w.style.transitionDelay = `${Math.round(i * stagger)}ms`;
      setTimeout(() => w.classList.add('is-in'), 20);
    });
  }

  return { attach };
})();
