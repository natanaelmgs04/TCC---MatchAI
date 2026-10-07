/**
 * contrato.html — proposta e contrato de um pedido de contratação.
 *   ?hire=<id>  arquiteto monta a proposta (modelo de etapas, prazos,
 *               honorários, escopo) e assina digitando o nome.
 *   ?id=<id>    os dois leem o documento; o cliente assina (nome + "li e
 *               concordo") ou pede mudanças. Assinado, o projeto começa no
 *               Espaço do projeto com as etapas do contrato.
 */
(() => {
  const API = MatchAPI;
  const qs = new URLSearchParams(location.search);
  const state = document.getElementById('ctState');
  const app = document.getElementById('ctApp');
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = (n) => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const when = (iso) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const isId = (v) => /^[a-f\d]{24}$/i.test(v || '');

  function fail(msg) {
    state.hidden = false;
    state.innerHTML = `${esc(msg)} <a href="dashboard.html">Voltar ao painel</a>`;
    app.hidden = true;
  }

  // ------------------------------------------------------------------ montar (arquiteto)
  async function compose(hireId) {
    let d;
    try { d = await API.proposalDraft(hireId); } catch (err) { if (err.status === 401) return location.replace('login.html'); return fail(err.message); }
    if (d.hire.status !== 'pending') return fail('Este pedido de contratação já foi respondido.');
    const base = d.last?.stages?.length ? d.last.stages : d.templates[0].stages;
    let rows = base.map((s) => ({ name: s.name, weeks: s.weeks, fee: s.fee || 0, closesDesign: !!s.closesDesign }));
    const p = d.project || {};
    const about = [p.propertyType && String(p.propertyType).toLowerCase(), p.areaM2 && `${p.areaM2} m²`].filter(Boolean).join(', ');
    const scopeHint = d.last?.scope || `Projeto "${p.name}"${about ? ` (${about})` : ''}: levantamento, estudo e anteprojeto para aprovação do cliente, projeto executivo com detalhamento e acompanhamento da obra.${p.projectGoals ? ` Objetivos do cliente: ${p.projectGoals}` : ''}`;

    app.innerHTML = `
      <header class="ct-head">
        <span class="eyebrow">Proposta${d.last ? ` · nova versão (a anterior ficou ${d.last.status === 'declined' ? 'recusada' : 'substituída'})` : ''}</span>
        <h1>${esc(p.name || 'Projeto')}</h1>
        <p class="ct-muted">Para ${esc(d.client.name)}. Quando o cliente assinar, a contratação fecha e o Espaço do projeto começa com estas etapas, prazos e honorários.</p>
      </header>
      <form class="ct-card ct-form" id="ctForm" novalidate>
        <div class="ct-row">
          <label for="ctTemplate">Modelo de etapas</label>
          <select id="ctTemplate">${d.templates.map((t, i) => `<option value="${i}">${esc(t.name)}</option>`).join('')}</select>
        </div>
        <fieldset class="ct-stages">
          <legend>Etapas, prazos e honorários</legend>
          <div class="ct-stage-head" aria-hidden="true"><span>Etapa</span><span>Semanas</span><span>Honorários (R$)</span><span>Fecha o projeto</span><span></span></div>
          <ol id="ctRows"></ol>
          <div class="ct-stage-foot">
            <button type="button" class="btn btn-secondary btn-sm" id="ctAdd">+ Etapa</button>
            <p>Total: <strong id="ctTotal">—</strong> · meta: <strong id="ctWeeks">—</strong></p>
          </div>
        </fieldset>
        <div class="ct-row">
          <label for="ctScope">Escopo do trabalho</label>
          <textarea id="ctScope" rows="5" maxlength="3000" required>${esc(scopeHint)}</textarea>
        </div>
        <div class="ct-grid">
          <div class="ct-row">
            <label for="ctPay">Forma de pagamento</label>
            <input id="ctPay" maxlength="600" value="${esc(d.last?.paymentTerms || 'Honorários de cada etapa pagos na aprovação da etapa, por Pix ou transferência.')}">
          </div>
          <div class="ct-row">
            <label for="ctValid">Validade da proposta (dias)</label>
            <input id="ctValid" type="number" min="1" max="60" value="15">
          </div>
        </div>
        <div class="ct-sign">
          <label for="ctSignName">Assinatura: digite seu nome completo (<strong>${esc(d.architectName)}</strong>)</label>
          <input id="ctSignName" autocomplete="name" maxlength="120" placeholder="${esc(d.architectName)}" required>
          <p class="ct-muted">Assinatura eletrônica simples: ficam registrados a data, a hora e o código de verificação do documento.</p>
        </div>
        <p class="ct-error" id="ctError" role="alert"></p>
        <div class="ct-actions">
          <a class="btn btn-secondary" href="dashboard.html#contratacoes">Cancelar</a>
          <button type="submit" class="btn btn-primary">Assinar e enviar ao cliente</button>
        </div>
      </form>`;

    const list = document.getElementById('ctRows');
    const paintRows = () => {
      list.innerHTML = rows.map((r, i) => `
        <li data-i="${i}">
          <label class="sr-only" for="n${i}">Nome da etapa ${i + 1}</label>
          <input id="n${i}" data-f="name" maxlength="60" value="${esc(r.name)}" required>
          <label class="sr-only" for="w${i}">Semanas da etapa ${i + 1}</label>
          <input id="w${i}" data-f="weeks" type="number" min="0" max="52" value="${r.weeks}">
          <label class="sr-only" for="f${i}">Honorários da etapa ${i + 1}, em reais</label>
          <input id="f${i}" data-f="fee" type="number" min="0" step="0.01" value="${r.fee || ''}" placeholder="0,00">
          <label class="ct-close"><input type="radio" name="closes" data-f="closesDesign" ${r.closesDesign ? 'checked' : ''}><span class="sr-only">A etapa ${i + 1} fecha o projeto</span></label>
          <button type="button" class="ct-x" data-remove="${i}" aria-label="Remover etapa ${i + 1}" ${rows.length <= 2 ? 'disabled' : ''}>✕</button>
        </li>`).join('');
      paintTotals();
    };
    const paintTotals = () => {
      const total = rows.reduce((t, r) => t + (Number(r.fee) || 0), 0);
      let last = rows.findIndex((r) => r.closesDesign);
      if (last < 0) last = rows.length - 1;
      const weeks = rows.slice(0, last + 1).reduce((t, r) => t + (Number(r.weeks) || 0), 0);
      document.getElementById('ctTotal').textContent = money(total);
      document.getElementById('ctWeeks').textContent = `${weeks} semanas até "${rows[last]?.name || ''}"`;
    };
    paintRows();
    list.addEventListener('input', (e) => {
      const li = e.target.closest('[data-i]');
      const f = e.target.dataset.f;
      if (!li || !f) return;
      const i = Number(li.dataset.i);
      if (f === 'closesDesign') rows.forEach((r, j) => { r.closesDesign = j === i; });
      else rows[i][f] = f === 'name' ? e.target.value : Number(e.target.value) || 0;
      paintTotals(); // só os totais: redesenhar as linhas tiraria o cursor do campo
    });
    list.addEventListener('click', (e) => {
      const b = e.target.closest('[data-remove]');
      if (!b || rows.length <= 2) return;
      rows.splice(Number(b.dataset.remove), 1);
      paintRows();
    });
    document.getElementById('ctAdd').addEventListener('click', () => {
      if (rows.length >= 10) return;
      rows.splice(rows.length - 1, 0, { name: 'Nova etapa', weeks: 2, fee: 0, closesDesign: false });
      paintRows();
    });
    document.getElementById('ctTemplate').addEventListener('change', (e) => {
      const t = d.templates[Number(e.target.value)];
      rows = t.stages.map((s) => ({ name: s.name, weeks: s.weeks, fee: 0, closesDesign: !!s.closesDesign }));
      paintRows();
    });
    document.getElementById('ctForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = e.target.querySelector('[type="submit"]');
      const err = document.getElementById('ctError');
      btn.disabled = true;
      err.textContent = '';
      try {
        const created = await API.createProposal({
          hireId,
          stages: rows,
          scope: document.getElementById('ctScope').value,
          paymentTerms: document.getElementById('ctPay').value,
          validDays: document.getElementById('ctValid').value,
          signatureName: document.getElementById('ctSignName').value,
        });
        location.replace(`contrato.html?id=${created.id}`);
      } catch (ex) {
        err.textContent = ex.message || 'Não foi possível enviar a proposta.';
        btn.disabled = false;
      }
    });
    state.hidden = true;
    app.hidden = false;
  }

  // ------------------------------------------------------------------ ler e assinar
  function documentHtml(p) {
    const d = p.document;
    const sig = (label, s, who) => `
      <div class="ct-sig ${s ? 'is-signed' : ''}">
        <span class="ct-sig-label">${label}</span>
        ${s ? `<strong class="ct-sig-name">${esc(s.name)}</strong><span>Assinado em ${when(s.at)}</span>` : `<strong class="ct-sig-name is-empty">${esc(who)}</strong><span>Aguardando assinatura</span>`}
      </div>`;
    return `
      <article class="ct-card ct-doc">
        <header>
          <p class="ct-doc-kicker">match.IA · versão ${d.version}</p>
          <h1>${esc(d.title)}</h1>
        </header>
        <section><h2>Partes</h2>
          <p><strong>CONTRATANTE:</strong> ${esc(d.parties.contratante)}<br><strong>CONTRATADO(A):</strong> ${esc(d.parties.contratado)}, arquiteto(a)</p></section>
        <section><h2>Objeto</h2><p>${esc(d.object)}</p></section>
        <section><h2>Escopo</h2><p class="ct-pre">${esc(d.scope)}</p></section>
        <section><h2>Etapas, prazos e honorários</h2>
          <div class="ct-table-wrap"><table class="ct-table">
            <thead><tr><th>#</th><th>Etapa</th><th>Prazo</th><th>Honorários</th></tr></thead>
            <tbody>${d.stages.map((s) => `<tr><td>${s.n}</td><td>${esc(s.name)}${s.closesDesign ? ' <span class="ct-tag">fecha o projeto</span>' : ''}</td><td>${s.weeks ? `${s.weeks} sem.` : 'sem prazo fixo'}</td><td>${money(s.fee)}</td></tr>`).join('')}</tbody>
            <tfoot><tr><td></td><td colspan="2">Total</td><td>${esc(d.totalText)}</td></tr></tfoot>
          </table></div></section>
        <section><h2>Pagamento</h2><p>${esc(d.paymentTerms)}</p></section>
        <section><h2>Condições</h2><ol class="ct-clauses">${d.clauses.map((c) => `<li>${esc(c)}</li>`).join('')}</ol></section>
        <p class="ct-muted">Proposta válida até ${new Date(`${d.validUntil}T12:00:00Z`).toLocaleDateString('pt-BR')}.</p>
        <section class="ct-sigs">${sig('Contratado(a)', p.architectSignature, p.names.architect)}${sig('Contratante', p.clientSignature, p.names.client)}</section>
        <p class="ct-hash">Código de verificação do documento (SHA-256): <code>${esc(p.documentHash)}</code></p>
      </article>`;
  }

  function statusBanner(p) {
    if (p.status === 'signed') return `<div class="ct-banner is-ok"><strong>Contrato assinado pelas duas partes.</strong> O projeto já começou no Espaço do projeto. <a class="btn btn-primary btn-sm" href="projeto.html?id=${esc(p.project)}">Abrir espaço do projeto</a></div>`;
    if (p.status === 'declined') return `<div class="ct-banner is-warn"><strong>O cliente pediu mudanças:</strong> “${esc(p.declinedReason)}”${p.role === 'architect' ? ` <a class="btn btn-primary btn-sm" href="contrato.html?hire=${esc(p.hire)}">Enviar nova versão</a>` : ' O arquiteto pode enviar uma nova versão.'}</div>`;
    if (p.status === 'cancelled') return '<div class="ct-banner">Esta versão foi substituída por uma proposta mais nova.</div>';
    if (p.expired) return `<div class="ct-banner is-warn"><strong>A proposta venceu.</strong>${p.role === 'architect' ? ` <a class="btn btn-primary btn-sm" href="contrato.html?hire=${esc(p.hire)}">Enviar nova versão</a>` : ' Peça ao arquiteto uma nova versão.'}</div>`;
    return p.role === 'architect' ? '<div class="ct-banner">Proposta enviada. Você recebe um aviso quando o cliente assinar ou pedir mudanças.</div>' : '';
  }

  function signHtml(p) {
    if (p.role !== 'client' || p.status !== 'sent' || p.expired) return '';
    return `
      <section class="ct-card ct-actions-card">
        <form id="ctSignForm" novalidate>
          <h2>Assinar o contrato</h2>
          <label class="ct-agree"><input type="checkbox" id="ctAgree"> Li a proposta inteira e concordo com o escopo, as etapas, os prazos e os honorários.</label>
          <label for="ctClientName">Digite seu nome completo (<strong>${esc(p.names.client)}</strong>)</label>
          <input id="ctClientName" autocomplete="name" maxlength="120" placeholder="${esc(p.names.client)}">
          <p class="ct-error" id="ctSignError" role="alert"></p>
          <button type="submit" class="btn btn-primary">Assinar e fechar a contratação</button>
        </form>
        <details class="ct-decline">
          <summary>Não concordo com algo — pedir mudanças</summary>
          <form id="ctDeclineForm" novalidate>
            <label for="ctReason" class="sr-only">O que mudar</label>
            <textarea id="ctReason" rows="3" maxlength="600" placeholder="Ex.: o prazo do anteprojeto está curto; prefiro pagar em duas vezes."></textarea>
            <button type="submit" class="btn btn-secondary btn-sm">Enviar pedido de mudança</button>
          </form>
        </details>
      </section>`;
  }

  async function view(id) {
    let p;
    try { p = await API.proposal(id); } catch (err) { if (err.status === 401) return location.replace('login.html'); return fail(err.message); }
    const paint = () => {
      document.title = `${p.document.title} — match.IA`;
      app.innerHTML = `
        <div class="ct-toolbar"><a href="dashboard.html#${p.role === 'architect' ? 'contratacoes' : 'projeto'}" class="ct-back">← Painel</a><button type="button" class="btn btn-secondary btn-sm" id="ctPrint">Imprimir / PDF</button></div>
        ${statusBanner(p)}
        ${documentHtml(p)}
        ${signHtml(p)}`;
      document.getElementById('ctPrint').addEventListener('click', () => window.print());
      document.getElementById('ctSignForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = e.target.querySelector('[type="submit"]');
        const err = document.getElementById('ctSignError');
        btn.disabled = true;
        err.textContent = '';
        try {
          p = await API.signProposal(id, { agree: document.getElementById('ctAgree').checked, signatureName: document.getElementById('ctClientName').value });
          paint();
          window.scrollTo({ top: 0, behavior: 'smooth' });
        } catch (ex) { err.textContent = ex.message; btn.disabled = false; }
      });
      document.getElementById('ctDeclineForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
          p = await API.declineProposal(id, document.getElementById('ctReason').value);
          paint();
        } catch (ex) { document.getElementById('ctSignError').textContent = ex.message; }
      });
    };
    paint();
    state.hidden = true;
    app.hidden = false;
  }

  if (!API.token() || !API.currentUser()) location.replace('login.html');
  else if (isId(qs.get('id'))) view(qs.get('id'));
  else if (isId(qs.get('hire'))) compose(qs.get('hire'));
  else fail('Proposta não encontrada.');
})();
