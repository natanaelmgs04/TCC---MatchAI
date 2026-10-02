// Home: "Como funciona" e "Match inteligente" montados pela rolagem.
//
// Cada bloco [data-scrub] ganha um progresso p (0 quando o topo entra na
// tela, 1 quando o fim chega perto do meio) e o desenho segue p nos dois
// sentidos: rolar para baixo monta, rolar para cima desmonta. Movimentos
// grandes (linha, cartões, círculo, contagem) seguem p direto; detalhes
// pequenos (checks, tags, prévias) só ligam uma classe e a transição CSS faz
// o resto, com as curvas do site.
//
// Com prefers-reduced-motion as cenas montam do mesmo jeito, só com fade
// (.is-gentle); sem JS, tudo aparece pronto (estado padrão do CSS).
(() => {
  const blocks = [...document.querySelectorAll('[data-scrub]')];
  if (!blocks.length) return;

  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
  const seg = (p, a, b) => clamp01((p - a) / (b - a));
  const easeOut = (x) => 1 - Math.pow(1 - x, 3);
  const vertical = matchMedia('(max-width: 800px)');

  // p = 0 quando o topo do bloco está em `from` da altura da tela;
  // p = 1 quando o fim do bloco sobe até `to` da altura da tela
  function progress(el, from, to) {
    const r = el.getBoundingClientRect(), vh = innerHeight;
    const range = vh * (from - to) + r.height;
    return range > 0 ? clamp01((vh * from - r.top) / range) : 1;
  }

  const scenes = [];

  // ---------- Como funciona ----------
  const steps = document.querySelector('[data-scrub="steps"]');
  if (steps) {
    const fill = steps.querySelector('.steps-fill');
    const track = steps.querySelector('.steps-track');
    const list = [...steps.querySelectorAll('.step')];
    scenes.push(() => {
      if (vertical.matches) {
        // celular: linha vertical; cada etapa acende quando passa da linha de leitura
        const line = innerHeight * 0.72, tr = track.getBoundingClientRect();
        fill.style.setProperty('--fill', clamp01((line - tr.top) / tr.height).toFixed(4));
        list.forEach((s) => s.classList.toggle('is-on', s.getBoundingClientRect().top < line));
      } else {
        const p = progress(steps, 0.9, 0.62);
        const f = seg(p, 0.05, 0.75);
        fill.style.setProperty('--fill', f.toFixed(4));
        list.forEach((s, i) => s.classList.toggle('is-on', p > 0.04 && f >= i / (list.length - 1) - 0.01));
      }
    });
  }

  // ---------- Match inteligente ----------
  const demo = document.querySelector('[data-scrub="match"]');
  if (demo) {
    const lis = [...demo.querySelectorAll('.match-profile li')];
    const crits = [...demo.querySelectorAll('.match-crit')];
    const parts = [...demo.querySelectorAll('.result .arch-name, .result .arch-meta, .result .arch-quote, .result .tag')];
    const scoreEl = demo.querySelector('[data-score]');
    const arc = demo.querySelector('.score-arc circle');
    const live = demo.querySelector('[data-score-live]');
    const cta = demo.parentElement.querySelector('.match-cta');

    const target = () => crits.reduce((s, b) => s + (b.getAttribute('aria-pressed') === 'true' ? +b.dataset.w : 0), 0);
    let score = target();      // valor animado (muda quando o usuário liga/desliga um critério)
    let fillRing = 1;          // quanto do score já "carregou" com a rolagem

    const drawScore = () => {
      const v = score * fillRing;
      scoreEl.textContent = Math.round(v);
      arc.style.strokeDashoffset = (100 - v).toFixed(2);
    };

    scenes.push(() => {
      const p = progress(demo, 0.9, 0.6);
      const s = demo.style;
      s.setProperty('--a', easeOut(seg(p, 0, 0.18)).toFixed(3));
      lis.forEach((li, i) => li.classList.toggle('is-on', p > 0.12 + i * 0.055));
      s.setProperty('--w1', seg(p, 0.4, 0.5).toFixed(3));
      s.setProperty('--r', easeOut(seg(p, 0.42, 0.54)).toFixed(3));
      fillRing = easeOut(seg(p, 0.5, 0.7));
      s.setProperty('--w2', seg(p, 0.68, 0.76).toFixed(3));
      s.setProperty('--b', easeOut(seg(p, 0.72, 0.86)).toFixed(3));
      parts.forEach((el, i) => el.classList.toggle('is-shown', p > 0.8 + i * 0.022));
      const ready = p > 0.95;
      demo.classList.toggle('is-ready', ready);
      cta?.classList.toggle('is-waiting', !ready);
      drawScore();
    });

    // interação: desligar um critério derruba a compatibilidade (simulação)
    let tween = 0;
    crits.forEach((b) => b.addEventListener('click', () => {
      b.setAttribute('aria-pressed', String(b.getAttribute('aria-pressed') !== 'true'));
      const from = score, to = target(), t0 = performance.now(), dur = reduce ? 0 : 550;
      demo.classList.toggle('is-low', to < 70);
      if (live) live.textContent = `Compatibilidade: ${to}%`;
      cancelAnimationFrame(tween);
      const step = (now) => {
        const k = dur ? easeOut(clamp01((now - t0) / dur)) : 1;
        score = from + (to - from) * k;
        drawScore();
        if (k < 1) tween = requestAnimationFrame(step);
      };
      tween = requestAnimationFrame(step);
    }));
    drawScore();
  }

  // Motion reduzido: as cenas montam pela rolagem do mesmo jeito, mas só com
  // opacidade (.is-gentle no home-motion.css tira o deslocamento).
  blocks.forEach((b) => b.classList.add('is-scrub', ...(reduce ? ['is-gentle'] : [])));
  let ticking = false;
  const update = () => { ticking = false; scenes.forEach((fn) => fn()); };
  const request = () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } };
  addEventListener('scroll', request, { passive: true });
  addEventListener('resize', request);
  vertical.addEventListener?.('change', request);
  update();
})();

