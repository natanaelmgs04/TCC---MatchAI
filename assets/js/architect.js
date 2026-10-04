document.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('apiBaseLabel').textContent = MatchAPI.base();
  const id = new URLSearchParams(location.search).get('id');
  if (!id) { document.getElementById('noId').style.display = 'block'; return; }

  // Tudo que vem do banco foi digitado por alguém (arquiteto, cliente): entra
  // escapado no HTML, e link só abre se for http(s) — um "javascript:..."
  // cadastrado como site ou projeto viraria código rodando para quem clicasse.
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const safeUrl = (u) => {
    try { const url = new URL(String(u), location.href); return /^https?:$/.test(url.protocol) ? url.href : ''; } catch { return ''; }
  };
  const safeImg = (u) => (/^data:image\//.test(String(u)) ? String(u) : safeUrl(u));

  try {
    const arch = await MatchAPI.architect(id);
    const p = arch.profile || {};

    // Conta uma visualização pras métricas do arquiteto — no máximo uma vez
    // por sessão do navegador, e nunca quando o próprio arquiteto abre o
    // perfil dele (senão ele inflava a própria métrica só de conferir o perfil).
    const viewerIsSelf = MatchAPI.currentUser()?.id === id;
    const viewedKey = `matchia_viewed_${id}`;
    if (!viewerIsSelf && !sessionStorage.getItem(viewedKey)) {
      MatchAPI.recordProfileView(id).catch(() => {});
      sessionStorage.setItem(viewedKey, '1');
    }
    document.getElementById('profileState').style.display = 'block';
    if (arch.isDemo) {
      const note = document.createElement('p');
      note.className = 'ap-demo-note';
      note.setAttribute('role', 'note');
      note.innerHTML = '<strong>Perfil ilustrativo.</strong> Este perfil mostra como os arquitetos aparecem na match.IA durante a fase inicial — ainda não está ligado a um profissional de verdade, então não recebe mensagens nem pedidos de contratação.';
      document.getElementById('profileState').prepend(note);
    }
    document.getElementById('archName').textContent = arch.name;
    document.getElementById('apAboutName').textContent = arch.name;
    document.title = `${arch.name} — match.IA`;
    setupHero(arch, p);
    document.getElementById('archLocation').textContent = [arch.city, arch.state].filter(Boolean).join(' · ') || 'Localização não informada';
    document.getElementById('archAvailability').textContent = { available: 'Disponível', limited: 'Disponibilidade limitada', unavailable: 'Indisponível' }[p.availability] || '—';
    document.getElementById('archEmail').textContent = arch.email || '—';
    document.getElementById('archPhone').textContent = arch.phone || '—';
    document.getElementById('archYears').textContent = p.yearsExperience ? `${p.yearsExperience} anos` : '—';
    const website = safeUrl(p.website);
    document.getElementById('archWebsite').innerHTML = website ? `<a href="${esc(website)}" target="_blank" rel="noopener" style="color:var(--terracotta);">${esc(p.website)}</a>` : '—';
    document.getElementById('archInstagram').textContent = p.instagram || '—';
    document.getElementById('archBio').textContent = p.bio || 'Este arquiteto ainda não adicionou uma bio.';

    const cauStatus = p.cauVerification?.status;
    document.getElementById('archVerifiedBadge').innerHTML = cauStatus === 'verified'
      ? '<span class="status-pill badge-validated">✓ Verificado</span>' : '';

    const tagRow = (elId, items) => {
      document.getElementById(elId).innerHTML = items && items.length
        ? items.map(i => `<span class="tag">${esc(typeof i === 'string' ? i : i.name)}</span>`).join('')
        : '<span style="font-size:0.85rem; color:var(--ink-faint);">Nenhum registrado</span>';
    };
    tagRow('archStyles', p.styles);
    tagRow('archSpecialties', p.specialties);
    tagRow('archMaterials', p.favoriteMaterials);

    const styleProfile = MatchExtras.getStyleProfile(id);
    if (styleProfile.palette.length || styleProfile.keywords.length) {
      document.getElementById('stylePaletteCard').style.display = 'block';
      document.getElementById('archPalette').innerHTML = styleProfile.palette
        .filter(hex => /^#[0-9a-f]{3,8}$/i.test(hex))
        .map(hex => `<span class="dot" style="background:${hex}"></span>`).join('');
      document.getElementById('archKeywords').innerHTML = styleProfile.keywords.map(k => `<span class="tag">${esc(k)}</span>`).join('') || '<span style="font-size:0.82rem; color:var(--ink-faint);">Nenhuma cadastrada</span>';
    }

    MatchAPI.architectReferenceImage(id).then(photo => {
      const img = safeImg(photo.imageUrl);
      if (!img) return;
      document.getElementById('archReferenceImageCard').style.display = 'block';
      const credit = safeUrl(photo.photographerUrl);
      document.getElementById('archReferenceImageContent').innerHTML = `
        <img src="${esc(img)}" alt="${esc(photo.description)}" style="width:100%; border-radius:12px; display:block;">
        <p style="font-size:0.76rem; color:var(--ink-faint); margin-top:8px;">Foto: ${credit ? `<a href="${esc(credit)}" target="_blank" rel="noopener" style="color:inherit;">${esc(photo.photographerName)}</a>` : esc(photo.photographerName)} via <a href="https://unsplash.com/?utm_source=matchia&utm_medium=referral" target="_blank" rel="noopener" style="color:inherit;">Unsplash</a></p>`;
    }).catch(() => { /* sem estilo/materiais suficientes, ou API fora do ar — card fica oculto */ });

    const combos = MatchExtras.generateMaterialCombos(p.favoriteMaterials);
    document.getElementById('archCombos').innerHTML = combos.length
      ? `<div class="constraint-note">Só usa materiais que ${esc(arch.name)} cadastrou como favoritos — nada inexequível.</div>` +
        combos.map(c => `<div class="combo-card"><div class="combo-name">${esc(c.name)}</div></div>`).join('')
      : '<p style="font-size:0.86rem; color:var(--ink-faint);">Cadastre ao menos 2 materiais favoritos para gerar sugestões.</p>';

    const portfolio = p.portfolio || [];
    document.getElementById('archPortfolio').innerHTML = portfolio.length
      ? `<div class="material-grid">${portfolio.map(proj => {
          const img = safeImg(proj.imageUrl), link = safeUrl(proj.projectUrl);
          return `
          <div class="material-card spotlight">
            <div class="thumb">${img ? `<img src="${esc(img)}" alt="${esc(proj.title)}" loading="lazy">` : ''}</div>
            <div class="info">
              <span class="cat">${proj.status === 'ongoing' ? 'Em andamento' : 'Concluído'}</span>
              <h4>${esc(proj.title)}</h4>
              ${link ? `<a href="${esc(link)}" target="_blank" rel="noopener" style="font-size:0.78rem; color:var(--terracotta); font-weight:600;">Ver projeto →</a>` : ''}
            </div>
          </div>`;
        }).join('')}</div>`
      : '<p style="font-size:0.86rem; color:var(--ink-faint);">Nenhum projeto no portfólio ainda.</p>';

    // Projetos fechados pela plataforma (contratações aceitas, sem dados do cliente)
    MatchAPI.closedProjects(id).then(closed => {
      if (!closed.length) return;
      document.getElementById('archClosedCard').style.display = 'block';
      document.getElementById('archClosedList').innerHTML = closed.map(c => `
        <div class="closed-item">
          <div>
            <strong>${esc(c.title)}</strong>
            <span>${[c.areaM2 ? `${c.areaM2} m²` : '', c.location, c.closedAt ? `fechado em ${new Date(c.closedAt).toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' })}` : ''].filter(Boolean).map(esc).join(' · ')}</span>
          </div>
          <span class="hire-chip is-closed">${c.status === 'completed' ? 'Concluído' : 'Em andamento'}</span>
        </div>`).join('');
    }).catch(() => {});

    MatchAPI.publishedCaseStudies(id).then(cases => {
      if (!cases.length) return;
      const card = document.getElementById('archCaseStudiesCard');
      card.style.display = 'block';
      document.getElementById('archCaseStudiesContent').innerHTML = cases.map(c => `
        <div class="case-study-card">
          ${c.images?.length ? `<div class="case-study-images">${c.images.map(safeImg).filter(Boolean).map(url => `<img src="${esc(url)}" alt="${esc(c.title)}" loading="lazy">`).join('')}</div>` : ''}
          <h4>${esc(c.title)}</h4>
          ${c.description ? `<p>${esc(c.description)}</p>` : ''}
          ${c.testimonial ? `<blockquote>"${esc(c.testimonial)}"<cite>— ${esc(c.clientName || 'Cliente')}</cite></blockquote>` : ''}
        </div>`).join('');
    }).catch(() => {});

    // Avaliações (reais, vêm do back-end)
    try {
      const { reviews, average, count } = await MatchAPI.reviews(id);
      const stars = (n) => '★'.repeat(Math.max(0, Math.min(5, Math.round(n)))) + '☆'.repeat(5 - Math.max(0, Math.min(5, Math.round(n))));
      document.getElementById('archReviews').innerHTML = count
        ? `<div class="review-summary">
             <span class="review-avg">${esc(average)}</span>
             <div><span class="star-display">${stars(average)}</span><div style="font-size:0.8rem; color:var(--ink-faint);">${count} avaliaç${count > 1 ? 'ões' : 'ão'}</div></div>
           </div>
           ${reviews.map(r => `
             <div class="review-item">
               <div class="review-head">
                 <span class="review-name">${esc(r.client?.name || 'Cliente')}</span>
                 <span class="star-display">${stars(r.rating)}</span>
               </div>
               ${r.comment ? `<p>${esc(r.comment)}</p>` : ''}
             </div>`).join('')}`
        : '<p style="font-size:0.86rem; color:var(--ink-faint);">Este arquiteto ainda não recebeu avaliações.</p>';
    } catch {
      document.getElementById('archReviews').innerHTML = '<p style="font-size:0.86rem; color:var(--ink-faint);">Não foi possível carregar as avaliações.</p>';
    }

    const me = MatchAPI.currentUser();
    const isClient = Boolean(me && me.role === 'client' && MatchAPI.token());
    setupHire(arch, me, isClient);

    // Enviar mensagem (só clientes logados)
    if (isClient) {
      MatchAPI.getValidation(id).then(v => {
        if (v.clientConfirmed && v.architectConfirmed) {
          document.getElementById('archValidatedBadge').innerHTML = '<span class="status-pill badge-validated">✓ Resumo validado com você</span>';
        }
      }).catch(() => {});
      document.getElementById('messageForm').style.display = 'block';
      document.getElementById('sendMessageBtn').addEventListener('click', async () => {
        const text = document.getElementById('messageText').value.trim();
        if (!text) return;
        const btn = document.getElementById('sendMessageBtn');
        btn.disabled = true;
        try {
          await MatchAPI.sendMessage(id, text);
          document.getElementById('messageText').value = '';
          document.getElementById('messageSentNote').style.display = 'block';
        } catch (err) {
          alert(err.message || 'Não foi possível enviar a mensagem.');
        } finally {
          btn.disabled = false;
        }
      });
    } else if (!me) {
      document.getElementById('messageLoggedOut').style.display = 'block';
    } else {
      document.getElementById('messageCard').style.display = 'none';
    }
  } catch (err) {
    if (err.offline) document.getElementById('apiBanner').classList.add('show');
    document.getElementById('noId').style.display = 'block';
    document.getElementById('noId').innerHTML = `<h2>Não foi possível carregar este perfil</h2><p>${esc(err.message || '')}</p><a href="index.html" class="btn btn-secondary">Voltar ao início</a>`;
  }

  // ---------------- Hero editorial ----------------
  // Foto de estúdio + pessoa recortada por cima do nome que rola. Enquanto o
  // arquiteto não tem foto própria, usa o retrato ilustrativo fixo dele
  // (assets/js/portraits.js — o mesmo da vitrine de destaques).
  function setupHero(arch, p) {
    const hero = document.getElementById('apHero');
    const bg = document.getElementById('apBg'), cut = document.getElementById('apCut');
    const pic = MatchPortraits.pick(arch.id || id, arch.name);
    // Foto enviada pelo próprio arquiteto: vira um retrato em arco no centro
    // (não há recorte dela), sobre o cinza do estúdio, na frente do nome.
    const ownPhoto = arch.avatar ? MatchAPI.avatarSrc(arch.avatar) : '';
    hero.classList.toggle('ap-own-photo', Boolean(ownPhoto));
    cut.alt = `Retrato de ${arch.name}`;

    // nome em duas metades idênticas (o trilho anda -50% e emenda sem pulo)
    const [first, ...rest] = String(arch.name).trim().split(/\s+/);
    const track = document.getElementById('apTrack');
    for (let i = 0; i < 2; i++) {
      const span = document.createElement('span');
      span.append(first, ' — ');
      if (rest.length) { const em = document.createElement('em'); em.textContent = rest.join(' '); span.append(em); }
      span.append(' ');
      track.append(span);
    }

    const years = Number(p.yearsExperience) || 0;
    document.getElementById('apSince').textContent = years ? `Desde ${new Date().getFullYear() - years}` : 'match.IA';
    const feminine = MatchPortraits.isFeminine(arch.name);
    document.getElementById('apFootRole').textContent = `${feminine ? 'Arquiteta' : 'Arquiteto'}${p.cauVerification?.status === 'verified' ? ' · CAU verificado' : ''}`;
    document.getElementById('apFootStyles').textContent = (p.styles || []).slice(0, 2).join(' · ') || (p.specialties || [])[0] || 'Arquitetura e interiores';
    document.getElementById('apFootPlace').textContent = [arch.city, arch.state].filter(Boolean).join(' · ') || (years ? `${years} anos de experiência` : ' ');
    const availability = { available: 'Disponível para novos projetos', limited: 'Agenda limitada', unavailable: 'Agenda fechada no momento' }[p.availability];
    document.getElementById('apFootLabel').textContent = availability ? 'Disponibilidade' : 'Experiência';
    document.getElementById('apFootValue').textContent = availability || (years ? `${years} anos` : '—');

    // contato: só o que existe e é seguro (http/https, mailto)
    const links = [];
    const ig = String(p.instagram || '').trim().replace(/^@/, '');
    if (ig) links.push(['Instagram', /^https?:/i.test(ig) ? safeUrl(ig) : `https://instagram.com/${encodeURIComponent(ig)}`]);
    const site = safeUrl(p.website);
    if (site) links.push(['Site', site]);
    if (arch.email) links.push(['E-mail', `mailto:${encodeURIComponent(arch.email).replace(/%40/g, '@')}`]);
    if (!links.length) links.push(['Mensagem', '#contratar']);
    const fill = (wrap, base, step, cls) => {
      wrap.textContent = '';
      links.filter(([, href]) => href).forEach(([label, href], i) => {
        const a = document.createElement('a');
        a.href = href;
        a.textContent = label;
        if (/^https?:/.test(href)) { a.target = '_blank'; a.rel = 'noopener'; }
        if (cls) a.className = cls;
        a.style.setProperty('--d', `${base + i * step}ms`);
        wrap.append(a);
      });
    };
    fill(document.getElementById('apSocial'), 1150, 80, 'anim-fade-up');
    fill(document.getElementById('apDrawerSocial'), 550, 60, '');

    // entradas só quando as duas camadas carregaram (nunca pessoa sem fundo ou vice-versa)
    const layers = ownPhoto ? [[cut, ownPhoto]] : [[bg, pic.photo], [cut, pic.cutout]];
    let pending = layers.length;
    const ready = () => { if (--pending <= 0) hero.classList.add('is-ready'); };
    layers.forEach(([img, src]) => {
      img.addEventListener('load', ready, { once: true });
      img.addEventListener('error', ready, { once: true });
      img.src = src;
    });
    setTimeout(() => hero.classList.add('is-ready'), 2500);

    // gaveta do celular
    const burger = document.getElementById('apBurger');
    const drawer = document.getElementById('apDrawer');
    const setMenu = (open) => {
      hero.classList.toggle('is-menu', open);
      burger.setAttribute('aria-expanded', String(open));
      burger.setAttribute('aria-label', open ? 'Fechar menu' : 'Abrir menu');
      drawer.setAttribute('aria-hidden', String(!open));
      document.body.style.overflow = open ? 'hidden' : '';
      if (open) drawer.querySelector('a')?.focus({ preventScroll: true });
    };
    burger.addEventListener('click', () => setMenu(!hero.classList.contains('is-menu')));
    document.getElementById('apDrawerX').addEventListener('click', () => { setMenu(false); burger.focus(); });
    document.getElementById('apScrim').addEventListener('click', () => setMenu(false));
    drawer.addEventListener('click', (e) => { if (e.target.closest('a')) setMenu(false); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && hero.classList.contains('is-menu')) { setMenu(false); burger.focus(); } });

    // a barra do site entra quando o hero sai da tela
    new IntersectionObserver(([entry]) => {
      document.body.classList.toggle('ap-past-hero', !entry.isIntersecting);
    }, { threshold: 0.08 }).observe(hero);
  }

  // ---------------- Contratar este arquiteto ----------------
  // Cliente logado escolhe um dos próprios projetos e envia o pedido; o
  // arquiteto aceita ou recusa no painel. Visitante vê o convite para entrar;
  // arquiteto/loja não veem o cartão.
  async function setupHire(arch, me, isClient) {
    const card = document.getElementById('hireCard');
    const body = document.getElementById('hireCardBody');
    if (!card || !body) return;
    if (me && !isClient) { card.style.display = 'none'; return; }
    if (arch.isDemo) {
      body.innerHTML = '<p class="hire-muted">Este é um perfil ilustrativo, sem um arquiteto de verdade por trás. <a href="dashboard.html" style="color:var(--terracotta); font-weight:600;">Rode o match</a> para encontrar arquitetos disponíveis.</p>';
      return;
    }
    if (!me) {
      body.innerHTML = `<p class="hire-muted">Para contratar, <a href="login.html" style="color:var(--terracotta); font-weight:600;">entre</a> ou <a href="cadastro.html?tipo=cliente" style="color:var(--terracotta); font-weight:600;">crie sua conta de cliente</a> e cadastre o seu projeto.</p>`;
      return;
    }
    const firstName = esc(String(arch.name).split(' ')[0]);
    let projects = [], hires = [];
    try {
      [projects, hires] = await Promise.all([MatchAPI.projects(), MatchAPI.hires()]);
    } catch (err) {
      body.innerHTML = `<p class="hire-muted">${esc(err.message || 'Não foi possível carregar seus projetos agora.')}</p>`;
      return;
    }
    const withArch = hires.filter(h => h.architect.id === arch.id);
    const closedWithArch = withArch.filter(h => h.status === 'accepted');
    const pendingWithArch = withArch.filter(h => h.status === 'pending');
    const busy = new Set(hires.filter(h => h.status === 'accepted' || h.status === 'pending').map(h => h.project.id));
    const available = projects.filter(pr => !busy.has(pr._id) && !pr.architect);

    const statusHtml = [
      ...closedWithArch.map(h => `<p class="hire-status is-closed">✓ <strong>${esc(h.project.name)}</strong>: projeto fechado com ${firstName}.</p>`),
      ...pendingWithArch.map(h => `<p class="hire-status">⏳ <strong>${esc(h.project.name)}</strong>: pedido enviado, aguardando resposta. <button type="button" class="btn btn-tertiary btn-sm" data-cancel-hire="${esc(h.id)}">Cancelar</button></p>`),
    ].join('');

    let formHtml;
    if (!projects.length) {
      formHtml = `<p class="hire-muted">Você ainda não tem projetos. <a href="novo-projeto.html" style="color:var(--terracotta); font-weight:600;">Crie o seu projeto</a> para poder contratar.</p>`;
    } else if (!available.length) {
      formHtml = statusHtml ? '' : '<p class="hire-muted">Todos os seus projetos já têm um arquiteto ou um pedido em andamento.</p>';
    } else {
      formHtml = `
        <div class="form-field full">
          <label for="hireProject">Projeto</label>
          <select id="hireProject">${available.map(pr => `<option value="${esc(pr._id)}">${esc(pr.name)}</option>`).join('')}</select>
        </div>
        <div class="form-field full">
          <label for="hireMessage">Mensagem (opcional)</label>
          <textarea id="hireMessage" maxlength="1000" rows="3" placeholder="Conte o que mais importa para você: prazo, o que já tem em mente..."></textarea>
        </div>
        <button type="button" class="btn btn-primary" id="hireSendBtn">Contratar ${firstName}</button>`;
    }
    body.innerHTML = statusHtml + formHtml;

    document.getElementById('hireSendBtn')?.addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      btn.textContent = 'Enviando…';
      try {
        await MatchAPI.requestHire(document.getElementById('hireProject').value, arch.id, document.getElementById('hireMessage').value);
        await setupHire(arch, me, isClient);
      } catch (err) {
        alert(err.message || 'Não foi possível enviar o pedido agora.');
        btn.disabled = false;
        btn.textContent = `Contratar ${String(arch.name).split(' ')[0]}`;
      }
    });
    body.querySelectorAll('[data-cancel-hire]').forEach(btn => btn.addEventListener('click', async () => {
      if (!confirm('Cancelar o pedido de contratação? O arquiteto será avisado.')) return;
      btn.disabled = true;
      try { await MatchAPI.cancelHire(btn.dataset.cancelHire); } catch (err) { alert(err.message || 'Não foi possível cancelar agora.'); }
      await setupHire(arch, me, isClient);
    }));
  }
});
