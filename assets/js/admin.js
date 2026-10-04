/**
 * Painel da equipe match.IA (admin.html).
 *
 * Usa a mesma conta do site; o servidor só libera /api/admin para e-mails
 * em ADMIN_EMAILS. Toda ação que altera algo é registrada na auditoria.
 * Os gráficos reaproveitam os componentes do painel (assets/js/dashboard-ui.js).
 */
(() => {
  const U = DashUI;
  const esc = U.esc;
  const $ = (id) => document.getElementById(id);
  const view = $('admView');
  const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
  const fmtDateTime = (d) => (d ? new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—');
  const ROLE = { client: 'Cliente', architect: 'Arquiteto', store: 'Loja' };
  const HIRE = { pending: 'Aguardando', accepted: 'Aceita', declined: 'Recusada', cancelled: 'Cancelada' };
  const PROJECT = { draft: 'Rascunho', matching: 'Buscando arquiteto', in_progress: 'Em andamento', completed: 'Concluído' };

  // ---------- API ----------
  async function api(path, { method = 'GET', body, raw = false } = {}) {
    const res = await fetch(`${MatchAPI.base()}/admin${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${MatchAPI.token() || ''}` },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 401) { showGate('Sua sessão expirou. Entre de novo.'); throw new Error('Sessão expirada'); }
    if (raw) return res;
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Não foi possível concluir agora.');
    return data;
  }

  let toastTimer;
  function toast(text, tone = 'ok') {
    const el = $('admToast');
    el.textContent = text;
    el.dataset.tone = tone;
    el.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('is-on'), 3200);
  }
  const fail = (err) => toast(err.message || 'Algo deu errado.', 'err');

  // ---------- entrada ----------
  function showGate(message) {
    $('admApp').hidden = true;
    $('admGate').hidden = false;
    if (message) $('admGateLead').textContent = message;
  }
  $('admLogin').addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('admLoginError');
    err.textContent = '';
    try {
      const r = await MatchAPI.login({ email: $('admEmail').value.trim(), password: $('admPass').value });
      MatchAPI.setSession(r.token, r.user);
      $('admPass').value = '';
      boot();
    } catch (ex) {
      err.textContent = ex.status === 401 ? 'E-mail ou senha incorretos.' : (ex.message || 'Não foi possível entrar.');
    }
  });
  $('admLogout').addEventListener('click', () => { MatchAPI.clearSession(); showGate('Você saiu do painel.'); });

  // ---------- navegação ----------
  const SECTIONS = [
    { key: 'overview', label: 'Visão geral', icon: 'home', render: () => renderOverview() },
    { key: 'users', label: 'Usuários', icon: 'users', render: () => renderUsers() },
    { key: 'cau', label: 'Verificações CAU', icon: 'badge', render: () => renderCau(), badge: 'cauPending' },
    { key: 'projects', label: 'Projetos', icon: 'projeto', render: () => renderProjects() },
    { key: 'matches', label: 'Matches', icon: 'match', render: () => renderMatches() },
    { key: 'hires', label: 'Contratações', icon: 'contratacoes', render: () => renderHires() },
    { key: 'reviews', label: 'Avaliações', icon: 'avaliacoes', render: () => renderReviews() },
    { key: 'finance', label: 'Financeiro', icon: 'comissoes', render: () => renderFinance() },
    { key: 'brand', label: 'Marca e site', icon: 'palette', render: () => renderBrand() },
    { key: 'broadcast', label: 'Comunicados', icon: 'megaphone', render: () => renderBroadcast() },
    { key: 'logs', label: 'Auditoria', icon: 'list', render: () => renderLogs() },
    { key: 'system', label: 'Sistema', icon: 'server', render: () => renderSystem() },
  ];
  const badges = {};
  function buildNav() {
    $('admNav').innerHTML = SECTIONS.map((s) => `
      <a href="#${s.key}" data-key="${s.key}"${s.key === current() ? ' class="is-active"' : ''}><span class="adm-nav-ico">${U.icon(s.icon, 18)}</span><span>${s.label}</span>${s.badge && badges[s.badge] ? `<b class="adm-badge">${badges[s.badge]}</b>` : ''}</a>`).join('');
  }
  function current() { return (location.hash.replace('#', '').split('/')[0]) || 'overview'; }
  async function route() {
    const key = current();
    const section = SECTIONS.find((s) => s.key === key) || SECTIONS[0];
    $('admTitle').textContent = section.label;
    document.title = `${section.label} — Gestão match.IA`;
    $('admNav').querySelectorAll('a').forEach((a) => a.classList.toggle('is-active', a.dataset.key === section.key));
    document.body.classList.remove('adm-menu-open');
    view.onclick = null;
    view.innerHTML = '<div class="adm-loading"><span class="spinner"></span></div>';
    try { await section.render(); } catch (err) {
      view.innerHTML = `<div class="dash-card">${U.empty(esc(err.message || 'Não foi possível carregar.'))}</div>`;
    }
  }
  window.addEventListener('hashchange', route);
  $('admRefresh').innerHTML = U.icon('refresh', 18);
  $('admRefresh').addEventListener('click', route);
  $('admBurger').addEventListener('click', () => document.body.classList.toggle('adm-menu-open'));
  document.querySelectorAll('[data-icon]').forEach((el) => el.insertAdjacentHTML('afterbegin', U.icon(el.dataset.icon, 15)));

  // ---------- peças reutilizáveis ----------
  const pill = (text, tone = '') => `<span class="adm-pill${tone ? ` is-${tone}` : ''}">${esc(text)}</span>`;
  const statusPill = (u) => (u.status === 'suspended' ? pill('Suspensa', 'danger') : pill('Ativa', 'ok'));
  const card = (title, body, { eyebrow = '', actions = '', cls = '' } = {}) => `
    <section class="dv-card adm-card ${cls}">
      <header class="dv-card-head"><div>${eyebrow ? `<span class="eyebrow">${esc(eyebrow)}</span>` : ''}<h3>${esc(title)}</h3></div>${actions}</header>
      ${body}
    </section>`;
  const pager = (d, name) => {
    const pages = Math.max(1, Math.ceil(d.total / d.pageSize));
    return `<div class="adm-pager" data-pager="${name}">
      <span>${d.total.toLocaleString('pt-BR')} no total · página ${d.page} de ${pages}</span>
      <button type="button" class="btn btn-secondary btn-sm" data-page="${d.page - 1}" ${d.page <= 1 ? 'disabled' : ''}>Anterior</button>
      <button type="button" class="btn btn-secondary btn-sm" data-page="${d.page + 1}" ${d.page >= pages ? 'disabled' : ''}>Próxima</button>
    </div>`;
  };
  const table = (head, rows, empty = 'Nada por aqui ainda.') => rows.length
    ? `<div class="adm-table-wrap"><table class="adm-table"><thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`
    : U.empty(empty);
  const person = (p, sub = '') => p ? `<span class="adm-person">${U.avatar({ id: p._id || p.id, name: p.name, avatar: p.avatar }, { size: 30, role: 'client' })}<span><strong>${esc(p.name)}</strong>${sub ? `<em>${esc(sub)}</em>` : ''}</span></span>` : '<span class="adm-muted">removido</span>';
  const money = (n) => U.money(Number(n) || 0);
  const kpi = (icon, label, value, foot = '', count) => `
    <div class="dv-card dv-kpi adm-kpi">
      <span class="dv-kpi-top"><span class="dv-chip-ico">${U.icon(icon, 18)}</span><span class="dv-kpi-label">${esc(label)}</span></span>
      <strong class="dv-kpi-num" ${count != null ? `data-count="${count}"` : ''}>${esc(value)}</strong>
      <span class="dv-kpi-foot">${foot}</span>
    </div>`;
  const dayBars = (series) => U.bars(series.map((d, i) => ({
    value: d.value,
    label: i % 5 === 4 || i === series.length - 1 ? new Date(d.date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '',
    title: new Date(d.date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }),
  })), { highlight: series.length - 1 });
  const play = (root = view) => U.play(root);

  // ================= Visão geral =================
  async function renderOverview() {
    const d = await api('/overview');
    badges.cauPending = d.architects.cauPending; buildNav();
    const sum = (s) => s.reduce((a, b) => a + b.value, 0);
    view.innerHTML = `
      ${(d.architects.cauPending || d.users.suspended) ? `<div class="adm-alerts">
        ${d.architects.cauPending ? `<a class="adm-alert" href="#cau">${U.icon('badge', 16)}<span><b>${d.architects.cauPending}</b> verificaç${d.architects.cauPending > 1 ? 'ões' : 'ão'} de CAU aguardando a equipe</span>${U.icon('arrow', 14)}</a>` : ''}
        ${d.users.suspended ? `<a class="adm-alert is-muted" href="#users">${U.icon('alert', 16)}<span><b>${d.users.suspended}</b> conta${d.users.suspended > 1 ? 's' : ''} suspensa${d.users.suspended > 1 ? 's' : ''}</span>${U.icon('arrow', 14)}</a>` : ''}
      </div>` : ''}
      <div class="adm-kpis">
        ${kpi('users', 'Usuários', d.users.total, `+${d.users.new7} em 7 dias · +${d.users.new30} em 30`, d.users.total)}
        ${kpi('eye', 'Ativos em 7 dias', d.users.active7, `${d.users.total ? Math.round((d.users.active7 / d.users.total) * 100) : 0}% da base`, d.users.active7)}
        ${kpi('match', 'Matches', d.matches.total, `${d.matches.last7} nos últimos 7 dias`, d.matches.total)}
        ${kpi('mensagens', 'Mensagens', d.messages.total, `${d.messages.last7} nos últimos 7 dias`, d.messages.total)}
        ${kpi('projeto', 'Projetos', d.projects.total, `${d.favorites} favoritos salvos`, d.projects.total)}
        ${kpi('contratacoes', 'Contratações fechadas', d.hires.accepted || 0, `${d.hires.pending || 0} aguardando resposta`, d.hires.accepted || 0)}
        ${kpi('avaliacoes', 'Avaliação média', d.reviews.total ? d.reviews.average.toLocaleString('pt-BR') : '—', `${d.reviews.total} avaliações`)}
        ${kpi('bolt', 'Arquitetos Pro', d.architects.pro, `de ${d.users.architects} arquitetos`, d.architects.pro)}
      </div>
      <div class="adm-grid">
        ${card('Cadastros por dia', dayBars(d.series.signups), { eyebrow: `Últimos 30 dias · ${sum(d.series.signups)} contas`, cls: 'adm-span-8' })}
        ${card('Quem está na plataforma', `${U.stacked([
          { label: 'Clientes', value: d.users.clients, color: 'var(--terracotta)' },
          { label: 'Arquitetos', value: d.users.architects, color: 'var(--sage)' },
          { label: 'Lojas', value: d.users.stores, color: '#C9BBA8' },
        ])}<div class="adm-split">${U.ring(d.users.total ? (d.users.architects / d.users.total) * 100 : 0, { size: 104 })}<p>dos usuários são arquitetos. O equilíbrio entre oferta e procura é o que faz o match funcionar.</p></div>`, { eyebrow: 'Base por papel', cls: 'adm-span-4' })}
        ${card('Matches por dia', dayBars(d.series.matches), { eyebrow: `Últimos 30 dias · ${sum(d.series.matches)} buscas`, cls: 'adm-span-6' })}
        ${card('Mensagens por dia', dayBars(d.series.messages), { eyebrow: `Últimos 30 dias · ${sum(d.series.messages)} mensagens`, cls: 'adm-span-6' })}
        ${card('Projetos por status', U.stacked(Object.entries(PROJECT).map(([k, label], i) => ({ label, value: d.projects.byStatus[k] || 0, color: ['#C9BBA8', 'var(--terracotta)', 'var(--sage)', '#5B6B5D'][i] }))), { eyebrow: 'Funil dos clientes', cls: 'adm-span-4' })}
        ${card('Estilos mais pedidos', d.topStyles.length ? U.hbars(d.topStyles) : U.empty('Sem projetos ainda.'), { eyebrow: 'Projetos', cls: 'adm-span-4' })}
        ${card('Cidades com mais contas', d.topCities.length ? U.hbars(d.topCities) : U.empty('Sem cidades informadas.'), { eyebrow: 'Usuários', cls: 'adm-span-4' })}
        ${card('Financeiro (simulado)', `<div class="adm-money">
            <div><span>Comissões de projetos</span><strong>${money(d.finance.commissions.total)}</strong><em>${d.finance.commissions.count} registro(s)</em></div>
            <div><span>Indicações de lojas</span><strong>${money(d.finance.referrals.total)}</strong><em>${d.finance.referrals.count} registro(s)</em></div>
            <div><span>Produtos de lojas</span><strong>${d.finance.products}</strong><em>no catálogo</em></div>
          </div><p class="adm-note">Valores simulados: a plataforma ainda não tem gateway de pagamento. Veja "Financeiro".</p>`, { eyebrow: 'Receita potencial', cls: 'adm-span-12' })}
      </div>`;
    play();
  }

  // ================= Usuários =================
  const userFilters = { q: '', role: '', status: '', sort: 'createdAt', page: 1 };
  async function renderUsers() {
    view.innerHTML = `
      <div class="adm-toolbar">
        <label class="dv-search adm-search"><span class="dv-search-ico">${U.icon('search', 16)}</span><input type="search" id="uQ" placeholder="Buscar por nome, e-mail ou cidade" value="${esc(userFilters.q)}"></label>
        <select id="uRole" aria-label="Papel"><option value="">Todos os papéis</option><option value="client">Clientes</option><option value="architect">Arquitetos</option><option value="store">Lojas</option></select>
        <select id="uStatus" aria-label="Situação"><option value="">Todas as situações</option><option value="active">Ativas</option><option value="suspended">Suspensas</option></select>
        <select id="uSort" aria-label="Ordenar"><option value="createdAt">Mais recentes</option><option value="lastSeen">Vistos por último</option><option value="name">Nome (A–Z)</option></select>
        <button type="button" class="btn btn-secondary btn-sm" id="uCsv">${U.icon('download', 15)} Exportar CSV</button>
      </div>
      <section class="dv-card adm-card adm-demo" id="uDemo" aria-labelledby="uDemoTitle">
        <div class="adm-demo-text">
          <h3 id="uDemoTitle">Arquitetos de demonstração</h3>
          <p>10 perfis ilustrativos para a plataforma não parecer vazia no começo. Aparecem com o selo "Perfil ilustrativo", ninguém consegue entrar neles, e mensagens, contratações e avaliações para eles são bloqueadas. Remova quando houver arquitetos reais.</p>
        </div>
        <div class="adm-demo-actions"><span class="adm-muted" id="uDemoCount">…</span><button type="button" class="btn btn-sm" id="uDemoBtn" disabled>…</button></div>
      </section>
      <div id="uList"><div class="adm-loading"><span class="spinner"></span></div></div>`;
    setupDemoCard();
    $('uRole').value = userFilters.role; $('uStatus').value = userFilters.status; $('uSort').value = userFilters.sort;
    let t;
    $('uQ').addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { userFilters.q = $('uQ').value.trim(); userFilters.page = 1; loadUsers(); }, 280); });
    ['uRole', 'uStatus', 'uSort'].forEach((id) => $(id).addEventListener('change', () => {
      userFilters.role = $('uRole').value; userFilters.status = $('uStatus').value; userFilters.sort = $('uSort').value; userFilters.page = 1; loadUsers();
    }));
    $('uCsv').addEventListener('click', async () => {
      try {
        const res = await api('/users.csv', { raw: true });
        if (!res.ok) throw new Error('Não foi possível exportar.');
        const url = URL.createObjectURL(await res.blob());
        const a = Object.assign(document.createElement('a'), { href: url, download: 'matchia-usuarios.csv' });
        document.body.append(a); a.click(); a.remove(); URL.revokeObjectURL(url);
      } catch (err) { fail(err); }
    });
    await loadUsers();
  }
  async function setupDemoCard() {
    const btn = $('uDemoBtn'), count = $('uDemoCount');
    const paint = (n) => {
      if (!btn) return;
      count.textContent = n ? `${n} ${n === 1 ? 'perfil ativo' : 'perfis ativos'}` : 'Nenhum perfil ativo';
      btn.className = `btn btn-sm ${n ? 'btn-secondary' : 'btn-primary'}`;
      btn.textContent = n ? 'Remover todos' : 'Criar os 10 perfis';
      btn.dataset.mode = n ? 'remove' : 'create';
      btn.disabled = false;
    };
    try { paint((await api('/demo-architects')).count); } catch (err) { count.textContent = ''; fail(err); }
    btn?.addEventListener('click', async () => {
      const removing = btn.dataset.mode === 'remove';
      if (removing && !confirm('Remover todos os arquitetos de demonstração? Favoritos e matches ligados a eles também saem.')) return;
      btn.disabled = true;
      btn.textContent = removing ? 'Removendo…' : 'Criando…';
      try {
        const r = await api('/demo-architects', { method: removing ? 'DELETE' : 'POST' });
        toast(removing ? `${r.removed} perfis removidos` : `${r.created} perfis criados${r.skipped ? ` (${r.skipped} já existiam)` : ''}`);
        paint(removing ? 0 : r.total);
        loadUsers();
      } catch (err) { fail(err); paint(removing ? 1 : 0); }
    });
  }
  async function loadUsers() {
    const qs = new URLSearchParams({ q: userFilters.q, role: userFilters.role, status: userFilters.status, sort: userFilters.sort, page: userFilters.page });
    const d = await api(`/users?${qs}`);
    const list = $('uList');
    if (!list) return;
    list.innerHTML = `<section class="dv-card adm-card">${table(
      ['Pessoa', 'Papel', 'Local', 'Plano / CAU', 'Situação', 'Cadastro', 'Visto por último'],
      d.users.map((u) => `<tr data-user="${u.id}" tabindex="0">
        <td>${person(u, u.email)}</td>
        <td>${pill(ROLE[u.role] || u.role, u.role)}${u.isDemo ? ` ${pill('Ilustrativo', 'warn')}` : ''}</td>
        <td>${esc([u.city, u.state].filter(Boolean).join(' / ') || '—')}</td>
        <td>${u.role === 'architect' ? `${u.plan === 'pro' ? pill('Pro', 'accent') : pill('Gratuito')} ${u.cau === 'verified' ? pill('CAU ✓', 'ok') : u.cau === 'pending' ? pill('CAU pendente', 'warn') : ''}` : '<span class="adm-muted">—</span>'}</td>
        <td>${statusPill(u)}</td>
        <td>${fmtDate(u.createdAt)}</td>
        <td>${u.lastSeenAt ? U.timeAgo(u.lastSeenAt) : '<span class="adm-muted">nunca</span>'}</td>
      </tr>`),
      'Nenhuma conta encontrada com esses filtros.',
    )}${pager(d, 'users')}</section>`;
    list.querySelector('[data-pager]')?.addEventListener('click', (e) => {
      const b = e.target.closest('[data-page]'); if (!b || b.disabled) return;
      userFilters.page = Number(b.dataset.page); loadUsers();
    });
    list.querySelectorAll('[data-user]').forEach((tr) => {
      const open = () => openUser(tr.dataset.user);
      tr.addEventListener('click', open);
      tr.addEventListener('keydown', (e) => { if (e.key === 'Enter') open(); });
    });
  }

  // ---------- gaveta do usuário ----------
  function setDrawer(open) {
    $('admDrawer').classList.toggle('is-open', open);
    $('admDrawer').setAttribute('aria-hidden', String(!open));
    $('admScrim').hidden = !open;
  }
  $('admDrawerX').innerHTML = U.icon('close', 18);
  $('admDrawerX').addEventListener('click', () => setDrawer(false));
  $('admScrim').addEventListener('click', () => setDrawer(false));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setDrawer(false); });

  async function openUser(id) {
    setDrawer(true);
    const body = $('admDrawerBody');
    body.innerHTML = '<div class="adm-loading"><span class="spinner"></span></div>';
    let u;
    try { u = await api(`/users/${id}`); } catch (err) { body.innerHTML = U.empty(esc(err.message)); return; }
    const c = u.counts;
    const facts = [
      ['E-mail', u.email], ['Telefone', u.phone || '—'], ['Local', [u.city, u.state].filter(Boolean).join(' / ') || '—'],
      ['Cadastro', fmtDateTime(u.createdAt)], ['Visto por último', u.lastSeenAt ? fmtDateTime(u.lastSeenAt) : 'nunca'],
    ];
    if (u.role === 'architect') {
      const a = u.architectProfile;
      facts.push(['Plano', u.plan === 'pro' ? `Pro desde ${fmtDate(a.proSince)}` : 'Gratuito'], ['CAU', a.cauNumber ? `${a.cauNumber} · ${u.cau === 'verified' ? 'verificado' : u.cau === 'pending' ? 'pendente' : 'não verificado'}` : 'não enviado'],
        ['Portfólio', `${a.portfolioCount} peça(s)`], ['Disponibilidade', { available: 'Disponível', limited: 'Limitada', unavailable: 'Indisponível' }[a.availability] || '—'], ['Experiência', a.yearsExperience ? `${a.yearsExperience} anos` : '—']);
    }
    if (u.role === 'client') facts.push(['Orçamento', u.clientProfile?.budget?.min || u.clientProfile?.budget?.max ? `${money(u.clientProfile.budget.min || 0)} – ${money(u.clientProfile.budget.max || 0)}` : '—']);
    const stats = u.role === 'architect'
      ? [['Avaliações', c.reviewsReceived], ['Nota média', c.ratingAverage ?? '—'], ['Projetos fechados', c.hiresAsArchitect.accepted || 0], ['Pedidos pendentes', c.hiresAsArchitect.pending || 0], ['Mensagens enviadas', c.messagesSent], ['Indicou', c.referred]]
      : u.role === 'store'
        ? [['Produtos', c.products], ['Mensagens', c.messagesSent], ['Indicou', c.referred]]
        : [['Projetos', c.projects], ['Matches', c.matches], ['Favoritos', c.favorites], ['Contratações', c.hiresAsClient], ['Mensagens enviadas', c.messagesSent], ['Indicou', c.referred]];

    body.innerHTML = `
      <div class="adm-u-head">
        ${U.avatar({ id: u.id, name: u.name, avatar: u.avatar }, { size: 72, role: 'client' })}
        <div><h2>${esc(u.name)}</h2><p>${pill(ROLE[u.role] || u.role, u.role)} ${statusPill(u)} ${u.role === 'architect' && u.plan === 'pro' ? pill('Pro', 'accent') : ''}</p>
          ${u.role === 'architect' ? `<a href="arquiteto.html?id=${u.id}" target="_blank" rel="noopener" class="dv-link">Ver perfil público ${U.icon('external', 13)}</a>` : ''}</div>
      </div>
      ${u.status === 'suspended' && u.suspendedReason ? `<p class="adm-reason">Motivo da suspensão: ${esc(u.suspendedReason)}</p>` : ''}
      <div class="adm-u-stats">${stats.map(([l, v]) => `<div><strong>${esc(v)}</strong><span>${l}</span></div>`).join('')}</div>
      <dl class="adm-facts">${facts.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
      ${u.bio ? `<p class="adm-bio">${esc(u.bio)}</p>` : ''}
      ${u.recentProjects?.length ? `<h4 class="adm-sub">Projetos recentes</h4><ul class="adm-mini-list">${u.recentProjects.map((p) => `<li><strong>${esc(p.name)}</strong><span>${esc(PROJECT[p.status] || 'Rascunho')} · ${esc(p.propertyType || '')}${p.areaM2 ? ` · ${p.areaM2} m²` : ''}</span></li>`).join('')}</ul>` : ''}

      <h4 class="adm-sub">Ações da equipe</h4>
      <div class="adm-actions">
        ${u.status === 'suspended'
          ? '<button type="button" class="btn btn-sage btn-sm" data-act="reactivate">Reativar conta</button>'
          : '<button type="button" class="btn btn-secondary btn-sm" data-act="suspend">Suspender conta</button>'}
        ${u.role === 'architect' ? (u.plan === 'pro'
          ? '<button type="button" class="btn btn-secondary btn-sm" data-act="plan-free">Voltar para Gratuito</button>'
          : '<button type="button" class="btn btn-secondary btn-sm" data-act="plan-pro">Ativar Pro</button>') : ''}
        ${u.role === 'architect' && u.cau === 'pending' ? '<button type="button" class="btn btn-sage btn-sm" data-act="cau-ok">Aprovar CAU</button><button type="button" class="btn btn-secondary btn-sm" data-act="cau-no">Recusar CAU</button>' : ''}
        ${u.avatar ? '<button type="button" class="btn btn-secondary btn-sm" data-act="remove-avatar">Remover foto</button>' : ''}
      </div>
      ${u.role === 'client' || u.role === 'architect' ? `
      <form class="adm-inline" data-form="bonus">
        <label>${u.role === 'client' ? 'Buscas de match bônus' : 'Vagas de portfólio bônus'}<input type="number" min="0" max="999" name="bonus" value="${u.role === 'client' ? u.clientProfile?.bonusMatches || 0 : u.architectProfile?.bonusPortfolioSlots || 0}"></label>
        <button class="btn btn-secondary btn-sm" type="submit">Salvar</button>
      </form>` : ''}
      <form class="adm-inline adm-notify" data-form="notify">
        <label>Enviar aviso no sininho da pessoa<input type="text" name="text" maxlength="300" placeholder="Ex.: Seu portfólio foi destacado na vitrine!"></label>
        <button class="btn btn-primary btn-sm" type="submit">Enviar</button>
      </form>
      <details class="adm-danger">
        <summary>${U.icon('alert', 15)} Zona de perigo</summary>
        <p>Excluir apaga a conta e todos os dados ligados a ela (projetos, mensagens, avaliações). Não tem como desfazer.</p>
        <form class="adm-inline" data-form="delete">
          <label>Digite <b>${esc(u.email)}</b> para confirmar<input type="text" name="confirm" autocomplete="off"></label>
          <button class="btn btn-danger btn-sm" type="submit">Excluir conta</button>
        </form>
      </details>`;

    const patch = async (payload, msg) => {
      try { await api(`/users/${u.id}`, { method: 'PATCH', body: payload }); toast(msg); openUser(u.id); if (current() === 'users') loadUsers(); if (current() === 'cau') route(); }
      catch (err) { fail(err); }
    };
    body.querySelector('.adm-actions').addEventListener('click', (e) => {
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (!act) return;
      if (act === 'suspend') {
        const reason = prompt(`Motivo da suspensão de ${u.name} (fica no registro da equipe):`);
        if (reason === null) return;
        patch({ status: 'suspended', reason }, 'Conta suspensa');
      }
      if (act === 'reactivate') patch({ status: 'active' }, 'Conta reativada');
      if (act === 'plan-pro' && confirm(`Ativar o plano Pro para ${u.name}?`)) patch({ plan: 'pro' }, 'Plano Pro ativado');
      if (act === 'plan-free' && confirm(`Voltar ${u.name} para o plano Gratuito?`)) patch({ plan: 'free' }, 'Plano alterado para Gratuito');
      if (act === 'cau-ok') patch({ cau: 'verified' }, 'CAU aprovado — a pessoa foi avisada');
      if (act === 'cau-no' && confirm('Recusar a verificação? A pessoa recebe um aviso para conferir o número.')) patch({ cau: 'rejected' }, 'Verificação recusada');
      if (act === 'remove-avatar' && confirm('Remover a foto de perfil desta conta?')) patch({ removeAvatar: true }, 'Foto removida');
    });
    body.querySelector('[data-form="bonus"]')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const v = Number(e.target.bonus.value) || 0;
      patch(u.role === 'client' ? { bonusMatches: v } : { bonusPortfolioSlots: v }, 'Bônus atualizado');
    });
    body.querySelector('[data-form="notify"]').addEventListener('submit', async (e) => {
      e.preventDefault();
      try { await api(`/users/${u.id}/notify`, { method: 'POST', body: { text: e.target.text.value } }); e.target.reset(); toast('Aviso enviado'); }
      catch (err) { fail(err); }
    });
    body.querySelector('[data-form="delete"]').addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!confirm(`Excluir definitivamente a conta de ${u.name}?`)) return;
      try { await api(`/users/${u.id}`, { method: 'DELETE', body: { confirm: e.target.confirm.value.trim() } }); toast('Conta excluída'); setDrawer(false); route(); }
      catch (err) { fail(err); }
    });
  }

  // ================= Verificações CAU =================
  async function renderCau() {
    const d = await api('/users?cau=pending&pageSize=100');
    badges.cauPending = d.total; buildNav();
    const rows = await Promise.all(d.users.map((u) => api(`/users/${u.id}`).catch(() => u)));
    view.innerHTML = card('Registros aguardando a equipe', rows.length ? `<ul class="adm-cau">${rows.map((u) => `
      <li>
        ${person(u, u.email)}
        <span class="adm-cau-num">${esc(u.architectProfile?.cauNumber || '—')}</span>
        <a class="dv-link" href="https://siccau.caubr.gov.br/app/view/sight/externo?form=PesquisarProfissional" target="_blank" rel="noopener">Consultar no CAU ${U.icon('external', 13)}</a>
        <span class="adm-cau-actions"><button type="button" class="btn btn-sage btn-sm" data-cau="${u.id}" data-ok="1">Aprovar</button><button type="button" class="btn btn-secondary btn-sm" data-cau="${u.id}">Recusar</button><button type="button" class="btn btn-tertiary btn-sm" data-open="${u.id}">Detalhes</button></span>
      </li>`).join('')}</ul>` : U.empty('Nenhuma verificação pendente. 🎉'), { eyebrow: `${rows.length} pendente(s)` });
    view.onclick = async (e) => {
      const b = e.target.closest('[data-cau]');
      const o = e.target.closest('[data-open]');
      if (o) openUser(o.dataset.open);
      if (!b) return;
      if (!b.dataset.ok && !confirm('Recusar a verificação?')) return;
      try { await api(`/users/${b.dataset.cau}`, { method: 'PATCH', body: { cau: b.dataset.ok ? 'verified' : 'rejected' } }); toast(b.dataset.ok ? 'CAU aprovado' : 'Verificação recusada'); route(); }
      catch (err) { fail(err); }
    };
  }

  // ================= Listagens simples =================
  function listView(title, eyebrow, path, head, row, empty, filterHtml = '', filterInit) {
    let page = 1;
    let extra = '';
    return async function render() {
      view.innerHTML = `${filterHtml}<div id="lv"></div>`;
      filterInit?.((qs) => { extra = qs; page = 1; load(); });
      async function load() {
        const d = await api(`${path}?page=${page}${extra ? `&${extra}` : ''}`);
        $('lv').innerHTML = `<section class="dv-card adm-card"><header class="dv-card-head"><div><span class="eyebrow">${esc(eyebrow)}</span><h3>${esc(title)}</h3></div></header>${table(head, d.items.map(row), empty)}${pager(d, 'list')}</section>`;
        $('lv').querySelector('[data-pager]')?.addEventListener('click', (e) => {
          const b = e.target.closest('[data-page]'); if (!b || b.disabled) return; page = Number(b.dataset.page); load();
        });
        $('lv').querySelectorAll('[data-open]').forEach((el) => el.addEventListener('click', () => openUser(el.dataset.open)));
        bindRowActions?.($('lv'), load);
      }
      let bindRowActions = render.bindRowActions;
      await load();
    };
  }

  const renderProjects = listView('Projetos criados pelos clientes', 'Mais recentes primeiro', '/projects',
    ['Projeto', 'Cliente', 'Status', 'Tipo', 'Área', 'Local', 'Arquiteto', 'Criado'],
    (p) => `<tr><td><strong>${esc(p.name)}</strong><div class="adm-tags">${(p.preferredStyles || []).slice(0, 3).map((s) => `<span>${esc(s)}</span>`).join('')}</div></td>
      <td>${p.client ? `<button type="button" class="adm-link-btn" data-open="${p.client._id}">${esc(p.client.name)}</button>` : '—'}</td>
      <td>${pill(PROJECT[p.status] || 'Rascunho', p.status === 'in_progress' ? 'ok' : p.status === 'matching' ? 'warn' : '')}</td>
      <td>${esc(p.propertyType || '—')}</td><td>${p.areaM2 ? `${p.areaM2} m²` : '—'}</td><td>${esc([p.city, p.state].filter(Boolean).join(' / ') || '—')}</td>
      <td>${esc(p.architect?.name || '—')}</td><td>${fmtDate(p.createdAt)}</td></tr>`,
    'Nenhum projeto ainda.');

  const renderMatches = listView('Buscas de compatibilidade', 'Mais recentes primeiro', '/matches',
    ['Quando', 'Cliente', 'Projeto', 'Resultados', 'Melhor', 'Top 3'],
    (m) => `<tr><td>${fmtDateTime(m.createdAt)}</td>
      <td>${m.client ? `<button type="button" class="adm-link-btn" data-open="${m.client._id}">${esc(m.client.name)}</button>` : '—'}</td>
      <td>${esc(m.project?.name || 'Perfil principal')}</td><td>${m.results}</td>
      <td><span class="adm-score">${m.best}%</span></td>
      <td>${m.top.map((t) => `<span class="adm-chip">${esc(t.name)} · ${t.score}%</span>`).join(' ') || '—'}</td></tr>`,
    'Nenhum match rodado ainda.');

  const renderHires = listView('Pedidos de contratação', 'Cliente → arquiteto', '/hires',
    ['Quando', 'Projeto', 'Cliente', 'Arquiteto', 'Status', 'Decidido em'],
    (h) => `<tr><td>${fmtDateTime(h.createdAt)}</td><td>${esc(h.project?.name || '—')}</td>
      <td>${h.client ? `<button type="button" class="adm-link-btn" data-open="${h.client._id}">${esc(h.client.name)}</button>` : '—'}</td>
      <td>${h.architect ? `<button type="button" class="adm-link-btn" data-open="${h.architect._id}">${esc(h.architect.name)}</button>` : '—'}</td>
      <td>${pill(HIRE[h.status] || h.status, h.status === 'accepted' ? 'ok' : h.status === 'pending' ? 'warn' : h.status === 'declined' ? 'danger' : '')}</td>
      <td>${h.decidedAt ? fmtDate(h.decidedAt) : '—'}</td></tr>`,
    'Nenhuma contratação ainda.',
    `<div class="adm-toolbar"><select id="hStatus" aria-label="Status"><option value="">Todos os status</option>${Object.entries(HIRE).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div>`,
    (set) => $('hStatus').addEventListener('change', (e) => set(e.target.value ? `status=${e.target.value}` : '')));

  const renderReviews = listView('Avaliações dos clientes', 'Moderação', '/reviews',
    ['Quando', 'Cliente', 'Arquiteto', 'Nota', 'Comentário', ''],
    (r) => `<tr><td>${fmtDate(r.createdAt)}</td>
      <td>${r.client ? `<button type="button" class="adm-link-btn" data-open="${r.client._id}">${esc(r.client.name)}</button>` : '—'}</td>
      <td>${r.architect ? `<button type="button" class="adm-link-btn" data-open="${r.architect._id}">${esc(r.architect.name)}</button>` : '—'}</td>
      <td><span class="adm-stars">${'★'.repeat(r.rating)}<i>${'★'.repeat(5 - r.rating)}</i></span></td>
      <td class="adm-comment">${esc(r.comment || '—')}</td>
      <td><button type="button" class="btn btn-tertiary btn-sm" data-del-review="${r._id}">Remover</button></td></tr>`,
    'Nenhuma avaliação ainda.',
    '<div class="adm-toolbar"><select id="rMax" aria-label="Filtrar nota"><option value="">Todas as notas</option><option value="2">Só notas 1 e 2 (atenção)</option><option value="3">Até 3 estrelas</option></select></div>',
    (set) => $('rMax').addEventListener('change', (e) => set(e.target.value ? `maxRating=${e.target.value}` : '')));
  renderReviews.bindRowActions = (root, reload) => root.querySelectorAll('[data-del-review]').forEach((b) => b.addEventListener('click', async () => {
    const reason = prompt('Motivo da remoção (fica na auditoria):');
    if (reason === null) return;
    try { await api(`/reviews/${b.dataset.delReview}`, { method: 'DELETE', body: { reason } }); toast('Avaliação removida'); reload(); } catch (err) { fail(err); }
  }));

  // ================= Financeiro =================
  async function renderFinance() {
    const d = await api('/finance');
    const sum = (xs) => xs.reduce((s, x) => s + (x.amount || 0), 0);
    view.innerHTML = `
      <div class="adm-banner">${U.icon('alert', 18)}<p><b>Pagamentos simulados.</b> Hoje o checkout do plano Pro, as comissões e as indicações são registrados sem cobrança real. Para cobrar de verdade é preciso integrar um gateway (Mercado Pago ou Stripe). Enquanto isso, a equipe pode ativar o Pro manualmente em "Usuários".</p></div>
      <div class="adm-kpis adm-kpis-3">
        ${kpi('bolt', 'Assinantes Pro', d.pros.length, `≈ ${money(d.pros.length * 49)}/mês se cobrado`, d.pros.length)}
        ${kpi('comissoes', 'Comissões (simuladas)', money(sum(d.commissions)), `${d.commissions.length} registro(s)`)}
        ${kpi('produtos', 'Indicações de lojas', money(sum(d.referrals)), `${d.referrals.length} registro(s)`)}
      </div>
      <div class="adm-grid">
        ${card('Arquitetos Pro', table(['Arquiteto', 'E-mail', 'Desde'], d.pros.map((p) => `<tr><td><button type="button" class="adm-link-btn" data-open="${p.id}">${esc(p.name)}</button></td><td>${esc(p.email)}</td><td>${fmtDate(p.since)}</td></tr>`), 'Nenhum assinante Pro.'), { cls: 'adm-span-12' })}
        ${card('Comissões de projetos fechados', table(['Quando', 'Arquiteto', 'Cliente', 'Projeto', 'Valor estimado', 'Comissão'], d.commissions.map((c) => `<tr><td>${fmtDate(c.createdAt)}</td><td>${esc(c.architect || '—')}</td><td>${esc(c.client || '—')}</td><td>${esc(c.project || '—')}</td><td>${money(c.estimatedValue)}</td><td><b>${money(c.amount)}</b> <span class="adm-muted">(${Math.round((c.rate || 0) * 100)}%)</span></td></tr>`), 'Nenhuma comissão ainda.'), { cls: 'adm-span-12' })}
        ${card('Indicações de produtos das lojas', table(['Quando', 'Loja', 'Cliente', 'Produto', 'Valor'], d.referrals.map((r) => `<tr><td>${fmtDate(r.createdAt)}</td><td>${esc(r.store || '—')}</td><td>${esc(r.client || '—')}</td><td>${esc(r.product || '—')}</td><td><b>${money(r.amount)}</b></td></tr>`), 'Nenhuma indicação ainda.'), { cls: 'adm-span-12' })}
      </div>`;
    view.querySelectorAll('[data-open]').forEach((el) => el.addEventListener('click', () => openUser(el.dataset.open)));
    play();
  }

  // ================= Marca e site =================
  async function renderBrand() {
    const s = await api('/settings');
    const a = s.announcement;
    const palette = [['Off-white', '#FAF9F6', 'Fundo'], ['Areia', '#EEE3DA', 'Fundo alternativo'], ['Sálvia', '#7B8E7E', 'Apoio'], ['Terracota', '#B0755A', 'Destaque'], ['Grafite', '#333333', 'Texto']];
    view.innerHTML = `<div class="adm-grid">
      ${card('Faixa de aviso do site', `
        <p class="card-lead">Aparece como um aviso discreto em todas as páginas públicas e no painel. Use para lançamentos, manutenção ou novidades.</p>
        <form id="annForm" class="adm-form">
          <label class="adm-switch"><input type="checkbox" name="active" ${a.active ? 'checked' : ''}><span></span> Aviso ligado</label>
          <div class="form-field"><label for="annText">Texto</label><input id="annText" name="text" maxlength="180" value="${esc(a.text)}" placeholder="Ex.: Agora você pode trocar sua foto de perfil na aba Conta!"></div>
          <div class="form-grid">
            <div class="form-field"><label for="annLink">Link (opcional)</label><input id="annLink" name="link" maxlength="200" value="${esc(a.link)}" placeholder="planos.html ou https://…"></div>
            <div class="form-field"><label for="annTone">Tom</label><select id="annTone" name="tone"><option value="info">Informativo (terracota)</option><option value="success">Novidade (sálvia)</option><option value="warning">Atenção (areia)</option></select></div>
          </div>
          <div class="adm-preview"><span class="eyebrow">Prévia</span><div class="mi-announce is-static" id="annPreview"></div></div>
          <div class="adm-form-foot"><span class="adm-muted">${s.updatedAt ? `Última alteração ${U.timeAgo(s.updatedAt)} por ${esc(s.updatedBy)}` : 'Nunca alterado'}</span><button class="btn btn-primary btn-sm" type="submit">Salvar aviso</button></div>
        </form>`, { eyebrow: 'Comunicação', cls: 'adm-span-7' })}
      ${card('Identidade visual', `
        <div class="adm-swatches">${palette.map(([n, hex, use]) => `<button type="button" class="adm-swatch" data-copy="${hex}" style="--c:${hex}"><span></span><strong>${n}</strong><em>${hex} · ${use}</em></button>`).join('')}</div>
        <div class="adm-type">
          <div><span class="adm-type-a" style="font-family:var(--font-display)">Aa</span><strong>Playfair Display</strong><em>Títulos e números</em></div>
          <div><span class="adm-type-a" style="font-family:var(--font-body)">Aa</span><strong>Inter</strong><em>Textos e interface</em></div>
          <div><span class="adm-type-a" style="font-family:var(--font-logo)">Aa</span><strong>Poppins</strong><em>Logotipo</em></div>
        </div>
        <div class="adm-logos">
          <a href="assets/img/mark.png" download class="adm-logo-tile"><img src="assets/img/mark.png" alt=""><span>Símbolo (claro)</span></a>
          <a href="assets/img/mark-light.png" download class="adm-logo-tile is-dark"><img src="assets/img/mark-light.png" alt=""><span>Símbolo (escuro)</span></a>
        </div>
        <p class="adm-note">Clique numa cor para copiar o código.</p>`, { eyebrow: 'Marca', cls: 'adm-span-5' })}
    </div>`;
    const form = $('annForm');
    form.tone.value = a.tone || 'info';
    const preview = () => {
      const p = $('annPreview');
      p.dataset.tone = form.tone.value;
      p.innerHTML = `<span class="mi-announce-dot"></span><span>${esc(form.text.value || 'Seu aviso aparece aqui.')}</span>${form.link.value ? '<b>Saiba mais →</b>' : ''}`;
      p.style.opacity = form.active.checked ? '1' : '.5';
    };
    form.addEventListener('input', preview); preview();
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await api('/settings', { method: 'PUT', body: { announcement: { active: form.active.checked, text: form.text.value, link: form.link.value, tone: form.tone.value } } });
        toast(form.active.checked ? 'Aviso publicado no site' : 'Aviso salvo (desligado)');
      } catch (err) { fail(err); }
    });
    view.querySelectorAll('[data-copy]').forEach((b) => b.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(b.dataset.copy); toast(`${b.dataset.copy} copiado`); } catch { toast(b.dataset.copy); }
    }));
  }

  // ================= Comunicados =================
  async function renderBroadcast() {
    view.innerHTML = card('Enviar comunicado', `
      <p class="card-lead">Vira uma notificação no sininho de cada pessoa do público escolhido (contas suspensas ficam de fora). Para um aviso fixo no site, use "Marca e site".</p>
      <form id="bcForm" class="adm-form">
        <div class="form-grid">
          <div class="form-field"><label for="bcRole">Para quem</label><select id="bcRole" name="role"><option value="">Todos os usuários</option><option value="client">Só clientes</option><option value="architect">Só arquitetos</option><option value="store">Só lojas</option></select></div>
          <div class="form-field"><label for="bcLink">Link (opcional)</label><input id="bcLink" name="link" maxlength="200" placeholder="dashboard.html#conta"></div>
        </div>
        <div class="form-field"><label for="bcText">Mensagem</label><textarea id="bcText" name="text" maxlength="300" rows="3" placeholder="Ex.: Novidade: agora dá para colocar sua foto de perfil!"></textarea></div>
        <div class="adm-form-foot"><span class="adm-muted" id="bcCount">0/300</span><button class="btn btn-primary btn-sm" type="submit">${U.icon('megaphone', 15)} Enviar comunicado</button></div>
      </form>`, { eyebrow: 'Notificações', cls: 'adm-narrow' });
    const f = $('bcForm');
    f.text.addEventListener('input', () => { $('bcCount').textContent = `${f.text.value.length}/300`; });
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const who = f.role.options[f.role.selectedIndex].text.toLowerCase();
      if (!confirm(`Enviar este comunicado para ${who}?`)) return;
      try { const r = await api('/broadcast', { method: 'POST', body: { role: f.role.value, text: f.text.value, link: f.link.value } }); toast(`Enviado para ${r.recipients} pessoa(s)`); f.reset(); }
      catch (err) { fail(err); }
    });
  }

  // ================= Auditoria =================
  const ACTION = (a) => a.replace('suspend', 'suspendeu').replace('reactivate', 'reativou').replace('plan:pro', 'ativou Pro').replace('plan:free', 'voltou para Gratuito')
    .replace('cau:verified', 'aprovou CAU').replace('cau:rejected', 'recusou CAU').replace('delete-user', 'excluiu conta').replace('delete-review', 'removeu avaliação')
    .replace('notify-user', 'enviou aviso').replace('broadcast', 'enviou comunicado').replace('update-announcement', 'alterou o aviso do site')
    .replace('export-users-csv', 'exportou usuários').replace('removeAvatar', 'removeu foto').replace(/bonus\w+:(\d+)/, 'bônus = $1');
  const renderLogs = listView('Registro de ações da equipe', 'Auditoria', '/logs',
    ['Quando', 'Quem', 'O que', 'Em quem / onde', 'Detalhes'],
    (l) => `<tr><td>${fmtDateTime(l.createdAt)}</td><td>${esc(l.adminEmail)}</td><td><strong>${esc(ACTION(l.action))}</strong></td>
      <td>${esc(l.targetLabel || '—')}</td><td class="adm-comment">${esc(l.details ? Object.entries(l.details).map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`).join(' · ') : '')}</td></tr>`,
    'Nenhuma ação registrada ainda.');

  // ================= Sistema =================
  async function renderSystem() {
    const s = await api('/system');
    const h = Math.floor(s.uptimeSeconds / 3600), m = Math.floor((s.uptimeSeconds % 3600) / 60);
    const check = (ok, label, help) => `<li class="${ok ? 'is-ok' : 'is-bad'}"><span>${ok ? U.icon('check', 13) : '!'}</span><div><strong>${label}</strong><em>${help}</em></div></li>`;
    view.innerHTML = `
      <div class="adm-kpis">
        ${kpi('server', 'Ambiente', s.environment === 'production' ? 'Produção' : 'Desenvolvimento', `Node ${esc(s.node)}`)}
        ${kpi('clock', 'No ar há', `${h}h ${m}min`, 'desde o último reinício')}
        ${kpi('metricas', 'Memória', `${s.memoryMb} MB`, 'uso do processo')}
        ${kpi('shield', 'Equipe', s.admins, 'e-mails com acesso a este painel', s.admins)}
      </div>
      ${card('Checklist de produção', `<ul class="adm-checks">
        ${check(s.database === 'conectado', `Banco de dados ${esc(s.database)}`, `MongoDB${s.databaseName ? ` · ${esc(s.databaseName)}` : ''}`)}
        ${check(s.services.jwtFixed, 'Chave de login fixa (JWT_SECRET)', 'Sem ela, todo mundo é deslogado a cada reinício')}
        ${check(s.services.email, `E-mail: ${esc(s.email)}`, 'Boas-vindas, recuperação de senha, contratação e mensagens (Brevo)')}
        ${check(s.services.gemini, 'Inteligência artificial (Gemini)', 'Explicações do match, assistente, moodboard e brief')}
        ${check(s.services.unsplash, 'Fotos de referência (Unsplash)', 'Opcional — referência visual dos arquitetos')}
        ${check(Boolean(s.services.appUrl), 'Endereço público', s.services.appUrl ? esc(s.services.appUrl) : 'Usado nos links dos e-mails (APP_URL)')}
      </ul>`, { eyebrow: 'Saúde do serviço', cls: 'adm-narrow' })}`;
    play();
  }

  // ---------- início ----------
  async function boot() {
    if (!MatchAPI.token()) { showGate(); return; }
    try {
      const me = await api('/me');
      $('admGate').hidden = true;
      $('admApp').hidden = false;
      $('admMe').innerHTML = `${U.avatar({ name: me.name, avatar: me.avatar }, { size: 34, role: 'client' })}<span><strong>${esc(me.name)}</strong><em>${esc(me.email)}</em></span>`;
      buildNav();
      route();
    } catch (err) {
      if (/restrito/i.test(err.message)) showGate('Esta conta não faz parte da equipe. Entre com um e-mail autorizado.');
      else if (!/Sessão/.test(err.message)) showGate(err.message);
    }
  }
  boot();
})();