// ---------- Hero: profundidade com o mouse ----------
// A composição inclina na direção do cursor; os cartões de vidro (camadas
// .hero-layer com data-depth) andam mais que a foto, a foto anda ao
// contrário e um brilho suave segue o cursor — dá a sensação de volume.
// Só em ponteiro fino (mouse/trackpad) e sem motion reduzido; o movimento é
// amortecido (lerp) e o loop para sozinho quando chega no alvo.
(() => {
  const hero = document.querySelector('.hero');
  if (!hero || matchMedia('(prefers-reduced-motion: reduce)').matches || !matchMedia('(pointer: fine)').matches) return;
  const visual = hero.querySelector('.hero-visual');
  const img = hero.querySelector('.hero-photo img');
  const glow = hero.querySelector('.hero-glow');
  const layers = [...hero.querySelectorAll('.hero-layer')].map((el) => ({ el, depth: parseFloat(el.dataset.depth) || 16 }));
  if (!visual) return;
  const desktop = matchMedia('(min-width: 901px)');

  let tx = 0, ty = 0, x = 0, y = 0, raf = 0;
  const loop = () => {
    x += (tx - x) * 0.08;
    y += (ty - y) * 0.08;
    visual.style.transform = `perspective(1400px) rotateY(${(x * 6).toFixed(3)}deg) rotateX(${(-y * 5).toFixed(3)}deg)`;
    if (img) img.style.translate = `${(-x * 12).toFixed(2)}px ${(-y * 9).toFixed(2)}px`;
    layers.forEach(({ el, depth }) => { el.style.transform = `translate3d(${(x * depth).toFixed(2)}px, ${(y * depth * 0.7).toFixed(2)}px, 0)`; });
    raf = Math.abs(tx - x) + Math.abs(ty - y) > 0.0008 ? requestAnimationFrame(loop) : 0;
  };
  const kick = () => { if (!raf) raf = requestAnimationFrame(loop); };

  hero.addEventListener('pointermove', (e) => {
    const r = hero.getBoundingClientRect();
    glow?.style.setProperty('--mx', `${e.clientX - r.left}px`);
    glow?.style.setProperty('--my', `${e.clientY - r.top}px`);
    glow?.style.setProperty('--glow', '1');
    if (!desktop.matches) return;
    tx = ((e.clientX - r.left) / r.width) * 2 - 1;
    ty = ((e.clientY - r.top) / r.height) * 2 - 1;
    kick();
  });
  hero.addEventListener('pointerleave', () => {
    glow?.style.setProperty('--glow', '0');
    tx = ty = 0;
    kick();
  });
})();
