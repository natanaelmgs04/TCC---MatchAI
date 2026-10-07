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
      flash(err?.message || 'Não deu certo agora. Tente de novo.', true);
      if (btn) btn.disabled = false;
      return null;
    }
  }

  // ------------------------------------------------------------------ topo
  function renderHero() {
    $('#pjTitle').textContent = W.name;
    document.title = `${W.name} · Espaço do projeto — match.IA`;
    const other = isArchitect() ? W.client : W.architect;
    $('#pjPeople').innerHTML = `${isArchitect() ? 'Cliente' : 'Arquiteto(a)'}: <strong>${esc(other?.name || '—')}</strong> · <a href="dashboard.html#mensagens">Conversar</a>${W.contractId ? ` · <a href="contrato.html?id=${esc(W.contractId)}">Contrato assinado</a>` : ''}`;
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
    return `<span>Honorários: ${v} (cobrados ao aprovar)</span>`;
  }

  function feeAction(st) {
    if (st.feeStatus !== 'due') return '';
    if (isArchitect()) return `<p class="pj-muted">Cobrança de ${money(st.fee)} aberta desde ${fmtDate(st.feeDueAt)} — aguardando o pagamento do cliente.</p>`;
    return `
      <div class="pj-fee-due">
        <p><strong>Honorários desta etapa: ${money(st.fee)}</strong><br><span class="pj-muted">Pagamento simulado — projeto acadêmico, nenhum valor é cobrado de verdade.</span></p>
        <button type="button" class="btn btn-primary btn-sm" data-act="pay" data-key="${st.key}">Pagar ${money(st.fee)}</button>
      </div>`;
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
            <label class="is-wide">Observação<input data-field="note" maxlength="300" value="${esc(it.note)}" placeholder="Acabamento, cor, onde usar…"></label>
          </div>
          <button type="button" class="pj-link pj-danger" data-act="remove-item" data-id="${it.id}">Tirar da biblioteca</button>`
          : `${it.note ? `<p class="pj-muted">${esc(it.note)}</p>` : ''}<span class="pj-muted">${it.quantity} ${esc(it.unit || 'un')}</span>`}
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

  function renderObra() {
    $('#pjPanelObra').innerHTML = crewHtml() + diaryHtml();
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

  // ------------------------------------------------------------------ geral
  function render() {
    renderHero();
    renderStages();
    renderFiles();
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

    if (act === 'stage') {
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
      if (!confirm(`Registrar o pagamento de ${money(st.fee)} dos honorários de "${st.name}"? (simulação — nada é cobrado)`)) return;
      await run(btn, () => API.workspacePayFee(W.id, btn.dataset.key), 'Pagamento registrado.');
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
    if (kind === 'target') {
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
      btn.disabled = true;
      btn.textContent = files.length ? 'Enviando fotos…' : 'Registrando…';
      try {
        const ids = [];
        for (const f of files) {
          if (f.size > W.storage.fileMax) throw new Error(`${f.name}: foto grande demais (máximo 15 MB).`);
          ids.push((await API.workspaceUpload(W.id, f, '', 'diary')).uploaded);
        }
        W = await API.workspaceAddDiary(W.id, { date: `${$('#pjDiaryDate').value}T12:00:00Z`, text: $('#pjDiaryText').value, files: ids });
        render();
        flash('Registro adicionado ao diário de obra.');
      } catch (err) {
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
    } catch (err) {
      if (err?.status === 401) { location.replace('login.html'); return; }
      state.innerHTML = `${esc(err?.message || 'Não foi possível abrir o projeto.')} <a href="dashboard.html">Voltar ao painel</a>`;
      return;
    }
    const hash = location.hash.replace('#', '');
    if (['etapas', 'arquivos', 'biblioteca', 'compras', 'obra', 'historico'].includes(hash)) tab = hash;
    state.hidden = true;
    app.hidden = false;
    render();
    if (isArchitect()) {
      API.workspaceTemplates().then((t) => { templates = t; renderStages(); }).catch(() => {});
      API.architectProjects().then((list) => { otherProjects = list.filter((p) => String(p._id) !== W.id); renderLibrary(); }).catch(() => {});
    }
  }
  boot();
})();
