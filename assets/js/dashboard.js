document.addEventListener('DOMContentLoaded', async () => {
  // Quem pede menos animação no sistema também não quer rolagem suave.
  const SCROLL_BEHAVIOR = matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
  // Estado vazio compacto e consistente pra dentro de um card (portfólio,
  // histórico, mensagens...) — traço + texto + ação opcional, no mesmo
  // idioma visual do resto do site (ver .eyebrow), em vez de um ícone
  // decorativo ou um parágrafo cinza solto sem nenhum apelo visual.
  const emptyStateHtml = (text, actionHtml = '') =>
    `<div class="empty-state-inline"><span class="empty-rule"></span><p>${text}</p>${actionHtml}</div>`;
  // Ids de arquitetos salvos "pra depois" (qualquer categoria, não só o match
  // principal) — carregado uma vez ao abrir o painel (loadFavoriteIds roda
  // logo no início, antes de qualquer match), atualizado localmente a cada
  // clique em salvar/remover sem precisar recarregar o match inteiro.
  // Precisa ficar declarado aqui em cima: como é lido bem no início da
  // inicialização do painel, declará-lo lá embaixo (perto de allResultsById)
  // causava ReferenceError de temporal dead zone — a função que o usa já
  // tinha sido chamada antes dessa linha ser executada.
  const favoriteIds = new Set();
  // Mesmo motivo do favoriteIds acima: o clique automático de "acabou de se
  // cadastrar" (mais abaixo) pode abrir o drawer antes do script terminar de
  // rodar até a declaração original dessas listas, disparando um
  // ReferenceError de temporal dead zone.
  let myProjects = [];
  let assistant = null; // aba "Assistente" (assistente.js), criada no painel do cliente
  let myPortfolio = [];
  const apiBanner = document.getElementById('apiBanner');
  document.getElementById('apiBaseLabel').textContent = MatchAPI.base();
  const uid = (u) => u.id || u._id;
  const PROJECT_STYLES = MatchProjectStyles.list;
  const PROJECT_STYLE_THUMBS = MatchProjectStyles.thumbs;

  // Foto do hero do painel muda a cada visita. Usa fotos diretas do Unsplash
  // (mesmas já usadas no hero da home/carrossel de projetos), não a busca
  // por chave do back-end (imageSearchService.js) -- essa é limitada a
  // 50 buscas/hora, compartilhada por todo mundo no site, e reservada pra
  // referência visual do arquiteto; chamá-la de novo aqui, a cada
  // carregamento do painel, estouraria essa cota rapidinho.
  const HERO_BACKGROUNDS = [
    'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1600&q=80',
    'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1600&q=80',
    'https://images.unsplash.com/photo-1600566753086-00f18fb6b3ea?auto=format&fit=crop&w=1600&q=80',
    'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=1600&q=80',
    'https://images.unsplash.com/photo-1487958449943-2429e8be8625?auto=format&fit=crop&w=1600&q=80',
    'https://images.unsplash.com/photo-1449844908441-8829872d2607?auto=format&fit=crop&w=1600&q=80',
  ];
  function pickHeroBackground() {
    const bg = document.getElementById('dashHeroBg');
    if (!bg) return;
    const url = HERO_BACKGROUNDS[Math.floor(Math.random() * HERO_BACKGROUNDS.length)];
    bg.style.backgroundImage = `url("${url}")`;
  }

  // O hero de perfil (#dashHero) existe uma única vez no HTML -- assim que
  // o papel logado é descoberto, ele é movido pra dentro da aba "Home" desse
  // papel, em vez de ficar sempre visível acima de toda e qualquer aba.
  function moveHeroIntoHome(homePanelId) {
    const hero = document.getElementById('dashHero');
    const home = document.getElementById(homePanelId);
    if (hero && home) home.prepend(hero);
  }

  async function refreshUnreadBadge(badgeId, mirrorId) {
    const badge = document.getElementById(badgeId);
    const mirror = mirrorId ? document.getElementById(mirrorId) : null;
    if (!badge && !mirror) return;
    try {
      const { count } = await MatchAPI.unreadCount();
      if (badge) {
        if (count) { badge.textContent = count > 9 ? '9+' : count; badge.style.display = 'inline-flex'; }
        else badge.style.display = 'none';
      }
      if (mirror) mirror.textContent = count;
    } catch { /* offline: só não mostra o contador, sem travar o painel */ }
  }

  if (!MatchAPI.token()) {
    document.getElementById('guestState').style.display = 'block';
    return;
  }

  document.getElementById('logoutBtn').addEventListener('click', (e) => {
    e.preventDefault();
    MatchAPI.clearSession();
    location.href = 'index.html';
  });

  let me;
  try {
    me = await MatchAPI.me();
  } catch (err) {
    if (err.status === 401) { MatchAPI.clearSession(); location.href = 'login.html'; return; }
    apiBanner.classList.add('show');
    document.getElementById('guestState').style.display = 'block';
    document.getElementById('guestState').innerHTML = `
      <h2>Não foi possível carregar seu painel</h2>
      <p>${err.message || 'Verifique se o back-end está no ar.'}</p>
      <a href="index.html" class="btn btn-secondary">Voltar ao início</a>`;
    return;
  }

  document.getElementById('dashState').style.display = 'block';
  pickHeroBackground();
  renderProfile(me);
  renderPlanCard(me);

  if (me.role === 'client') {
    document.getElementById('clientPanel').style.display = '';
    moveHeroIntoHome('clientHomePanel');
    document.getElementById('roleLabel').textContent = 'Painel do cliente';
    document.getElementById('matchResults').addEventListener('click', (e) => handleResultClick(e, me));
    document.getElementById('matchExtraPanels').addEventListener('click', (e) => handleResultClick(e, me));
    setupMatchTabs();
    setupProfileTabs('clientProfileTabs', 'clientPanel');
    document.getElementById('clientOverview').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-jump-tab]');
      if (btn) activateProfileTab(document.getElementById('clientProfileTabs'), document.getElementById('clientPanel'), btn.dataset.jumpTab);
    });
    document.getElementById('clientStatMatch').style.display = '';
    document.getElementById('clientStatFav').style.display = '';
    await loadFavoriteIds(me);
    renderFavorites(me);
    renderProjectSummary(me);
    setupProjectSummary(me);
    setupExportPdf(me);
    setupExportMatchPdf(me);
    setupMoodboard(me);
    setupReferenceImage(me);
    setupStyleShare(me);
    setupCompare(me);
    setupChat(me, 'clientConversationList', 'clientChatShell');
    renderProjects(me);
    setupProjects(me);
    const clientTabs = document.getElementById('clientProfileTabs'), clientScope = document.getElementById('clientPanel');
    assistant = MatchAssistant.mount(document.getElementById('assistantMount'), {
      user: me,
      getProjects: () => myProjects,
      onCreateProject: () => { location.href = 'novo-projeto.html'; },
      // O briefing só pode ir para quem apareceu no match deste projeto
      onRunMatch: (projectId) => { activateProfileTab(clientTabs, clientScope, 'match'); runMatch(me, projectId); },
      // A conversa com o arquiteto continua na aba Mensagens (caminho que a comissão acompanha)
      onOpenConversation: (architectId, name) => {
        activateProfileTab(clientTabs, clientScope, 'mensagens');
        loadConversations(me, 'clientConversationList', 'clientChatShell');
        openConversation(architectId, name, 'clientChatShell', me);
      },
    });
    renderMatchHistory(me);
    setupCompareExport(me);
    refreshUnreadBadge('clientUnreadBadge', 'overviewUnreadCount');
  } else if (me.role === 'architect') {
    document.getElementById('architectPanel').style.display = '';
    moveHeroIntoHome('architectHomePanel');
    document.getElementById('roleLabel').textContent = 'Painel do arquiteto';
    setupProfileTabs('architectProfileTabs', 'architectPanel');
    document.getElementById('architectStatRating').style.display = '';
    document.getElementById('architectStatPortfolio').style.display = '';
    document.getElementById('architectOverview').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-jump-tab]');
      if (btn) activateProfileTab(document.getElementById('architectProfileTabs'), document.getElementById('architectPanel'), btn.dataset.jumpTab);
    });
    renderOnboardingChecklist(me);
    renderPortfolio(me);
    setupPortfolioForm(me);
    await renderStyleProfile(me);
    setupStyleProfile(me);
    setupCauVerification(me);
    setupShareProfile(me);
    renderArchitectReviews(me);
    setupChat(me, 'architectConversationList', 'architectChatShell');
    refreshUnreadBadge('architectUnreadBadge', 'overviewArchitectUnreadCount');
    renderPendingValidations();
    setupMetrics(me);
    renderCommissions();
    setupCaseStudies(me);
    renderCaseStudies(me);
    renderArchitectStatsChart();
    ArchitectAssistant.mount(document.getElementById('architectAssistantMount'));
  } else {
    document.getElementById('storePanel').style.display = '';
    moveHeroIntoHome('storeHomePanel');
    document.getElementById('roleLabel').textContent = 'Painel da loja parceira';
    setupProfileTabs('storeProfileTabs', 'storePanel');
    setupStoreProducts(me);
    renderStoreReferrals();
  }

  setupProfileEdit(me);
  setupPrivacyActions(me);
  setupReferral(me);

  // O link "Assistente" do menu do site aponta pra dashboard.html#assistente
  // -- se a aba existir pro papel logado, abre direto nela em vez de cair
  // sempre na Home.
  const hashTab = location.hash.replace('#', '');
  if (hashTab) {
    const ids = { client: ['clientProfileTabs', 'clientPanel'], architect: ['architectProfileTabs', 'architectPanel'], store: ['storeProfileTabs', 'storePanel'] };
    const [tabsId, scopeId] = ids[me.role] || ids.client;
    const tabsBar = document.getElementById(tabsId);
    if (tabsBar.querySelector(`[data-profile-panel="${hashTab}"]`)) {
      activateProfileTab(tabsBar, document.getElementById(scopeId), hashTab);
    }
  }

  // Quem acabou de se cadastrar cai num painel vazio -- abre direto o
  // menu de "criar meu primeiro projeto"/"adicionar minha primeira peça de
  // portfólio" em vez de deixar a pessoa procurar o botão sozinha.
  if (sessionStorage.getItem('matchia_just_registered') === '1') {
    sessionStorage.removeItem('matchia_just_registered');
    if (me.role === 'client') location.href = 'novo-projeto.html'; else document.getElementById('openPortfolioDrawerBtn')?.click();
  }

  function renderProfile(user) {
    document.getElementById('profileName').textContent = user.name;
    document.getElementById('profileEmail').textContent = user.email;
    document.getElementById('profileCity').textContent = user.city || '—';
    document.getElementById('profileState').textContent = user.state || '—';
    document.getElementById('avatarInitials').textContent = user.name.split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase();

    const row1 = document.getElementById('profileExtraRow1');
    const row2 = document.getElementById('profileExtraRow2');
    if (user.role === 'client' && user.clientProfile) {
      row1.style.display = 'flex';
      row1.innerHTML = `<span>Estilos</span><span>${(user.clientProfile.preferredStyles || []).join(', ') || '—'}</span>`;
      row2.style.display = 'flex';
      row2.innerHTML = `<span>Orçamento</span><span>${formatBudget(user.clientProfile.budget)}</span>`;
    } else if (user.role === 'architect' && user.architectProfile) {
      row1.style.display = 'flex';
      row1.innerHTML = `<span>Experiência</span><span>${user.architectProfile.yearsExperience || 0} anos</span>`;
      row2.style.display = 'flex';
      row2.innerHTML = `<span>Disponibilidade</span><span>${translateAvailability(user.architectProfile.availability)}</span>`;
    }
  }

  // ---------------- Plano (cliente sempre grátis; arquiteto Pro real) ----------------
  function renderPlanCard(user) {
    const planStat = document.getElementById('planName')?.closest('.stat');
    const upgradeBtn = document.getElementById('upgradePlanBtn');
    if (user.role !== 'architect') {
      // Cliente nunca paga; loja parceira não tem mensalidade, só comissão
      // sobre indicação -- nenhum dos dois tem nada de plano pra mostrar.
      if (planStat) planStat.style.display = 'none';
      upgradeBtn.style.display = 'none';
      return;
    }
    if (planStat) planStat.style.display = '';
    const tier = user.architectProfile?.subscriptionTier || 'free';
    document.getElementById('planName').innerHTML = tier === 'pro' ? 'Pro <span class="badge-pro">★ Pro</span>' : 'Gratuito';
    const count = (user.architectProfile?.portfolio || []).length;
    const limit = tier === 'pro' ? Infinity : 3 + (user.architectProfile?.bonusPortfolioSlots || 0);
    document.getElementById('planUsage').textContent = limit === Infinity
      ? 'Portfólio ilimitado'
      : `${count}/${limit} projetos no portfólio`;
    if (tier === 'free') {
      upgradeBtn.textContent = 'Assinar Pro';
      upgradeBtn.style.display = '';
      upgradeBtn.onclick = () => openUpgrade(user, () => { renderPlanCard(user); renderPortfolio(user); });
    } else {
      upgradeBtn.style.display = 'none';
    }
  }

  function openUpgrade(user, onDone) {
    CheckoutModal.open({
      name: 'Plano Pro',
      desc: 'Portfólio ilimitado, selo Pro e um bônus de prioridade nos resultados -- mérito real sempre conta mais que o plano.',
      price: 49,
    }, async () => {
      try {
        await MatchAPI.setArchitectSubscription('pro');
        onDone();
      } catch (err) {
        alert(err.message || 'Não foi possível ativar o Pro agora.');
      }
    });
  }

  function formatBudget(budget) {
    if (!budget || (!budget.min && !budget.max)) return '—';
    const fmt = (v) => v ? 'R$ ' + Number(v).toLocaleString('pt-BR') : '';
    return [fmt(budget.min), fmt(budget.max)].filter(Boolean).join(' – ');
  }
  function translateAvailability(a) {
    return { available: 'Disponível', limited: 'Limitada', unavailable: 'Indisponível' }[a] || '—';
  }

  function setupProfileEdit(user) {
    const editBtn = document.getElementById('editProfileBtn');
    const editCard = document.getElementById('editCard');
    editBtn.addEventListener('click', () => {
      goToAccountTab(user);
      editCard.style.display = 'block';
      document.getElementById('editName').value = user.name;
      document.getElementById('editCity').value = user.city || '';
      document.getElementById('editState').value = user.state || '';
      editCard.scrollIntoView({ behavior: SCROLL_BEHAVIOR, block: 'start' });
    });
    document.getElementById('saveProfileBtn').addEventListener('click', async () => {
      try {
        const updated = await MatchAPI.updateMe({
          name: document.getElementById('editName').value.trim(),
          city: document.getElementById('editCity').value.trim(),
          state: document.getElementById('editState').value.trim().toUpperCase(),
        });
        MatchAPI.setSession(MatchAPI.token(), { id: updated.id || updated._id, name: updated.name, role: updated.role });
        renderProfile(updated);
        editCard.style.display = 'none';
      } catch (err) {
        alert(err.message || 'Não foi possível salvar as alterações.');
      }
    });
  }

  // ---------------- Privacidade / LGPD ----------------
  function setupPrivacyActions(user) {
    document.getElementById('exportDataBtn').addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      try {
        const data = await MatchAPI.exportMyData();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'matchia-meus-dados.json';
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      } catch (err) {
        alert(err.message || 'Não foi possível gerar o arquivo agora.');
      } finally {
        btn.disabled = false;
      }
    });

    document.getElementById('deleteAccountBtn').addEventListener('click', async () => {
      if (!confirm('Isso apaga sua conta e todos os seus dados (projetos, mensagens, avaliações, histórico) permanentemente. Não tem como desfazer. Continuar?')) return;
      if (!confirm('Tem certeza mesmo? Essa é a última confirmação.')) return;
      try {
        await MatchAPI.deleteMyAccount();
        MatchAPI.clearSession();
        location.href = 'index.html';
      } catch (err) {
        alert(err.message || 'Não foi possível excluir a conta agora.');
      }
    });
  }

  // ---------------- Indicação (real, guardada no back-end) ----------------
  function setupReferral(user) {
    const url = `${location.origin}${location.pathname.replace('dashboard.html', '')}cadastro.html?ref=${uid(user)}`;
    document.getElementById('referralLinkInput').value = url;
    const bonus = user.role === 'client' ? (user.clientProfile?.bonusMatches || 0) : (user.architectProfile?.bonusPortfolioSlots || 0);
    const bonusLabel = user.role === 'client' ? 'busca(s) de match bônus' : 'vaga(s) de portfólio bônus';
    document.getElementById('referralExplainer').textContent = user.role === 'client'
      ? 'Compartilhe seu link — cada pessoa que se cadastrar por ele te dá +1 busca de match bônus.'
      : 'Compartilhe seu link — cada pessoa que se cadastrar por ele te dá +1 vaga bônus no portfólio.';
    document.getElementById('referralBonusCount').textContent = bonus > 0 ? `Você já ganhou ${bonus} ${bonusLabel}.` : 'Ninguém se cadastrou pelo seu link ainda.';
    document.getElementById('copyReferralLinkBtn').addEventListener('click', async () => {
      const btn = document.getElementById('copyReferralLinkBtn');
      try {
        await navigator.clipboard.writeText(url);
        const original = btn.textContent;
        btn.textContent = '✓ Copiado!';
        setTimeout(() => { btn.textContent = original; }, 1600);
      } catch {
        alert('Não foi possível copiar automaticamente. Copie manualmente:\n' + url);
      }
    });
  }

  // ---------------- Resumo do projeto (cliente) ----------------
  function renderProjectSummary(user) {
    const p = user.clientProfile || {};
    const meta = MatchExtras.getProjectMeta(uid(user));
    document.getElementById('ppStyle').textContent = [(p.preferredStyles || []).join(', '), p.preferences].filter(Boolean).join(' — ') || 'não informado';
    document.getElementById('ppBudget').textContent = formatBudget(p.budget);
    document.getElementById('ppRestrictions').textContent = meta.restrictions || 'nenhuma informada';
    document.getElementById('ppPriorities').textContent = meta.priorities || 'nenhuma informada';
    updateValidateButton(user);
  }
  function updateValidateButton(user) {
    const btn = document.getElementById('validateSummaryBtn');
    const validated = localStorage.getItem(`matchia_summary_ok_${uid(user)}`) === '1';
    btn.textContent = validated ? '✓ Resumo validado' : 'Validar resumo do projeto';
    btn.classList.toggle('btn-sage', true);
    btn.disabled = validated;
  }
  function setupProjectSummary(user) {
    document.getElementById('validateSummaryBtn').addEventListener('click', () => {
      localStorage.setItem(`matchia_summary_ok_${uid(user)}`, '1');
      updateValidateButton(user);
    });
  }

  // ---------------- Meus projetos (drawer estilo lista de conversas) ----------------
  function buildProjectStyleChips(containerId, selected = []) {
    const container = document.getElementById(containerId);
    container.innerHTML = PROJECT_STYLES.map(style =>
      `<button type="button" class="chip has-thumb${selected.includes(style) ? ' active' : ''}" data-style="${style}"><img class="chip-thumb" src="${PROJECT_STYLE_THUMBS[style]}" alt="" loading="lazy">${style}</button>`
    ).join('');
    container.querySelectorAll('.chip').forEach(chip => {
      chip.addEventListener('click', () => chip.classList.toggle('active'));
    });
  }

  function projectDrawerCardHtml(p) {
    const budget = formatBudget(p.budget);
    const statusLabel = { draft: 'Rascunho', matching: 'Buscando arquiteto', in_progress: 'Em andamento', completed: 'Concluído' }[p.status] || 'Rascunho';
    return `
      <h4>${p.name}</h4>
      <div class="drawer-item-meta">${[statusLabel, p.propertyType, p.areaM2 ? `${p.areaM2} m²` : '', budget !== '—' ? budget : ''].filter(Boolean).join(' · ')}</div>`;
  }

  async function renderProjects(user) {
    try {
      myProjects = await MatchAPI.projects();
    } catch {
      myProjects = [];
    }
    renderHeroProjects();
    renderProjectsGrid(user);
    renderStatusChart('clientStatsChart', myProjects);
  }

  // Grade "Seus projetos" dentro da própria aba (além da gaveta de sempre) —
  // mostra TODOS os projetos de uma vez, não só os 3 da estante do hero, e é
  // daqui que o match é rodado para um projeto específico (não existe mais
  // um botão genérico de "rodar match" fora daqui).
  function renderProjectsGrid() {
    const grid = document.getElementById('clientProjectsGrid');
    if (!grid) return;
    if (!myProjects.length) {
      grid.innerHTML = '';
      return;
    }
    grid.innerHTML = myProjects.map((p) => `
      <div class="dash-project-card" role="button" tabindex="0" data-project-id="${p._id}">
        <strong>${p.name}</strong>
        <span>${[STATUS_LABEL_PT[p.status] || 'Rascunho', p.propertyType].filter(Boolean).join(' · ')}</span>
        <span class="tag">${p.areaM2 ? `${p.areaM2} m²` : 'Metragem não informada'}</span>
        <button type="button" class="dash-project-card-run" data-run-match="${p._id}">Rodar match com IA</button>
      </div>`).join('');
  }

  const STATUS_LABEL_PT = { draft: 'Rascunho', matching: 'Buscando arquiteto', in_progress: 'Em andamento', completed: 'Concluído' };
  const STATUS_CHART_COLORS = { draft: '#C9BBA8', matching: '#B0755A', in_progress: '#7B8E7E', completed: '#5B6B5D' };
  const chartInstances = {};

  // Gráfico simples (doughnut) de projetos por status — mesmos dados que já
  // carregam a estante/gaveta de projetos, sem precisar de outra chamada à API.
  function renderStatusChart(canvasId, projects) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || typeof Chart === 'undefined') return;
    const counts = {};
    projects.forEach((p) => { counts[p.status || 'draft'] = (counts[p.status || 'draft'] || 0) + 1; });
    const labels = Object.keys(counts);
    const empty = document.getElementById(canvasId.replace('Chart', 'Empty'));
    chartInstances[canvasId]?.destroy();
    if (empty) empty.hidden = Boolean(labels.length);
    canvas.style.display = labels.length ? '' : 'none';
    if (!labels.length) return;
    chartInstances[canvasId] = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels: labels.map((k) => STATUS_LABEL_PT[k] || k),
        datasets: [{
          data: labels.map((k) => counts[k]),
          backgroundColor: labels.map((k) => STATUS_CHART_COLORS[k] || '#B0755A'),
          borderWidth: 0,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 11 } } } },
      },
    });
  }

  // "Meus projetos" na estante do hero -- sempre visível ao carregar o
  // painel, sem precisar clicar em "Ver meus projetos" primeiro. Clicar num
  // item abre a mesma gaveta que já existia (lista completa + detalhe).
  function renderHeroProjects() {
    assistant?.refresh(); // a aba Assistente lista os mesmos projetos
    const rail = document.getElementById('heroProjectsRail');
    if (!rail) return;
    if (!myProjects.length) { rail.style.display = 'none'; return; }
    rail.style.display = 'flex';
    rail.innerHTML = myProjects.slice(0, 3).map((p) => `
      <button type="button" class="dash-hero-project-item" data-hero-project="${p._id}">
        <strong>${p.name}</strong>
        <span>${p.propertyType || 'Projeto'}</span>
      </button>`).join('');
    rail.querySelectorAll('[data-hero-project]').forEach((btn) => {
      btn.addEventListener('click', () => document.getElementById('openProjectsDrawerBtn').click());
    });
  }

  function renderProjectDetail(project, container, { back }, user) {
    container.innerHTML = `
      <form id="drawerProjectForm">
        <div class="form-grid">
          <div class="form-field full">
            <label for="projName">Nome do projeto</label>
            <input type="text" id="projName" placeholder="Ex.: Reforma do apartamento da praia" required>
          </div>
          <div class="form-field">
            <label for="projPropertyType">Tipo de imóvel</label>
            <select id="projPropertyType">
              <option value="Residencial unifamiliar">Residencial unifamiliar</option>
              <option value="Apartamento">Apartamento</option>
              <option value="Reforma">Reforma</option>
              <option value="Interiores">Interiores</option>
              <option value="Comercial">Comercial</option>
              <option value="Paisagismo">Paisagismo</option>
            </select>
          </div>
          <div class="form-field">
            <label for="projAreaM2">Metragem (m²)</label>
            <input type="number" id="projAreaM2" min="0" placeholder="100">
          </div>
          <div class="form-field">
            <label for="projBudgetMin">Orçamento mínimo (R$)</label>
            <input type="number" id="projBudgetMin" min="0">
          </div>
          <div class="form-field">
            <label for="projBudgetMax">Orçamento máximo (R$)</label>
            <input type="number" id="projBudgetMax" min="0">
          </div>
          ${project ? `
          <div class="form-field">
            <label for="projStatus">Status</label>
            <select id="projStatus">
              <option value="draft">Rascunho</option>
              <option value="matching">Buscando arquiteto</option>
              <option value="in_progress">Em andamento</option>
              <option value="completed">Concluído</option>
            </select>
          </div>` : ''}
          <div class="form-field full">
            <label>Estilos desejados</label>
            <div class="chip-select" id="projStylesChips"></div>
          </div>
          <div class="form-field full">
            <label for="projMaterials">Materiais preferidos <span class="hint">(separados por vírgula)</span></label>
            <input type="text" id="projMaterials" placeholder="Concreto aparente, madeira de demolição">
          </div>
          <div class="form-field full">
            <label for="projGoals">Objetivos do projeto</label>
            <textarea id="projGoals"></textarea>
          </div>
        </div>
        <div class="drawer-detail-actions">
          <button type="submit" class="btn ${project ? 'btn-secondary' : 'btn-primary'} btn-sm">${project ? 'Salvar alterações' : 'Criar projeto'}</button>
          ${project ? '<button type="button" class="btn btn-primary btn-sm" id="drawerRunMatchBtn">Rodar match</button>' : ''}
          ${project ? '<button type="button" class="btn btn-danger btn-sm" id="drawerDeleteProjectBtn">Excluir</button>' : ''}
        </div>
      </form>
      ${project ? '<div id="suggestedProductsBox" style="margin-top:20px;"></div>' : ''}`;

    buildProjectStyleChips('projStylesChips', project?.preferredStyles || []);
    document.getElementById('projName').value = project?.name || '';
    document.getElementById('projPropertyType').value = project?.propertyType || 'Residencial unifamiliar';
    document.getElementById('projAreaM2').value = project?.areaM2 || '';
    document.getElementById('projBudgetMin').value = project?.budget?.min || '';
    document.getElementById('projBudgetMax').value = project?.budget?.max || '';
    document.getElementById('projMaterials').value = (project?.preferredMaterials || []).join(', ');
    document.getElementById('projGoals').value = project?.projectGoals || '';
    if (project) document.getElementById('projStatus').value = project.status || 'draft';

    document.getElementById('drawerProjectForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const payload = {
        name: document.getElementById('projName').value.trim(),
        propertyType: document.getElementById('projPropertyType').value,
        areaM2: document.getElementById('projAreaM2').value,
        budgetMin: document.getElementById('projBudgetMin').value,
        budgetMax: document.getElementById('projBudgetMax').value,
        preferredStyles: Array.from(document.querySelectorAll('#projStylesChips .chip.active')).map(c => c.dataset.style),
        preferredMaterials: document.getElementById('projMaterials').value,
        projectGoals: document.getElementById('projGoals').value.trim(),
      };
      if (project) payload.status = document.getElementById('projStatus').value;
      if (!payload.name) { alert('Dê um nome para o projeto.'); return; }
      try {
        if (project) await MatchAPI.updateProject(project._id, payload);
        else await MatchAPI.createProject(payload);
        await renderProjects(user);
        back();
      } catch (err) {
        alert(err.message || 'Não foi possível salvar o projeto.');
      }
    });

    if (project) {
      document.getElementById('drawerRunMatchBtn').addEventListener('click', () => {
        ProjectDrawer.close();
        activateProfileTab(document.getElementById('clientProfileTabs'), document.getElementById('clientPanel'), 'match');
        runMatch(user, project._id);
        document.getElementById('matchResults')?.scrollIntoView({ behavior: SCROLL_BEHAVIOR, block: 'start' });
      });
      document.getElementById('drawerDeleteProjectBtn').addEventListener('click', async () => {
        if (!confirm('Excluir este projeto?')) return;
        try {
          await MatchAPI.deleteProject(project._id);
          await renderProjects(user);
          back();
        } catch (err) {
          alert(err.message || 'Não foi possível excluir o projeto.');
        }
      });
      renderSuggestedProducts(project);
    }
  }

  /** Painel "produtos sugeridos" dentro do detalhe do projeto -- a IA casa
   * o estilo/materiais/objetivos do projeto contra o catálogo das lojas
   * parceiras (ver storeMatchService no back-end). "Simular compra" segue
   * o mesmo espírito do CheckoutModal: confirma, nunca cobra de verdade. */
  async function renderSuggestedProducts(project) {
    const box = document.getElementById('suggestedProductsBox');
    if (!box) return;
    box.innerHTML = '<p style="font-size:0.86rem; color:var(--ink-faint);"><span class="spinner"></span> Buscando produtos que combinam com o projeto...</p>';
    try {
      const products = await MatchAPI.suggestedProducts(project._id);
      if (!products.length) { box.innerHTML = ''; return; }
      box.innerHTML = `
        <div class="dash-card" style="padding:16px;">
          <h4 style="margin:0 0 4px;">Produtos sugeridos</h4>
          <p style="font-size:0.8rem; color:var(--ink-faint); margin:0 0 12px;">Combinam com o estilo/objetivos deste projeto, em lojas parceiras.</p>
          <div class="tag-row" style="flex-direction:column; align-items:stretch; gap:8px;">
            ${products.map(p => `
              <div class="material-card spotlight" style="padding:12px; display:flex; gap:10px; align-items:center;">
                ${p.photo ? `<img src="${p.photo}" alt="" style="width:48px; height:48px; object-fit:cover; border-radius:8px; flex-shrink:0;">` : ''}
                <div style="flex:1; min-width:0;">
                  <strong style="font-size:0.86rem;">${p.name}</strong>
                  <p style="font-size:0.76rem; color:var(--ink-faint); margin:2px 0;">${p.storeName || 'Loja parceira'}${p.price ? ` — R$${p.price}` : ''}</p>
                </div>
                <button type="button" class="btn btn-secondary btn-sm" data-simulate-buy="${p.id}">Simular compra</button>
              </div>`).join('')}
          </div>
        </div>`;
      box.querySelectorAll('[data-simulate-buy]').forEach(btn => {
        btn.addEventListener('click', async () => {
          btn.disabled = true;
          try {
            const { purchaseUrl } = await MatchAPI.createStoreReferral(btn.dataset.simulateBuy, project._id);
            alert('Compra simulada registrada! Nenhuma cobrança real acontece (projeto acadêmico).' + (purchaseUrl ? `\n\nLink do produto: ${purchaseUrl}` : ''));
          } catch (err) {
            alert(err.message || 'Não foi possível simular a compra agora.');
            btn.disabled = false;
          }
        });
      });
    } catch {
      box.innerHTML = '';
    }
  }

  function openProjectsDrawer(user, openId) {
    ProjectDrawer.open({
      title: 'Meus projetos',
      newLabel: '+ Novo projeto',
      emptyLabel: 'Você ainda não criou nenhum projeto — crie um pra rodar seu primeiro match.',
      items: () => myProjects,
      idOf: (p) => p._id,
      cardHtml: projectDrawerCardHtml,
      renderDetail: (project, container, helpers) => renderProjectDetail(project, container, helpers, user),
      // Criar projeto agora é a página cheia (formulário + experiência 3D); a gaveta fica só para editar.
      onNew: () => { location.href = 'novo-projeto.html'; },
      openId,
    });
  }

  function setupProjects(user) {
    document.getElementById('openProjectsDrawerBtn').addEventListener('click', () => openProjectsDrawer(user));
    const grid = document.getElementById('clientProjectsGrid');
    const clientTabs = document.getElementById('clientProfileTabs'), clientScope = document.getElementById('clientPanel');
    // Clicar num card da grade "Seus projetos" vai direto ao detalhe daquele
    // projeto; o botão "Rodar match" dentro do card roda o match só para
    // ESTE projeto e pula pra aba Compatibilidade (não existe mais um botão
    // genérico de rodar match fora daqui).
    grid.addEventListener('click', (e) => {
      const runBtn = e.target.closest('[data-run-match]');
      if (runBtn) {
        activateProfileTab(clientTabs, clientScope, 'match');
        runMatch(user, runBtn.dataset.runMatch, runBtn);
        return;
      }
      const card = e.target.closest('[data-project-id]');
      if (card) openProjectsDrawer(user, card.dataset.projectId);
    });
    grid.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const card = e.target.closest('[data-project-id]');
      if (card) { e.preventDefault(); openProjectsDrawer(user, card.dataset.projectId); }
    });
  }

  // ---------------- Perfil de estilo (arquiteto) ----------------
  async function renderStyleProfile(user) {
    const saved = MatchExtras.getStyleProfile(uid(user));
    const container = document.getElementById('dashPalette');
    container.innerHTML = '';
    const presetHexes = MatchExtras.PALETTE.map(c => c.hex);
    MatchExtras.PALETTE.forEach(color => {
      const swatch = document.createElement('button');
      swatch.type = 'button';
      swatch.className = 'swatch' + (saved.palette.includes(color.hex) ? ' active' : '');
      swatch.title = color.name;
      swatch.style.background = color.hex;
      swatch.dataset.hex = color.hex;
      swatch.addEventListener('click', () => swatch.classList.toggle('active'));
      container.appendChild(swatch);
    });

    let addBtn;
    function addCustomSwatch(hex) {
      const swatch = document.createElement('button');
      swatch.type = 'button';
      swatch.className = 'swatch custom active';
      swatch.title = hex;
      swatch.style.background = hex;
      swatch.dataset.hex = hex;
      swatch.addEventListener('click', () => swatch.classList.toggle('active'));
      const remove = document.createElement('span');
      remove.className = 'swatch-remove';
      remove.textContent = '×';
      remove.addEventListener('click', (e) => { e.stopPropagation(); swatch.remove(); });
      swatch.appendChild(remove);
      container.insertBefore(swatch, addBtn);
    }
    // Cores personalizadas salvas anteriormente (fora da paleta sugerida).
    saved.palette.filter(hex => !presetHexes.includes(hex)).forEach(hex => addCustomSwatch(hex));

    addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'swatch-add';
    addBtn.title = 'Escolher outra cor';
    addBtn.innerHTML = '<span>+</span>';
    addBtn.addEventListener('click', () => {
      ColorWheelPicker.open(addBtn, '#B0755A', (hex) => addCustomSwatch(hex));
    });
    container.appendChild(addBtn);

    document.getElementById('dashKeywords').value = (saved.keywords || []).join(', ');

    // Materiais recorrentes: favoriteMaterials já vem como texto livre do back-end.
    const tagRow = document.getElementById('dashRecurringMaterials');
    const favorites = user.architectProfile?.favoriteMaterials || [];
    tagRow.innerHTML = favorites.length
      ? favorites.map(name => `<span class="tag">${name}</span>`).join('')
      : '<span style="font-size:0.85rem; color:var(--ink-faint);">Nenhum material favorito cadastrado ainda.</span>';
  }
  function setupStyleProfile(user) {
    document.getElementById('saveStyleProfileBtn').addEventListener('click', () => {
      const palette = Array.from(document.querySelectorAll('#dashPalette .swatch.active')).map(s => s.dataset.hex);
      const keywords = document.getElementById('dashKeywords').value.split(',').map(s => s.trim()).filter(Boolean);
      MatchExtras.setStyleProfile(uid(user), { palette, keywords });
      renderOnboardingChecklist(user);
      const btn = document.getElementById('saveStyleProfileBtn');
      const original = btn.textContent;
      btn.textContent = '✓ Perfil salvo';
      setTimeout(() => { btn.textContent = original; }, 1600);
    });
  }

  let lastResults = [];
  // Todos os resultados já renderizados (match principal + categorias extras),
  // por id de arquiteto — usado por ações que agem sobre qualquer card, tipo
  // "ver sugestões de materiais", sem depender só de lastResults (que é só o
  // match principal, o único que entra no limite do plano Gratuito).
  const allResultsById = new Map();

  async function loadFavoriteIds(user) {
    if (user.role !== 'client') return;
    try {
      const favorites = await MatchAPI.favorites();
      favorites.forEach(f => favoriteIds.add(f.id));
    } catch { /* offline: só não pré-marca os botões de salvar, sem travar o painel */ }
  }

  async function renderFavorites(user) {
    const list = document.getElementById('favoritesList');
    if (!list) return;
    try {
      const favorites = await MatchAPI.favorites();
      document.getElementById('statFavCount').textContent = favorites.length;
      const overviewFavCount = document.getElementById('overviewFavCount');
      if (overviewFavCount) overviewFavCount.textContent = favorites.length;
      if (!favorites.length) {
        list.innerHTML = emptyStateHtml('Nenhum arquiteto salvo ainda. Use o botão "Salvar para depois" nos resultados do match.');
        return;
      }
      list.innerHTML = favorites.map(a => `
        <div class="favorite-item">
          <div>
            <h4 style="margin:0;"><a href="arquiteto.html?id=${a.id}" style="color:inherit;">${a.name}</a></h4>
            <div class="muted">${[a.city, a.state].filter(Boolean).join(' · ') || 'Localização não informada'}</div>
            <div class="tag-row" style="margin-top:6px;">${(a.profile?.styles || []).slice(0, 4).map(s => `<span class="tag">${s}</span>`).join('')}</div>
          </div>
          <button type="button" class="btn btn-secondary btn-sm" data-remove-favorite="${a.id}">Remover</button>
        </div>`).join('');
      list.querySelectorAll('[data-remove-favorite]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const archId = btn.dataset.removeFavorite;
          btn.disabled = true;
          try {
            await MatchAPI.removeFavorite(archId);
            favoriteIds.delete(archId);
            document.querySelectorAll(`[data-toggle-favorite="${archId}"]`).forEach(b => {
              b.textContent = '☆ Salvar para depois';
              b.setAttribute('aria-pressed', 'false');
            });
            renderFavorites(user);
          } catch (err) {
            alert(err.message || 'Não foi possível remover o favorito agora.');
            btn.disabled = false;
          }
        });
      });
    } catch (err) {
      list.innerHTML = `<p style="font-size:0.86rem; color:var(--ink-faint);">${err.message || 'Não foi possível carregar seus favoritos agora.'}</p>`;
    }
  }

  function validationRow(architectId) {
    return `
      <div id="validation-${architectId}" style="margin-top:14px; padding-top:14px; border-top:1px dashed var(--line);">
        <span class="mock-label">Resumo do projeto</span>
        <div class="validate-row" style="margin-top:8px;">
          <span style="font-size:0.82rem; color:var(--ink-faint);">Carregando status de validação...</span>
        </div>
      </div>`;
  }

  function validationRowContent(architectId, status) {
    return `
      <button type="button" class="btn btn-sm ${status.clientConfirmed ? 'btn-sage' : 'btn-secondary'}" data-validate="${architectId}" ${status.clientConfirmed ? 'disabled' : ''}>${status.clientConfirmed ? '✓ Você validou' : 'Validar resumo'}</button>
      <span class="status-pill ${status.architectConfirmed ? 'badge-validated' : 'badge-pending'}">${status.architectConfirmed ? '✓ Arquiteto confirmou' : 'Aguardando confirmação do arquiteto'}</span>`;
  }

  const validationCache = {};

  async function loadResultThumbnails(results) {
    await Promise.all(results.map(async (r) => {
      const img = document.getElementById(`result-thumb-${r.architect.id}`);
      if (!img) return;
      try {
        const photo = await MatchAPI.architectReferenceImage(r.architect.id);
        img.src = photo.imageUrl;
        img.alt = photo.description || r.architect.name;
        img.style.display = 'block';
      } catch { /* arquiteto sem estilo/materiais suficientes ainda — sem problema, só não mostra a foto */ }
    }));
  }

  async function loadValidationStatuses(results) {
    await Promise.all(results.map(async (r) => {
      const row = document.getElementById(`validation-${r.architect.id}`);
      try {
        const status = await MatchAPI.getValidation(r.architect.id);
        validationCache[r.architect.id] = status;
        if (row) row.querySelector('.validate-row').innerHTML = validationRowContent(r.architect.id, status);
      } catch {
        if (row) row.querySelector('.validate-row').innerHTML = '<span style="font-size:0.82rem; color:var(--ink-faint);">Não foi possível carregar o status de validação.</span>';
      }
    }));
  }

  function combosBlock(architectId) {
    return `<div id="combos-${architectId}" style="display:none; margin-top:14px; padding-top:14px; border-top:1px dashed var(--line);"></div>`;
  }

  function timelineBlock(architectId) {
    return `<div id="timeline-${architectId}" style="display:none; margin-top:14px; padding-top:14px; border-top:1px dashed var(--line);"></div>`;
  }

  function briefBlock(architectId) {
    return `<div id="brief-${architectId}" style="display:none; margin-top:14px; padding-top:14px; border-top:1px dashed var(--line);"></div>`;
  }

  const TIMELINE_PHASES = ['Contato inicial', 'Briefing', 'Conceito', 'Desenvolvimento', 'Entrega'];
  function timelineHtml(architectId, phase) {
    const steps = TIMELINE_PHASES.map((label, i) => `
      <div class="mini-step${i <= phase ? ' done' : ''}${i === phase ? ' current' : ''}">
        <span class="mini-step-dot"></span>
        <span class="mini-step-label">${label}</span>
      </div>`).join('');
    const nextBtn = phase < TIMELINE_PHASES.length - 1
      ? `<button type="button" class="btn btn-sage btn-sm" data-advance-timeline="${architectId}" style="margin-top:12px;">Avançar para "${TIMELINE_PHASES[phase + 1]}"</button>`
      : `<p style="font-size:0.82rem; color:var(--sage-dark); margin:10px 0 0;">✓ Projeto entregue</p>`;
    return `<span class="mock-label">Linha do tempo do projeto</span><div class="mini-stepper">${steps}</div>${nextBtn}`;
  }

  function caseStudyBlock(architectId) {
    return `<div id="casestudy-${architectId}" style="display:none; margin-top:14px; padding-top:14px; border-top:1px dashed var(--line);"></div>`;
  }

  function caseStudyClientHtml(architectId, cs) {
    if (!cs) return `<p style="font-size:0.84rem; color:var(--ink-faint); margin:0;">O arquiteto ainda não propôs um case de sucesso pra este projeto — isso fica disponível depois que o resumo é confirmado pelos dois lados.</p>`;
    const published = cs.clientApproved && cs.architectApproved;
    return `
      <span class="mock-label">${cs.title}</span>
      ${cs.description ? `<p style="font-size:0.88rem;">${cs.description}</p>` : ''}
      ${(cs.images || []).length ? `<div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:12px;">${cs.images.map(url => `<img src="${url}" alt="" style="width:90px; height:90px; object-fit:cover; border-radius:8px;">`).join('')}</div>` : ''}
      <div class="form-field full">
        <label>Seu testemunho <span class="hint">(opcional, aparece junto do case)</span></label>
        <textarea data-testimonial-input="${architectId}">${cs.testimonial || ''}</textarea>
      </div>
      <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
        <button type="button" class="btn btn-secondary btn-sm" data-save-testimonial="${architectId}">Salvar testemunho</button>
        ${published
          ? '<span class="status-pill badge-validated">✓ Publicado no perfil do arquiteto</span>'
          : `<button type="button" class="btn btn-sage btn-sm" data-approve-case="${architectId}" ${cs.clientApproved ? 'disabled' : ''}>${cs.clientApproved ? '✓ Você aprovou' : 'Aprovar publicação'}</button>`}
      </div>`;
  }

  function briefHtml(brief) {
    return `
      ${summaryLineHtml('Resumo', brief.resumo)}
      ${summaryLineHtml('Objetivos', brief.objetivos)}
      ${summaryLineHtml('Estilo e materiais', brief.estiloEMateriais)}
      ${summaryLineHtml('Orçamento', brief.orcamento)}
      ${summaryLineHtml('Restrições', brief.restricoes)}
      ${summaryLineHtml('Próximo passo sugerido', brief.proximosPassos)}
      <button type="button" class="btn btn-secondary btn-sm" data-export-brief style="margin-top:8px;">Exportar brief em PDF</button>`;
  }

  function breakdownBlock(architectId, breakdown) {
    const rows = (breakdown || []).map(b => `
      <div class="score-bar-row">
        <span class="score-bar-label">${b.label}</span>
        <div class="score-bar-track"><div class="score-bar-fill" style="width:${b.max ? (b.value / b.max) * 100 : 0}%"></div></div>
        <span class="score-bar-value">${b.value}/${b.max}</span>
      </div>`).join('');
    return `<div id="breakdown-${architectId}" style="display:none; margin-top:14px; padding-top:14px; border-top:1px dashed var(--line);">
      <span class="mock-label">Como a pontuação foi calculada</span>
      <div style="margin-top:10px;">${rows}</div>
    </div>`;
  }

  function handleResultClick(e, user) {
    const breakdownBtn = e.target.closest('[data-toggle-breakdown]');
    if (breakdownBtn) {
      const archId = breakdownBtn.dataset.toggleBreakdown;
      const box = document.getElementById(`breakdown-${archId}`);
      const isOpen = box.style.display !== 'none';
      box.style.display = isOpen ? 'none' : 'block';
      breakdownBtn.textContent = isOpen ? 'Ver detalhes da pontuação' : 'Ocultar detalhes da pontuação';
      return;
    }

    const comboBtn = e.target.closest('[data-toggle-combos]');
    if (comboBtn) {
      const archId = comboBtn.dataset.toggleCombos;
      const box = document.getElementById(`combos-${archId}`);
      const isOpen = box.style.display !== 'none';
      if (isOpen) { box.style.display = 'none'; comboBtn.textContent = 'Ver sugestões de materiais'; return; }
      const result = allResultsById.get(archId);
      const combos = MatchExtras.generateMaterialCombos(result?.architect.profile?.favoriteMaterials);
      box.innerHTML = combos.length
        ? `<div class="constraint-note">Combinações geradas só com os materiais que ${result.architect.name} cadastrou como favoritos.</div>` +
          combos.map(c => `<div class="combo-card"><div class="combo-name">${c.name}</div></div>`).join('')
        : `<p style="font-size:0.84rem; color:var(--ink-faint); margin:0;">Este arquiteto ainda não cadastrou materiais favoritos suficientes para gerar combinações.</p>`;
      box.style.display = 'block';
      comboBtn.textContent = 'Ocultar sugestões de materiais';
      return;
    }

    const timelineBtn = e.target.closest('[data-toggle-timeline]');
    if (timelineBtn) {
      const archId = timelineBtn.dataset.toggleTimeline;
      const box = document.getElementById(`timeline-${archId}`);
      const isOpen = box.style.display !== 'none';
      if (isOpen) { box.style.display = 'none'; timelineBtn.textContent = 'Linha do tempo do projeto'; return; }
      box.innerHTML = '<p style="font-size:0.84rem; color:var(--ink-faint);"><span class="spinner"></span> Carregando linha do tempo...</p>';
      box.style.display = 'block';
      timelineBtn.textContent = 'Ocultar linha do tempo';
      MatchAPI.getTimeline(archId)
        .then(({ phase }) => { box.innerHTML = timelineHtml(archId, phase); })
        .catch(err => { box.innerHTML = `<p style="font-size:0.84rem; color:var(--ink-faint);">${err.message || 'Não foi possível carregar a linha do tempo.'}</p>`; });
      return;
    }

    const advanceBtn = e.target.closest('[data-advance-timeline]');
    if (advanceBtn) {
      const archId = advanceBtn.dataset.advanceTimeline;
      advanceBtn.disabled = true;
      MatchAPI.advanceTimeline(archId)
        .then(({ phase }) => { document.getElementById(`timeline-${archId}`).innerHTML = timelineHtml(archId, phase); })
        .catch(err => { alert(err.message || 'Não foi possível avançar a etapa agora.'); advanceBtn.disabled = false; });
      return;
    }

    const briefBtn = e.target.closest('[data-toggle-brief]');
    if (briefBtn) {
      const archId = briefBtn.dataset.toggleBrief;
      const box = document.getElementById(`brief-${archId}`);
      const isOpen = box.style.display !== 'none';
      if (isOpen) { box.style.display = 'none'; briefBtn.textContent = 'Gerar brief com IA'; return; }
      box.innerHTML = '<p style="font-size:0.84rem; color:var(--ink-faint);"><span class="spinner"></span> Gerando brief do projeto...</p>';
      box.style.display = 'block';
      briefBtn.textContent = 'Ocultar brief do projeto';
      MatchAPI.getBrief(archId)
        .then(brief => {
          box.dataset.brief = JSON.stringify(brief);
          box.innerHTML = briefHtml(brief);
        })
        .catch(err => { box.innerHTML = `<p style="font-size:0.84rem; color:var(--ink-faint);">${err.message || 'Não foi possível gerar o brief agora.'}</p>`; });
      return;
    }

    const exportBriefBtn = e.target.closest('[data-export-brief]');
    if (exportBriefBtn) {
      const box = exportBriefBtn.closest('[id^="brief-"]');
      const brief = JSON.parse(box.dataset.brief || '{}');
      document.getElementById('printTitle').textContent = 'Brief do projeto';
      document.getElementById('printDate').textContent = new Date().toLocaleDateString('pt-BR');
      document.getElementById('printableContent').innerHTML = briefHtml(brief).replace(/<button[\s\S]*?<\/button>/, '');
      window.print();
      return;
    }

    const caseToggleBtn = e.target.closest('[data-toggle-casestudy]');
    if (caseToggleBtn) {
      const archId = caseToggleBtn.dataset.toggleCasestudy;
      const box = document.getElementById(`casestudy-${archId}`);
      const isOpen = box.style.display !== 'none';
      if (isOpen) { box.style.display = 'none'; caseToggleBtn.textContent = 'Case de sucesso'; return; }
      box.innerHTML = '<p style="font-size:0.84rem; color:var(--ink-faint);"><span class="spinner"></span> Carregando...</p>';
      box.style.display = 'block';
      caseToggleBtn.textContent = 'Ocultar case de sucesso';
      MatchAPI.getCaseStudy(archId)
        .then(cs => { box.innerHTML = caseStudyClientHtml(archId, cs); })
        .catch(err => { box.innerHTML = `<p style="font-size:0.84rem; color:var(--ink-faint);">${err.message || 'Não foi possível carregar o case agora.'}</p>`; });
      return;
    }

    const saveTestimonialBtn = e.target.closest('[data-save-testimonial]');
    if (saveTestimonialBtn) {
      const archId = saveTestimonialBtn.dataset.saveTestimonial;
      const textarea = document.querySelector(`[data-testimonial-input="${archId}"]`);
      saveTestimonialBtn.disabled = true;
      MatchAPI.submitTestimonial(archId, textarea.value.trim())
        .then(cs => { document.getElementById(`casestudy-${archId}`).innerHTML = caseStudyClientHtml(archId, cs); })
        .catch(err => { alert(err.message || 'Não foi possível salvar o testemunho agora.'); saveTestimonialBtn.disabled = false; });
      return;
    }

    const approveCaseBtn = e.target.closest('[data-approve-case]');
    if (approveCaseBtn) {
      const archId = approveCaseBtn.dataset.approveCase;
      approveCaseBtn.disabled = true;
      MatchAPI.approveCaseStudy(archId)
        .then(cs => { document.getElementById(`casestudy-${archId}`).innerHTML = caseStudyClientHtml(archId, cs); })
        .catch(err => { alert(err.message || 'Não foi possível aprovar agora.'); approveCaseBtn.disabled = false; });
      return;
    }

    const favoriteBtn = e.target.closest('[data-toggle-favorite]');
    if (favoriteBtn) {
      const archId = favoriteBtn.dataset.toggleFavorite;
      const nowFavorited = !favoriteIds.has(archId);
      favoriteBtn.disabled = true;
      const request = nowFavorited ? MatchAPI.addFavorite(archId) : MatchAPI.removeFavorite(archId);
      request.then(() => {
        if (nowFavorited) favoriteIds.add(archId); else favoriteIds.delete(archId);
        document.querySelectorAll(`[data-toggle-favorite="${archId}"]`).forEach(b => {
          b.textContent = nowFavorited ? '★ Salvo' : '☆ Salvar para depois';
          b.setAttribute('aria-pressed', String(nowFavorited));
          b.disabled = false;
        });
        renderFavorites(user);
      }).catch(err => {
        alert(err.message || 'Não foi possível salvar agora.');
        favoriteBtn.disabled = false;
      });
      return;
    }

    const validateBtn = e.target.closest('[data-validate]');
    if (validateBtn) {
      const archId = validateBtn.dataset.validate;
      validateBtn.disabled = true;
      MatchAPI.confirmValidation(archId)
        .then((status) => {
          validationCache[archId] = status;
          const row = document.getElementById(`validation-${archId}`);
          if (row) row.querySelector('.validate-row').innerHTML = validationRowContent(archId, status);
        })
        .catch((err) => {
          alert(err.message || 'Não foi possível validar o resumo agora.');
          validateBtn.disabled = false;
        });
      return;
    }

    const reviewToggle = e.target.closest('[data-toggle-review]');
    if (reviewToggle) {
      const box = document.getElementById(`review-${reviewToggle.dataset.toggleReview}`);
      box.style.display = box.style.display === 'none' ? 'block' : 'none';
      return;
    }

    const star = e.target.closest('[data-star]');
    if (star) {
      const group = star.closest('[data-stars]');
      const value = Number(star.dataset.star);
      group.dataset.value = value;
      group.querySelectorAll('[data-star]').forEach(s => {
        const active = Number(s.dataset.star) <= value;
        s.classList.toggle('active', active);
        s.setAttribute('aria-checked', String(Number(s.dataset.star) === value));
      });
      return;
    }

    const submitReview = e.target.closest('[data-submit-review]');
    if (submitReview) {
      const archId = submitReview.dataset.submitReview;
      const group = document.querySelector(`[data-stars="${archId}"]`);
      const rating = Number(group?.dataset.value || 0);
      if (!rating) { alert('Escolha de 1 a 5 estrelas antes de enviar.'); return; }
      const comment = document.querySelector(`[data-review-comment="${archId}"]`).value.trim();
      submitReview.disabled = true;
      MatchAPI.createReview(archId, rating, comment)
        .then(() => {
          document.getElementById(`review-${archId}`).innerHTML = '<p style="font-size:0.86rem; color:var(--sage-dark); margin:0;">✓ Avaliação enviada. Obrigado!</p>';
        })
        .catch(err => { alert(err.message || 'Não foi possível enviar a avaliação.'); submitReview.disabled = false; });
      return;
    }

    const chatBtn = e.target.closest('[data-open-chat]');
    if (chatBtn) {
      activateProfileTab(document.getElementById('clientProfileTabs'), document.getElementById('clientPanel'), 'mensagens');
      document.getElementById('mensagens')?.scrollIntoView({ behavior: SCROLL_BEHAVIOR });
      openConversation(chatBtn.dataset.openChat, chatBtn.dataset.openChatName, 'clientChatShell', user);
    }
  }

  function resultCardHtml(r, i, user) {
    return `
        <div class="result-rank">${i + 1}</div>
        <div class="result-body">
          <div style="display:flex; gap:12px; align-items:flex-start;">
            <img id="result-thumb-${r.architect.id}" style="display:none; width:56px; height:56px; border-radius:12px; object-fit:cover; flex-shrink:0;" alt="">
            <div>
              <h4 style="margin:0;"><a href="arquiteto.html?id=${r.architect.id}" style="color:inherit;">${r.architect.name}</a></h4>
              <div class="muted">${[r.architect.city, r.architect.state].filter(Boolean).join(' · ') || 'Localização não informada'}</div>
            </div>
          </div>
          <p class="explanation">${r.explanation}</p>
          <div class="tag-row">
            ${r.architect.sameCity ? '<span class="tag tag-samecity">Mesma cidade</span>' : ''}
            ${(r.architect.profile?.styles || []).slice(0, 4).map(s => `<span class="tag">${s}</span>`).join('')}
          </div>
          <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:12px;">
            <button type="button" class="btn btn-secondary btn-sm" data-toggle-breakdown="${r.architect.id}">Ver detalhes da pontuação</button>
            <button type="button" class="btn btn-secondary btn-sm" data-toggle-combos="${r.architect.id}">Ver sugestões de materiais</button>
            <button type="button" class="btn btn-secondary btn-sm" data-toggle-timeline="${r.architect.id}">Linha do tempo do projeto</button>
            <button type="button" class="btn btn-secondary btn-sm" data-toggle-brief="${r.architect.id}">Gerar brief com IA</button>
            <button type="button" class="btn btn-secondary btn-sm" data-toggle-casestudy="${r.architect.id}">Case de sucesso</button>
            <button type="button" class="btn btn-secondary btn-sm" data-toggle-review="${r.architect.id}">★ Avaliar arquiteto</button>
            <button type="button" class="btn btn-secondary btn-sm" data-open-chat="${r.architect.id}" data-open-chat-name="${r.architect.name}">Mensagem</button>
            <button type="button" class="btn btn-secondary btn-sm" data-toggle-favorite="${r.architect.id}" aria-pressed="${favoriteIds.has(r.architect.id)}">${favoriteIds.has(r.architect.id) ? '★ Salvo' : '☆ Salvar para depois'}</button>
          </div>
          ${breakdownBlock(r.architect.id, r.breakdown)}
          ${combosBlock(r.architect.id)}
          ${timelineBlock(r.architect.id)}
          ${briefBlock(r.architect.id)}
          ${caseStudyBlock(r.architect.id)}
          <div id="review-${r.architect.id}" style="display:none; margin-top:12px; padding-top:12px; border-top:1px dashed var(--line);">
            <div class="star-rating" data-stars="${r.architect.id}" role="radiogroup" aria-label="Sua avaliação, de 1 a 5 estrelas">${[1, 2, 3, 4, 5].map(n => `<button type="button" data-star="${n}" role="radio" aria-checked="false" aria-label="${n} estrela${n > 1 ? 's' : ''}">★</button>`).join('')}</div>
            <textarea data-review-comment="${r.architect.id}" placeholder="Comentário (opcional)" style="width:100%; margin-top:8px; padding:8px; border:1px solid var(--line); border-radius:8px; font-family:inherit;"></textarea>
            <button type="button" class="btn btn-primary btn-sm" style="margin-top:8px;" data-submit-review="${r.architect.id}">Enviar avaliação</button>
          </div>
          ${validationRow(r.architect.id)}
        </div>
        <div class="result-score"><strong>${r.score}</strong><span>pontos</span></div>`;
  }

  /** Categorias extras (indisponível/fora da região/fora do orçamento/bem
   * avaliado) — viram abas ao lado do match principal, em vez de uma lista
   * comprida empilhada. Sem nenhuma categoria extra, some a barra de abas e
   * só o match principal aparece, como antes. Nenhuma delas entra no limite
   * de resultados bloqueados do plano Gratuito. */
  function renderMatchTabs(mainCount, categories, user) {
    const tabsBar = document.getElementById('matchTabs');
    const mainPanel = document.getElementById('matchPanelMain');
    const extraPanels = document.getElementById('matchExtraPanels');

    if (!categories.length) {
      tabsBar.style.display = 'none';
      tabsBar.innerHTML = '';
      extraPanels.innerHTML = '';
      mainPanel.hidden = false;
      return;
    }

    const tabs = [{ key: 'main', label: 'Melhor compatibilidade', count: mainCount }, ...categories.map(c => ({ key: c.key, label: c.label, count: c.results.length }))];
    tabsBar.style.display = 'flex';
    tabsBar.innerHTML = tabs.map((t, i) => `
      <button type="button" class="match-tab${i === 0 ? ' active' : ''}" id="matchTab-${t.key}" role="tab"
        aria-selected="${i === 0}" aria-controls="matchPanel-${t.key}" tabindex="${i === 0 ? '0' : '-1'}" data-tab-key="${t.key}">
        ${t.label} <span class="count">(${t.count})</span>
      </button>`).join('');

    extraPanels.innerHTML = categories.map(cat => `
      <div id="matchPanel-${cat.key}" class="match-tabpanel" role="tabpanel" aria-labelledby="matchTab-${cat.key}" hidden>
        <p class="match-tabpanel-note">${cat.note}</p>
        <div class="result-list">
          ${cat.results.map((r, i) => `<div class="result-card" style="grid-template-columns:auto 1fr auto; align-items:start;">${resultCardHtml(r, i, user)}</div>`).join('')}
        </div>
      </div>`).join('');

    mainPanel.hidden = false;

    const allExtraResults = categories.flatMap(cat => cat.results);
    allExtraResults.forEach(r => allResultsById.set(r.architect.id, r));
    loadValidationStatuses(allExtraResults);
    loadResultThumbnails(allExtraResults);
  }

  /** Abas de nível superior do painel (Seu projeto / Compatibilidade /
   * Favoritos / Mensagens / Conta, ou o equivalente do arquiteto) — trocam
   * qual bloco de conteúdo aparece, tipo as abas de um perfil de rede
   * social. "Conta" é compartilhada entre os dois papéis (mesmo card de
   * editar perfil, plano, indicação, LGPD), por isso vive fora de
   * clientPanel/architectPanel e é tratada à parte aqui. */
  function setupProfileTabs(tabsId, panelsScopeId) {
    const tabsBar = document.getElementById(tabsId);
    const scope = document.getElementById(panelsScopeId);
    if (!tabsBar || !scope) return;
    tabsBar.addEventListener('click', (e) => {
      const btn = e.target.closest('.profile-tab');
      if (btn) activateProfileTab(tabsBar, scope, btn.dataset.profilePanel);
    });
  }

  function activateProfileTab(tabsBar, scope, key) {
    tabsBar.querySelectorAll('.profile-tab').forEach(btn => {
      const active = btn.dataset.profilePanel === key;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-selected', String(active));
    });
    // Não usa ":scope >" (só filho direto) porque os painéis agora vivem
    // dentro do wrapper ".dash-main" do layout com menu lateral, não mais
    // soltos direto dentro do scope do papel.
    scope.querySelectorAll('[data-profile-panel-content]').forEach(panel => {
      panel.hidden = panel.dataset.profilePanelContent !== key;
    });
    document.getElementById('contaPanel').hidden = key !== 'conta';
  }

  /** Troca pra aba "Conta" (compartilhada) de qualquer papel e mostra o
   * card de edição — usado pelo botão "Editar perfil" no cabeçalho, que
   * fica fora de qualquer aba específica. */
  function goToAccountTab(user) {
    const ids = { client: ['clientProfileTabs', 'clientPanel'], architect: ['architectProfileTabs', 'architectPanel'], store: ['storeProfileTabs', 'storePanel'] };
    const [tabsId, scopeId] = ids[user.role] || ids.client;
    const tabsBar = document.getElementById(tabsId);
    activateProfileTab(tabsBar, document.getElementById(scopeId), 'conta');
  }

  /** Clique e navegação por teclado (setas/Home/End) nas abas, seguindo o
   * padrão de acessibilidade de abas (roving tabindex) — ligado uma única
   * vez, já que o conteúdo das abas é recriado a cada match rodado. */
  function setupMatchTabs() {
    const tabsBar = document.getElementById('matchTabs');
    tabsBar.addEventListener('click', (e) => {
      const btn = e.target.closest('.match-tab');
      if (btn) activateMatchTab(btn.dataset.tabKey);
    });
    tabsBar.addEventListener('keydown', (e) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
      const buttons = Array.from(tabsBar.querySelectorAll('.match-tab'));
      const currentIndex = buttons.findIndex(b => b.classList.contains('active'));
      let nextIndex = currentIndex;
      if (e.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + buttons.length) % buttons.length;
      else if (e.key === 'ArrowRight') nextIndex = (currentIndex + 1) % buttons.length;
      else if (e.key === 'Home') nextIndex = 0;
      else if (e.key === 'End') nextIndex = buttons.length - 1;
      e.preventDefault();
      activateMatchTab(buttons[nextIndex].dataset.tabKey);
      buttons[nextIndex].focus();
    });
  }

  function activateMatchTab(key) {
    const tabsBar = document.getElementById('matchTabs');
    const buttons = Array.from(tabsBar.querySelectorAll('.match-tab'));
    buttons.forEach(btn => {
      const isActive = btn.dataset.tabKey === key;
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-selected', String(isActive));
      btn.tabIndex = isActive ? 0 : -1;
    });
    document.getElementById('matchPanelMain').hidden = key !== 'main';
    document.querySelectorAll('#matchExtraPanels .match-tabpanel').forEach(panel => {
      panel.hidden = panel.id !== `matchPanel-${key}`;
    });
  }

  async function runMatch(user, projectId, btn) {
    const list = document.getElementById('matchResults');
    const empty = document.getElementById('matchEmpty');
    const contextLabel = document.getElementById('matchContextLabel');

    projectId = projectId || myProjects[0]?._id;
    if (!projectId) {
      empty.style.display = 'block';
      empty.innerHTML = '<p>Crie um projeto em "Meus projetos" pra rodar seu primeiro match.</p>';
      list.innerHTML = '';
      document.getElementById('matchTabs').style.display = 'none';
      document.getElementById('matchExtraPanels').innerHTML = '';
      return;
    }

    const originalBtnText = btn?.textContent;
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Analisando compatibilidade...'; }
    empty.style.display = 'none';
    list.innerHTML = `
      <div class="skeleton-result">
        <div class="skeleton-block avatar"></div>
        <div class="skeleton-lines">
          <div class="skeleton-block line" style="width:50%;"></div>
          <div class="skeleton-block line" style="width:80%;"></div>
        </div>
      </div>`.repeat(3);
    try {
      const { results, extra, project } = await MatchAPI.runMatch(projectId);
      lastResults = results;
      allResultsById.clear();
      results.forEach(r => allResultsById.set(r.architect.id, r));
      contextLabel.textContent = project ? `Resultados para o projeto "${project.name}".` : '';
      empty.style.display = results.length ? 'none' : 'block';
      if (!results.length) {
        empty.innerHTML = '<p>Nenhum arquiteto compatível encontrado ainda. Complete o projeto com mais estilos e materiais preferidos.</p>';
      }
      list.innerHTML = results.map((r, i) =>
        `<div class="result-card" style="grid-template-columns:auto 1fr auto; align-items:start;">${resultCardHtml(r, i, user)}</div>`
      ).join('');
      document.getElementById('compareBtn').style.display = results.length > 1 ? '' : 'none';
      document.getElementById('exportMatchPdfBtn').style.display = results.length ? '' : 'none';
      loadValidationStatuses(results);
      loadResultThumbnails(results);
      renderMatchTabs(results.length, extra || [], user);
      renderMatchHistory(user);
    } catch (err) {
      list.innerHTML = '';
      empty.style.display = 'block';
      empty.innerHTML = `<p>${err.message || 'Não foi possível rodar o match agora.'}</p>`;
      document.getElementById('matchTabs').style.display = 'none';
      document.getElementById('matchExtraPanels').innerHTML = '';
      if (err.offline) apiBanner.classList.add('show');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = originalBtnText || 'Rodar match'; }
    }
  }

  // ---------------- Checklist de onboarding (arquiteto) ----------------
  function renderOnboardingChecklist(user) {
    const p = user.architectProfile || {};
    const styleProfile = MatchExtras.getStyleProfile(uid(user));
    const items = [
      { done: Boolean(p.bio?.trim()), label: 'Escreva uma bio curta sobre seu jeito de projetar' },
      { done: (p.portfolio?.length || 0) > 0, label: 'Adicione ao menos 1 projeto no portfólio' },
      { done: (p.favoriteMaterials?.length || 0) > 0, label: 'Cadastre seus materiais favoritos' },
      { done: styleProfile.palette.length > 0 || styleProfile.keywords.length > 0, label: 'Defina sua paleta de cores ou palavras-chave' },
      { done: (p.cauVerification?.status || 'none') !== 'none', label: 'Solicite a verificação do seu registro CAU/A' },
    ];
    const pending = items.filter(i => !i.done).length;
    const card = document.getElementById('onboardingChecklistCard');
    if (!pending) { card.style.display = 'none'; return; }
    card.style.display = 'block';
    document.getElementById('onboardingChecklist').innerHTML = items.map(i => `
      <li class="checklist-item ${i.done ? 'done' : ''}">
        <span class="check-icon">✓</span>
        <span class="label">${i.label}</span>
      </li>`).join('');
  }

  function portfolioDrawerCardHtml(p) {
    return `
      <h4>${p.title}</h4>
      <div class="drawer-item-meta">${[p.status === 'ongoing' ? 'Em andamento' : 'Concluído', (p.styles || []).join(', '), p.areaM2 ? `${p.areaM2} m²` : ''].filter(Boolean).join(' · ')}</div>`;
  }

  function renderPortfolio(user) {
    myPortfolio = user.architectProfile?.portfolio || [];
    document.getElementById('statPortfolioCount').textContent = myPortfolio.length;
  }

  function renderPortfolioDetail(item, container, { back }) {
    container.innerHTML = `
      <form id="drawerPortfolioForm">
        <div class="form-grid">
          <div class="form-field full">
            <label for="pTitle">Título do projeto</label>
            <input type="text" id="pTitle" required>
          </div>
          <div class="form-field full">
            <label for="pDescription">Descrição</label>
            <textarea id="pDescription"></textarea>
          </div>
          <div class="form-field full">
            <label>Imagem do projeto <span class="hint">(anexe um arquivo ou cole um link abaixo)</span></label>
            <div class="file-input-row">
              <label class="file-btn" for="pImageFile">Anexar imagem</label>
              <input type="file" id="pImageFile" accept="image/*" style="display:none;">
              <span class="file-hint">JPG/PNG, até 2MB</span>
            </div>
            <div class="file-preview" id="pImagePreview"></div>
            <input type="url" id="pImageUrl" placeholder="ou cole uma URL de imagem" style="margin-top:10px;">
          </div>
          <div class="form-field full">
            <label>Arquivo do projeto <span class="hint">(plantas, PDF, portfólio completo...)</span></label>
            <div class="file-input-row">
              <label class="file-btn" for="pProjectFile">Anexar arquivo</label>
              <input type="file" id="pProjectFile" accept=".pdf,image/*,.zip,.dwg" style="display:none;">
              <span class="file-hint">PDF, imagem ou ZIP, até 2MB</span>
            </div>
            <div class="file-preview" id="pProjectFilePreview"></div>
            <input type="url" id="pProjectUrl" placeholder="ou cole um link do projeto" style="margin-top:10px;">
          </div>
          <div class="form-field">
            <label for="pStatus">Status</label>
            <select id="pStatus">
              <option value="completed">Concluído</option>
              <option value="ongoing">Em andamento</option>
            </select>
          </div>
          <div class="form-field">
            <label for="pAreaM2">Metragem (m²)</label>
            <input type="number" id="pAreaM2" min="0" placeholder="100">
          </div>
          <div class="form-field full">
            <label>Estilo desta peça <span class="hint">(alimenta o match — seu perfil agregado é a soma de tudo que está aqui)</span></label>
            <div class="chip-select" id="pStylesChips"></div>
          </div>
          <div class="form-field full">
            <label for="pMaterials">Materiais usados <span class="hint">(separados por vírgula)</span></label>
            <input type="text" id="pMaterials" placeholder="Concreto aparente, madeira de demolição">
          </div>
        </div>
        <div class="drawer-detail-actions">
          <button type="submit" class="btn btn-primary btn-sm">${item ? 'Salvar alterações' : 'Adicionar ao portfólio'}</button>
          ${item ? '<button type="button" class="btn btn-danger btn-sm" id="drawerDeletePortfolioBtn">Remover</button>' : ''}
        </div>
      </form>`;

    buildProjectStyleChips('pStylesChips', item?.styles || []);
    document.getElementById('pTitle').value = item?.title || '';
    document.getElementById('pDescription').value = item?.description || '';
    document.getElementById('pImageUrl').value = item?.imageUrl || '';
    document.getElementById('pProjectUrl').value = item?.projectUrl || '';
    document.getElementById('pStatus').value = item?.status || 'completed';
    document.getElementById('pAreaM2').value = item?.areaM2 || '';
    document.getElementById('pMaterials').value = (item?.materials || []).join(', ');

    let pImageDataUri = '';
    let pProjectDataUri = '';
    const pImageFileCtl = MatchExtras.setupFileInput('pImageFile', 'pImagePreview', (uri) => { pImageDataUri = uri; }, { isImage: true });
    const pProjectFileCtl = MatchExtras.setupFileInput('pProjectFile', 'pProjectFilePreview', (uri) => { pProjectDataUri = uri; });

    document.getElementById('drawerPortfolioForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const title = document.getElementById('pTitle').value.trim();
      if (!title) { alert('Dê um título para o projeto.'); return; }
      const payload = {
        title,
        description: document.getElementById('pDescription').value.trim(),
        imageUrl: pImageDataUri || document.getElementById('pImageUrl').value.trim(),
        projectUrl: pProjectDataUri || document.getElementById('pProjectUrl').value.trim(),
        status: document.getElementById('pStatus').value,
        areaM2: document.getElementById('pAreaM2').value || undefined,
        styles: Array.from(document.querySelectorAll('#pStylesChips .chip.active')).map(c => c.dataset.style),
        materials: document.getElementById('pMaterials').value.split(',').map(s => s.trim()).filter(Boolean),
      };
      try {
        if (item) await MatchAPI.updatePortfolio(item._id || item.title, payload);
        else await MatchAPI.addPortfolio(payload);
        const refreshed = await MatchAPI.me();
        renderPortfolio(refreshed);
        renderPlanCard(refreshed);
        renderOnboardingChecklist(refreshed);
        back();
      } catch (err) {
        alert(err.message || 'Não foi possível salvar o projeto.');
      }
    });

    if (item) {
      document.getElementById('drawerDeletePortfolioBtn').addEventListener('click', async () => {
        if (!confirm('Remover este projeto do portfólio?')) return;
        try {
          await MatchAPI.deletePortfolio(item._id || item.title);
          const refreshed = await MatchAPI.me();
          renderPortfolio(refreshed);
          renderPlanCard(refreshed);
          back();
        } catch (err) {
          alert(err.message || 'Não foi possível remover o projeto.');
        }
      });
    }
  }

  function setupPortfolioForm() {
    document.getElementById('openPortfolioDrawerBtn').addEventListener('click', () => {
      ProjectDrawer.open({
        title: 'Meu portfólio',
        newLabel: '+ Nova peça de portfólio',
        emptyLabel: 'Você ainda não adicionou nada ao portfólio.',
        items: () => myPortfolio,
        idOf: (p) => p._id || p.title,
        cardHtml: portfolioDrawerCardHtml,
        renderDetail: renderPortfolioDetail,
      });
    });
  }

  // ---------------- Produtos da loja parceira (drawer) ----------------
  let myStoreProducts = [];

  function productDrawerCardHtml(p) {
    return `
      <h4>${p.name}</h4>
      <div class="drawer-item-meta">${[p.category, (p.styles || []).join(', '), p.price ? `R$${p.price}` : ''].filter(Boolean).join(' · ')}</div>`;
  }

  async function renderStoreProducts() {
    try {
      myStoreProducts = await MatchAPI.myStoreProducts();
    } catch {
      myStoreProducts = [];
    }
  }

  function renderProductDetail(product, container, { back }) {
    container.innerHTML = `
      <form id="drawerProductForm">
        <div class="form-grid">
          <div class="form-field full">
            <label for="storeProductName">Nome do produto</label>
            <input type="text" id="storeProductName" required>
          </div>
          <div class="form-field">
            <label for="storeProductCategory">Categoria</label>
            <input type="text" id="storeProductCategory" placeholder="Iluminação, revestimento, mobiliário...">
          </div>
          <div class="form-field">
            <label for="storeProductPrice">Preço (R$)</label>
            <input type="number" id="storeProductPrice" min="0">
          </div>
          <div class="form-field full">
            <label for="storeProductPhoto">Foto (URL) <span class="hint">(opcional)</span></label>
            <input type="url" id="storeProductPhoto" placeholder="https://...">
          </div>
          <div class="form-field full">
            <label for="storeProductUrl">Link de compra</label>
            <input type="url" id="storeProductUrl" placeholder="https://...">
          </div>
          <div class="form-field full">
            <label>Estilos combinados <span class="hint">(a IA usa isso pra sugerir o produto certo)</span></label>
            <div class="chip-select" id="storeProductStylesChips"></div>
          </div>
        </div>
        <div class="drawer-detail-actions">
          <button type="submit" class="btn btn-primary btn-sm">${product ? 'Salvar alterações' : 'Adicionar produto'}</button>
          ${product ? '<button type="button" class="btn btn-danger btn-sm" id="drawerDeleteProductBtn">Remover</button>' : ''}
        </div>
      </form>`;

    buildProjectStyleChips('storeProductStylesChips', product?.styles || []);
    document.getElementById('storeProductName').value = product?.name || '';
    document.getElementById('storeProductCategory').value = product?.category || '';
    document.getElementById('storeProductPrice').value = product?.price || '';
    document.getElementById('storeProductPhoto').value = product?.photo || '';
    document.getElementById('storeProductUrl').value = product?.purchaseUrl || '';

    document.getElementById('drawerProductForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('storeProductName').value.trim();
      if (!name) { alert('Dê um nome para o produto.'); return; }
      const payload = {
        name,
        category: document.getElementById('storeProductCategory').value.trim(),
        price: document.getElementById('storeProductPrice').value || undefined,
        photo: document.getElementById('storeProductPhoto').value.trim(),
        purchaseUrl: document.getElementById('storeProductUrl').value.trim(),
        styles: Array.from(document.querySelectorAll('#storeProductStylesChips .chip.active')).map(c => c.dataset.style),
      };
      try {
        if (product) await MatchAPI.updateStoreProduct(product._id, payload);
        else await MatchAPI.createStoreProduct(payload);
        await renderStoreProducts();
        back();
      } catch (err) {
        alert(err.message || 'Não foi possível salvar o produto.');
      }
    });

    if (product) {
      document.getElementById('drawerDeleteProductBtn').addEventListener('click', async () => {
        if (!confirm('Remover este produto?')) return;
        try {
          await MatchAPI.deleteStoreProduct(product._id);
          await renderStoreProducts();
          back();
        } catch (err) {
          alert(err.message || 'Não foi possível remover o produto.');
        }
      });
    }
  }

  function setupStoreProducts(user) {
    renderStoreProducts();
    document.getElementById('openProductsDrawerBtn').addEventListener('click', () => {
      ProjectDrawer.open({
        title: 'Meus produtos',
        newLabel: '+ Novo produto',
        emptyLabel: 'Você ainda não cadastrou nenhum produto.',
        items: () => myStoreProducts,
        idOf: (p) => p._id,
        cardHtml: productDrawerCardHtml,
        renderDetail: renderProductDetail,
      });
    });
  }

  // ---------------- Indicações de venda simulada (loja parceira) ----------------
  async function renderStoreReferrals() {
    const list = document.getElementById('referralsList');
    try {
      const { total, count, referrals } = await MatchAPI.myStoreReferrals();
      document.getElementById('referralTotal').textContent = `R$${total}`;
      document.getElementById('referralCount').textContent = count;
      list.innerHTML = referrals.length
        ? `<div class="tag-row" style="flex-direction:column; align-items:stretch; gap:8px;">${referrals.map(r => `
          <div class="material-card spotlight" style="padding:14px;">
            <div class="info" style="padding:0;">
              <span class="cat">${new Date(r.createdAt).toLocaleDateString('pt-BR')}</span>
              <h4>${r.productName || 'Produto'}</h4>
              <p style="font-size:0.82rem; color:var(--ink-faint); margin:4px 0;">Indicado a ${r.clientName || 'um cliente'} — R$${r.simulatedAmount} simulado</p>
            </div>
          </div>`).join('')}</div>`
        : emptyStateHtml('Nenhuma indicação simulada ainda.');
    } catch (err) {
      list.innerHTML = `<p style="font-size:0.86rem; color:var(--ink-faint);">${err.message || 'Não foi possível carregar as indicações agora.'}</p>`;
    }
  }

  // ---------------- Exportar PDF (impressão do resumo) ----------------
  function summaryLineHtml(label, value) {
    return `<div class="summary-line"><span>${label}</span><strong>${value && String(value).trim() ? value : '—'}</strong></div>`;
  }
  function setupExportPdf(user) {
    document.getElementById('exportPdfBtn').addEventListener('click', () => {
      const p = user.clientProfile || {};
      const meta = MatchExtras.getProjectMeta(uid(user));
      document.getElementById('printTitle').textContent = 'Resumo do projeto';
      document.getElementById('printDate').textContent = new Date().toLocaleDateString('pt-BR');
      document.getElementById('printableContent').innerHTML = `
        <div class="summary-section-title">Cliente</div>
        ${summaryLineHtml('Nome', user.name)}
        ${summaryLineHtml('Cidade', [user.city, user.state].filter(Boolean).join(' / '))}
        <div class="summary-section-title">Projeto</div>
        ${summaryLineHtml('Estilo desejado', (p.preferredStyles || []).join(', '))}
        ${summaryLineHtml('Orçamento', formatBudget(p.budget))}
        ${summaryLineHtml('Restrições', meta.restrictions)}
        ${summaryLineHtml('Prioridades', meta.priorities)}
      `;
      window.print();
    });
  }

  function setupExportMatchPdf(user) {
    document.getElementById('exportMatchPdfBtn').addEventListener('click', () => {
      if (!lastResults.length) return;
      document.getElementById('printTitle').textContent = 'Resultados do match';
      document.getElementById('printDate').textContent = new Date().toLocaleDateString('pt-BR');
      document.getElementById('printableContent').innerHTML = lastResults.map((r, i) => `
        <div class="summary-section-title">${i + 1}. ${r.architect.name} — ${r.score} pontos</div>
        ${summaryLineHtml('Localização', [r.architect.city, r.architect.state].filter(Boolean).join(' / '))}
        ${summaryLineHtml('Estilos', (r.architect.profile?.styles || []).join(', '))}
        ${summaryLineHtml('Experiência', r.architect.profile?.yearsExperience ? `${r.architect.profile.yearsExperience} anos` : '')}
        <div class="summary-line" style="display:block;"><span>Por que combinam</span><p style="margin:4px 0 0;">${r.explanation}</p></div>
      `).join('');
      window.print();
    });
  }

  // ---------------- Moodboard com IA ----------------
  function setupMoodboard(user) {
    document.getElementById('moodboardBtn').addEventListener('click', async () => {
      const card = document.getElementById('moodboardCard');
      const content = document.getElementById('moodboardContent');
      card.style.display = 'block';
      card.scrollIntoView({ behavior: SCROLL_BEHAVIOR, block: 'nearest' });
      content.innerHTML = '<p style="font-size:0.86rem; color:var(--ink-faint);"><span class="spinner"></span> Gerando conceito...</p>';
      const p = user.clientProfile || {};
      const meta = MatchExtras.getProjectMeta(uid(user));
      const swatchColors = { 'Claras': '#EDE6DC', 'Escuras': '#3A342C', 'Contraste': '#1A1A1A', 'Tons pastéis': '#E8D6D0', 'Coloridas': '#C68868', 'Branco': '#FFFFFF', 'Preto': '#111111', 'Neutras': '#D8D2C4', 'Cinza': '#A6A6A6', 'Marrom': '#6B4A30' };
      try {
        const { concept } = await MatchAPI.moodboard({
          styles: p.preferredStyles || [],
          materials: p.preferredMaterials || [],
          keywords: meta.habits || [],
          colorTones: meta.colorTones || [],
        });
        content.innerHTML = `
          <div class="moodboard-card">
            <p class="moodboard-concept">"${concept}"</p>
            <span class="mock-label">Paleta sugerida</span>
            <div class="moodboard-swatches">${(meta.colorTones || []).map(c => `<span class="dot" style="background:${swatchColors[c] || '#ccc'}" title="${c}"></span>`).join('') || '<span style="font-size:0.82rem; color:var(--ink-faint);">Nenhum tom de cor informado no questionário.</span>'}</div>
          </div>`;
      } catch (err) {
        content.innerHTML = `<p style="font-size:0.86rem; color:var(--ink-faint);">${err.message || 'Não foi possível gerar o moodboard agora.'}</p>`;
      }
    });
  }

  // ---------------- Referência visual (foto real via Unsplash) ----------------
  function setupReferenceImage(user) {
    document.getElementById('referenceImageBtn').addEventListener('click', async () => {
      const card = document.getElementById('referenceImageCard');
      const content = document.getElementById('referenceImageContent');
      card.style.display = 'block';
      card.scrollIntoView({ behavior: SCROLL_BEHAVIOR, block: 'nearest' });
      content.innerHTML = '<p style="font-size:0.86rem; color:var(--ink-faint);"><span class="spinner"></span> Buscando uma referência visual...</p>';
      const p = user.clientProfile || {};
      const meta = MatchExtras.getProjectMeta(uid(user));
      try {
        const photo = await MatchAPI.referenceImage({
          styles: p.preferredStyles || [],
          materials: p.preferredMaterials || [],
          keywords: meta.habits || [],
        });
        content.innerHTML = `
          <img src="${photo.imageUrl}" alt="${photo.description}" style="width:100%; border-radius:12px; display:block;">
          <p style="font-size:0.76rem; color:var(--ink-faint); margin-top:8px;">Foto: <a href="${photo.photographerUrl}" target="_blank" rel="noopener" style="color:inherit;">${photo.photographerName}</a> via <a href="${photo.unsplashUrl}" target="_blank" rel="noopener" style="color:inherit;">Unsplash</a></p>`;
      } catch (err) {
        content.innerHTML = `<p style="font-size:0.86rem; color:var(--ink-faint);">${err.message || 'Não foi possível encontrar uma referência agora.'}</p>`;
      }
    });
  }

  // ---------------- Compartilhar perfil de estilo ----------------
  function setupStyleShare(user) {
    document.getElementById('styleShareBtn').addEventListener('click', () => StyleShare.open(user));
  }

  // ---------------- Comparador lado a lado ----------------
  function compareTableHtml(user) {
    const visible = lastResults;
    return `
        <table class="compare-table">
          <thead><tr><th>Arquiteto</th>${visible.map(r => `<th>${r.architect.name}</th>`).join('')}</tr></thead>
          <tbody>
            <tr><th>Pontuação</th>${visible.map(r => `<td>${r.score} pontos</td>`).join('')}</tr>
            <tr><th>Localização</th>${visible.map(r => `<td>${[r.architect.city, r.architect.state].filter(Boolean).join(' · ') || '—'}</td>`).join('')}</tr>
            <tr><th>Experiência</th>${visible.map(r => `<td>${r.architect.profile?.yearsExperience || 0} anos</td>`).join('')}</tr>
            <tr><th>Estilos</th>${visible.map(r => `<td>${(r.architect.profile?.styles || []).join(', ') || '—'}</td>`).join('')}</tr>
            <tr><th>Disponibilidade</th>${visible.map(r => `<td>${translateAvailability(r.architect.profile?.availability)}</td>`).join('')}</tr>
            <tr><th>Resumo validado</th>${visible.map(r => {
              const v = validationCache[r.architect.id];
              return `<td>${v?.clientConfirmed && v?.architectConfirmed ? '✓ Sim' : '—'}</td>`;
            }).join('')}</tr>
          </tbody>
        </table>`;
  }
  function setupCompare(user) {
    document.getElementById('compareBtn').addEventListener('click', () => {
      const section = document.getElementById('compareSection');
      if (section.style.display === 'block') { section.style.display = 'none'; return; }
      document.getElementById('compareContent').innerHTML = compareTableHtml(user);
      section.style.display = 'block';
      section.scrollIntoView({ behavior: SCROLL_BEHAVIOR, block: 'nearest' });
    });
  }

  function setupCompareExport(user) {
    document.getElementById('exportCompareBtn').addEventListener('click', () => {
      if (!lastResults.length) { alert('Rode um match antes de exportar o comparativo.'); return; }
      document.getElementById('printTitle').textContent = 'Comparativo de arquitetos';
      document.getElementById('printDate').textContent = new Date().toLocaleDateString('pt-BR');
      document.getElementById('printableContent').innerHTML = compareTableHtml(user);
      window.print();
    });
  }

  // ---------------- Histórico de buscas ----------------
  async function renderMatchHistory(user) {
    const container = document.getElementById('matchHistoryList');
    try {
      const history = await MatchAPI.matchHistory();
      document.getElementById('statMatchCount').textContent = history.length;
      const overviewMatchCount = document.getElementById('overviewMatchCount');
      if (overviewMatchCount) overviewMatchCount.textContent = history.length;
      if (!history.length) {
        container.innerHTML = emptyStateHtml('Nenhuma busca registrada ainda — clique em "Rodar match com IA" no topo da página.');
        return;
      }
      container.innerHTML = history.map(h => `
        <div style="padding:12px 0; border-bottom:1px dashed var(--line);">
          <div style="display:flex; justify-content:space-between; flex-wrap:wrap; gap:8px;">
            <strong style="font-size:0.9rem;">${h.project ? h.project.name : 'Perfil principal'}</strong>
            <span style="font-size:0.78rem; color:var(--ink-faint);">${new Date(h.createdAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
          </div>
          <div class="tag-row" style="margin-top:6px;">
            ${h.results.map(r => `<span class="tag">${r.architect?.name || 'Arquiteto removido'} · ${r.score}pts</span>`).join('') || '<span style="font-size:0.8rem; color:var(--ink-faint);">Nenhum resultado nessa busca.</span>'}
          </div>
        </div>`).join('');
    } catch (err) {
      container.innerHTML = `<p style="font-size:0.86rem; color:var(--ink-faint);">${err.message || 'Não foi possível carregar o histórico.'}</p>`;
    }
  }

  // ---------------- Verificação profissional (CAU/A) ----------------
  function setupCauVerification(user) {
    function renderBadge() {
      const status = user.architectProfile?.cauVerification?.status || 'none';
      const badge = document.getElementById('cauStatusBadge');
      badge.innerHTML = status === 'verified' ? '<span class="status-pill badge-validated">✓ Verificado</span>'
        : status === 'pending' ? '<span class="status-pill badge-pending">Em análise</span>' : '';
      document.getElementById('cauNumberInput').value = user.architectProfile?.cauVerification?.number || '';
    }
    renderBadge();
    document.getElementById('submitCauBtn').addEventListener('click', async () => {
      const number = document.getElementById('cauNumberInput').value.trim();
      if (!number) { alert('Informe o número do seu registro CAU/A.'); return; }
      try {
        const updated = await MatchAPI.updateMe({ architectProfile: { cauVerification: { number, status: 'pending' } } });
        user.architectProfile = updated.architectProfile;
        renderBadge();
        renderOnboardingChecklist(user);
        alert('Solicitação enviada! A equipe match.IA analisa manualmente e ativa o selo de verificado no seu perfil.');
      } catch (err) {
        alert(err.message || 'Não foi possível enviar a solicitação.');
      }
    });
  }

  // ---------------- Compartilhar perfil ----------------
  function setupShareProfile(user) {
    const url = `${location.origin}${location.pathname.replace('dashboard.html', '')}arquiteto.html?id=${uid(user)}`;
    document.getElementById('shareLinkInput').value = url;
    document.getElementById('shareQrCode').src = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(url)}`;
    document.getElementById('copyShareLinkBtn').addEventListener('click', async () => {
      const btn = document.getElementById('copyShareLinkBtn');
      try {
        await navigator.clipboard.writeText(url);
        const original = btn.textContent;
        btn.textContent = '✓ Copiado!';
        setTimeout(() => { btn.textContent = original; }, 1600);
      } catch {
        alert('Não foi possível copiar automaticamente. Copie manualmente:\n' + url);
      }
    });
  }

  // ---------------- Resumos para confirmar (arquiteto) ----------------
  async function renderPendingValidations() {
    const card = document.getElementById('pendingValidationsCard');
    const list = document.getElementById('pendingValidationsList');
    try {
      const pending = await MatchAPI.pendingValidations();
      if (!pending.length) { card.style.display = 'none'; return; }
      card.style.display = 'block';
      list.innerHTML = pending.map(p => `
        <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; padding:10px 0; border-bottom:1px dashed var(--line);">
          <span style="font-size:0.9rem;">${p.client.name}</span>
          <button type="button" class="btn btn-sage btn-sm" data-confirm-validation="${p.client.id}">Confirmar resumo</button>
        </div>`).join('');
      list.querySelectorAll('[data-confirm-validation]').forEach(btn => {
        btn.addEventListener('click', async () => {
          btn.disabled = true;
          try {
            await MatchAPI.confirmValidation(btn.dataset.confirmValidation);
            renderPendingValidations();
          } catch (err) {
            alert(err.message || 'Não foi possível confirmar agora.');
            btn.disabled = false;
          }
        });
      });
    } catch {
      card.style.display = 'none';
    }
  }

  // ---------------- Métricas do perfil (arquiteto Pro) ----------------
  function setupMetrics(user) {
    document.getElementById('upgradeFromMetricsBtn').addEventListener('click', () =>
      openUpgrade(user, () => { renderPlanCard(user); renderMetrics(user); }));
    renderMetrics(user);
  }

  async function renderMetrics(user) {
    const upsell = document.getElementById('metricsUpsell');
    const content = document.getElementById('metricsContent');
    if (user.architectProfile?.subscriptionTier !== 'pro') { upsell.style.display = 'block'; content.style.display = 'none'; return; }
    upsell.style.display = 'none';
    content.style.display = 'block';
    const statsEl = document.getElementById('metricsStats');
    statsEl.innerHTML = '<p style="font-size:0.86rem; color:var(--ink-faint);"><span class="spinner"></span> Carregando métricas...</p>';
    try {
      const s = await MatchAPI.myStats();
      statsEl.innerHTML = `
        <div class="stat"><strong>${s.views30d}</strong><span>visualizações do perfil (30 dias)</span></div>
        <div class="stat"><strong>${s.matchAppearances}</strong><span>aparições em resultados de match</span></div>
        <div class="stat"><strong>${s.responseRate === null ? '—' : s.responseRate + '%'}</strong><span>taxa de resposta a mensagens</span></div>
        <div class="stat"><strong>${s.validationsConfirmed}</strong><span>projetos com resumo validado</span></div>
      `;
    } catch (err) {
      statsEl.innerHTML = `<p style="font-size:0.86rem; color:var(--ink-faint);">${err.message || 'Não foi possível carregar as métricas agora.'}</p>`;
    }
  }

  // ---------------- Cases de sucesso (arquiteto propõe, cliente aprova) ----------------
  function setupCaseStudies(user) {
    document.getElementById('caseStudiesList').addEventListener('submit', async (e) => {
      const form = e.target.closest('.case-study-form');
      if (!form) return;
      e.preventDefault();
      const clientId = form.dataset.caseClient;
      const payload = {
        title: form.querySelector('[name="title"]').value.trim(),
        description: form.querySelector('[name="description"]').value.trim(),
        images: form.querySelector('[name="images"]').value.split('\n').map(s => s.trim()).filter(Boolean).slice(0, 4),
      };
      const btn = form.querySelector('button[type="submit"]');
      btn.disabled = true;
      try {
        await MatchAPI.proposeCaseStudy(clientId, payload);
        renderCaseStudies(user);
      } catch (err) {
        alert(err.message || 'Não foi possível salvar o case agora.');
        btn.disabled = false;
      }
    });
  }

  async function renderCaseStudies(user) {
    const card = document.getElementById('caseStudiesCard');
    const list = document.getElementById('caseStudiesList');
    try {
      const confirmed = await MatchAPI.confirmedValidations();
      if (!confirmed.length) { card.style.display = 'none'; return; }
      card.style.display = 'block';
      const items = await Promise.all(confirmed.map(async (c) => {
        let cs = null;
        try { cs = await MatchAPI.getCaseStudy(c.client.id); } catch { /* ainda sem case proposto */ }
        return { client: c.client, cs };
      }));
      list.innerHTML = items.map(({ client, cs }) => caseStudyRowHtml(client, cs)).join('');
    } catch {
      card.style.display = 'none';
    }
  }

  function caseStudyRowHtml(client, cs) {
    const published = Boolean(cs && cs.clientApproved && cs.architectApproved && cs.title);
    const statusText = !cs ? '' : published ? '✓ Publicado no seu perfil' : (cs.testimonial ? 'Aguardando aprovação do cliente' : 'Aguardando testemunho do cliente');
    return `
      <div class="dash-card" style="background:var(--bg); margin-bottom:12px;">
        <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap;">
          <strong style="font-size:0.92rem;">${client.name}</strong>
          ${statusText ? `<span class="status-pill ${published ? 'badge-validated' : 'badge-pending'}">${statusText}</span>` : ''}
        </div>
        <form class="case-study-form" data-case-client="${client.id}" style="margin-top:12px;">
          <div class="form-grid">
            <div class="form-field full">
              <label>Título do case</label>
              <input type="text" name="title" value="${cs?.title || ''}" required>
            </div>
            <div class="form-field full">
              <label>Descrição</label>
              <textarea name="description">${cs?.description || ''}</textarea>
            </div>
            <div class="form-field full">
              <label>Imagens <span class="hint">(URLs, uma por linha, até 4)</span></label>
              <textarea name="images" placeholder="https://...">${(cs?.images || []).join('\n')}</textarea>
            </div>
          </div>
          <button type="submit" class="btn btn-secondary btn-sm">${cs ? 'Atualizar case' : 'Propor case'}</button>
        </form>
        ${cs?.testimonial ? `<div style="margin-top:10px; padding-top:10px; border-top:1px dashed var(--line);"><span class="mock-label">Testemunho do cliente</span><p style="margin:0; font-style:italic;">"${cs.testimonial}"</p></div>` : ''}
      </div>`;
  }

  // ---------------- Avaliações recebidas (arquiteto) ----------------
  async function renderArchitectReviews(user) {
    const container = document.getElementById('architectReviews');
    try {
      const { reviews, average, count } = await MatchAPI.reviews(uid(user));
      document.getElementById('statRatingValue').textContent = count ? `★ ${average}` : '—';
      document.getElementById('statReviewCount').textContent = count ? `${count} avaliaç${count > 1 ? 'ões' : 'ão'}` : 'sem avaliações';
      const overviewRating = document.getElementById('overviewRatingValue');
      if (overviewRating) overviewRating.textContent = count ? `★ ${average}` : '—';
      if (!count) {
        container.innerHTML = emptyStateHtml('Você ainda não recebeu avaliações.');
        return;
      }
      container.innerHTML = `
        <div class="review-summary">
          <span class="review-avg">${average}</span>
          <div><span class="star-display">${'★'.repeat(Math.round(average))}${'☆'.repeat(5 - Math.round(average))}</span><div style="font-size:0.8rem; color:var(--ink-faint);">${count} avaliaç${count > 1 ? 'ões' : 'ão'}</div></div>
        </div>
        ${reviews.map(r => `
          <div class="review-item">
            <div class="review-head">
              <span class="review-name">${r.client?.name || 'Cliente'}</span>
              <span class="star-display">${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)}</span>
            </div>
            ${r.comment ? `<p>${r.comment}</p>` : ''}
          </div>`).join('')}
      `;
    } catch (err) {
      container.innerHTML = `<p style="font-size:0.86rem; color:var(--ink-faint);">${err.message || 'Não foi possível carregar as avaliações.'}</p>`;
    }
  }

  // ---------------- Estatísticas dos projetos contratados (arquiteto) ----------------
  async function renderArchitectStatsChart() {
    let projects = [];
    try { projects = await MatchAPI.architectProjects(); } catch { projects = []; }
    renderStatusChart('architectStatsChart', projects);
  }

  // ---------------- Comissões (arquiteto) ----------------
  async function renderCommissions() {
    const list = document.getElementById('commissionsList');
    try {
      const { total, count, commissions } = await MatchAPI.myCommissions();
      document.getElementById('commissionTotal').textContent = `R$${total}`;
      document.getElementById('commissionCount').textContent = count;
      const overviewCommissionCount = document.getElementById('overviewCommissionCount');
      if (overviewCommissionCount) overviewCommissionCount.textContent = count;
      list.innerHTML = commissions.length
        ? `<div class="tag-row" style="flex-direction:column; align-items:stretch; gap:8px;">${commissions.map(c => `
          <div class="material-card spotlight" style="padding:14px;">
            <div class="info" style="padding:0;">
              <span class="cat">${new Date(c.createdAt).toLocaleDateString('pt-BR')}</span>
              <h4>${c.clientName || 'Cliente'}${c.projectName ? ` — ${c.projectName}` : ''}</h4>
              <p style="font-size:0.82rem; color:var(--ink-faint); margin:4px 0;">R$${c.amount} simulado (${Math.round(c.rate * 100)}% de R$${c.estimatedValue})</p>
            </div>
          </div>`).join('')}</div>`
        : emptyStateHtml('Nenhum projeto fechado pela plataforma ainda.');
    } catch (err) {
      list.innerHTML = `<p style="font-size:0.86rem; color:var(--ink-faint);">${err.message || 'Não foi possível carregar suas comissões agora.'}</p>`;
    }
  }

  // ---------------- Mensagens (chat) ----------------
  function setupChat(user, listId, shellId) {
    document.getElementById(shellId).addEventListener('click', (e) => {
      const advanceBtn = e.target.closest('[data-advance-timeline]');
      if (!advanceBtn) return;
      const otherId = advanceBtn.dataset.advanceTimeline;
      advanceBtn.disabled = true;
      MatchAPI.advanceTimeline(otherId)
        .then(({ phase }) => { document.getElementById(`chatTimeline-${shellId}`).innerHTML = timelineHtml(otherId, phase); })
        .catch(err => { alert(err.message || 'Não foi possível avançar a etapa agora.'); advanceBtn.disabled = false; });
    });
    loadConversations(user, listId, shellId);
  }

  async function loadChatTimeline(containerId, otherId) {
    const el = document.getElementById(containerId);
    if (!el) return;
    try {
      const { phase } = await MatchAPI.getTimeline(otherId);
      el.innerHTML = timelineHtml(otherId, phase);
    } catch { el.innerHTML = ''; }
  }

  async function loadConversations(user, listId, shellId) {
    const listEl = document.getElementById(listId);
    try {
      const conversations = await MatchAPI.conversations();
      if (!conversations.length) {
        listEl.innerHTML = emptyStateHtml('Nenhuma conversa ainda.');
        return;
      }
      listEl.innerHTML = conversations.map(c => `
        <div class="conversation-list-item" data-conv-user="${escapeHtml(c.userId)}" data-conv-name="${escapeHtml(c.name)}">
          <div class="conv-avatar">${(c.name || '?').split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase()}</div>
          <div class="conv-info">
            <div class="conv-name">${escapeHtml(c.name)}</div>
            <div class="conv-preview">${escapeHtml(c.lastMessage)}</div>
          </div>
        </div>`).join('');
      listEl.querySelectorAll('[data-conv-user]').forEach(item => {
        item.addEventListener('click', () => {
          listEl.querySelectorAll('.conversation-list-item').forEach(i => i.classList.remove('active'));
          item.classList.add('active');
          openConversation(item.dataset.convUser, item.dataset.convName, shellId, user);
        });
      });
    } catch (err) {
      listEl.innerHTML = `<p style="font-size:0.8rem; color:var(--ink-faint); padding:10px;">${err.message || 'Não foi possível carregar as conversas.'}</p>`;
    }
  }

  async function openConversation(otherId, otherName, shellId, user) {
    const shell = document.getElementById(shellId);
    const msgId = `chatMessages-${shellId}`;
    const timelineId = `chatTimeline-${shellId}`;
    shell.innerHTML = `
      <div class="chat-timeline" id="${timelineId}"></div>
      <div class="chat-messages" id="${msgId}"><p style="text-align:center; color:var(--ink-faint); font-size:0.84rem;">Carregando...</p></div>
      <div class="chat-input-row">
        <input type="text" id="chatInput-${shellId}" placeholder="Mensagem para ${otherName}...">
        <button type="button" id="chatSend-${shellId}" aria-label="Enviar">➤</button>
      </div>`;
    loadChatTimeline(timelineId, otherId);
    const messagesEl = document.getElementById(msgId);
    try {
      const messages = await MatchAPI.conversation(otherId);
      renderMessages(messagesEl, messages, user);
    } catch (err) {
      messagesEl.innerHTML = `<p style="text-align:center; color:var(--ink-faint); font-size:0.84rem;">${err.message || 'Não foi possível carregar as mensagens.'}</p>`;
    }
    const input = document.getElementById(`chatInput-${shellId}`);
    const send = async () => {
      const text = input.value.trim();
      if (!text) return;
      input.value = '';
      try {
        await MatchAPI.sendMessage(otherId, text);
        const messages = await MatchAPI.conversation(otherId);
        renderMessages(messagesEl, messages, user);
        loadConversations(user, shellId.replace('ChatShell', 'ConversationList'), shellId);
      } catch (err) { alert(err.message || 'Não foi possível enviar a mensagem.'); }
    };
    document.getElementById(`chatSend-${shellId}`).addEventListener('click', send);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') send(); });
  }

  // O texto das mensagens é digitado por outra pessoa (ou gerado por IA a
  // partir do que ela escreveu): nunca entra como HTML cru.
  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  }

  function renderMessages(container, messages, user) {
    const myId = uid(user);
    // Cliente sempre vê o histórico completo. Arquiteto free vê só as
    // últimas 5 mensagens por conversa -- Pro libera o histórico inteiro.
    const limit = user.role === 'architect' && user.architectProfile?.subscriptionTier !== 'pro' ? 5 : Infinity;
    const visible = messages.length > limit ? messages.slice(-limit) : messages;
    const hiddenCount = messages.length - visible.length;
    const limitNote = hiddenCount > 0
      ? `<div class="chat-limit-note">Plano Gratuito mostra só as últimas ${limit} mensagens desta conversa (${hiddenCount} mais antiga${hiddenCount > 1 ? 's' : ''} oculta${hiddenCount > 1 ? 's' : ''}). <button type="button" class="btn btn-sage btn-sm" id="chatUpgradeBtn">Assinar Pro</button></div>`
      : '';
    container.innerHTML = limitNote + (visible.length ? visible.map(m => `
      <div class="chat-bubble ${String(m.from) === String(myId) ? 'mine' : 'theirs'}">
        <span style="white-space:pre-wrap;">${escapeHtml(m.text)}</span>
        <span class="chat-time">${new Date(m.createdAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
      </div>`).join('') : '<p style="text-align:center; color:var(--ink-faint); font-size:0.84rem;">Nenhuma mensagem ainda. Diga oi!</p>');
    container.scrollTop = container.scrollHeight;
    container.querySelector('#chatUpgradeBtn')?.addEventListener('click', () => openUpgrade(user, () => renderMessages(container, messages, user)));
  }
});
