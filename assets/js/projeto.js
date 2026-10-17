/**
 * projeto.html — Espaço do projeto: onde cliente e arquiteto trabalham
 * depois da contratação. Etapas com prazo e aprovação do cliente, arquivos
 * técnicos com versões, a biblioteca de produtos que o arquiteto monta para
 * o projeto (a IA só sugere a partir dela) e a lista de compras da obra.
 * Toda ação devolve o espaço inteiro (MatchAPI.workspace*) e a tela é
 * redesenhada a partir dele.
 */
(() => {
  const API = MatchAPI;
  const id = new URLSearchParams(location.search).get('id') || '';
  const $ = (sel, root = document) => root.querySelector(sel);
  const state = $('#pjState');
  const app = $('#pjApp');

  let W = null; // o espaço do projeto, como veio da API
  let tab = 'etapas';
  let catalog = null; // resultados da busca no catálogo (arquiteto)
  let otherProjects = null; // outros projetos do arquiteto (trazer biblioteca)
  let conceptText = '';
  let templates = null; // modelos de etapas (arquiteto): { builtIn, mine }
  const openQuotes = new Set(); // itens da lista de compras com as cotações abertas
  const quoteHints = new Map(); // sugestões do catálogo por item
  let providers = null; // prestadores parceiros encontrados (arquiteto)
  const thumbs = new Map(); // fotos do diário já baixadas (id → URL local)
  let editingReview = false;
  let offlineSince = null; // aberto sem internet a partir da cópia salva neste aparelho
  let pendingDiary = []; // registros do diário feitos sem internet, esperando para subir
  const TRADES = ['Marcenaria', 'Elétrica', 'Hidráulica', 'Pintura', 'Gesso e drywall', 'Marmoraria', 'Vidraçaria', 'Serralheria', 'Paisagismo', 'Ar-condicionado', 'Iluminação técnica', 'Pedreiro e acabamento'];

  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : '—');
  const fmtDateTime = (iso) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  const inputDate = (iso) => (iso ? new Date(iso).toISOString().slice(0, 10) : '');
  const money = (n) => Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const fileSize = (b) => (b >= 1048576 ? `${(b / 1048576).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
  const daysFrom = (iso) => Math.ceil((new Date(iso).getTime() - Date.now()) / 864e5);
  const isArchitect = () => W?.role === 'architect';
  const PREVIEW = new Set(['pdf', 'png', 'jpg', 'jpeg', 'webp']);
  const MEETING_STATUS = { pending: 'Aguardando confirmação', confirmed: 'Confirmado', declined: 'Recusado — remarcar', cancelled: 'Cancelado' };
  const MEETING_KINDS = { reuniao: 'Reunião', visita: 'Visita de obra', apresentacao: 'Apresentação do projeto', medicao: 'Visita técnica / medição' };
  const LEGAL_STATUS = { pendente: 'Pendente', andamento: 'Em andamento', concluido: 'Concluído', nao_aplica: 'Não se aplica' };
  const fmtWhen = (iso) => new Date(iso).toLocaleString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  const stars = (n) => `${'★'.repeat(n)}${'☆'.repeat(5 - n)}`;
  const slug = (s) => String(s || '').normalize('NFD').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-').toLowerCase() || 'projeto';

  const STATUS = {
    pending: 'A começar',
    in_progress: 'Em andamento',
    awaiting_approval: 'Aguardando aprovação',
    approved: 'Aprovada',
  };

  function flash(text, isError) {
    const el = $('#pjFlash');
    el.textContent = text || '';
    el.classList.toggle('is-error', !!isError);
    clearTimeout(flash.t);
    if (text) flash.t = setTimeout(() => { el.textContent = ''; }, isError ? 9000 : 4000);
  }

  async function run(btn, fn, ok) {
    if (btn) btn.disabled = true;
    try {
      const res = await fn();
      if (res && res.id && res.stages) W = res;
      else if (res?.workspace) W = res.workspace;
      render();
      if (ok) flash(typeof ok === 'function' ? ok(res) : ok);
      return res;
    } catch (err) {
      if (err?.status === 401) { location.replace('login.html'); return null; }
      flash(err?.offline ? 'Sem internet agora. Só o diário de obra funciona offline — o resto, quando a conexão voltar.' : err?.message || 'Não deu certo agora. Tente de novo.', true);
      if (btn) btn.disabled = false;
      return null;
    }
  }

  // ------------------------------------------------------------------ topo
  function renderHero() {
    $('#pjTitle').textContent = W.name;
    document.title = `${W.name} · Espaço do projeto — match.IA`;
    const other = isArchitect() ? W.client : W.architect;
    $('#pjPeople').innerHTML = `${isArchitect() ? 'Cliente' : 'Arquiteto(a)'}: <strong>${esc(other?.name || '—')}</strong> · <a href="dashboard.html#mensagens">Conversar</a>${W.contractId ? ` · <a href="contrato.html?id=${esc(W.contractId)}">Contrato assinado</a>` : ''}${W.briefingId ? ` · <a href="briefing.html?id=${esc(W.briefingId)}">Briefing</a>` : ''}`;
    const off = $('#pjOffline');
    off.hidden = !offlineSince;
    off.innerHTML = offlineSince ? `<strong>Sem internet.</strong> Você está vendo a cópia salva neste aparelho em ${fmtDateTime(offlineSince)}. Registros do diário de obra ficam guardados e sobem sozinhos quando a conexão voltar.` : '';
    const s = W.summary;
    const current = W.stages.find((x) => x.key === s.current);
    const left = W.targetDate ? daysFrom(W.targetDate) : null;
    const banner = $('#pjPlanBanner');
    banner.hidden = !(isArchitect() && W.plan?.locked);
    banner.innerHTML = banner.hidden ? '' : `<strong>Este projeto está só para leitura no plano Gratuito.</strong> No Gratuito você usa o Espaço do projeto com 1 projeto ativo por vez (o mais antigo). Conclua o atual ou <a href="planos.html">assine o Pro</a> para editar todos. O cliente continua vendo e aprovando normalmente.`;
    $('#pjKpis').innerHTML = `
      <div class="pj-kpi">
        <span>Progresso</span><strong>${s.progress}%</strong>
        <i class="pj-bar"><b style="width:${s.progress}%"></b></i>
        <small>${s.approved} de ${s.total} etapas aprovadas</small>
      </div>
      <div class="pj-kpi"><span>Etapa atual</span><strong>${esc(current?.name || 'Projeto concluído')}</strong><small>${current ? STATUS[current.status] : 'todas as etapas aprovadas'}</small></div>
      <div class="pj-kpi ${left !== null && left < 0 && current ? 'is-late' : ''}"><span>Meta de entrega</span><strong>${fmtDate(W.targetDate)}</strong>
        <small>${left === null ? '' : left >= 0 ? `faltam ${left} dias` : `passou há ${-left} dias`}</small></div>
      <div class="pj-kpi"><span>Rodadas de ajuste</span><strong>${s.revisionRounds}</strong><small>pedidos de ajuste nas etapas</small></div>`;
  }

  // ------------------------------------------------------------------ etapas
  function feeChip(st) {
    if (!st.fee) return '';
    const v = money(st.fee);
    if (st.feeStatus === 'paid') return `<span class="pj-chip is-approved">Honorários ${v} · pagos em ${fmtDate(st.feePaidAt)}</span>`;
    if (st.feeStatus === 'due') return `<span class="pj-chip is-awaiting_approval">Honorários ${v} · a pagar</span>`;
    if (st.feeStatus === 'reported') return `<span class="pj-chip is-awaiting_approval">Honorários ${v} · pagamento avisado, aguardando confirmação</span>`;
    return `<span>Honorários: ${v} (cobrados ao aprovar)</span>`;
  }

  function feeAction(st) {
    if (st.feeStatus === 'paid') return `<div class="pj-row-actions"><button type="button" class="btn btn-tertiary btn-sm" data-act="receipt" data-key="${st.key}">Recibo dos honorários</button></div>`;
    if (!['due', 'reported'].includes(st.feeStatus)) return '';
    if (isArchitect()) {
      const text = st.feeStatus === 'reported'
        ? `<strong>${esc(W.client?.name || 'O cliente')} avisou em ${fmtDate(st.feeReportedAt)} que pagou ${money(st.fee)}.</strong> Confira no seu banco e confirme: o recibo sai na hora para o cliente.`
        : `Cobrança de ${money(st.fee)} aberta desde ${fmtDate(st.feeDueAt)} — aguardando o pagamento do cliente.`;
      const hint = !W.pixConfigured && W.isOwner ? '<br><span class="pj-muted">Cadastre sua chave Pix em <a href="dashboard.html#recebimentos">Painel → Conta → Recebimentos</a> para o cliente pagar pelo QR Code.</span>' : '';
      return `
        <div class="pj-fee-due">
          <p>${text}${hint}</p>
          ${W.isOwner ? `<button type="button" class="btn btn-sage btn-sm" data-act="confirm-fee" data-key="${st.key}">Confirmar recebimento</button>` : ''}
        </div>`;
    }
    if (st.feeStatus === 'reported') return `<div class="pj-fee-due"><p><strong>Você avisou o pagamento de ${money(st.fee)}.</strong><br><span class="pj-muted">Quando ${esc(W.architect?.name || 'o arquiteto')} confirmar o recebimento, o recibo aparece aqui.</span></p></div>`;
    const pix = st.pix;
    return `
      <div class="pj-fee-due ${pix ? 'has-pix' : ''}">
        ${pix ? `<img class="pj-pix-qr" src="${pix.qr}" width="168" height="168" alt="QR Code Pix de ${money(st.fee)} para ${esc(pix.receiver)}">` : ''}
        <div class="pj-pix-body">
          <p><strong>Honorários desta etapa: ${money(st.fee)}</strong><br>
          ${pix ? `<span class="pj-muted">Pix para <strong>${esc(pix.receiver)}</strong> (${esc(pix.keyType)}). Aponte a câmera do app do banco para o QR Code ou copie o código. O valor vai direto para a conta do arquiteto — a match.IA não intermedia o pagamento.</span>`
            : `<span class="pj-muted">${esc(W.architect?.name || 'O arquiteto')} ainda não cadastrou a chave Pix. Combine a forma de pagamento pelo chat e avise aqui quando pagar.</span>`}</p>
          ${pix ? `<div class="pj-pix-copy"><label class="sr-only" for="pix-${st.key}">Pix copia e cola</label><input id="pix-${st.key}" readonly value="${esc(pix.payload)}"><button type="button" class="btn btn-secondary btn-sm" data-act="copy-pix" data-key="${st.key}">Copiar código</button></div>` : ''}
          <div class="pj-row-actions"><button type="button" class="btn btn-primary btn-sm" data-act="pay" data-key="${st.key}">Já paguei</button></div>
        </div>
      </div>`;
  }

  // ------------------------------------------------------------------ impressão (recibo, cronograma, manual)
  function printDoc(html) {
    const box = $('#pjPrint');
    box.innerHTML = html;
    document.body.classList.add('pj-print-doc');
    const done = () => { document.body.classList.remove('pj-print-doc'); box.innerHTML = ''; };
    window.addEventListener('afterprint', done, { once: true });
    window.print();
  }

  async function printReceipt(key) {
    const r = await API.workspaceReceipt(W.id, key);
    printDoc(`
      <article class="pj-doc">
        <header><p class="pj-doc-kicker">Recibo de honorários nº ${esc(r.number)}</p><h1>${esc(r.valueText)}</h1></header>
        <p class="pj-doc-text">${esc(r.text)}</p>
        <p>${esc(r.place ? `${r.place}, ` : '')}${esc(r.dateText)}.</p>
        <div class="pj-doc-sign"><span>${esc(r.payee)}</span><small>${[r.payeeDocument, r.payeeCau ? `CAU ${r.payeeCau}` : ''].filter(Boolean).map(esc).join(' · ') || 'Arquiteto(a)'}</small></div>
        <footer>Código do recibo: ${esc(r.code)} · Pagamento confirmado pelo arquiteto no Espaço do projeto da match.IA em ${esc(r.dateText)}. Recibo sem valor fiscal: não substitui a nota fiscal de serviço (NFS-e).</footer>
      </article>`);
  }

  // Cronograma (Gantt): cada etapa vai do fim da anterior até o prazo dela.
  function ganttHtml() {
    const start = new Date(W.startedAt).getTime();
    let prev = start;
    const rows = W.stages.map((st) => {
      const to = st.dueDate ? new Date(st.dueDate).getTime() : null;
      const row = { st, from: prev, to };
      if (to) prev = to;
      return row;
    });
    const ends = rows.filter((r) => r.to).map((r) => r.to);
    if (!ends.length) return '';
    const target = W.targetDate ? new Date(W.targetDate).getTime() : null;
    const now = Date.now();
    const max = Math.max(...ends, target || 0, Math.min(now, Math.max(...ends) + 30 * 864e5));
    const span = Math.max(max - start, 14 * 864e5);
    const pct = (t) => Math.max(0, Math.min(100, ((t - start) / span) * 100));
    const ticks = [];
    const d = new Date(start);
    d.setDate(1);
    d.setMonth(d.getMonth() + 1);
    while (d.getTime() < start + span) { ticks.push(d.getTime()); d.setMonth(d.getMonth() + 1); }
    const marks = (W.meetings || []).filter((m) => m.status !== 'cancelled' && new Date(m.startsAt).getTime() <= start + span && new Date(m.startsAt).getTime() >= start);
    const overlay = `${now <= start + span ? `<b class="pj-gantt-today" style="left:${pct(now)}%"></b>` : ''}${target ? `<b class="pj-gantt-target" style="left:${pct(target)}%"></b>` : ''}`;
    return `
      <div class="pj-gantt" role="img" aria-label="Cronograma: ${W.stages.length} etapas, de ${fmtDate(new Date(start).toISOString())} a ${fmtDate(new Date(Math.max(...ends)).toISOString())}${target ? `, meta em ${fmtDate(W.targetDate)}` : ''}">
        <div class="pj-gantt-row pj-gantt-scale"><span></span><div class="pj-gantt-track">${ticks.map((t) => `<small style="left:${pct(t)}%">${new Date(t).toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '').replace(/^./, (c) => c.toUpperCase())}</small>`).join('')}</div></div>
        ${rows.map((r) => {
          const late = r.to && r.to < now && r.st.status !== 'approved';
          return `
          <div class="pj-gantt-row">
            <span class="pj-gantt-label">${esc(r.st.name)}</span>
            <div class="pj-gantt-track">${r.to ? `<i class="pj-gantt-bar is-${r.st.status}${late ? ' is-late' : ''}" style="left:${pct(r.from)}%;width:${Math.max(1.5, pct(r.to) - pct(r.from))}%" title="${fmtDate(new Date(r.from).toISOString())} a ${fmtDate(r.st.dueDate)}"></i>` : '<em>sem prazo fixo</em>'}${overlay}</div>
          </div>`;
        }).join('')}
        ${marks.length ? `<div class="pj-gantt-row"><span class="pj-gantt-label">Agenda</span><div class="pj-gantt-track">${marks.map((m) => `<i class="pj-gantt-dot" style="left:${pct(new Date(m.startsAt).getTime())}%" title="${esc(m.title)} — ${fmtWhen(m.startsAt)}"></i>`).join('')}${overlay}</div></div>` : ''}
      </div>
      <p class="pj-gantt-legend"><span class="is-in_progress">em andamento</span><span class="is-approved">aprovada</span><span class="is-late">atrasada</span><span class="is-today">hoje</span>${target ? '<span class="is-target">meta</span>' : ''}${marks.length ? '<span class="is-dot">reunião/visita</span>' : ''}</p>`;
  }

  function ganttCard() {
    const g = ganttHtml();
    if (!g) return '';
    return `
      <div class="pj-card pj-gantt-card">
        <div class="pj-card-head"><h2>Cronograma</h2><button type="button" class="btn btn-tertiary btn-sm" data-act="print-gantt">Imprimir</button></div>
        ${g}
      </div>`;
  }

  function reviewCard() {
    if (W.role !== 'client') return '';
    const r = W.review;
    if (!r && W.status !== 'completed') return '';
    const name = esc(W.architect?.name || 'o arquiteto');
    if (r && !editingReview) return `
      <div class="pj-card pj-review">
        <h2>Sua avaliação de ${name}</h2>
        <p class="pj-stars" aria-label="${r.rating} de 5 estrelas">${stars(r.rating)}</p>
        ${r.comment ? `<p>“${esc(r.comment)}”</p>` : ''}
        <p class="pj-muted">${r.verified ? 'Aparece no perfil público com o selo "Contratou pela match.IA". ' : ''}<button type="button" class="pj-link" data-act="review-edit">Editar</button></p>
      </div>`;
    return `
      <form class="pj-card pj-review" data-form="review">
        <h2>Projeto concluído! Como foi trabalhar com ${name}?</h2>
        <p class="pj-muted">Sua avaliação aparece no perfil com o selo "Contratou pela match.IA" — ajuda outros clientes a escolher.</p>
        <fieldset class="pj-star-pick"><legend class="sr-only">Nota</legend>
          ${[5, 4, 3, 2, 1].map((n) => `<input type="radio" name="rating" id="rv${n}" value="${n}" ${(r?.rating || 5) === n ? 'checked' : ''}><label for="rv${n}" title="${n} de 5">★<span class="sr-only">${n} de 5</span></label>`).join('')}
        </fieldset>
        <label class="sr-only" for="pjReviewText">Comentário</label>
        <textarea id="pjReviewText" rows="3" maxlength="1000" placeholder="O que você destacaria? Prazo, escuta, soluções, acompanhamento da obra…">${esc(r?.comment || '')}</textarea>
        <div class="pj-row-actions"><button type="submit" class="btn btn-primary btn-sm">Enviar avaliação</button>${r ? '<button type="button" class="btn btn-tertiary btn-sm" data-act="review-cancel">Cancelar</button>' : ''}</div>
      </form>`;
  }

  function stageActions(st) {
    if (isArchitect()) {
      if (st.status === 'in_progress') return `
        <label class="sr-only" for="note-${st.key}">Recado para o cliente</label>
        <textarea id="note-${st.key}" data-note rows="2" maxlength="1000" placeholder="O que você está entregando nesta etapa? (opcional)"></textarea>
        <div class="pj-row-actions"><button type="button" class="btn btn-primary btn-sm" data-act="stage" data-action="submit" data-key="${st.key}">Enviar para aprovação do cliente</button></div>`;
      if (st.status === 'awaiting_approval') return `<p class="pj-muted">Enviada em ${fmtDate(st.submittedAt)}. Aguardando o cliente aprovar ou pedir ajustes.</p>`;
      return '';
    }
    if (st.status === 'awaiting_approval') return `
      <p class="pj-callout">O arquiteto enviou esta etapa para você aprovar. Confira os arquivos dela antes.</p>
      <label class="sr-only" for="note-${st.key}">Comentário</label>
      <textarea id="note-${st.key}" data-note rows="2" maxlength="1000" placeholder="Comentário (obrigatório para pedir ajustes — quanto mais claro, menos retrabalho)"></textarea>
      <div class="pj-row-actions">
        <button type="button" class="btn btn-sage btn-sm" data-act="stage" data-action="approve" data-key="${st.key}">Aprovar etapa</button>
        <button type="button" class="btn btn-secondary btn-sm" data-act="stage" data-action="request-changes" data-key="${st.key}">Pedir ajustes</button>
      </div>`;
    if (st.status === 'in_progress') return '<p class="pj-muted">O arquiteto está trabalhando nesta etapa.</p>';
    return '';
  }

  // Modelos de etapas: trocar enquanto o projeto não andou; salvar as etapas atuais como modelo próprio.
  function weeksOfStages() {
    let prev = new Date(W.startedAt).getTime();
    return W.stages.map((st) => {
      if (!st.dueDate) return { name: st.name, weeks: 0, closesDesign: st.closesDesign };
      const due = new Date(st.dueDate).getTime();
      const weeks = Math.max(0, Math.round((due - prev) / (7 * 864e5)));
      prev = due;
      return { name: st.name, weeks, closesDesign: st.closesDesign };
    });
  }

  function templatesCard() {
    if (!templates) return '';
    const opts = [
      ...templates.builtIn.map((t) => `<option value="${esc(t.id)}">${esc(t.name)}</option>`),
      ...templates.mine.map((t) => `<option value="${esc(t.id)}">Meu modelo: ${esc(t.name)}</option>`),
    ].join('');
    return `
      <div class="pj-card pj-templates">
        <h2>Modelo de etapas</h2>
        ${W.canChangeTemplate ? `
        <form class="pj-inline" data-form="apply-template">
          <label for="pjTpl">Trocar por</label>
          <select id="pjTpl">${opts}</select>
          <button type="submit" class="btn btn-secondary btn-sm">Aplicar</button>
        </form>
        <p class="pj-muted">Dá para trocar enquanto nenhuma etapa foi enviada, aprovada ou cobrada. Os prazos recomeçam a contar do início do projeto.</p>` : '<p class="pj-muted">O projeto já andou — ajuste as etapas uma a uma em "Ajustar etapa".</p>'}
        <form class="pj-inline" data-form="save-template">
          <label for="pjTplName">Salvar estas etapas como meu modelo</label>
          <input id="pjTplName" maxlength="60" placeholder="Ex.: Reforma de apartamento" required>
          <button type="submit" class="btn btn-secondary btn-sm">Salvar modelo</button>
        </form>
        ${templates.mine.length ? `<p class="pj-muted">Seus modelos: ${templates.mine.map((t) => `${esc(t.name)} <button type="button" class="pj-link pj-danger" data-act="del-template" data-id="${esc(t.id)}" aria-label="Apagar o modelo ${esc(t.name)}">apagar</button>`).join(' · ')}</p>` : ''}
      </div>`;
  }

  function teamCard() {
    const list = W.team.length ? `<ul class="pj-team">${W.team.map((m) => `<li><span>${esc(m.name)}</span>${W.isOwner ? `<button type="button" class="pj-link pj-danger" data-act="team-remove" data-id="${esc(m.id)}">tirar</button>` : ''}</li>`).join('')}</ul>` : '<p class="pj-muted">Ninguém além de você ainda.</p>';
    return `
      <div class="pj-card pj-team-card">
        <h2>Equipe do escritório</h2>
        <p class="pj-muted">${W.isOwner ? 'Convide sócios, estagiários ou o projetista terceirizado: eles enviam arquivos, comentam as plantas e acompanham a obra. Honorários, meta e modelo de etapas continuam só com você.' : `Você participa da equipe de ${esc(W.architect?.name || 'o arquiteto')} neste projeto.`}</p>
        ${list}
        ${W.isOwner ? `
        <form class="pj-inline" data-form="team">
          <label for="pjTeamEmail">E-mail do colega (conta de arquiteto)</label>
          <input id="pjTeamEmail" type="email" maxlength="120" placeholder="colega@escritorio.com" required>
          <button type="submit" class="btn btn-secondary btn-sm">Convidar</button>
        </form>` : `<button type="button" class="pj-link pj-danger" data-act="team-leave">Sair da equipe deste projeto</button>`}
      </div>`;
  }

  function rrtCallout() {
    const rrt = W.legalDocs?.find((d) => d.key === 'rrt');
    if (!isArchitect() || !rrt || ['concluido', 'nao_aplica'].includes(rrt.status)) return '';
    return `<p class="pj-callout pj-rrt">Emita o <strong>RRT do projeto</strong> no SICCAU antes de começar e registre o número em <button type="button" class="pj-link" data-act="goto-tab" data-tab="documentos">Documentos</button> — ele aparece no contrato e nos recibos.</p>`;
  }

  function renderStages() {
    const filesBy = (key) => W.files.filter((f) => f.stage === key).length;
    $('#pjPanelEtapas').innerHTML = `
      <div class="pj-card pj-target">
        <div>
          <h2>Meta: projeto fechado em ${fmtDate(W.targetDate)}</h2>
          <p class="pj-muted">O padrão soma 12 semanas até o projeto executivo (3 meses). Cada etapa só avança com a aprovação do cliente, e cada pedido de ajuste fica registrado no histórico.</p>
          ${W.fees?.total ? `<p class="pj-fees-line">Honorários: <strong>${money(W.fees.total)}</strong> no total · ${money(W.fees.paid)} pagos · ${money(W.fees.due)} a pagar · ${money(W.fees.upcoming)} nas próximas etapas</p>`
            : isArchitect() ? '<p class="pj-muted">Defina os honorários de cada etapa em "Ajustar etapa": a cobrança abre quando o cliente aprova a etapa.</p>' : ''}
        </div>
        ${isArchitect() ? `
        <form class="pj-inline" data-form="target">
          <label for="pjTarget">Mudar a meta</label>
          <input type="date" id="pjTarget" value="${inputDate(W.targetDate)}" required>
          <button type="submit" class="btn btn-secondary btn-sm">Salvar</button>
        </form>` : ''}
      </div>
      ${rrtCallout()}
      ${reviewCard()}
      ${ganttCard()}
      ${isArchitect() && W.isOwner ? templatesCard() : ''}
      ${isArchitect() ? teamCard() : ''}
      <ol class="pj-stages">
        ${W.stages.map((st, i) => {
          const days = st.dueDate ? daysFrom(st.dueDate) : null;
          const late = days !== null && days < 0 && st.status !== 'approved';
          const n = filesBy(st.key);
          return `
          <li class="pj-card pj-stage is-${st.status}">
            <div class="pj-stage-head">
              <span class="pj-step" aria-hidden="true">${st.status === 'approved' ? '✓' : i + 1}</span>
              <div>
                <h3>${esc(st.name)}</h3>
                <p class="pj-stage-meta">
                  <span class="pj-chip is-${st.status}">${STATUS[st.status]}</span>
                  <span>Prazo: ${st.dueDate ? fmtDate(st.dueDate) : 'sem prazo fixo'}</span>
                  ${late ? `<span class="pj-chip is-late">Atrasada ${-days} ${-days === 1 ? 'dia' : 'dias'}</span>` : ''}
                  ${st.revisionRounds ? `<span>${st.revisionRounds} ${st.revisionRounds === 1 ? 'rodada' : 'rodadas'} de ajuste</span>` : ''}
                  ${st.approvedAt ? `<span>Aprovada em ${fmtDate(st.approvedAt)}</span>` : ''}
                  ${feeChip(st)}
                  ${n ? `<button type="button" class="pj-link" data-act="goto-files" data-key="${st.key}">${n} ${n === 1 ? 'arquivo' : 'arquivos'}</button>` : ''}
                </p>
              </div>
            </div>
            ${stageActions(st)}
            ${feeAction(st)}
            ${isArchitect() ? `
            <details class="pj-edit">
              <summary>Ajustar etapa (nome, prazo e honorários)</summary>
              <form class="pj-inline" data-form="stage" data-key="${st.key}">
                <label class="sr-only" for="sn-${st.key}">Nome da etapa</label>
                <input id="sn-${st.key}" name="name" maxlength="60" value="${esc(st.name)}">
                <label class="sr-only" for="sd-${st.key}">Prazo</label>
                <input type="date" id="sd-${st.key}" name="dueDate" value="${inputDate(st.dueDate)}">
                <label class="sr-only" for="sf-${st.key}">Honorários (R$)</label>
                <input type="number" id="sf-${st.key}" name="fee" min="0" step="0.01" placeholder="Honorários (R$)" value="${st.fee || ''}" ${st.status === 'approved' ? 'disabled title="Etapa aprovada: a cobrança já foi aberta"' : ''}>
                <button type="submit" class="btn btn-secondary btn-sm">Salvar</button>
              </form>
            </details>` : ''}
          </li>`;
        }).join('')}
      </ol>`;
  }

  // ------------------------------------------------------------------ arquivos
  // versão anterior do mesmo arquivo (mesmo nome, mesma etapa)
  const prevOf = (f) => W.files.filter((x) => x.stage === f.stage && x.name === f.name && x.version < f.version).sort((a, b) => b.version - a.version)[0];

  function renderFiles() {
    const stageName = (key) => W.stages.find((s) => s.key === key)?.name || 'Sem etapa';
    const latest = new Map();
    W.files.forEach((f) => { const k = `${f.stage}|${f.name}`; if (!latest.has(k) || latest.get(k).version < f.version) latest.set(k, f); });
    const groups = new Map();
    W.files.forEach((f) => { if (!groups.has(f.stage)) groups.set(f.stage, []); groups.get(f.stage).push(f); });
    const order = [...W.stages.map((s) => s.key), ''].filter((k) => groups.has(k));
    const pct = Math.min(100, Math.round((W.storage.used / W.storage.quota) * 100));
    const reviewChip = (f) => (f.review.status === 'approved' ? '<span class="pj-chip is-approved">Aprovado pelo cliente</span>'
      : f.review.status === 'changes' ? '<span class="pj-chip is-late">Ajustes pedidos</span>' : '');
    const row = (f) => {
      const isLatest = latest.get(`${f.stage}|${f.name}`) === f;
      const mine = f.uploader === W.me;
      const by = f.uploader === W.client?.id ? W.client?.name : W.architect?.name;
      const canReview = W.role === 'client' && !mine && isLatest;
      return `
        <li class="pj-file ${isLatest ? '' : 'is-old'}">
          <span class="pj-file-ext" aria-hidden="true">${esc(f.ext)}</span>
          <div class="pj-file-main">
            <strong>${esc(f.name)}</strong>
            <span class="pj-muted">v${f.version}${isLatest ? '' : ' (versão anterior)'} · ${fileSize(f.size)} · ${esc(by || '')} · ${fmtDate(f.createdAt)}</span>
            ${reviewChip(f)}
            ${f.notes?.total ? `<span class="pj-muted">${f.notes.open ? `${f.notes.open} ${f.notes.open === 1 ? 'comentário aberto' : 'comentários abertos'}` : 'comentários resolvidos'} no arquivo</span>` : ''}
            ${f.review.comment ? `<p class="pj-file-comment">“${esc(f.review.comment)}”</p>` : ''}
            ${canReview ? `
            <details class="pj-edit">
              <summary>Aprovar ou pedir ajustes</summary>
              <label class="sr-only" for="rv-${f.id}">Comentário</label>
              <textarea id="rv-${f.id}" data-note rows="2" maxlength="600" placeholder="Comentário (obrigatório para pedir ajustes)"></textarea>
              <div class="pj-row-actions">
                <button type="button" class="btn btn-sage btn-sm" data-act="review" data-decision="approved" data-id="${f.id}">Aprovar</button>
                <button type="button" class="btn btn-secondary btn-sm" data-act="review" data-decision="changes" data-id="${f.id}">Pedir ajustes</button>
              </div>
            </details>` : ''}
          </div>
          <div class="pj-file-actions">
            ${PREVIEW.has(f.ext) ? `<button type="button" class="btn btn-tertiary btn-sm" data-act="annotate" data-id="${f.id}">Ver e comentar${f.notes?.open ? ` <span class="pj-count">${f.notes.open}</span>` : ''}</button>` : ''}
            ${isLatest && prevOf(f) && PREVIEW.has(f.ext) && PREVIEW.has(prevOf(f).ext) ? `<button type="button" class="btn btn-tertiary btn-sm" data-act="compare" data-id="${f.id}">Comparar com v${prevOf(f).version}</button>` : ''}
            <button type="button" class="btn btn-secondary btn-sm" data-act="download" data-id="${f.id}">Baixar</button>
            ${mine ? `<button type="button" class="pj-link pj-danger" data-act="delete-file" data-id="${f.id}">Apagar</button>` : ''}
          </div>
        </li>`;
    };
    $('#pjPanelArquivos').innerHTML = `
      <form class="pj-card pj-upload" data-form="upload">
        <div>
          <h2>Enviar arquivo</h2>
          <p class="pj-muted">Plantas, cortes, PDFs, DWG/DXF, SketchUp, IFC, planilhas de materiais e orçamento (até 15 MB). Enviar de novo um arquivo com o mesmo nome na mesma etapa cria uma nova versão.</p>
        </div>
        <div class="pj-upload-row">
          <label class="sr-only" for="pjUpStage">Etapa</label>
          <select id="pjUpStage">${W.stages.map((s) => `<option value="${s.key}" ${s.key === W.summary.current ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}<option value="">Sem etapa</option></select>
          <label class="sr-only" for="pjUpFile">Arquivo</label>
          <input type="file" id="pjUpFile" required accept=".pdf,.png,.jpg,.jpeg,.webp,.dwg,.dxf,.skp,.ifc,.xlsx,.xls,.csv,.docx">
          <button type="submit" class="btn btn-primary btn-sm">Enviar</button>
        </div>
        <div class="pj-storage"><i class="pj-bar"><b style="width:${pct}%"></b></i><span class="pj-muted">${fileSize(W.storage.used)} de ${fileSize(W.storage.quota)} usados neste projeto</span></div>
      </form>
      ${order.length ? order.map((k) => `
        <section class="pj-card" id="files-${k || 'none'}">
          <h3>${esc(stageName(k))}</h3>
          <ul class="pj-files">${groups.get(k).map(row).join('')}</ul>
        </section>`).join('') : '<p class="pj-empty">Nenhum arquivo ainda. As plantas, os PDFs e as planilhas do projeto ficam aqui, organizados por etapa.</p>'}`;
  }

  // ------------------------------------------------------------------ biblioteca
  function signatureCard() {
    const sig = W.signature || {};
    const d = W.signatureDerived || {};
    const has = sig.statement || sig.signatureMaterials?.length || sig.principles?.length;
    if (!has && !isArchitect()) return '';
    if (!has) return `
      <div class="pj-card pj-signature is-empty">
        <h2>Sua assinatura</h2>
        <p class="pj-muted">Descreva o seu jeito de projetar (princípios, materiais de assinatura, o que você evita) em <a href="dashboard.html#portfolio">Painel → Portfólio</a>. O assistente de IA e o conceito deste projeto passam a seguir essa assinatura.</p>
      </div>`;
    const chips = (list, cls = '') => list.map((x) => `<span class="pj-tag ${cls}">${esc(x)}</span>`).join('');
    return `
      <div class="pj-card pj-signature">
        <span class="eyebrow">Assinatura de ${esc(W.architect?.name || 'arquiteto')}</span>
        ${sig.statement ? `<p class="pj-sig-statement">“${esc(sig.statement)}”</p>` : ''}
        ${sig.principles?.length ? `<ul class="pj-sig-list">${sig.principles.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>` : ''}
        <div class="pj-sig-tags">
          ${sig.signatureMaterials?.length ? `<div><small>Materiais de assinatura</small>${chips(sig.signatureMaterials)}</div>` : ''}
          ${sig.palette?.length ? `<div><small>Paleta</small>${chips(sig.palette)}</div>` : ''}
          ${sig.avoid?.length ? `<div><small>Evita</small>${chips(sig.avoid, 'is-avoid')}</div>` : ''}
          ${!sig.signatureMaterials?.length && d.materials?.length ? `<div><small>Mais usados no portfólio</small>${chips(d.materials.slice(0, 5).map((m) => m.name))}</div>` : ''}
        </div>
      </div>`;
  }

  function itemCard(it) {
    const editable = isArchitect();
    const price = it.price != null ? `${money(it.price)}${it.unit ? ` / ${esc(it.unit)}` : ''}` : 'Preço sob consulta';
    return `
      <li class="pj-item" data-item="${it.id}">
        ${it.photo ? `<img src="${esc(it.photo)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : `<span class="pj-item-ph" aria-hidden="true">${esc((it.category || it.name).slice(0, 1))}</span>`}
        <div class="pj-item-body">
          <strong>${esc(it.name)}</strong>
          <span class="pj-muted">${[it.category, it.storeName || (it.kind === 'custom' ? 'item do arquiteto' : '')].filter(Boolean).map(esc).join(' · ')}</span>
          <span class="pj-item-price">${price}</span>
          ${editable ? `
          <div class="pj-item-edit">
            <label>Ambiente<input data-field="room" maxlength="60" value="${esc(it.room)}" placeholder="Ex.: Sala"></label>
            <label>Qtd.<input data-field="quantity" type="number" min="0.01" step="0.01" value="${it.quantity}"></label>
            <label>Unid.<input data-field="unit" maxlength="20" value="${esc(it.unit)}" placeholder="un, m²"></label>
            ${it.kind === 'custom' ? `<label>Preço (R$)<input data-field="price" type="number" min="0" step="0.01" value="${it.price ?? ''}"></label>` : ''}
            <label>Garantia (meses)<input data-field="warrantyMonths" type="number" min="1" max="600" step="1" value="${it.warrantyMonths ?? ''}"></label>
            <label class="is-wide">Observação<input data-field="note" maxlength="300" value="${esc(it.note)}" placeholder="Acabamento, cor, onde usar…"></label>
          </div>
          <button type="button" class="pj-link pj-danger" data-act="remove-item" data-id="${it.id}">Tirar da biblioteca</button>`
          : `${it.note ? `<p class="pj-muted">${esc(it.note)}</p>` : ''}<span class="pj-muted">${it.quantity} ${esc(it.unit || 'un')}${it.warrantyMonths ? ` · garantia de ${it.warrantyMonths} meses` : ''}</span>`}
        </div>
      </li>`;
  }

  function renderLibrary() {
    const rooms = new Map();
    W.library.forEach((it) => { const r = it.room || 'Geral'; if (!rooms.has(r)) rooms.set(r, []); rooms.get(r).push(it); });
    const lim = W.plan?.limits || {};
    const free = W.plan?.tier === 'free';
    const count = lim.libraryItems ? `<span class="pj-muted">${W.library.length} de ${lim.libraryItems} itens${free ? ' no plano Gratuito' : ''}</span>` : '';
    const tools = isArchitect() ? `
      <div class="pj-card pj-tools">
        <h2>Montar a biblioteca ${count}</h2>
        <p class="pj-muted">Escolha produtos reais do catálogo das lojas parceiras ou cadastre os seus. O assistente de IA (seu e do cliente) só sugere o que estiver aqui — nada de produto inventado.</p>
        <form class="pj-inline" data-form="search">
          <label class="sr-only" for="pjSearch">Buscar no catálogo</label>
          <input type="search" id="pjSearch" placeholder="Buscar: sofá, porcelanato, luminária…" maxlength="60">
          <button type="submit" class="btn btn-primary btn-sm">Buscar</button>
          <button type="button" class="btn btn-tertiary btn-sm" data-act="suggest">Sugeridos para este projeto</button>
        </form>
        ${catalog ? (catalog.length ? `<ul class="pj-catalog">${catalog.map((p) => `
          <li>
            ${p.photo ? `<img src="${esc(p.photo)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : '<span class="pj-item-ph" aria-hidden="true"></span>'}
            <div><strong>${esc(p.name)}</strong><span class="pj-muted">${esc(p.storeName)}${p.price != null ? ` · ${money(p.price)}` : ''}</span></div>
            ${p.inLibrary ? '<span class="pj-chip is-approved">Na biblioteca</span>' : `<button type="button" class="btn btn-secondary btn-sm" data-act="add-product" data-id="${p.id}">Adicionar</button>`}
          </li>`).join('')}</ul>` : '<p class="pj-muted">Nada encontrado no catálogo das lojas parceiras. Cadastre como item próprio abaixo.</p>') : ''}
        <details class="pj-edit">
          <summary>Cadastrar item próprio</summary>
          <form class="pj-grid-form" data-form="custom">
            <label>Nome*<input name="name" maxlength="120" required placeholder="Ex.: Bancada em quartzo branco"></label>
            <label>Categoria<input name="category" maxlength="60" placeholder="Revestimento, mobiliário…"></label>
            <label>Loja / fornecedor<input name="storeName" maxlength="80"></label>
            <label>Preço (R$)<input name="price" type="number" min="0" step="0.01"></label>
            <label>Quantidade<input name="quantity" type="number" min="0.01" step="0.01" value="1"></label>
            <label>Unidade<input name="unit" maxlength="20" placeholder="un, m², m"></label>
            <label>Ambiente<input name="room" maxlength="60" placeholder="Ex.: Cozinha"></label>
            <label class="is-wide">Link de compra<input name="purchaseUrl" type="url" maxlength="500" placeholder="https://"></label>
            <label class="is-wide">Foto (link)<input name="photo" type="url" maxlength="500" placeholder="https://"></label>
            <div class="is-wide"><button type="submit" class="btn btn-primary btn-sm">Adicionar à biblioteca</button></div>
          </form>
        </details>
        ${otherProjects?.length && !lim.copyLibrary ? `<p class="pj-muted pj-upsell">Reaproveitar a seleção de outro projeto faz parte do Pro. <a href="planos.html">Ver planos</a></p>` : ''}
        ${otherProjects?.length && lim.copyLibrary ? `
        <form class="pj-inline" data-form="copy">
          <label for="pjCopyFrom">Trazer a seleção de outro projeto</label>
          <select id="pjCopyFrom">${otherProjects.map((p) => `<option value="${p._id}">${esc(p.name)}</option>`).join('')}</select>
          <button type="submit" class="btn btn-secondary btn-sm">Trazer</button>
        </form>` : ''}
      </div>` : `
      <p class="pj-lead">Esta é a seleção que ${esc(W.architect?.name || 'o arquiteto')} montou para o seu projeto — produtos reais, com loja e preço. O assistente de IA só sugere itens daqui.</p>`;
    $('#pjPanelBiblioteca').innerHTML = `
      ${signatureCard()}
      ${tools}
      <div class="pj-card pj-concept">
        <div>
          <h2>Conceito do projeto</h2>
          <p class="pj-muted">Um texto curto para apresentar o projeto, escrito só com os itens da biblioteca e a assinatura do arquiteto.${isArchitect() && free ? ' No plano Gratuito sai um texto padrão montado com a biblioteca; no <a href="planos.html">Pro</a>, a IA escreve seguindo a sua assinatura.' : ''}</p>
        </div>
        <button type="button" class="btn btn-secondary btn-sm" data-act="concept" ${W.library.length ? '' : 'disabled'}>Escrever o conceito</button>
        ${conceptText ? `<p class="pj-concept-text">${esc(conceptText)}</p>` : ''}
      </div>
      ${W.library.length ? [...rooms.entries()].map(([room, items]) => `
        <section class="pj-room">
          <h3>${esc(room)} <span class="pj-muted">${items.length}</span></h3>
          <ul class="pj-items">${items.map(itemCard).join('')}</ul>
        </section>`).join('') : `<p class="pj-empty">${isArchitect() ? 'A biblioteca está vazia. Busque no catálogo ou cadastre seus próprios itens acima.' : 'O arquiteto ainda não montou a biblioteca deste projeto.'}</p>`}`;
  }

  // ------------------------------------------------------------------ compras
  function renderShopping() {
    const t = W.totals;
    const byStore = new Map();
    W.library.forEach((it) => { const k = it.storeName || 'Sem loja definida'; if (!byStore.has(k)) byStore.set(k, []); byStore.get(k).push(it); });
    $('#pjPanelCompras').innerHTML = W.library.length ? `
      <div class="pj-card pj-totals">
        <div><span>Total estimado</span><strong>${money(t.total)}</strong></div>
        <div><span>Falta comprar</span><strong>${money(t.pending)}</strong></div>
        <div><span>Itens comprados</span><strong>${t.purchased} de ${t.count}</strong></div>
        <div class="pj-totals-actions">
          <button type="button" class="btn btn-secondary btn-sm" data-act="print">Imprimir / PDF</button>
          <button type="button" class="btn btn-secondary btn-sm" data-act="csv">Baixar planilha</button>
        </div>
      </div>
      <p class="pj-muted pj-note">Valores dos catálogos das lojas no momento em que o item entrou na biblioteca — confirme o preço na loja antes de comprar. Itens sem preço ficam "sob consulta" e não entram no total.</p>
      <div class="pj-print-head" aria-hidden="true"><strong>${esc(W.name)}</strong> — lista de compras · ${new Date().toLocaleDateString('pt-BR')}</div>
      ${[...byStore.entries()].map(([store, items]) => {
        const g = t.stores.find((s) => s.store === store);
        return `
        <section class="pj-card pj-store">
          <h3>${esc(store)} <span class="pj-muted">${g ? money(g.subtotal) : ''}</span></h3>
          <div class="pj-table-wrap">
            <table class="pj-table">
              <thead><tr><th scope="col">Comprado</th><th scope="col">Item</th><th scope="col">Ambiente</th><th scope="col">Qtd.</th><th scope="col">Preço</th><th scope="col">Total</th><th scope="col"><span class="sr-only">Link</span></th></tr></thead>
              <tbody>${items.map((it) => `
                <tr class="${it.purchased ? 'is-done' : ''}">
                  <td><input type="checkbox" data-act="purchased" data-id="${it.id}" ${it.purchased ? 'checked' : ''} aria-label="Comprado: ${esc(it.name)}"></td>
                  <td>${esc(it.name)}${it.note ? `<small>${esc(it.note)}</small>` : ''}</td>
                  <td>${esc(it.room || '—')}</td>
                  <td>${it.quantity} ${esc(it.unit || 'un')}</td>
                  <td>${it.price != null ? money(it.price) : 'sob consulta'}</td>
                  <td>${it.price != null ? money(it.price * it.quantity) : '—'}</td>
                  <td>${it.purchaseUrl ? `<a href="${esc(it.purchaseUrl)}" target="_blank" rel="noopener noreferrer">Comprar</a>` : ''}
                    <button type="button" class="pj-link pj-quote-toggle" data-act="quotes" data-id="${it.id}" aria-expanded="${openQuotes.has(it.id)}">Cotações${it.quotes.length ? ` (${it.quotes.length})` : ''}</button></td>
                </tr>
                ${openQuotes.has(it.id) ? `<tr class="pj-quotes-row"><td colspan="7">${quotesHtml(it)}</td></tr>` : ''}`).join('')}</tbody>
            </table>
          </div>
        </section>`;
      }).join('')}` : `<p class="pj-empty">A lista de compras sai da biblioteca do projeto. ${isArchitect() ? 'Adicione itens na aba Biblioteca.' : 'Assim que o arquiteto montar a biblioteca, os itens aparecem aqui, separados por loja e com o total estimado.'}</p>`;
  }

  function quotesHtml(it) {
    const hints = quoteHints.get(it.id);
    return `
      <div class="pj-quotes">
        <p class="pj-muted">Compare o mesmo item em lojas diferentes. A cotação escolhida vira a loja, o preço e o link do item na lista.</p>
        ${it.quotes.length ? `<ul class="pj-quote-list">${it.quotes.map((q) => `
          <li class="${q.chosen ? 'is-chosen' : ''}">
            <strong>${esc(q.storeName)}</strong>
            <span>${money(q.price)} · ${money(q.price * it.quantity)} para ${it.quantity} ${esc(it.unit || 'un')}</span>
            ${q.purchaseUrl ? `<a href="${esc(q.purchaseUrl)}" target="_blank" rel="noopener noreferrer">ver na loja</a>` : ''}
            ${q.chosen ? '<span class="pj-chip is-approved">Escolhida</span>' : `<button type="button" class="btn btn-secondary btn-sm" data-act="quote-choose" data-item="${it.id}" data-id="${q.id}">Escolher</button>`}
            <button type="button" class="pj-link pj-danger" data-act="quote-remove" data-item="${it.id}" data-id="${q.id}" aria-label="Apagar a cotação de ${esc(q.storeName)}">apagar</button>
          </li>`).join('')}</ul>` : ''}
        <div class="pj-quote-tools">
          <button type="button" class="btn btn-tertiary btn-sm" data-act="quote-hints" data-id="${it.id}">Buscar no catálogo das lojas</button>
          ${hints ? (hints.length ? `<ul class="pj-quote-list">${hints.map((h) => `<li><strong>${esc(h.storeName)}</strong><span>${esc(h.name)} · ${money(h.price)}</span><button type="button" class="btn btn-secondary btn-sm" data-act="quote-add-product" data-item="${it.id}" data-id="${h.id}">Adicionar cotação</button></li>`).join('')}</ul>` : '<p class="pj-muted">Nenhum produto parecido nas lojas parceiras.</p>') : ''}
          <form class="pj-inline" data-form="quote" data-item="${it.id}">
            <label class="sr-only" for="qs-${it.id}">Loja</label><input id="qs-${it.id}" name="storeName" maxlength="80" placeholder="Loja" required>
            <label class="sr-only" for="qp-${it.id}">Preço</label><input id="qp-${it.id}" name="price" type="number" min="0.01" step="0.01" placeholder="Preço (R$)" required>
            <label class="sr-only" for="qu-${it.id}">Link</label><input id="qu-${it.id}" name="purchaseUrl" type="url" maxlength="500" placeholder="Link (opcional)">
            <button type="submit" class="btn btn-secondary btn-sm">Adicionar cotação</button>
          </form>
        </div>
      </div>`;
  }

  // ------------------------------------------------------------------ obra (prestadores + diário)
  function crewHtml() {
    const statusLabel = { cotando: 'Em cotação', contratado: 'Contratado', concluido: 'Concluído' };
    const item = (c) => `
      <li class="pj-crew-item">
        <div>
          <strong>${esc(c.name)}</strong> <span class="pj-muted">${esc(c.trade)}${c.providerId ? ' · parceiro match.IA' : ''}</span>
          ${c.contact ? `<p class="pj-muted">${esc(c.contact)}</p>` : ''}
          ${c.note ? `<p class="pj-muted">${esc(c.note)}</p>` : ''}
        </div>
        <div class="pj-crew-meta">
          ${c.quote != null ? `<span>Orçamento: <strong>${money(c.quote)}</strong></span>` : ''}
          ${isArchitect() ? `
            <label class="sr-only" for="cs-${c.id}">Situação</label>
            <select id="cs-${c.id}" data-crew="${c.id}" data-field="status">${Object.entries(statusLabel).map(([k, v]) => `<option value="${k}" ${c.status === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
            <label class="sr-only" for="cq-${c.id}">Orçamento (R$)</label>
            <input id="cq-${c.id}" type="number" min="0" step="0.01" data-crew="${c.id}" data-field="quote" value="${c.quote ?? ''}" placeholder="Orçamento (R$)">
            ${c.status === 'concluido' ? `<label class="sr-only" for="cr-${c.id}">Nota</label><select id="cr-${c.id}" data-crew="${c.id}" data-field="rating"><option value="">Avaliar…</option>${[5, 4, 3, 2, 1].map((n) => `<option value="${n}" ${c.rating === n ? 'selected' : ''}>${'★'.repeat(n)} ${n}</option>`).join('')}</select>` : ''}
            <button type="button" class="pj-link pj-danger" data-act="crew-remove" data-id="${c.id}" aria-label="Tirar ${esc(c.name)} da equipe de obra">tirar</button>`
          : `<span class="pj-chip is-${c.status === 'concluido' ? 'approved' : c.status === 'contratado' ? 'in_progress' : 'pending'}">${statusLabel[c.status]}</span>${c.rating ? ` <span>${'★'.repeat(c.rating)}</span>` : ''}`}
        </div>
      </li>`;
    return `
      <section class="pj-card">
        <h2>Equipe de obra</h2>
        <p class="pj-muted">Marceneiro, eletricista, marmorista… quem vai executar o projeto. Prestadores parceiros da match.IA recebem a indicação e ganham avaliação no perfil quando o serviço termina.</p>
        ${W.crew.length ? `<ul class="pj-crew">${W.crew.map(item).join('')}</ul>` : '<p class="pj-empty">Nenhum prestador ainda.</p>'}
        ${isArchitect() ? `
        <form class="pj-inline" data-form="providers">
          <label for="pjTrade">Buscar parceiros por ofício</label>
          <select id="pjTrade">${TRADES.map((t) => `<option>${t}</option>`).join('')}</select>
          <label class="sr-only" for="pjUf">UF</label>
          <input id="pjUf" maxlength="2" placeholder="UF" value="${esc(W.state || '')}" style="max-width:70px">
          <button type="submit" class="btn btn-secondary btn-sm">Buscar</button>
        </form>
        ${providers ? (providers.length ? `<ul class="pj-quote-list">${providers.map((p) => `
          <li><strong>${esc(p.name)}</strong><span>${esc(p.trades.join(', '))}${p.city ? ` · ${esc(p.city)}/${esc(p.state)}` : ''}${p.rating ? ` · ★ ${String(p.rating.avg).replace('.', ',')} (${p.rating.count})` : ''}</span>
          ${W.crew.some((c) => c.providerId === p.id) ? '<span class="pj-chip is-approved">Na equipe</span>' : `<button type="button" class="btn btn-secondary btn-sm" data-act="crew-add-provider" data-id="${p.id}">Adicionar</button>`}</li>`).join('')}</ul>` : '<p class="pj-muted">Nenhum parceiro desse ofício ainda — cadastre o seu de confiança abaixo.</p>') : ''}
        <details class="pj-edit">
          <summary>Cadastrar prestador de confiança</summary>
          <form class="pj-grid-form" data-form="crew">
            <label>Nome*<input name="name" maxlength="80" required></label>
            <label>Ofício*<select name="trade">${TRADES.map((t) => `<option>${t}</option>`).join('')}</select></label>
            <label>Contato<input name="contact" maxlength="120" placeholder="Telefone ou e-mail"></label>
            <label>Orçamento (R$)<input name="quote" type="number" min="0" step="0.01"></label>
            <div class="is-wide"><button type="submit" class="btn btn-primary btn-sm">Adicionar à equipe de obra</button></div>
          </form>
        </details>` : ''}
      </section>`;
  }

  function diaryHtml() {
    const today = new Date().toISOString().slice(0, 10);
    return `
      <section class="pj-card">
        <h2>Diário de obra</h2>
        <p class="pj-muted">O que foi feito em cada dia, com fotos do canteiro — para o cliente acompanhar sem precisar ir à obra.</p>
        <form class="pj-diary-form" data-form="diary">
          <div class="pj-inline">
            <label for="pjDiaryDate">Dia</label>
            <input id="pjDiaryDate" type="date" value="${today}" max="${today}" required style="max-width:180px">
          </div>
          <label class="sr-only" for="pjDiaryText">O que aconteceu</label>
          <textarea id="pjDiaryText" rows="3" maxlength="2000" placeholder="Ex.: Marcenaria instalou os armários da cozinha; amanhã chega a bancada." required></textarea>
          <div class="pj-inline">
            <label for="pjDiaryPhotos">Fotos (até 6)</label>
            <input id="pjDiaryPhotos" type="file" accept=".jpg,.jpeg,.png,.webp" multiple>
            <button type="submit" class="btn btn-primary btn-sm">Registrar</button>
          </div>
        </form>
        ${pendingDiary.length ? `<div class="pj-pending"><strong>${pendingDiary.length} ${pendingDiary.length === 1 ? 'registro aguardando' : 'registros aguardando'} internet</strong><span class="pj-muted">Ficaram guardados neste aparelho e sobem sozinhos quando a conexão voltar.</span><ul>${pendingDiary.map((e) => `<li><time>${fmtDate(e.date)}</time> ${esc(e.text.slice(0, 90))}${e.files?.length ? ` · ${e.files.length} foto${e.files.length > 1 ? 's' : ''}` : ''}</li>`).join('')}</ul></div>` : ''}
        ${W.diary.length ? `<ol class="pj-diary">${W.diary.map((d) => `
          <li>
            <time>${fmtDate(d.date)}</time>
            <div>
              <p><strong>${esc(d.author?.name || '')}</strong></p>
              <p class="pj-diary-text">${esc(d.text)}</p>
              ${d.files.length ? `<div class="pj-diary-photos">${d.files.map((f) => `<button type="button" class="pj-photo" data-act="photo" data-id="${f}" aria-label="Ampliar foto"><img data-thumb="${f}" alt="Foto da obra em ${fmtDate(d.date)}"></button>`).join('')}</div>` : ''}
              ${d.mine ? `<button type="button" class="pj-link pj-danger" data-act="diary-remove" data-id="${d.id}">apagar registro</button>` : ''}
            </div>
          </li>`).join('')}</ol>` : '<p class="pj-empty">Nenhum registro ainda.</p>'}
      </section>`;
  }


  // ------------------------------------------------------------------ agenda
  function meetingItem(m) {
    const start = new Date(m.startsAt).getTime();
    const past = start + m.durationMin * 60000 < Date.now();
    const myAnswer = W.role === 'client' ? m.clientAnswer : m.architectAnswer;
    const open = !['cancelled'].includes(m.status);
    const chip = m.status === 'confirmed' ? 'is-approved' : m.status === 'pending' ? 'is-awaiting_approval' : 'is-late';
    const canMinutes = isArchitect() && open && start <= Date.now() + 30 * 60000;
    return `
      <li class="pj-card pj-meeting is-${m.status}${past ? ' is-past' : ''}">
        <div class="pj-meeting-when"><strong>${new Date(m.startsAt).getDate()}</strong><span>${new Date(m.startsAt).toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')} · ${new Date(m.startsAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span></div>
        <div class="pj-meeting-main">
          <h3>${esc(m.title)} <span class="pj-chip ${chip}">${MEETING_STATUS[m.status]}</span></h3>
          <p class="pj-stage-meta"><span>${esc(m.kindLabel)}</span><span>${m.durationMin} min</span>${m.place ? `<span>${esc(m.place)}</span>` : ''}<span>marcado por ${esc(m.createdBy?.name || '—')}</span></p>
          ${m.note ? `<p class="pj-muted">${esc(m.note)}</p>` : ''}
          ${m.answerNote ? `<p class="pj-muted">Recado: “${esc(m.answerNote)}”</p>` : ''}
          ${m.minutes ? `<div class="pj-minutes"><small>Ata · ${esc(m.minutesBy?.name || '')} · ${fmtDate(m.minutesAt)}</small><p>${esc(m.minutes)}</p></div>` : ''}
          ${open && !past && myAnswer === 'pending' ? `
            <label class="sr-only" for="mn-${m.id}">Recado</label>
            <textarea id="mn-${m.id}" data-note rows="2" maxlength="300" placeholder="Não pode? Sugira outro dia ou horário."></textarea>
            <div class="pj-row-actions">
              <button type="button" class="btn btn-sage btn-sm" data-act="meeting-answer" data-answer="yes" data-id="${m.id}">Confirmar presença</button>
              <button type="button" class="btn btn-secondary btn-sm" data-act="meeting-answer" data-answer="no" data-id="${m.id}">Não posso</button>
            </div>` : ''}
          ${canMinutes ? `
            <details class="pj-edit" ${!m.minutes && past ? 'open' : ''}>
              <summary>${m.minutes ? 'Editar a ata' : 'Registrar a ata (o que foi decidido)'}</summary>
              <form data-form="minutes" data-id="${m.id}">
                <label class="sr-only" for="mm-${m.id}">Ata</label>
                <textarea id="mm-${m.id}" rows="4" maxlength="3000" placeholder="Decisões, medidas conferidas, próximos passos e responsáveis." required>${esc(m.minutes)}</textarea>
                <div class="pj-row-actions"><button type="submit" class="btn btn-primary btn-sm">Salvar ata</button></div>
              </form>
            </details>` : ''}
          <div class="pj-row-actions">
            ${open && !past ? `<button type="button" class="btn btn-tertiary btn-sm" data-act="meeting-ics" data-id="${m.id}">Adicionar à minha agenda (.ics)</button>` : ''}
            ${open && !past && (m.mine || W.isOwner) ? `<button type="button" class="pj-link pj-danger" data-act="meeting-cancel" data-id="${m.id}">Cancelar</button>` : ''}
          </div>
        </div>
      </li>`;
  }

  function renderAgenda() {
    const now = Date.now();
    const upcoming = W.meetings.filter((m) => new Date(m.startsAt).getTime() + m.durationMin * 60000 >= now && m.status !== 'cancelled');
    const past = W.meetings.filter((m) => !upcoming.includes(m)).reverse();
    const today = new Date();
    const day = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    $('#pjPanelAgenda').innerHTML = `
      <form class="pj-card" data-form="meeting">
        <h2>Marcar reunião ou visita</h2>
        <p class="pj-muted">${isArchitect() ? 'O cliente' : 'O arquiteto'} recebe o convite no sininho e por e-mail e confirma por aqui. Um dia antes, os dois recebem um lembrete.</p>
        <div class="pj-grid-form">
          <label>Tipo<select name="kind">${Object.entries(MEETING_KINDS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label>
          <label>Assunto<input name="title" maxlength="100" placeholder="Ex.: Apresentação do anteprojeto"></label>
          <label>Dia*<input name="day" type="date" min="${day}" required></label>
          <label>Horário*<input name="time" type="time" required></label>
          <label>Duração<select name="durationMin">${[30, 60, 90, 120, 180, 240].map((n) => `<option value="${n}" ${n === 60 ? 'selected' : ''}>${n < 60 ? `${n} min` : `${n / 60} h`.replace('.5', ',5')}</option>`).join('')}</select></label>
          <label class="is-wide">Local ou link<input name="place" maxlength="200" placeholder="Endereço da obra ou link da chamada"></label>
          <label class="is-wide">Recado<input name="note" maxlength="600" placeholder="O que levar, o que vamos decidir…"></label>
          <div class="is-wide"><button type="submit" class="btn btn-primary btn-sm">Marcar</button></div>
        </div>
      </form>
      <section class="pj-room">
        <h3>Próximos <span class="pj-muted">${upcoming.length}</span></h3>
        ${upcoming.length ? `<ol class="pj-meetings">${upcoming.map(meetingItem).join('')}</ol>` : '<p class="pj-empty">Nada marcado. Reuniões, apresentações e visitas de obra aparecem aqui, com confirmação dos dois lados.</p>'}
      </section>
      ${past.length ? `<section class="pj-room"><h3>Anteriores e cancelados <span class="pj-muted">${past.length}</span></h3><ol class="pj-meetings">${past.map(meetingItem).join('')}</ol></section>` : ''}`;
  }

  // ------------------------------------------------------------------ documentos legais
  function renderDocs() {
    const docs = W.legalDocs || [];
    const latest = new Map();
    W.files.forEach((f) => { const k = `${f.stage}|${f.name}`; if (!latest.has(k) || latest.get(k).version < f.version) latest.set(k, f); });
    const fileOpts = [...latest.values()];
    const fileName = (fid) => W.files.find((f) => f.id === fid)?.name || 'arquivo';
    const done = docs.filter((d) => d.status === 'concluido').length;
    const relevant = docs.filter((d) => d.status !== 'nao_aplica').length;
    const chip = { pendente: '', andamento: 'is-awaiting_approval', concluido: 'is-approved', nao_aplica: '' };
    const row = (d) => `
      <li class="pj-legal is-${d.status}">
        <div class="pj-legal-main">
          <strong>${esc(d.name)}</strong> <span class="pj-chip ${chip[d.status]}">${LEGAL_STATUS[d.status]}</span>
          ${d.hint ? `<p class="pj-muted">${esc(d.hint)}</p>` : ''}
          <p class="pj-stage-meta">${d.number ? `<span>Nº ${esc(d.number)}</span>` : ''}${d.date ? `<span>${fmtDate(d.date)}</span>` : ''}${d.note ? `<span>${esc(d.note)}</span>` : ''}${d.fileId ? `<button type="button" class="pj-link" data-act="download" data-id="${esc(d.fileId)}">${esc(fileName(d.fileId))}</button>` : ''}</p>
        </div>
        ${isArchitect() ? `
        <details class="pj-edit">
          <summary>Atualizar</summary>
          <form class="pj-grid-form" data-form="legal" data-key="${esc(d.key)}">
            <label>Situação<select name="status">${Object.entries(LEGAL_STATUS).map(([k, v]) => `<option value="${k}" ${d.status === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
            <label>Número / protocolo<input name="number" maxlength="60" value="${esc(d.number)}"></label>
            <label>Data<input name="date" type="date" value="${inputDate(d.date)}"></label>
            <label>Arquivo do projeto<select name="fileId"><option value="">Nenhum</option>${fileOpts.map((f) => `<option value="${f.id}" ${d.fileId === f.id ? 'selected' : ''}>${esc(f.name)} (v${f.version})</option>`).join('')}</select></label>
            <label class="is-wide">Observação<input name="note" maxlength="300" value="${esc(d.note)}"></label>
            <div class="is-wide pj-row-actions" style="margin:0"><button type="submit" class="btn btn-secondary btn-sm">Salvar</button>${d.key.startsWith('custom-') ? `<button type="button" class="pj-link pj-danger" data-act="legal-remove" data-key="${esc(d.key)}">tirar da lista</button>` : ''}</div>
          </form>
        </details>` : ''}
      </li>`;
    $('#pjPanelDocumentos').innerHTML = `
      <div class="pj-card">
        <h2>Documentos da obra <span class="pj-muted">${done} de ${relevant} concluídos</span></h2>
        <p class="pj-muted">${isArchitect() ? 'RRT, aprovações e licenças em um lugar só. Anexe o comprovante enviando o PDF na aba Arquivos e escolhendo-o aqui. Marque "Não se aplica" no que esta obra não precisa.' : 'Os registros e licenças que o arquiteto cuida para a sua obra estar regular. Você acompanha a situação de cada um por aqui.'}</p>
        <ul class="pj-legal-list">${docs.map(row).join('')}</ul>
        ${isArchitect() ? `
        <form class="pj-inline" data-form="legal-add">
          <label for="pjLegalName">Outro documento</label>
          <input id="pjLegalName" maxlength="80" placeholder="Ex.: Laudo de vistoria do vizinho" required>
          <button type="submit" class="btn btn-secondary btn-sm">Incluir</button>
        </form>` : ''}
      </div>
      ${W.briefingId || W.contractId ? `
      <div class="pj-card">
        <h2>Combinado com o cliente</h2>
        <p class="pj-row-actions" style="margin-top:6px">
          ${W.briefingId ? `<a class="btn btn-secondary btn-sm" href="briefing.html?id=${esc(W.briefingId)}">Briefing respondido</a>` : ''}
          ${W.contractId ? `<a class="btn btn-secondary btn-sm" href="contrato.html?id=${esc(W.contractId)}">Contrato assinado${W.rrt ? ` · RRT ${esc(W.rrt)}` : ''}</a>` : ''}
        </p>
      </div>` : ''}`;
  }

  // ------------------------------------------------------------------ manual da casa
  function manualHtml() {
    if (!W.handoverAt) {
      if (isArchitect() && W.isOwner) return `
        <form class="pj-card" data-form="handover">
          <h2>Entrega da obra e manual da casa</h2>
          <p class="pj-muted">Ao registrar a entrega, o cliente recebe o manual da casa: materiais usados (com loja e garantia), quem executou cada serviço, os documentos da obra e um plano de manutenção montado a partir do que foi usado — com lembretes por e-mail.</p>
          <div class="pj-inline">
            <label for="pjHandover">Data da entrega</label>
            <input id="pjHandover" type="date" value="${new Date().toISOString().slice(0, 10)}" max="${new Date().toISOString().slice(0, 10)}" required style="max-width:180px">
            <button type="submit" class="btn btn-primary btn-sm">Registrar entrega</button>
          </div>
        </form>`;
      return `<div class="pj-card"><h2>Manual da casa</h2><p class="pj-muted">Quando a obra terminar, ${esc(W.architect?.name || 'o arquiteto')} registra a entrega e o manual da sua casa aparece aqui: materiais, garantias, quem fez cada serviço e quando fazer cada manutenção.</p></div>`;
    }
    const now = Date.now();
    return `
      <section class="pj-card pj-manual">
        <div class="pj-card-head">
          <h2>Manual da casa <span class="pj-muted">obra entregue em ${fmtDate(W.handoverAt)}</span></h2>
          <button type="button" class="btn btn-secondary btn-sm" data-act="print-manual">Imprimir / PDF</button>
        </div>
        <p class="pj-muted">Plano de manutenção montado com os materiais e serviços desta obra. ${W.role === 'client' ? 'Vamos te lembrar por e-mail quando chegar a hora; marque "Feito" para o próximo lembrete contar a partir de hoje.' : 'O cliente recebe um lembrete por e-mail quando cada item vence.'}</p>
        ${W.maintenance.length ? `<ul class="pj-maint">${W.maintenance.map((t) => {
          const late = new Date(t.nextAt).getTime() < now;
          return `
          <li>
            <div><strong>${esc(t.task)}</strong><span class="pj-muted">a cada ${t.everyMonths} ${t.everyMonths === 1 ? 'mês' : 'meses'}${t.because ? ` · por causa de: ${esc(t.because)}` : ''}${t.lastDoneAt ? ` · feita em ${fmtDate(t.lastDoneAt)}` : ''}</span></div>
            <div class="pj-maint-actions">
              <span class="pj-chip ${late ? 'is-late' : ''}">${late ? 'Venceu em' : 'Próxima'} ${fmtDate(t.nextAt)}</span>
              <button type="button" class="btn btn-tertiary btn-sm" data-act="maint-done" data-id="${t.id}">Feito</button>
              ${isArchitect() ? `<button type="button" class="pj-link pj-danger" data-act="maint-remove" data-id="${t.id}" aria-label="Tirar ${esc(t.task)} do plano">tirar</button>` : ''}
            </div>
          </li>`;
        }).join('')}</ul>` : '<p class="pj-empty">Nenhum item de manutenção.</p>'}
        ${isArchitect() ? `
        <form class="pj-inline" data-form="maint-add">
          <label class="sr-only" for="pjMaintTask">Manutenção</label>
          <input id="pjMaintTask" maxlength="160" placeholder="Outra manutenção (ex.: revisar o motor do portão)" required>
          <label class="sr-only" for="pjMaintEvery">A cada (meses)</label>
          <input id="pjMaintEvery" type="number" min="1" max="120" value="12" style="max-width:110px" aria-describedby="pjMaintEveryHint">
          <span id="pjMaintEveryHint" class="pj-muted">meses</span>
          <button type="submit" class="btn btn-secondary btn-sm">Incluir</button>
        </form>` : ''}
      </section>`;
  }

  function printManual() {
    const rooms = new Map();
    W.library.forEach((it) => { const r = it.room || 'Geral'; if (!rooms.has(r)) rooms.set(r, []); rooms.get(r).push(it); });
    const until = (m) => {
      const d = new Date(W.handoverAt);
      d.setMonth(d.getMonth() + m);
      return d.toISOString();
    };
    const docs = (W.legalDocs || []).filter((d) => d.status === 'concluido');
    printDoc(`
      <article class="pj-doc pj-doc-manual">
        <header><p class="pj-doc-kicker">Manual da casa · obra entregue em ${fmtDate(W.handoverAt)}</p><h1>${esc(W.name)}</h1>
          <p>Projeto de ${esc(W.architect?.name || '')} para ${esc(W.client?.name || '')}${W.city ? ` · ${esc(W.city)}${W.state ? `/${esc(W.state)}` : ''}` : ''}</p></header>
        <h2>Plano de manutenção</h2>
        <table><thead><tr><th>O quê</th><th>Frequência</th><th>Próxima</th></tr></thead><tbody>
          ${W.maintenance.map((t) => `<tr><td>${esc(t.task)}${t.because ? `<small>${esc(t.because)}</small>` : ''}</td><td>a cada ${t.everyMonths} ${t.everyMonths === 1 ? 'mês' : 'meses'}</td><td>${fmtDate(t.nextAt)}</td></tr>`).join('')}
        </tbody></table>
        ${W.library.length ? `<h2>Materiais e produtos</h2>${[...rooms.entries()].map(([room, items]) => `
          <h3>${esc(room)}</h3>
          <table><thead><tr><th>Item</th><th>Onde comprar</th><th>Garantia</th></tr></thead><tbody>
            ${items.map((it) => `<tr><td>${esc(it.name)}${it.category || it.note ? `<small>${[it.category, it.note].filter(Boolean).map(esc).join(' · ')}</small>` : ''}</td><td>${esc(it.storeName || '—')}${it.purchaseUrl ? `<small>${esc(it.purchaseUrl)}</small>` : ''}</td><td>${it.warrantyMonths ? `${it.warrantyMonths} meses (até ${fmtDate(until(it.warrantyMonths))})` : '—'}</td></tr>`).join('')}
          </tbody></table>`).join('')}` : ''}
        ${W.crew.length ? `<h2>Quem executou</h2><table><thead><tr><th>Serviço</th><th>Prestador</th><th>Contato</th></tr></thead><tbody>
          ${W.crew.map((c) => `<tr><td>${esc(c.trade)}</td><td>${esc(c.name)}${c.providerId ? '<small>parceiro match.IA</small>' : ''}</td><td>${esc(c.contact || (c.providerId ? 'pelo painel da match.IA' : '—'))}</td></tr>`).join('')}
        </tbody></table>` : ''}
        ${docs.length ? `<h2>Documentos da obra</h2><table><thead><tr><th>Documento</th><th>Número</th><th>Data</th></tr></thead><tbody>
          ${docs.map((d) => `<tr><td>${esc(d.name)}</td><td>${esc(d.number || '—')}</td><td>${d.date ? fmtDate(d.date) : '—'}</td></tr>`).join('')}
        </tbody></table>` : ''}
        <footer>Gerado pelo Espaço do projeto da match.IA em ${new Date().toLocaleDateString('pt-BR')}. Guarde junto com as notas fiscais e os manuais dos fabricantes.</footer>
      </article>`);
  }

  function renderObra() {
    $('#pjPanelObra').innerHTML = crewHtml() + diaryHtml() + manualHtml();
    // fotos do diário: baixadas com o login (protegidas) e guardadas para não baixar de novo
    $('#pjPanelObra').querySelectorAll('img[data-thumb]').forEach(async (img) => {
      const id = img.dataset.thumb;
      try {
        if (!thumbs.has(id)) thumbs.set(id, URL.createObjectURL(await API.workspaceFileBlob(W.id, id)));
        img.src = thumbs.get(id);
      } catch { img.alt = 'Foto indisponível'; }
    });
  }

  function downloadCsv() {
    const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const num = (n) => (n == null ? '' : String(n).replace('.', ','));
    const lines = [['Loja', 'Item', 'Categoria', 'Ambiente', 'Quantidade', 'Unidade', 'Preço unitário', 'Total', 'Comprado', 'Link', 'Observação'].map(q).join(';')];
    W.library.forEach((it) => lines.push([
      it.storeName || 'Sem loja definida', it.name, it.category, it.room, num(it.quantity), it.unit || 'un', num(it.price),
      it.price != null ? num(Math.round(it.price * it.quantity * 100) / 100) : '', it.purchased ? 'sim' : 'não', it.purchaseUrl, it.note,
    ].map(q).join(';')));
    const blob = new Blob([`﻿${lines.join('\r\n')}`], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `lista-de-compras-${W.name.normalize('NFD').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-').toLowerCase() || 'projeto'}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  // ------------------------------------------------------------------ histórico
  function renderHistory() {
    $('#pjPanelHistorico').innerHTML = W.activity.length ? `
      <ol class="pj-card pj-history">
        ${W.activity.map((a) => `<li class="is-${esc(a.kind)}"><time>${fmtDateTime(a.at)}</time><p><strong>${esc(a.by?.name || 'Alguém')}</strong> ${esc(a.text)}</p></li>`).join('')}
      </ol>` : '<p class="pj-empty">Tudo o que mudar no projeto (etapas, arquivos, biblioteca e compras) fica registrado aqui, com quem fez e quando.</p>';
  }


  // ------------------------------------------------------------------ sem internet (canteiro de obra)
  // Cópia do espaço e fila do diário de obra no IndexedDB deste aparelho; apagadas ao sair da conta (api.js).
  const Offline = (() => {
    let dbp = null;
    const db = () => dbp || (dbp = new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) { reject(new Error('sem IndexedDB')); return; }
      const r = indexedDB.open('matchia-offline', 1);
      r.onupgradeneeded = () => {
        r.result.createObjectStore('snapshots');
        r.result.createObjectStore('diary', { keyPath: 'qid', autoIncrement: true });
      };
      r.onsuccess = () => {
        // sair da conta (outra aba) apaga o banco: esta conexão fecha para não travar a exclusão
        r.result.onversionchange = () => { r.result.close(); dbp = null; };
        resolve(r.result);
      };
      r.onerror = () => reject(r.error);
      r.onblocked = () => reject(new Error('banco offline ocupado'));
    })).catch((err) => { dbp = null; throw err; });
    // nunca deixa a página esperando o armazenamento local
    const ready = () => Promise.race([db(), new Promise((_, reject) => setTimeout(() => reject(new Error('armazenamento local lento')), 3000))]);
    const tx = async (store, mode, fn) => {
      const d = await ready();
      return new Promise((resolve, reject) => {
        const t = d.transaction(store, mode);
        const req = fn(t.objectStore(store));
        t.oncomplete = () => resolve(req?.result);
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error);
      });
    };
    return {
      save: (key, value) => tx('snapshots', 'readwrite', (s) => s.put(value, key)).catch(() => {}),
      load: (key) => tx('snapshots', 'readonly', (s) => s.get(key)).catch(() => null),
      queue: (entry) => tx('diary', 'readwrite', (s) => s.add(entry)),
      pending: (owner) => tx('diary', 'readonly', (s) => s.getAll()).then((list) => (list || []).filter((e) => e.owner === owner)).catch(() => []),
      drop: (qid) => tx('diary', 'readwrite', (s) => s.delete(qid)),
    };
  })();
  const ownerKey = () => `${API.currentUser()?.id || ''}:${id}`;

  async function queueDiary(entry) {
    await Offline.queue({ ...entry, owner: ownerKey(), at: Date.now() });
    pendingDiary = await Offline.pending(ownerKey());
    renderObra();
    flash('Sem internet: o registro ficou guardado neste aparelho e sobe sozinho quando a conexão voltar.');
  }

  let flushing = false;
  async function flushDiary() {
    if (flushing || !navigator.onLine || !W || offlineSince) return;
    flushing = true;
    let sent = 0;
    try {
      for (const e of await Offline.pending(ownerKey())) {
        const ids = [];
        for (const f of e.files || []) ids.push((await API.workspaceUpload(W.id, f, '', 'diary')).uploaded);
        W = await API.workspaceAddDiary(W.id, { date: e.date, text: e.text, files: ids });
        await Offline.drop(e.qid);
        sent += 1;
      }
    } catch { /* sem conexão de novo: tenta na próxima vez */ }
    pendingDiary = await Offline.pending(ownerKey());
    flushing = false;
    if (sent) {
      render();
      flash(`${sent} ${sent === 1 ? 'registro do diário enviado' : 'registros do diário enviados'} — a conexão voltou.`);
    } else if (pendingDiary.length) renderObra();
  }

  window.addEventListener('online', async () => {
    if (offlineSince) {
      try { W = await API.workspace(id); offlineSince = null; Offline.save(ownerKey(), { W, at: Date.now() }); render(); } catch { return; }
    }
    flushDiary();
  });

  // ------------------------------------------------------------------ geral
  function render() {
    renderHero();
    renderStages();
    renderAgenda();
    renderFiles();
    renderDocs();
    renderLibrary();
    renderShopping();
    renderObra();
    renderHistory();
    showTab(tab, false);
  }

  function showTab(name, focus = true) {
    tab = name;
    document.querySelectorAll('[data-pj-tab]').forEach((b) => {
      const on = b.dataset.pjTab === name;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-selected', String(on));
      b.tabIndex = on ? 0 : -1;
      if (on && focus) b.focus();
    });
    document.querySelectorAll('[data-pj-panel]').forEach((p) => { p.hidden = p.dataset.pjPanel !== name; });
    try { history.replaceState(null, '', `#${name}`); } catch { /* sem histórico: só não guarda a aba */ }
  }

  async function openFile(fileId, mode) {
    const f = W.files.find((x) => x.id === fileId);
    if (!f) return;
    const win = mode === 'view' ? window.open('', '_blank') : null; // abre já no clique, senão o navegador bloqueia
    try {
      const blob = await API.workspaceFileBlob(W.id, fileId);
      const url = URL.createObjectURL(blob);
      if (win) win.location.href = url;
      else {
        const a = document.createElement('a');
        a.href = url;
        a.download = f.name;
        a.click();
      }
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (err) {
      win?.close();
      flash(err.message, true);
    }
  }

  // Cliques
  app.addEventListener('click', async (e) => {
    const tabBtn = e.target.closest('[data-pj-tab]');
    if (tabBtn) { showTab(tabBtn.dataset.pjTab); return; }
    const btn = e.target.closest('[data-act]');
    if (!btn || btn.matches('input')) return;
    const act = btn.dataset.act;
    const card = btn.closest('li, form, section');
    const note = card?.querySelector('[data-note]')?.value.trim() || '';

    if (act === 'goto-tab') {
      showTab(btn.dataset.tab);
    } else if (act === 'copy-pix') {
      const input = $(`#pix-${btn.dataset.key}`);
      try { await navigator.clipboard.writeText(input.value); } catch { input.select(); document.execCommand('copy'); }
      flash('Código Pix copiado. Cole no app do seu banco, em "Pix copia e cola".');
    } else if (act === 'confirm-fee') {
      const st = W.stages.find((x) => x.key === btn.dataset.key);
      if (!confirm(`Confirmar que você recebeu ${money(st.fee)} dos honorários de "${st.name}"? O cliente recebe o recibo na hora.`)) return;
      await run(btn, () => API.workspaceConfirmFee(W.id, btn.dataset.key), 'Recebimento confirmado — o recibo já está disponível.');
    } else if (act === 'receipt') {
      btn.disabled = true;
      try { await printReceipt(btn.dataset.key); } catch (err) { flash(err.message, true); }
      btn.disabled = false;
    } else if (act === 'print-gantt') {
      printDoc(`<article class="pj-doc"><header><p class="pj-doc-kicker">Cronograma do projeto</p><h1>${esc(W.name)}</h1><p>Meta de entrega: ${fmtDate(W.targetDate)} · ${W.summary.approved} de ${W.summary.total} etapas aprovadas</p></header>${ganttHtml()}<ol class="pj-doc-list">${W.stages.map((s) => `<li><strong>${esc(s.name)}</strong> — ${s.dueDate ? `prazo ${fmtDate(s.dueDate)}` : 'sem prazo fixo'} · ${STATUS[s.status]}</li>`).join('')}</ol></article>`);
    } else if (act === 'print-manual') {
      printManual();
    } else if (act === 'review-edit') {
      editingReview = true;
      renderStages();
    } else if (act === 'review-cancel') {
      editingReview = false;
      renderStages();
    } else if (act === 'meeting-answer') {
      await run(btn, () => API.workspaceAnswerMeeting(W.id, btn.dataset.id, btn.dataset.answer, note), btn.dataset.answer === 'yes' ? 'Presença confirmada.' : 'Resposta enviada — combinem outro horário.');
    } else if (act === 'meeting-cancel') {
      if (!confirm('Cancelar este compromisso? A outra pessoa recebe um aviso.')) return;
      await run(btn, () => API.workspaceCancelMeeting(W.id, btn.dataset.id), 'Compromisso cancelado.');
    } else if (act === 'meeting-ics') {
      try {
        const blob = await API.workspaceMeetingIcs(W.id, btn.dataset.id);
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `${slug(W.meetings.find((m) => m.id === btn.dataset.id)?.title)}.ics`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      } catch (err) { flash(err.message, true); }
    } else if (act === 'legal-remove') {
      await run(btn, () => API.workspaceRemoveLegalDoc(W.id, btn.dataset.key), 'Documento retirado da lista.');
    } else if (act === 'maint-done') {
      await run(btn, () => API.workspaceMaintenanceDone(W.id, btn.dataset.id), 'Anotado. O próximo lembrete conta a partir de hoje.');
    } else if (act === 'maint-remove') {
      if (!confirm('Tirar este item do plano de manutenção?')) return;
      await run(btn, () => API.workspaceRemoveMaintenance(W.id, btn.dataset.id), 'Item retirado.');
    } else if (act === 'stage') {
      const labels = { submit: 'Etapa enviada para o cliente aprovar.', approve: 'Etapa aprovada. A próxima já começou.', 'request-changes': 'Pedido de ajustes enviado ao arquiteto.' };
      await run(btn, () => API.workspaceStageAction(W.id, btn.dataset.key, btn.dataset.action, note), labels[btn.dataset.action]);
    } else if (act === 'quotes') {
      const id = btn.dataset.id;
      if (openQuotes.has(id)) openQuotes.delete(id); else openQuotes.add(id);
      renderShopping();
    } else if (act === 'quote-hints') {
      btn.disabled = true;
      try { quoteHints.set(btn.dataset.id, await API.workspaceQuoteSuggestions(W.id, btn.dataset.id)); renderShopping(); } catch (err) { flash(err.message, true); btn.disabled = false; }
    } else if (act === 'quote-add-product') {
      await run(btn, () => API.workspaceAddQuote(W.id, btn.dataset.item, { productId: btn.dataset.id }), 'Cotação adicionada.');
    } else if (act === 'quote-choose') {
      await run(btn, () => API.workspaceChooseQuote(W.id, btn.dataset.item, btn.dataset.id), 'Cotação escolhida — a lista de compras foi atualizada.');
    } else if (act === 'quote-remove') {
      await run(btn, () => API.workspaceRemoveQuote(W.id, btn.dataset.item, btn.dataset.id), 'Cotação apagada.');
    } else if (act === 'team-remove') {
      if (!confirm('Tirar esta pessoa da equipe do projeto?')) return;
      await run(btn, () => API.workspaceRemoveTeam(W.id, btn.dataset.id), 'Pessoa retirada da equipe.');
    } else if (act === 'team-leave') {
      if (!confirm('Sair da equipe deste projeto? Você perde o acesso ao Espaço dele.')) return;
      try { await API.workspaceRemoveTeam(W.id, W.me); location.href = 'dashboard.html'; } catch (err) { flash(err.message, true); }
    } else if (act === 'crew-add-provider') {
      await run(btn, () => API.workspaceAddCrew(W.id, { providerId: btn.dataset.id, trade: $('#pjTrade')?.value }), 'Prestador adicionado — ele recebe a indicação.');
    } else if (act === 'crew-remove') {
      if (!confirm('Tirar este prestador da equipe de obra?')) return;
      await run(btn, () => API.workspaceRemoveCrew(W.id, btn.dataset.id), 'Prestador retirado.');
    } else if (act === 'diary-remove') {
      if (!confirm('Apagar este registro do diário (e as fotos dele)?')) return;
      await run(btn, () => API.workspaceRemoveDiary(W.id, btn.dataset.id), 'Registro apagado.');
    } else if (act === 'photo') {
      const url = thumbs.get(btn.dataset.id);
      if (url) window.open(url, '_blank', 'noopener');
    } else if (act === 'del-template') {
      if (!confirm('Apagar este modelo?')) return;
      try { templates = await API.deleteWorkspaceTemplate(btn.dataset.id); renderStages(); } catch (err) { flash(err.message, true); }
    } else if (act === 'pay') {
      const st = W.stages.find((x) => x.key === btn.dataset.key);
      if (!confirm(`Avisar ${W.architect?.name || 'o arquiteto'} que você pagou ${money(st.fee)} dos honorários de "${st.name}"? Ele confere no banco e confirma o recebimento.`)) return;
      await run(btn, () => API.workspacePayFee(W.id, btn.dataset.key), 'Pagamento avisado. O recibo sai quando o arquiteto confirmar.');
    } else if (act === 'goto-files') {
      showTab('arquivos');
      document.getElementById(`files-${btn.dataset.key}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else if (act === 'compare') {
      const f = W.files.find((x) => x.id === btn.dataset.id);
      if (f && prevOf(f)) MatchFileViewer.compare({ workspaceId: W.id, older: prevOf(f), newer: f });
    } else if (act === 'annotate') {
      const f = W.files.find((x) => x.id === btn.dataset.id);
      if (f) MatchFileViewer.open({ workspaceId: W.id, file: f, onChange: () => API.workspace(W.id).then((w) => { W = w; renderFiles(); renderHistory(); }).catch(() => {}) });
    } else if (act === 'view' || act === 'download') {
      openFile(btn.dataset.id, act);
    } else if (act === 'delete-file') {
      if (!confirm('Apagar este arquivo? Não dá para desfazer.')) return;
      await run(btn, () => API.workspaceDeleteFile(W.id, btn.dataset.id), 'Arquivo apagado.');
    } else if (act === 'review') {
      await run(btn, () => API.workspaceReviewFile(W.id, btn.dataset.id, btn.dataset.decision, note), btn.dataset.decision === 'approved' ? 'Arquivo aprovado.' : 'Pedido de ajustes enviado.');
    } else if (act === 'suggest') {
      btn.disabled = true;
      try { catalog = await API.workspaceCatalog(W.id, ''); renderLibrary(); } catch (err) { flash(err.message, true); btn.disabled = false; }
    } else if (act === 'add-product') {
      const res = await run(btn, () => API.workspaceAddItem(W.id, { productId: btn.dataset.id }), 'Adicionado à biblioteca.');
      if (res && catalog) { catalog = catalog.map((p) => (p.id === btn.dataset.id ? { ...p, inLibrary: true } : p)); renderLibrary(); }
    } else if (act === 'remove-item') {
      await run(btn, () => API.workspaceRemoveItem(W.id, btn.dataset.id), 'Item retirado da biblioteca.');
    } else if (act === 'concept') {
      btn.disabled = true;
      btn.textContent = 'Escrevendo…';
      try { conceptText = (await API.workspaceConcept(W.id)).concept; } catch (err) { flash(err.message, true); }
      renderLibrary();
    } else if (act === 'print') {
      document.body.classList.add('pj-printing');
      window.print();
      document.body.classList.remove('pj-printing');
    } else if (act === 'csv') {
      downloadCsv();
    }
  });

  // Mudanças (biblioteca e compras salvam sozinhas)
  app.addEventListener('change', async (e) => {
    const el = e.target;
    if (el.matches('[data-act="purchased"]')) {
      el.disabled = true;
      await run(null, () => API.workspaceUpdateItem(W.id, el.dataset.id, { purchased: el.checked }), el.checked ? 'Marcado como comprado.' : 'Compra desmarcada.');
      return;
    }
    if (el.dataset.crew) {
      if (el.dataset.field === 'rating' && !el.value) return;
      await run(null, () => API.workspaceUpdateCrew(W.id, el.dataset.crew, { [el.dataset.field]: el.value }), 'Salvo.');
      return;
    }
    const field = el.dataset.field;
    const item = el.closest('[data-item]');
    if (field && item) await run(null, () => API.workspaceUpdateItem(W.id, item.dataset.item, { [field]: el.value }), 'Salvo.');
  });

  // Formulários
  app.addEventListener('submit', async (e) => {
    const form = e.target.closest('[data-form]');
    if (!form) return;
    e.preventDefault();
    const btn = form.querySelector('[type="submit"]');
    const kind = form.dataset.form;
    if (kind === 'meeting') {
      const f = form.elements;
      const when = new Date(`${f.day.value}T${f.time.value}`);
      if (Number.isNaN(when.getTime())) { flash('Escolha o dia e o horário.', true); return; }
      await run(btn, () => API.workspaceAddMeeting(W.id, { kind: f.kind.value, title: f.title.value, startsAt: when.toISOString(), durationMin: f.durationMin.value, place: f.place.value, note: f.note.value }), 'Marcado — a outra pessoa recebe o convite para confirmar.');
    } else if (kind === 'minutes') {
      await run(btn, () => API.workspaceMeetingMinutes(W.id, form.dataset.id, form.querySelector('textarea').value), 'Ata registrada no histórico do projeto.');
    } else if (kind === 'legal') {
      const f = form.elements;
      await run(btn, () => API.workspaceUpdateLegalDoc(W.id, form.dataset.key, { status: f.status.value, number: f.number.value, date: f.date.value ? `${f.date.value}T12:00:00Z` : null, fileId: f.fileId.value, note: f.note.value }), 'Documento atualizado.');
    } else if (kind === 'legal-add') {
      await run(btn, () => API.workspaceAddLegalDoc(W.id, { name: $('#pjLegalName').value }), 'Documento incluído na lista.');
    } else if (kind === 'handover') {
      if (!confirm('Registrar a entrega da obra? O cliente recebe o manual da casa e o plano de manutenção começa a contar.')) return;
      await run(btn, () => API.workspaceHandover(W.id, `${$('#pjHandover').value}T12:00:00Z`), 'Entrega registrada — o manual da casa está pronto.');
    } else if (kind === 'maint-add') {
      await run(btn, () => API.workspaceAddMaintenance(W.id, { task: $('#pjMaintTask').value, everyMonths: $('#pjMaintEvery').value }), 'Incluído no plano de manutenção.');
    } else if (kind === 'review') {
      const rating = Number(form.querySelector('input[name="rating"]:checked')?.value || 0);
      const res = await run(btn, () => API.workspaceReview(W.id, rating, $('#pjReviewText').value), 'Obrigado! Sua avaliação já aparece no perfil do arquiteto.');
      if (res) { editingReview = false; renderStages(); }
    } else if (kind === 'target') {
      await run(btn, () => API.workspaceTarget(W.id, `${$('#pjTarget').value}T12:00:00Z`), 'Meta atualizada.');
    } else if (kind === 'team') {
      await run(btn, () => API.workspaceAddTeam(W.id, $('#pjTeamEmail').value.trim()), 'Colega adicionado à equipe — ele recebe um aviso.');
    } else if (kind === 'quote') {
      const data = Object.fromEntries(new FormData(form).entries());
      await run(btn, () => API.workspaceAddQuote(W.id, form.dataset.item, data), 'Cotação adicionada.');
    } else if (kind === 'providers') {
      btn.disabled = true;
      try { providers = await API.providers($('#pjTrade').value, $('#pjUf').value.trim()); renderObra(); } catch (err) { flash(err.message, true); btn.disabled = false; }
    } else if (kind === 'crew') {
      const data = Object.fromEntries(new FormData(form).entries());
      await run(btn, () => API.workspaceAddCrew(W.id, data), `${data.name} adicionado à equipe de obra.`);
    } else if (kind === 'diary') {
      const files = [...($('#pjDiaryPhotos').files || [])].slice(0, 6);
      const entry = { date: `${$('#pjDiaryDate').value}T12:00:00Z`, text: $('#pjDiaryText').value, files };
      if (files.some((f) => f.size > W.storage.fileMax)) { flash('Foto grande demais (máximo 15 MB).', true); return; }
      if (!navigator.onLine || offlineSince) { await queueDiary(entry).catch(() => flash('Este navegador não deixa guardar o registro sem internet.', true)); return; }
      btn.disabled = true;
      btn.textContent = files.length ? 'Enviando fotos…' : 'Registrando…';
      try {
        const ids = [];
        for (const f of files) {
          if (f.size > W.storage.fileMax) throw new Error(`${f.name}: foto grande demais (máximo 15 MB).`);
          ids.push((await API.workspaceUpload(W.id, f, '', 'diary')).uploaded);
        }
        W = await API.workspaceAddDiary(W.id, { date: entry.date, text: entry.text, files: ids });
        render();
        flash('Registro adicionado ao diário de obra.');
      } catch (err) {
        if (err?.offline) { await queueDiary(entry).catch(() => {}); return; }
        flash(err.message || 'Não deu certo agora.', true);
        btn.disabled = false;
        btn.textContent = 'Registrar';
      }
    } else if (kind === 'apply-template') {
      if (!confirm('Trocar as etapas deste projeto pelo modelo escolhido? Nomes, prazos e honorários atuais serão substituídos.')) return;
      await run(btn, () => API.applyWorkspaceTemplate(W.id, $('#pjTpl').value), 'Modelo aplicado.');
    } else if (kind === 'save-template') {
      try {
        templates = await API.saveWorkspaceTemplate({ name: $('#pjTplName').value, stages: weeksOfStages() });
        renderStages();
        flash('Modelo salvo — ele aparece também na proposta de novos clientes.');
      } catch (err) { flash(err.message, true); }
    } else if (kind === 'stage') {
      const d = form.elements.dueDate.value;
      const payload = { name: form.elements.name.value, dueDate: d ? `${d}T12:00:00Z` : null };
      if (!form.elements.fee.disabled) payload.fee = form.elements.fee.value;
      await run(btn, () => API.workspaceUpdateStage(W.id, form.dataset.key, payload), 'Etapa atualizada.');
    } else if (kind === 'upload') {
      const file = $('#pjUpFile').files?.[0];
      if (!file) return;
      if (file.size > W.storage.fileMax) { flash('Arquivo grande demais (máximo 15 MB).', true); return; }
      btn.textContent = 'Enviando…';
      await run(btn, () => API.workspaceUpload(W.id, file, $('#pjUpStage').value), `${file.name} enviado.`);
    } else if (kind === 'search') {
      btn.disabled = true;
      try { catalog = await API.workspaceCatalog(W.id, $('#pjSearch').value.trim()); renderLibrary(); $('#pjSearch').focus(); } catch (err) { flash(err.message, true); btn.disabled = false; }
    } else if (kind === 'custom') {
      const data = Object.fromEntries(new FormData(form).entries());
      await run(btn, () => API.workspaceAddItem(W.id, data), `${data.name} adicionado à biblioteca.`);
    } else if (kind === 'copy') {
      await run(btn, () => API.workspaceCopyLibrary(W.id, $('#pjCopyFrom').value), (r) => (r.added ? `${r.added} ${r.added === 1 ? 'item trazido' : 'itens trazidos'}.` : 'Nada novo para trazer — esses itens já estão aqui.'));
    }
  });

  // Teclado nas abas (setas)
  $('.pj-tabs').addEventListener('keydown', (e) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    const tabs = [...document.querySelectorAll('[data-pj-tab]')];
    const i = tabs.findIndex((t) => t.dataset.pjTab === tab);
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : (i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    e.preventDefault();
    showTab(tabs[next].dataset.pjTab);
  });

  async function boot() {
    if (!API.token() || !API.currentUser()) { location.replace('login.html'); return; }
    if (!/^[a-f\d]{24}$/i.test(id)) { state.innerHTML = 'Projeto não encontrado. <a href="dashboard.html">Voltar ao painel</a>'; return; }
    try {
      W = await API.workspace(id);
      Offline.save(ownerKey(), { W, at: Date.now() });
    } catch (err) {
      if (err?.status === 401) { location.replace('login.html'); return; }
      const copy = err?.offline ? await Offline.load(ownerKey()) : null;
      if (!copy?.W) {
        state.innerHTML = `${esc(err?.offline ? 'Sem internet e sem uma cópia deste projeto salva neste aparelho.' : err?.message || 'Não foi possível abrir o projeto.')} <a href="dashboard.html">Voltar ao painel</a>`;
        return;
      }
      W = copy.W;
      offlineSince = new Date(copy.at).toISOString();
    }
    const hash = location.hash.replace('#', '');
    if (['etapas', 'agenda', 'arquivos', 'documentos', 'biblioteca', 'compras', 'obra', 'historico'].includes(hash)) tab = hash;
    state.hidden = true;
    app.hidden = false;
    render();
    // registros do diário feitos sem internet: mostra e envia sem segurar a abertura da página
    Offline.pending(ownerKey()).then((list) => {
      pendingDiary = list;
      if (list.length) renderObra();
      flushDiary();
    });
    if (isArchitect() && !offlineSince) {
      API.workspaceTemplates().then((t) => { templates = t; renderStages(); }).catch(() => {});
      API.architectProjects().then((list) => { otherProjects = list.filter((p) => String(p._id) !== W.id); renderLibrary(); }).catch(() => {});
    }
  }
  boot();
})();
