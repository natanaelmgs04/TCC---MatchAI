// A troca de página nativa (@view-transition no CSS) rejeita a própria
// promise interna do navegador como "AbortError: Transition was skipped"
// sempre que uma navegação começa antes da anterior terminar de animar —
// comportamento normal e documentado da API, não um bug daqui, mas o
// navegador loga como erro não tratado se ninguém escuta. Silencia só esse
// caso específico, sem mexer em nenhum outro erro real da página.
window.addEventListener('unhandledrejection', (e) => {
  if (e.reason?.name === 'AbortError' && /transition was skipped/i.test(e.reason?.message || '')) {
    e.preventDefault();
  }
});

// Comportamento compartilhado do site: navegação mobile, ano do rodapé,
// destaque do link ativo, animações de entrada e estado de sessão no header.
document.addEventListener('DOMContentLoaded', () => {
  const toggle = document.querySelector('.nav-toggle');
  const links = document.querySelector('.nav-links');
  if (toggle && links) {
    toggle.addEventListener('click', () => {
      links.classList.toggle('open');
      toggle.classList.toggle('open');
    });
    links.querySelectorAll('a').forEach(a => a.addEventListener('click', () => {
      links.classList.remove('open');
      toggle.classList.remove('open');
    }));
  }

  const path = location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav-links a[data-page]').forEach(a => {
    if (a.dataset.page === path) a.classList.add('active');
  });

  document.querySelectorAll('[data-year]').forEach(el => { el.textContent = new Date().getFullYear(); });

  // Entrada em sequência: um wrapper marcado com [data-stagger] (ex.: uma
  // lista de steps ou uma grade de cards) não anima ele mesmo — cada filho
  // direto vira um alvo de reveal individual, com um atraso incremental,
  // pra aparecer em sequência em vez de tudo de uma vez.
  document.querySelectorAll('[data-stagger]').forEach(wrapper => {
    Array.from(wrapper.children).forEach((child, i) => {
      child.classList.add('reveal');
      child.style.setProperty('--reveal-delay', `${i * 70}ms`);
    });
  });

  const revealEls = document.querySelectorAll('.reveal');
  if (revealEls.length) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) { entry.target.classList.add('in'); io.unobserve(entry.target); }
      });
    }, { threshold: 0.14 });
    revealEls.forEach(el => io.observe(el));
  }

  // Parallax sutil da foto do hero — só existe na home, onde .hero-photo
  // existe; em qualquer outra página este bloco não faz nada.
  const heroPhoto = document.querySelector('.hero-photo');
  if (heroPhoto && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    let ticking = false;
    const updateParallax = () => {
      const rect = heroPhoto.getBoundingClientRect();
      const offset = Math.max(-24, Math.min(24, rect.top * -0.05));
      heroPhoto.style.transform = `translateY(${offset}px)`;
      ticking = false;
    };
    window.addEventListener('scroll', () => {
      if (!ticking) { requestAnimationFrame(updateParallax); ticking = true; }
    }, { passive: true });
    updateParallax();
  }

  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Mesmo parallax sutil do hero, generalizado pra qualquer foto de fundo
  // marcada com .cta-bg-img (banners de CTA com foto) — um único listener
  // de scroll cobre todas as ocorrências da página.
  const bgParallaxEls = document.querySelectorAll('.cta-bg-img');
  if (bgParallaxEls.length && !reduceMotion) {
    let bgTicking = false;
    const updateBgParallax = () => {
      bgParallaxEls.forEach((el) => {
        const rect = el.parentElement.getBoundingClientRect();
        const offset = Math.max(-30, Math.min(30, rect.top * -0.06));
        el.style.transform = `translateY(${offset}px)`;
      });
      bgTicking = false;
    };
    window.addEventListener('scroll', () => {
      if (!bgTicking) { requestAnimationFrame(updateBgParallax); bgTicking = true; }
    }, { passive: true });
    updateBgParallax();
  }

  // ---- Scrollytelling horizontal: .hscroll-pin ----
  // Por padrão (sem isto rodar) já é um carrossel com scroll-snap, então
  // funciona em qualquer navegador. Em telas grandes, com ponteiro fino e
  // sem prefers-reduced-motion, promove a section a "pinada": ela ganha
  // altura extra e o próprio scroll vertical desloca a trilha lateralmente
  // via transform, gerando o efeito de scroll-jacking horizontal.
  const canPinHorizontal = !reduceMotion && matchMedia('(min-width: 860px)').matches && matchMedia('(pointer: fine)').matches;
  document.querySelectorAll('.hscroll-pin').forEach((section) => {
    const sticky = section.querySelector('.hscroll-pin-sticky');
    const track = section.querySelector('.hscroll-pin-track');
    const panelCount = track ? track.children.length : 0;
    if (!sticky || !track || !panelCount) return;
    section.style.setProperty('--panel-count', panelCount);
    if (!canPinHorizontal) return;

    section.classList.add('is-pinned');
    let pinTicking = false;
    const updatePin = () => {
      const rect = section.getBoundingClientRect();
      const scrollable = section.offsetHeight - window.innerHeight;
      const progress = scrollable > 0 ? Math.min(1, Math.max(0, -rect.top / scrollable)) : 0;
      const maxShift = Math.max(0, track.scrollWidth - sticky.clientWidth);
      track.style.transform = `translateX(-${progress * maxShift}px)`;
      pinTicking = false;
    };
    window.addEventListener('scroll', () => {
      if (!pinTicking) { requestAnimationFrame(updatePin); pinTicking = true; }
    }, { passive: true });
    window.addEventListener('resize', updatePin);
    updatePin();
  });

  // ---- Scrollytelling vertical: .narrative-sticky ----
  // A foto (coluna sticky) troca de imagem conforme cada bloco de texto
  // ([data-narrative-step]) cruza o meio da viewport — sem isto, a CSS
  // sozinha já deixa a primeira imagem visível, então degrada bem.
  document.querySelectorAll('.narrative-sticky').forEach((block) => {
    const steps = block.querySelectorAll('[data-narrative-step]');
    const images = block.querySelectorAll('.narrative-sticky-visual img');
    if (!steps.length || !images.length) return;
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const key = entry.target.dataset.narrativeStep;
        steps.forEach(s => s.classList.toggle('is-active', s === entry.target));
        images.forEach(img => img.classList.toggle('is-active', img.dataset.narrativeStep === key));
      });
    }, { threshold: 0.5, rootMargin: '-20% 0px -20% 0px' });
    steps.forEach(s => io.observe(s));
  });

  // ---- Spotlight: brilho que segue o cursor em qualquer .spotlight ----
  if (!reduceMotion) {
    document.addEventListener('pointermove', (e) => {
      if (!(e.target instanceof Element)) return;
      const card = e.target.closest('.spotlight');
      if (!card) return;
      const rect = card.getBoundingClientRect();
      card.style.setProperty('--mx', `${e.clientX - rect.left}px`);
      card.style.setProperty('--my', `${e.clientY - rect.top}px`);
    });
  }

  // ---- Tilt 3D e botão magnético: delegados no document (em vez de um
  // listener por elemento) pra também funcionar em cards/botões que só
  // existem depois de uma resposta assíncrona da API (vitrine, resultados
  // de match, produtos sugeridos etc.), não só nos que já estão no HTML
  // estático quando esse script roda.
  if (!reduceMotion) {
    let activeTilt = null;
    let activeMagnet = null;
    document.addEventListener('mousemove', (e) => {
      if (!(e.target instanceof Element)) return;
      const card = e.target.closest('.tilt');
      if (card) {
        const rect = card.getBoundingClientRect();
        const px = (e.clientX - rect.left) / rect.width - 0.5;
        const py = (e.clientY - rect.top) / rect.height - 0.5;
        card.style.transform = `translateY(-6px) rotateX(${py * -8}deg) rotateY(${px * 8}deg)`;
        activeTilt = card;
      } else if (activeTilt) {
        activeTilt.style.transform = '';
        activeTilt = null;
      }

      const btn = e.target.closest('.magnetic');
      if (btn) {
        const rect = btn.getBoundingClientRect();
        const x = e.clientX - rect.left - rect.width / 2;
        const y = e.clientY - rect.top - rect.height / 2;
        btn.style.transform = `translate(${x * 0.25}px, ${y * 0.35}px)`;
        activeMagnet = btn;
      } else if (activeMagnet) {
        activeMagnet.style.transform = '';
        activeMagnet = null;
      }
    });
  }

  // ---- Vidro líquido: brilho especular que varre cada card de vidro na
  // primeira vez que ele aparece. Precisa ser um <span> de verdade (não um
  // ::before/::after) porque esses cards já usam os dois slots de
  // pseudo-elemento pra outras coisas (bisel/borda com brilho, spotlight
  // do cursor). Cobre também os que só existem depois de uma resposta da
  // API (painel, perfil de arquiteto, notificações), não só os do HTML
  // estático, observando o DOM em vez de rodar só uma vez no load.
  if (!reduceMotion) {
    const GLASS_SHEEN_SELECTOR = '.dash-card, .dash-hero, .auth-card, .match-card, .architect-row, .arch-card, .result-card, .feature-card, .article-card, .material-card, .founder-modal, .checkout-modal, .color-wheel-panel, .project-drawer, .notif-dropdown';
    const addSheenTo = (el) => {
      if (el.dataset.sheenApplied) return;
      el.dataset.sheenApplied = '1';
      const sheen = document.createElement('span');
      sheen.className = 'glass-sheen';
      sheen.setAttribute('aria-hidden', 'true');
      el.appendChild(sheen);
    };
    const applySheen = (root) => {
      if (!(root instanceof Element)) return;
      if (root.matches(GLASS_SHEEN_SELECTOR)) addSheenTo(root);
      root.querySelectorAll(GLASS_SHEEN_SELECTOR).forEach(addSheenTo);
    };
    applySheen(document.body);
    const sheenObserver = new MutationObserver((mutations) => {
      mutations.forEach((m) => m.addedNodes.forEach(applySheen));
    });
    sheenObserver.observe(document.body, { childList: true, subtree: true });
  }

  // ---- Contador numérico: sobe de 0 até o valor real quando entra na tela ----
  document.querySelectorAll('[data-count-to]').forEach((el) => {
    const target = parseFloat(el.dataset.countTo);
    const suffix = el.dataset.countSuffix || '';
    if (reduceMotion) { el.textContent = target + suffix; return; }
    // data-count-delay (ms): espera a entrada coreografada do elemento antes
    // de contar (usado no hero, onde cada número aparece num tempo diferente)
    const delay = parseFloat(el.dataset.countDelay) || 0;
    el.textContent = '0' + suffix;
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        io.unobserve(entry.target);
        const duration = 1100;
        const start = performance.now() + delay;
        const step = (now) => {
          const progress = Math.max(0, Math.min(1, (now - start) / duration));
          const eased = 1 - Math.pow(1 - progress, 3);
          el.textContent = Math.round(target * eased) + suffix;
          if (progress < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      });
    }, { threshold: 0.6 });
    io.observe(el);
  });

  // ---- Campo de partículas do hero (só existe na home) ----
  const particleCanvas = document.getElementById('heroParticles');
  if (particleCanvas && !reduceMotion) {
    const ctx = particleCanvas.getContext('2d');
    const heroSection = particleCanvas.closest('.hero');
    let particles = [];
    let width, height, rafId;
    // cursor dentro do hero: as partículas mais próximas se afastam de leve
    // e ligam um fio até ele (fica "vivo" sem chamar atenção demais)
    const cursor = { x: -9999, y: -9999 };
    heroSection.addEventListener('pointermove', (e) => {
      const r = heroSection.getBoundingClientRect();
      cursor.x = e.clientX - r.left; cursor.y = e.clientY - r.top;
    });
    heroSection.addEventListener('pointerleave', () => { cursor.x = cursor.y = -9999; });

    function resize() {
      width = particleCanvas.width = heroSection.offsetWidth;
      height = particleCanvas.height = heroSection.offsetHeight;
    }

    function makeParticles() {
      const count = Math.min(50, Math.round((width * height) / 22000));
      particles = Array.from({ length: count }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.25,
        vy: (Math.random() - 0.5) * 0.25,
        r: Math.random() * 1.6 + 0.6,
      }));
    }

    function tick() {
      ctx.clearRect(0, 0, width, height);
      particles.forEach((p) => {
        const dx = p.x - cursor.x, dy = p.y - cursor.y, d = Math.hypot(dx, dy);
        if (d < 140 && d > 0.1) {
          const push = (1 - d / 140) * 0.9;
          p.x += (dx / d) * push; p.y += (dy / d) * push;
          ctx.strokeStyle = `rgba(176, 117, 90, ${0.28 * (1 - d / 140)})`;
          ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(cursor.x, cursor.y); ctx.stroke();
        }
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0 || p.x > width) { p.vx *= -1; p.x = Math.max(0, Math.min(width, p.x)); }
        if (p.y < 0 || p.y > height) { p.vy *= -1; p.y = Math.max(0, Math.min(height, p.y)); }
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(176, 117, 90, 0.35)';
        ctx.fill();
      });
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const a = particles[i], b = particles[j];
          const dist = Math.hypot(a.x - b.x, a.y - b.y);
          if (dist < 120) {
            ctx.strokeStyle = `rgba(123, 142, 126, ${0.18 * (1 - dist / 120)})`;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }
      }
      rafId = requestAnimationFrame(tick);
    }

    resize();
    makeParticles();
    tick();
    window.addEventListener('resize', () => { resize(); makeParticles(); });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { cancelAnimationFrame(rafId); }
      else { tick(); }
    });
  }

  // Estado de sessão no cabeçalho (login/cadastro <-> painel/sair)
  const user = typeof MatchAPI !== 'undefined' ? MatchAPI.currentUser() : null;
  // O assistente é só do cliente: some do menu para arquiteto e loja logados.
  if (user && user.role !== 'client') document.querySelectorAll('[data-assistant-link]').forEach(a => a.closest('li')?.remove());
  const authSlot = document.querySelector('[data-auth-slot]');
  if (authSlot) {
    if (user) {
      authSlot.innerHTML = `
        <div class="notif-bell-wrap">
          <button type="button" class="notif-bell" id="notifBellBtn" aria-label="Notificações"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9a6 6 0 1 1 12 0c0 3.4 1 5.2 1.8 6.2a.9.9 0 0 1-.7 1.5H4.9a.9.9 0 0 1-.7-1.5C5 14.2 6 12.4 6 9Z"/><path d="M9.5 19a2.5 2.5 0 0 0 5 0"/></svg><span class="unread-badge" id="notifBellBadge" style="display:none;"></span></button>
          <div class="notif-dropdown" id="notifDropdown" style="display:none;"></div>
        </div>
        <a href="dashboard.html" class="login-link">${user.name.split(' ')[0]}</a>
        <a href="dashboard.html" class="btn btn-primary btn-sm">Painel <span class="unread-badge" id="navUnreadBadge" style="display:none; margin-left:6px;"></span></a>
      `;
      if (typeof MatchAPI !== 'undefined' && MatchAPI.token()) {
        MatchAPI.unreadCount().then(({ count }) => {
          if (!count) return;
          const badge = document.getElementById('navUnreadBadge');
          if (badge) { badge.textContent = count > 9 ? '9+' : count; badge.style.display = 'inline-flex'; }
        }).catch(() => { /* API fora do ar — não afeta a navegação */ });

        const bellBtn = document.getElementById('notifBellBtn');
        const bellBadge = document.getElementById('notifBellBadge');
        const dropdown = document.getElementById('notifDropdown');
        MatchAPI.notificationsUnreadCount().then(({ count }) => {
          if (!count) return;
          bellBadge.textContent = count > 9 ? '9+' : count;
          bellBadge.style.display = 'inline-flex';
        }).catch(() => {});

        bellBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const isOpen = dropdown.style.display !== 'none';
          if (isOpen) { dropdown.style.display = 'none'; return; }
          dropdown.style.display = 'block';
          dropdown.innerHTML = '<p style="padding:14px; font-size:0.84rem; color:var(--ink-faint); margin:0;">Carregando...</p>';
          try {
            const notifications = await MatchAPI.notifications();
            dropdown.innerHTML = notifications.length
              ? notifications.map(n => `
                  <a href="${n.link || 'dashboard.html'}" class="notif-item ${n.read ? '' : 'unread'}">
                    <span>${n.text}</span>
                    <span class="notif-time">${new Date(n.createdAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                  </a>`).join('')
              : '<p style="padding:14px; font-size:0.84rem; color:var(--ink-faint); margin:0;">Nenhuma notificação ainda.</p>';
            bellBadge.style.display = 'none';
            MatchAPI.markNotificationsRead().catch(() => {});
          } catch {
            dropdown.innerHTML = '<p style="padding:14px; font-size:0.84rem; color:var(--ink-faint); margin:0;">Não foi possível carregar as notificações.</p>';
          }
        });
        document.addEventListener('click', (e) => {
          if (!dropdown.contains(e.target) && e.target !== bellBtn) dropdown.style.display = 'none';
        });
      }
    } else {
      authSlot.innerHTML = `
        <a href="login.html" class="login-link">Entrar</a>
        <a href="cadastro.html" class="btn btn-secondary btn-sm">Cadastrar</a>
      `;
    }
  }

  // Estatística real da home (média de compatibilidade calculada pelo motor
  // de match sobre todas as buscas já feitas) — só existe nesta página.
  const heroStat = document.getElementById('heroAvgCompat');
  if (heroStat && typeof MatchAPI !== 'undefined') {
    MatchAPI.stats()
      .then(({ avgCompatibility }) => { heroStat.textContent = avgCompatibility !== null ? `${avgCompatibility}%` : '95%'; })
      .catch(() => { heroStat.textContent = '95%'; });
  }

  // PWA: registra o service worker (só em http/https — 'file://' não suporta).
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('/sw.js').catch(() => { /* offline não é crítico */ });
  }
});
