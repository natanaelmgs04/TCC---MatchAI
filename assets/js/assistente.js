// Assistente do painel do cliente: escolha do projeto + conversa com a IA
// (texto e fotos), briefing e envio aos arquitetos. Visual: gradiente WebGL,
// robô 3D (cena Spline) que reage ao mouse sozinho e card de vidro líquido.
// Uso (dashboard.js): MatchAssistant.mount(elemento, { user, getProjects, ... }).
const MatchAssistant = (() => {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // ======================================================================
  // Gradiente animado (WebGL2) — mesmo shader do componente de referência,
  // com paleta da marca e troca automática claro/escuro.
  // ======================================================================
  const isDark = () => {
    const t = document.documentElement.dataset.theme;
    if (t === 'dark') return true;
    if (t === 'light') return false;
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  };
  const PALETTES = {
    light: { color1: '#F7EADF', color2: '#DCA083', color3: '#A9BFAE' },
    dark:  { color1: '#15120F', color2: '#8C5640', color3: '#3B4E40' },
  };
  const GRADIENT = {
    rotation: 24, proportion: 52, scale: 0.5, speed: 12, distortion: 9,
    swirl: 55, swirlIterations: 8, softness: 100, offset: 140, shape: 'Checks', shapeSize: 26,
  };
  const SHAPES = { Checks: 0, Stripes: 1, Edge: 2 };

  const VERT = `#version 300 es
  in vec4 a_position;
  void main() { gl_Position = a_position; }`;

  const FRAG = `#version 300 es
  precision highp float;
  uniform float u_time; uniform float u_pixelRatio; uniform vec2 u_resolution;
  uniform float u_scale; uniform float u_rotation;
  uniform vec4 u_color1; uniform vec4 u_color2; uniform vec4 u_color3;
  uniform float u_proportion; uniform float u_softness; uniform float u_shape; uniform float u_shapeScale;
  uniform float u_distortion; uniform float u_swirl; uniform float u_swirlIterations;
  out vec4 fragColor;
  #define TWO_PI 6.28318530718
  #define PI 3.14159265358979323846
  vec2 rotate(vec2 uv, float th) { return mat2(cos(th), sin(th), -sin(th), cos(th)) * uv; }
  float random(vec2 st) { return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123); }
  float noise(vec2 st) {
    vec2 i = floor(st); vec2 f = fract(st);
    float a = random(i); float b = random(i + vec2(1.0, 0.0));
    float c = random(i + vec2(0.0, 1.0)); float d = random(i + vec2(1.0, 1.0));
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }
  vec4 blend_colors(vec4 c1, vec4 c2, vec4 c3, float mixer, float edgesWidth, float edge_blur) {
    vec3 color1 = c1.rgb * c1.a; vec3 color2 = c2.rgb * c2.a; vec3 color3 = c3.rgb * c3.a;
    float r1 = smoothstep(.0 + .35 * edgesWidth, .7 - .35 * edgesWidth + .5 * edge_blur, mixer);
    float r2 = smoothstep(.3 + .35 * edgesWidth, 1. - .35 * edgesWidth + edge_blur, mixer);
    vec3 blended_color_2 = mix(color1, color2, r1);
    float blended_opacity_2 = mix(c1.a, c2.a, r1);
    vec3 c = mix(blended_color_2, color3, r2);
    float o = mix(blended_opacity_2, c3.a, r2);
    return vec4(c, o);
  }
  void main() {
    vec2 uv = gl_FragCoord.xy / u_resolution.xy;
    float t = .5 * u_time;
    float noise_scale = .0005 + .006 * u_scale;
    uv -= .5; uv *= (noise_scale * u_resolution);
    uv = rotate(uv, u_rotation * .5 * PI);
    uv /= u_pixelRatio; uv += .5;
    float n1 = noise(uv * 1. + t); float n2 = noise(uv * 2. - t);
    float angle = n1 * TWO_PI;
    uv.x += 4. * u_distortion * n2 * cos(angle);
    uv.y += 4. * u_distortion * n2 * sin(angle);
    float iterations_number = ceil(clamp(u_swirlIterations, 1., 30.));
    for (float i = 1.; i <= iterations_number; i++) {
      uv.x += clamp(u_swirl, 0., 2.) / i * cos(t + i * 1.5 * uv.y);
      uv.y += clamp(u_swirl, 0., 2.) / i * cos(t + i * 1. * uv.x);
    }
    float proportion = clamp(u_proportion, 0., 1.);
    float shape = 0.; float mixer = 0.;
    if (u_shape < .5) {
      vec2 checks_shape_uv = uv * (.5 + 3.5 * u_shapeScale);
      shape = .5 + .5 * sin(checks_shape_uv.x) * cos(checks_shape_uv.y);
      mixer = shape + .48 * sign(proportion - .5) * pow(abs(proportion - .5), .5);
    } else if (u_shape < 1.5) {
      vec2 stripes_shape_uv = uv * (.25 + 3. * u_shapeScale);
      float f = fract(stripes_shape_uv.y);
      shape = smoothstep(.0, .55, f) * smoothstep(1., .45, f);
      mixer = shape + .48 * sign(proportion - .5) * pow(abs(proportion - .5), .5);
    } else {
      float sh = 1. - uv.y; sh -= .5; sh /= (noise_scale * u_resolution.y); sh += .5;
      float shape_scaling = .2 * (1. - u_shapeScale);
      shape = smoothstep(.45 - shape_scaling, .55 + shape_scaling, sh + .3 * (proportion - .5));
      mixer = shape;
    }
    vec4 color_mix = blend_colors(u_color1, u_color2, u_color3, mixer, 1. - clamp(u_softness, 0., 1.), .01 + .01 * u_scale);
    fragColor = vec4(color_mix.rgb, color_mix.a);
  }`;

  const hexToRgba = (hex) => {
    const c = hex.replace('#', '');
    return [parseInt(c.slice(0, 2), 16) / 255, parseInt(c.slice(2, 4), 16) / 255, parseInt(c.slice(4, 6), 16) / 255, 1];
  };

  function initGradient(stage) {
    const box = stage.querySelector('.ai-gradient');
    const canvas = stage.querySelector('.ai-gradient canvas');
    const gl = canvas.getContext('webgl2', { premultipliedAlpha: true, alpha: true, antialias: false });
    if (!gl) return; // sem WebGL2: o fundo CSS (gradiente estático) continua valendo

    const compile = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.warn(gl.getShaderInfoLog(s)); return null; }
      return s;
    };
    const vs = compile(gl.VERTEX_SHADER, VERT);
    const fs = compile(gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return;
    const program = gl.createProgram();
    gl.attachShader(program, vs); gl.attachShader(program, fs); gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;
    gl.useProgram(program);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(program, 'a_position');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    const U = {};
    ['u_time', 'u_resolution', 'u_pixelRatio', 'u_scale', 'u_rotation', 'u_color1', 'u_color2', 'u_color3',
      'u_proportion', 'u_softness', 'u_shape', 'u_shapeScale', 'u_distortion', 'u_swirl', 'u_swirlIterations']
      .forEach(n => { U[n] = gl.getUniformLocation(program, n); });

    // O gradiente é macio: renderizar a ~60% da resolução não tem perda visível e poupa GPU.
    const RENDER_SCALE = 0.6;
    let colors = PALETTES[isDark() ? 'dark' : 'light'];
    const start = performance.now();
    function draw(now) {
      const w = Math.max(1, Math.round(box.clientWidth * RENDER_SCALE));
      const h = Math.max(1, Math.round(box.clientHeight * RENDER_SCALE));
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      gl.viewport(0, 0, canvas.width, canvas.height);
      const elapsed = reduceMotion ? 6 : (now - start) / 1000;
      const speed = (GRADIENT.speed / 100) * 5;
      gl.uniform1f(U.u_time, elapsed * speed + GRADIENT.offset * 0.01);
      gl.uniform2f(U.u_resolution, canvas.width, canvas.height);
      gl.uniform1f(U.u_pixelRatio, RENDER_SCALE);
      gl.uniform1f(U.u_scale, GRADIENT.scale);
      gl.uniform1f(U.u_rotation, (GRADIENT.rotation * Math.PI) / 180);
      gl.uniform4f(U.u_color1, ...hexToRgba(colors.color1));
      gl.uniform4f(U.u_color2, ...hexToRgba(colors.color2));
      gl.uniform4f(U.u_color3, ...hexToRgba(colors.color3));
      gl.uniform1f(U.u_proportion, GRADIENT.proportion / 100);
      gl.uniform1f(U.u_softness, GRADIENT.softness / 100);
      gl.uniform1f(U.u_shape, SHAPES[GRADIENT.shape]);
      gl.uniform1f(U.u_shapeScale, GRADIENT.shapeSize / 100);
      gl.uniform1f(U.u_distortion, GRADIENT.distortion / 50);
      gl.uniform1f(U.u_swirl, GRADIENT.swirl / 100);
      gl.uniform1f(U.u_swirlIterations, GRADIENT.swirl === 0 ? 0 : GRADIENT.swirlIterations);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }

    // Só anima com a aba visível e o palco na tela (o painel troca de aba com hidden)
    let visible = false, raf = 0;
    function loop(now) { draw(now); raf = requestAnimationFrame(loop); }
    function sync() {
      const run = visible && !document.hidden && !reduceMotion;
      if (run && !raf) raf = requestAnimationFrame(loop);
      if (!run && raf) { cancelAnimationFrame(raf); raf = 0; }
      if (!run && visible) draw(performance.now());
    }
    new IntersectionObserver(([e]) => { visible = e.isIntersecting; sync(); }).observe(stage);
    document.addEventListener('visibilitychange', sync);
    new ResizeObserver(() => { if (visible && !raf) draw(performance.now()); }).observe(box);
    const applyTheme = () => { colors = PALETTES[isDark() ? 'dark' : 'light']; if (visible && !raf) draw(performance.now()); };
    new MutationObserver(applyTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
  }

  // ======================================================================
  // Robô 3D (cena Spline): a interação com o mouse (cabeça/olhos seguindo o
  // cursor) já vem embutida na própria cena — o runtime só carrega e
  // desenha; não escrevemos nenhuma lógica de câmera/cursor aqui.
  // ======================================================================
  // Versão fixa (não "latest"): já testamos que esta carrega a cena sem
  // erro; o build "+esm" do jsdelivr é WebGPU-only e falha nela, por isso
  // usamos o arquivo ESM publicado pelo próprio pacote.
  const SPLINE_RUNTIME_URL = 'https://cdn.jsdelivr.net/npm/@splinetool/runtime@2.0.65/build/runtime.js';
  const SPLINE_SCENE_URL = 'https://prod.spline.design/kZDDjO5HuC9GJUM2/scene.splinecode';

  function initSpline(stage) {
    const canvas = stage.querySelector('.ai-spline');
    if (!canvas) return;
    // A cena tem interação de câmera contínua embutida, sem opção pública de
    // desligar só isso — quem pede menos movimento não carrega o robô 3D e
    // fica só com o gradiente de fundo (que já preenche o palco sozinho).
    if (reduceMotion || !window.WebGL2RenderingContext) return;

    let app = null, visible = true, disposed = false;
    function resize() { if (app) app.setSize(Math.max(1, canvas.clientWidth), Math.max(1, canvas.clientHeight)); }
    function sync() { if (app) { if (visible && !document.hidden) app.play(); else app.stop(); } }

    import(SPLINE_RUNTIME_URL)
      .then(({ Application }) => {
        if (disposed) return null;
        app = new Application(canvas);
        return app.load(SPLINE_SCENE_URL);
      })
      .then(() => {
        if (disposed || !app) return;
        resize();
        canvas.classList.add('is-ready');
        new ResizeObserver(resize).observe(canvas);
        new IntersectionObserver(([e]) => { visible = e.isIntersecting; sync(); }).observe(stage);
        document.addEventListener('visibilitychange', sync);
      })
      .catch((err) => {
        // Sem internet, CDN fora do ar ou GPU sem suporte: some com o robô e
        // deixa só o gradiente — igual ao resto do site, nunca quebra a tela.
        console.warn('Robô 3D indisponível, mantendo só o gradiente de fundo:', err?.message || err);
        canvas.remove();
      });

    return () => { disposed = true; try { app?.dispose(); } catch { /* já descartado */ } };
  }

  // Brilho que segue o cursor com um campo do assistente em foco
  function initGlow(stage) {
    const glow = stage.querySelector('.ai-glow');
    if (reduceMotion) return;
    let mx = 0, my = 0, gx = 0, gy = 0, raf = 0;
    window.addEventListener('mousemove', (e) => {
      const r = stage.getBoundingClientRect();
      mx = e.clientX - r.left; my = e.clientY - r.top;
      if (!raf && stage.offsetParent !== null) raf = requestAnimationFrame(step);
    }, { passive: true });
    function step() {
      raf = 0;
      gx += (mx - gx) * 0.08; gy += (my - gy) * 0.08;
      glow.style.transform = `translate3d(${gx}px, ${gy}px, 0)`;
      if (Math.abs(mx - gx) + Math.abs(my - gy) > 0.5) raf = requestAnimationFrame(step);
    }
    stage.addEventListener('focusin', (e) => { if (e.target.matches('.ai-input')) stage.classList.add('is-focused'); });
    stage.addEventListener('focusout', (e) => { if (e.target.matches('.ai-input')) stage.classList.remove('is-focused'); });
  }

  // ======================================================================
  // Utilidades de DOM e de imagem
  // ======================================================================
  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  };
  const SVG = (d, size = 16) => `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const ICONS = {
    style: SVG('<circle cx="13.5" cy="6.5" r=".5"/><circle cx="17.5" cy="10.5" r=".5"/><circle cx="8.5" cy="7.5" r=".5"/><circle cx="6.5" cy="12.5" r=".5"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/>'),
    budget: SVG('<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>'),
    materials: SVG('<path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"/><path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"/>'),
    brief: SVG('<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>'),
    x: SVG('<path d="M18 6 6 18"/><path d="m6 6 12 12"/>', 11),
    arrow: SVG('<path d="m9 18 6-6-6-6"/>', 18),
    plus: SVG('<path d="M12 5v14"/><path d="M5 12h14"/>', 18),
    back: SVG('<path d="m15 18-6-6 6-6"/>', 14),
    paperclip: SVG('<path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/>', 18),
    command: SVG('<path d="M15 6v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3"/>', 18),
    send: SVG('<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>', 17),
    arrowUp: SVG('<path d="M12 19V5"/><path d="M5.5 11.5L12 5l6.5 6.5"/>', 18),
  };
  const COMMANDS = [
    { prefix: '/estilo',    label: 'Descobrir meu estilo', icon: ICONS.style,     fill: 'Quero descobrir meu estilo de decoração. ' },
    { prefix: '/orcamento', label: 'Estimar orçamento',    icon: ICONS.budget,    fill: 'Quero estimar o orçamento deste projeto. ' },
    { prefix: '/materiais', label: 'Sugerir materiais',    icon: ICONS.materials, fill: 'Quero sugestões de materiais para este projeto. ' },
    { prefix: '/briefing',  label: 'Gerar briefing',       icon: ICONS.brief,     action: 'briefing' },
  ];

  // A IA às vezes solta markdown mesmo pedindo texto simples — limpa o mais comum.
  const plain = (t) => String(t || '').replace(/\*\*(.+?)\*\*/g, '$1').replace(/^\s*\*\s+/gm, '- ').replace(/^#+\s*/gm, '');

  /** Reduz a foto no navegador (vai pra IA em JPEG ~1280px) e gera a miniatura que fica na conversa. */
  async function processImage(file) {
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error('Use fotos JPEG, PNG ou WebP.');
    let bmp;
    try { bmp = await createImageBitmap(file); }
    catch { throw new Error('Não consegui abrir essa foto. Tente outra.'); }
    const render = (max, q) => {
      const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
      const c = document.createElement('canvas');
      c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); // PNG transparente vira fundo branco no JPEG
      ctx.drawImage(bmp, 0, 0, c.width, c.height);
      return c.toDataURL('image/jpeg', q);
    };
    let full = render(1280, 0.82);
    if (full.length > 1_300_000) full = render(1024, 0.7);
    const thumb = render(240, 0.7); // antes do close(): depois dele o bitmap não pode mais ser desenhado
    bmp.close?.();
    return { mime: 'image/jpeg', data: full.split(',')[1], thumb };
  }

  // ======================================================================
  // Montagem do palco e do chat
  // ======================================================================
  const STAGE_HTML = `
    <div class="ai-stage">
      <div class="ai-gradient" aria-hidden="true"><canvas></canvas></div>
      <div class="ai-spline-wrap" aria-hidden="true">
        <canvas class="ai-spline"></canvas>
      </div>
      <div class="ai-veil" aria-hidden="true"></div>
      <div class="ai-glow" aria-hidden="true"></div>

      <div class="ai-shell">
        <div class="ai-column">
          <span class="eyebrow ai-eyebrow">Assistente match.IA</span>
          <h2 class="ai-title"></h2>
          <p class="ai-lead"></p>

          <div class="ai-card">
            <!-- Vista 1: escolher o projeto -->
            <div class="ai-view" data-view="picker">
              <div class="ai-card-head">
                <img src="assets/img/mark.png" alt="" width="30" height="30">
                <div class="ai-card-id">
                  <strong class="logo-word">match<span class="ia">.IA</span></strong>
                  <span class="ai-status"><i aria-hidden="true"></i> Online</span>
                </div>
              </div>
              <div class="ai-picker" data-ref="pickerList"></div>
            </div>

            <!-- Vista 2: conversa sobre o projeto escolhido -->
            <div class="ai-view" data-view="chat" hidden>
              <div class="ai-card-head">
                <button type="button" class="ai-pill" data-ref="back" aria-label="Trocar de projeto">${ICONS.back} Projetos</button>
                <div class="ai-card-id">
                  <strong class="logo-word">match<span class="ia">.IA</span></strong>
                  <span class="ai-status"><i aria-hidden="true"></i> Online</span>
                </div>
                <button type="button" class="ai-pill ai-pill--accent" data-ref="briefBtn" aria-label="Gerar briefing">${ICONS.brief}<span class="ai-lbl-long">Gerar briefing</span><span class="ai-lbl-short">Briefing</span></button>
                <button type="button" class="ai-pill" data-ref="resetBtn" title="Apagar esta conversa e recomeçar">Reiniciar</button>
              </div>
              <div class="ai-thread" data-ref="thread" role="log" aria-live="polite" aria-label="Conversa"></div>
              <div class="ai-compose">
                <div class="ai-palette" data-ref="palette" role="listbox" aria-label="Comandos" hidden></div>
                <p class="ai-error" data-ref="error" role="alert"></p>
                <div class="ai-attachments" data-ref="attachments" aria-label="Fotos anexadas"></div>
                <!-- pílula do compositor: é ela que vira o orbe ao enviar (assets/js/morph-orb.js) -->
                <div class="mo-pill" data-ref="pill">
                  <span class="mo-pill-glow" aria-hidden="true"></span>
                  <span class="mo-pill-aurora" aria-hidden="true"><i></i><i></i><i></i></span>
                  <svg class="mo-spark" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 3.5l1.7 4.8 4.8 1.7-4.8 1.7L10 16.5l-1.7-4.8L3.5 10l4.8-1.7L10 3.5z"/><path d="M18 14.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7.7-1.8z"/></svg>
                  <div class="ai-tools">
                    <button type="button" class="ai-tool" data-ref="attach" aria-label="Anexar fotos do espaço" title="Anexar fotos do espaço">${ICONS.paperclip}</button>
                    <button type="button" class="ai-tool" data-ref="commands" aria-label="Abrir comandos" aria-expanded="false" title="Comandos (digite /)">${ICONS.command}</button>
                    <input type="file" data-ref="file" accept="image/jpeg,image/png,image/webp" multiple hidden>
                  </div>
                  <textarea class="ai-input" data-ref="input" rows="1" maxlength="1500"
                            placeholder="Pergunte qualquer coisa sobre o projeto…" aria-label="Mensagem para o assistente"></textarea>
                  <button type="button" class="ai-send" data-ref="send" aria-label="Enviar" disabled>${ICONS.arrowUp}</button>
                </div>
                <span class="ai-hint">Enter envia · Shift+Enter quebra a linha</span>
              </div>

              <!-- Escolha dos arquitetos que recebem o briefing -->
              <div class="ai-sheet" data-ref="sheet" hidden></div>
            </div>
          </div>

          <div class="ai-chips" data-ref="chips" hidden></div>
          <p class="ai-note">Sem custo para o cliente. As fotos são enviadas à IA (Google Gemini) só para analisar o espaço; o match.IA guarda apenas uma miniatura na conversa.</p>
        </div>
      </div>
      <div class="ai-cursor-hint" aria-hidden="true"><span></span> Mova o mouse — ele acompanha você</div>
    </div>`;

  const STATUS_LABEL = { draft: 'Rascunho', matching: 'Buscando arquiteto', in_progress: 'Em andamento', completed: 'Concluído' };

  /**
   * opts: { user, getProjects(), onCreateProject(), onRunMatch(projectId),
   *         onOpenConversation(architectId, name) }
   */
  function mount(host, opts) {
    host.innerHTML = STAGE_HTML;
    const stage = host.querySelector('.ai-stage');
    const $ = (ref) => stage.querySelector(`[data-ref="${ref}"]`);
    const refs = Object.fromEntries(
      ['pickerList', 'back', 'briefBtn', 'resetBtn', 'thread', 'palette', 'input', 'error', 'attachments', 'attach', 'commands', 'file', 'send', 'sheet', 'chips', 'pill']
        .map((r) => [r, $(r)]),
    );
    const title = stage.querySelector('.ai-title');
    const lead = stage.querySelector('.ai-lead');
    const views = { picker: stage.querySelector('[data-view="picker"]'), chat: stage.querySelector('[data-view="chat"]') };

    initGradient(stage);
    initSpline(stage);
    initGlow(stage);

    let project = null;       // projeto escolhido
    let chat = null;          // estado vindo do servidor
    let photos = [];          // fotos prontas pra enviar { mime, data, thumb }
    let busy = false;
    let userTurns = 0;
    let loadToken = 0;

    // ---------- Vistas ----------
    // orbe que pensa (assets/js/morph-orb.js); sem o script, cai no "digitando…"
    const orb = typeof MorphOrb !== 'undefined' ? MorphOrb.attach(stage.querySelector('.ai-card'), { compose: refs.pill, thread: refs.thread }) : null;

    function setView(name) {
      Object.entries(views).forEach(([k, v]) => { v.hidden = k !== name; });
      stage.dataset.view = name; // o CSS do desktop muda o layout conforme a vista
      refs.chips.hidden = name !== 'chat';
      if (name === 'picker') {
        title.innerHTML = 'Sobre qual projeto<br><em>vamos conversar?</em>';
        lead.textContent = 'Escolha um dos seus projetos. Eu ajudo a definir estilo, materiais e orçamento e, no final, monto o briefing para os arquitetos que você escolher.';
      } else {
        title.textContent = '';
        const a = document.createTextNode('Conversando sobre ');
        const em = el('em', '', project.name);
        title.append(a, em);
        lead.textContent = 'Conte o que imagina, anexe fotos do local e peça sugestões. Quando estiver pronto, gere o briefing.';
      }
    }

    function renderPicker() {
      const projects = opts.getProjects() || [];
      refs.pickerList.textContent = '';
      refs.pickerList.append(el('div', 'ai-picker-title', 'Seus projetos'));
      if (!projects.length) {
        refs.pickerList.append(el('p', 'ai-empty', 'Você ainda não tem projetos. Crie o primeiro para conversar com o assistente.'));
      }
      projects.forEach((p) => {
        const b = el('button', 'ai-project');
        b.type = 'button';
        const main = el('span', 'ai-project-main');
        const meta = [STATUS_LABEL[p.status] || 'Rascunho', p.propertyType, p.areaM2 ? `${p.areaM2} m²` : ''].filter(Boolean).join(' · ');
        main.append(el('strong', '', p.name), el('span', '', meta));
        b.append(main);
        b.insertAdjacentHTML('beforeend', ICONS.arrow);
        b.addEventListener('click', () => openProject(p));
        refs.pickerList.append(b);
      });
      const add = el('button', 'ai-project ai-project--new');
      add.type = 'button';
      add.insertAdjacentHTML('afterbegin', ICONS.plus);
      add.append(el('span', 'ai-project-main', 'Criar um novo projeto'));
      add.addEventListener('click', () => opts.onCreateProject && opts.onCreateProject());
      refs.pickerList.append(add);
    }

    function showPicker() {
      project = null; chat = null; photos = [];
      setView('picker');
      renderPicker();
    }
    refs.back.addEventListener('click', showPicker);

    // ---------- Mensagens ----------
    const scrollDown = () => { refs.thread.scrollTop = refs.thread.scrollHeight; };

    function addUser(text, thumbs) {
      const m = el('div', 'ai-msg ai-msg--user');
      if (thumbs && thumbs.length) {
        const ph = el('div', 'ai-msg-photos');
        thumbs.forEach((t) => { const i = el('img'); i.src = t; i.alt = 'Foto enviada'; ph.append(i); });
        m.append(ph);
      }
      if (text) m.append(el('div', 'ai-bubble', text));
      refs.thread.append(m); scrollDown();
      return m;
    }

    function productCard(p) {
      const card = el('div', 'ai-product');
      if (p.photo) { const i = el('img'); i.src = p.photo; i.alt = ''; card.append(i); }
      const info = el('div', 'ai-product-info');
      info.append(el('strong', '', p.name), el('span', '', [p.storeName || 'Loja parceira', p.price ? `R$${p.price}` : ''].filter(Boolean).join(' · ')));
      const btn = el('button', 'ai-pill', 'Simular compra');
      btn.type = 'button';
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        try {
          await MatchAPI.createStoreReferral(p.id, project._id);
          btn.textContent = 'Compra simulada registrada';
        } catch (err) { btn.disabled = false; btn.textContent = err.message || 'Tente de novo'; }
      });
      card.append(info, btn);
      return card;
    }

    function addBot(text, products, pending) {
      const m = el('div', 'ai-msg ai-msg--bot' + (pending ? ' mo-pending' : ''));
      const av = el('img', 'ai-avatar'); av.src = 'assets/img/mark.png'; av.alt = '';
      const body = el('div', 'ai-msg-body');
      if (text) body.append(el('div', 'ai-bubble', plain(text)));
      if (products && products.length) {
        const list = el('div', 'ai-products');
        products.forEach((p) => list.append(productCard(p)));
        if (pending) list.classList.add('mo-extra');
        body.append(list);
      }
      m.append(av, body);
      refs.thread.append(m); scrollDown();
      return { root: m, body };
    }

    function addTyping(label) {
      const { root, body } = addBot('');
      const dots = el('div', 'ai-bubble ai-typing');
      dots.innerHTML = '<i></i><i></i><i></i>';
      dots.setAttribute('aria-label', label || 'O assistente está digitando');
      body.append(dots);
      return root;
    }

    function addNote(text) {
      const n = el('div', 'ai-note-line', text);
      refs.thread.append(n); scrollDown();
      return n;
    }

    const showError = (msg) => { refs.error.textContent = msg || ''; };
    function setBusy(v) {
      busy = v;
      refs.send.classList.toggle('is-busy', v);
      refs.briefBtn.disabled = v;
      refresh();
    }

    // ---------- Briefing ----------
    function addBriefing(briefing) {
      refs.thread.querySelectorAll('[data-briefing-msg]').forEach((n) => n.remove());
      const m = el('div', 'ai-msg ai-msg--bot');
      m.dataset.briefingMsg = '1';
      const av = el('img', 'ai-avatar'); av.src = 'assets/img/mark.png'; av.alt = '';
      const body = el('div', 'ai-msg-body');
      const card = el('div', 'ai-briefing');
      card.append(el('h4', '', `Briefing — ${project.name}`));
      const dl = el('dl');
      BRIEFING_FIELDS.forEach(([key, label]) => {
        if (!briefing[key]) return;
        const wrap = el('div');
        wrap.append(el('dt', '', label), el('dd', '', briefing[key]));
        dl.append(wrap);
      });
      card.append(dl);
      const actions = el('div', 'ai-actions');
      const send = el('button', 'ai-pill ai-pill--accent', 'Escolher arquitetos e enviar');
      send.type = 'button';
      send.addEventListener('click', openSheet);
      const redo = el('button', 'ai-pill', 'Gerar de novo');
      redo.type = 'button';
      redo.addEventListener('click', makeBriefing);
      actions.append(send, redo);
      card.append(actions);
      body.append(card);
      m.append(av, body);
      refs.thread.append(m); scrollDown();
    }

    async function makeBriefing() {
      if (busy) return;
      showError('');
      if (userTurns < 2) { showError('Converse um pouco mais com o assistente antes de gerar o briefing.'); return; }
      setBusy(true);
      const typing = addTyping('Montando o briefing');
      try {
        const { briefing } = await MatchAPI.assistantBriefing(project._id);
        typing.remove();
        chat.briefing = briefing;
        addBriefing(briefing);
      } catch (err) {
        typing.remove();
        showError(err.message || 'Não foi possível gerar o briefing agora.');
      } finally { setBusy(false); }
    }
    refs.briefBtn.addEventListener('click', makeBriefing);

    // ---------- Escolha dos arquitetos ----------
    async function openSheet() {
      const sheet = refs.sheet;
      sheet.hidden = false;
      sheet.textContent = '';
      sheet.append(el('h3', '', 'Enviar briefing para…'), el('p', '', 'Carregando os arquitetos do seu match…'));

      let candidates = [];
      try {
        const history = await MatchAPI.matchHistory();
        const entry = history.find((h) => h.project && String(h.project._id || h.project.id) === String(project._id));
        candidates = entry ? entry.results.filter((r) => r.category === 'main' && r.architect).sort((a, b) => b.score - a.score) : [];
      } catch (err) {
        sheet.textContent = '';
        sheet.append(el('h3', '', 'Enviar briefing para…'), el('p', '', err.message || 'Não foi possível carregar seus matches agora.'));
        addSheetFoot(sheet, null);
        return;
      }

      sheet.textContent = '';
      sheet.append(el('h3', '', 'Enviar briefing para…'));
      if (!candidates.length) {
        sheet.append(el('p', '', 'Você ainda não rodou o match para este projeto. Rode agora para ver os arquitetos compatíveis e escolher quem recebe o briefing.'));
        addSheetFoot(sheet, null);
        return;
      }
      sheet.append(el('p', '', 'Escolha um ou mais arquitetos do seu match. O briefing chega na caixa de mensagens deles e a conversa continua aqui no painel.'));
      const already = new Set((chat.sentTo || []).map((s) => String(s.architectId)));
      const list = el('div', 'ai-sheet-list');
      const checks = [];
      candidates.forEach((r) => {
        const a = r.architect;
        const id = String(a._id || a.id);
        const row = el('label', 'ai-arch' + (already.has(id) ? ' is-sent' : ''));
        const cb = el('input'); cb.type = 'checkbox'; cb.value = id; cb.disabled = already.has(id);
        const main = el('span', 'ai-arch-main');
        main.append(el('strong', '', a.name), el('span', '', already.has(id) ? 'Briefing já enviado' : [a.city, a.state].filter(Boolean).join('/')));
        row.append(cb, main, el('span', 'ai-arch-score', `${r.score}%`));
        list.append(row);
        checks.push(cb);
      });
      sheet.append(list);
      addSheetFoot(sheet, checks);
    }

    function addSheetFoot(sheet, checks) {
      const foot = el('div', 'ai-sheet-foot');
      const cancel = el('button', 'ai-pill', 'Cancelar');
      cancel.type = 'button';
      cancel.addEventListener('click', () => { sheet.hidden = true; });
      foot.append(cancel);
      if (checks) {
        const go = el('button', 'ai-pill ai-pill--accent', 'Enviar briefing');
        go.type = 'button'; go.disabled = true;
        const update = () => {
          const n = checks.filter((c) => c.checked).length;
          go.disabled = !n;
          go.textContent = n ? `Enviar para ${n} arquiteto${n > 1 ? 's' : ''}` : 'Enviar briefing';
        };
        checks.forEach((c) => c.addEventListener('change', update));
        go.addEventListener('click', async () => {
          go.disabled = true; go.textContent = 'Enviando…';
          try {
            const res = await MatchAPI.assistantSendBriefing(project._id, checks.filter((c) => c.checked).map((c) => c.value));
            chat.sentTo = [...(chat.sentTo || []), ...res.sent.map((s) => ({ ...s, at: new Date().toISOString() }))];
            sheet.hidden = true;
            announceSent(res.sent);
          } catch (err) {
            go.disabled = false; go.textContent = 'Tentar de novo';
            sheet.querySelector('p').textContent = err.message || 'Não foi possível enviar agora.';
          }
        });
        foot.append(go);
      } else {
        const run = el('button', 'ai-pill ai-pill--accent', 'Rodar match para este projeto');
        run.type = 'button';
        run.addEventListener('click', () => { sheet.hidden = true; opts.onRunMatch && opts.onRunMatch(project._id); });
        foot.append(run);
      }
      sheet.append(foot);
    }

    function announceSent(sent) {
      if (!sent.length) return;
      const names = sent.map((s) => s.name).join(', ');
      const { body } = addBot(`Pronto! Enviei o briefing para ${names}. As respostas chegam pela aba Mensagens do seu painel — é lá que a conversa continua.`);
      const actions = el('div', 'ai-actions');
      sent.forEach((s) => {
        const b = el('button', 'ai-pill ai-pill--accent', `Abrir conversa com ${s.name.split(' ')[0]}`);
        b.type = 'button';
        b.addEventListener('click', () => opts.onOpenConversation && opts.onOpenConversation(s.architectId, s.name));
        actions.append(b);
      });
      body.append(actions);
    }

    // ---------- Compositor ----------
    const MIN_H = 44, MAX_H = 160;
    function autosize() {
      const input = refs.input;
      input.style.height = MIN_H + 'px';
      input.style.height = clamp(input.scrollHeight, MIN_H, MAX_H) + 'px';
      input.style.overflowY = input.scrollHeight > MAX_H ? 'auto' : 'hidden';
    }
    function refresh() {
      autosize();
      refs.send.disabled = busy || (!refs.input.value.trim() && !photos.length);
      updatePalette();
    }

    let activeCmd = -1, paletteOpen = false, paletteManual = false;
    function renderPalette() {
      refs.palette.textContent = '';
      COMMANDS.forEach((c, i) => {
        const row = el('div', 'ai-cmd' + (i === activeCmd ? ' is-active' : ''));
        row.setAttribute('role', 'option');
        row.insertAdjacentHTML('beforeend', c.icon);
        row.append(el('strong', '', c.label), el('code', '', c.prefix));
        row.addEventListener('mousedown', (e) => { e.preventDefault(); pickCommand(c); });
        refs.palette.append(row);
      });
    }
    function setPalette(open) {
      paletteOpen = open;
      refs.palette.hidden = !open;
      refs.commands.setAttribute('aria-expanded', String(open));
      if (open) renderPalette();
    }
    function updatePalette() {
      const v = refs.input.value;
      if (v.startsWith('/') && !v.includes(' ')) {
        activeCmd = COMMANDS.findIndex((c) => c.prefix.startsWith(v));
        setPalette(true);
      } else if (paletteOpen && !paletteManual) setPalette(false);
    }
    function pickCommand(c) {
      paletteManual = false;
      setPalette(false);
      if (c.action === 'briefing') { refs.input.value = ''; refresh(); makeBriefing(); return; }
      refs.input.value = c.fill;
      refresh();
      refs.input.focus();
      refs.input.setSelectionRange(refs.input.value.length, refs.input.value.length);
    }
    refs.commands.addEventListener('click', () => { paletteManual = !paletteOpen; activeCmd = -1; setPalette(!paletteOpen); });
    document.addEventListener('mousedown', (e) => {
      if (paletteOpen && !refs.palette.contains(e.target) && !refs.commands.contains(e.target)) { paletteManual = false; setPalette(false); }
    });

    refs.input.addEventListener('input', () => { showError(''); refresh(); });
    refs.input.addEventListener('keydown', (e) => {
      if (paletteOpen) {
        if (e.key === 'ArrowDown') { e.preventDefault(); activeCmd = (activeCmd + 1) % COMMANDS.length; renderPalette(); return; }
        if (e.key === 'ArrowUp') { e.preventDefault(); activeCmd = (activeCmd - 1 + COMMANDS.length) % COMMANDS.length; renderPalette(); return; }
        if ((e.key === 'Enter' || e.key === 'Tab') && activeCmd >= 0) { e.preventDefault(); pickCommand(COMMANDS[activeCmd]); return; }
        if (e.key === 'Escape') { e.preventDefault(); paletteManual = false; setPalette(false); return; }
      }
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); }
    });

    // Fotos
    const MAX_PER_MESSAGE = 3;
    refs.attach.addEventListener('click', () => refs.file.click());
    refs.file.addEventListener('change', async () => {
      const files = [...refs.file.files];
      refs.file.value = '';
      showError('');
      for (const f of files) {
        if (photos.length >= MAX_PER_MESSAGE) { showError(`Envie no máximo ${MAX_PER_MESSAGE} fotos por mensagem.`); break; }
        try { photos.push(await processImage(f)); }
        catch (err) { showError(err.message); }
      }
      renderPhotos(); refresh();
    });
    function renderPhotos() {
      refs.attachments.textContent = '';
      photos.forEach((p, i) => {
        const t = el('div', 'ai-thumb');
        const img = el('img'); img.src = p.thumb; img.alt = 'Foto anexada';
        const rm = el('button'); rm.type = 'button'; rm.setAttribute('aria-label', 'Remover foto'); rm.innerHTML = ICONS.x;
        rm.addEventListener('click', () => { photos.splice(i, 1); renderPhotos(); refresh(); });
        t.append(img, rm);
        refs.attachments.append(t);
      });
      if (photos.length) refs.attachments.append(el('p', 'ai-photo-note', 'As fotos são enviadas à IA (Google Gemini) só para analisar o espaço; o match.IA guarda apenas uma miniatura na conversa.'));
    }

    // Envio
    async function send() {
      const text = refs.input.value.trim();
      if ((!text && !photos.length) || busy || !project) return;
      const sending = photos.slice();
      showError('');
      setPalette(false);
      setBusy(true);
      const userEl = addUser(text, sending.map((p) => p.thumb));
      refs.input.value = ''; photos = []; renderPhotos(); autosize();
      const request = MatchAPI.assistantSend(project._id, {
        text,
        images: sending.map(({ mime, data, thumb }) => ({ mime, data, thumb })),
      });
      const myProject = project;
      try {
        if (orb) {
          // a pílula vira o orbe que pensa e se desdobra no balão da resposta
          const res = await orb.think(request);
          if (!res || project !== myProject) return;
          const { body } = addBot(res.reply, res.products, true);
          await orb.unfold(body.querySelector('.ai-bubble'), [...body.querySelectorAll('.mo-extra')]);
        } else {
          const typing = addTyping();
          try { const res = await request; typing.remove(); addBot(res.reply, res.products); }
          catch (e) { typing.remove(); throw e; }
        }
        userTurns += 1;
      } catch (err) {
        // Falhou: devolve o texto e as fotos pro campo pra tentar de novo sem perder nada.
        orb?.cancel();
        userEl.remove();
        refs.input.value = text; photos = sending; renderPhotos();
        showError(err.message || 'Não foi possível enviar agora.');
      } finally { setBusy(false); refresh(); refs.input.focus({ preventScroll: true }); }
    }
    refs.send.addEventListener('click', send);

    // Sugestões rápidas abaixo do card
    COMMANDS.forEach((c, i) => {
      const b = el('button', 'ai-chip');
      b.type = 'button'; b.style.animationDelay = (0.2 + i * 0.07) + 's';
      b.insertAdjacentHTML('beforeend', c.icon);
      b.append(el('span', '', c.label));
      b.addEventListener('click', () => pickCommand(c));
      refs.chips.append(b);
    });

    // ---------- Abrir um projeto ----------
    async function openProject(p) {
      if (busy) orb?.cancel();
      project = p; chat = null; photos = []; userTurns = 0;
      const token = ++loadToken;
      refs.thread.textContent = '';
      refs.input.value = ''; renderPhotos(); showError('');
      refs.sheet.hidden = true;
      setView('chat');
      refresh();
      const loading = addTyping('Carregando a conversa');
      try {
        const data = await MatchAPI.assistantChat(p._id);
        if (token !== loadToken) return;
        chat = data;
        loading.remove();
        userTurns = data.messages.filter((m) => m.role === 'user').length;
        if (!data.messages.length) {
          const first = (opts.user?.name || '').split(' ')[0];
          addBot(`Oi${first ? `, ${first}` : ''}! Vamos conversar sobre "${p.name}". Me conta como você imagina esse espaço, ou anexe fotos do local e eu comento o que vejo.`);
        }
        data.messages.forEach((m) => { if (m.role === 'user') addUser(m.text, m.thumbs); else addBot(m.text, m.products); });
        if (data.briefing) addBriefing(data.briefing);
        if (data.sentTo?.length) addNote(`Briefing já enviado para ${data.sentTo.map((s) => s.name).join(', ')}.`);
        scrollDown();
        refs.input.focus({ preventScroll: true });
      } catch (err) {
        if (token !== loadToken) return;
        loading.remove();
        chat = { messages: [], briefing: null, sentTo: [] };
        showError(err.message || 'Não foi possível carregar a conversa agora.');
      }
    }

    refs.resetBtn.addEventListener('click', async () => {
      if (!project || busy) return;
      if (!confirm('Apagar esta conversa e recomeçar? O briefing gerado também será apagado (o que já foi enviado aos arquitetos permanece nas mensagens deles).')) return;
      try { await MatchAPI.assistantReset(project._id); openProject(project); }
      catch (err) { showError(err.message || 'Não foi possível reiniciar agora.'); }
    });

    showPicker();
    return {
      // Chamado pelo painel quando a lista de projetos muda
      refresh() { if (!project) renderPicker(); },
    };
  }

  // Campos do briefing na ordem em que aparecem (espelha o backend)
  const BRIEFING_FIELDS = [
    ['resumo', 'Resumo'], ['objetivos', 'Objetivos'], ['leituraDoEspaco', 'Leitura do espaço'],
    ['estiloEMateriais', 'Estilo e materiais'], ['orcamento', 'Orçamento'], ['prazo', 'Prazo'],
    ['restricoes', 'Restrições'], ['perguntasEmAberto', 'Pontos a alinhar'], ['proximosPassos', 'Próximo passo sugerido'],
  ];

  return { mount };
})();
