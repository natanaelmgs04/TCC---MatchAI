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
    $('#pjPeople').innerHTML = `${isArchitect() ? 'Cliente' : 'Arquiteto(a)'}: <strong>${esc(other?.name || '—')}</strong> · <a href="dashboard.html#mensagens">Conversar</a>`;
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

  function renderStages() {
    const filesBy = (key) => W.files.filter((f) => f.stage === key).length;
    $('#pjPanelEtapas').innerHTML = `
      <div class="pj-card pj-target">
        <div>
          <h2>Meta: projeto fechado em ${fmtDate(W.targetDate)}</h2>
          <p class="pj-muted">O padrão soma 12 semanas até o projeto executivo (3 meses). Cada etapa só avança com a aprovação do cliente, e cada pedido de ajuste fica registrado no histórico.</p>
        </div>
        ${isArchitect() ? `
        <form class="pj-inline" data-form="target">
          <label for="pjTarget">Mudar a meta</label>
          <input type="date" id="pjTarget" value="${inputDate(W.targetDate)}" required>
          <button type="submit" class="btn btn-secondary btn-sm">Salvar</button>
        </form>` : ''}
      </div>
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
                  ${n ? `<button type="button" class="pj-link" data-act="goto-files" data-key="${st.key}">${n} ${n === 1 ? 'arquivo' : 'arquivos'}</button>` : ''}
                </p>
              </div>
            </div>
            ${stageActions(st)}
            ${isArchitect() ? `
            <details class="pj-edit">
              <summary>Ajustar nome e prazo</summary>
              <form class="pj-inline" data-form="stage" data-key="${st.key}">
                <label class="sr-only" for="sn-${st.key}">Nome da etapa</label>
                <input id="sn-${st.key}" name="name" maxlength="60" value="${esc(st.name)}">
                <label class="sr-only" for="sd-${st.key}">Prazo</label>
                <input type="date" id="sd-${st.key}" name="dueDate" value="${inputDate(st.dueDate)}">
                <button type="submit" class="btn btn-secondary btn-sm">Salvar</button>
              </form>
            </details>` : ''}
          </li>`;
        }).join('')}
      </ol>`;
  }

  // ------------------------------------------------------------------ arquivos
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
            ${PREVIEW.has(f.ext) ? `<button type="button" class="btn btn-tertiary btn-sm" data-act="view" data-id="${f.id}">Ver</button>` : ''}
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
                  <td>${it.purchaseUrl ? `<a href="${esc(it.purchaseUrl)}" target="_blank" rel="noopener noreferrer">Comprar</a>` : ''}</td>
                </tr>`).join('')}</tbody>
            </table>
          </div>
        </section>`;
      }).join('')}` : `<p class="pj-empty">A lista de compras sai da biblioteca do projeto. ${isArchitect() ? 'Adicione itens na aba Biblioteca.' : 'Assim que o arquiteto montar a biblioteca, os itens aparecem aqui, separados por loja e com o total estimado.'}</p>`;
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
    } else if (act === 'goto-files') {
      showTab('arquivos');
      document.getElementById(`files-${btn.dataset.key}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
    } else if (kind === 'stage') {
      const d = form.elements.dueDate.value;
      await run(btn, () => API.workspaceUpdateStage(W.id, form.dataset.key, { name: form.elements.name.value, dueDate: d ? `${d}T12:00:00Z` : null }), 'Etapa atualizada.');
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
    if (['etapas', 'arquivos', 'biblioteca', 'compras', 'historico'].includes(hash)) tab = hash;
    state.hidden = true;
    app.hidden = false;
    render();
    if (isArchitect()) {
      API.architectProjects().then((list) => { otherProjects = list.filter((p) => String(p._id) !== W.id); renderLibrary(); }).catch(() => {});
    }
  }
  boot();
})();
