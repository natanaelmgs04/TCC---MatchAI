/**
 * briefing.html — briefing do arquiteto (programa de necessidades).
 *   sem ?id    o arquiteto monta o próprio questionário (vale para os próximos envios).
 *   ?id=<id>   o cliente responde; depois, os dois leem as respostas.
 * O envio para o cliente sai do pedido de contratação (Painel → Contratações).
 */
(() => {
  const API = MatchAPI;
  const qs = new URLSearchParams(location.search);
  const state = document.getElementById('bfState');
  const app = document.getElementById('bfApp');
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const when = (iso) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const TYPES = { text: 'Resposta livre', choice: 'Uma opção', multi: 'Várias opções' };

  function fail(msg) {
    state.hidden = false;
    state.innerHTML = `${esc(msg)} <a href="dashboard.html">Voltar ao painel</a>`;
    app.hidden = true;
  }
  const show = () => { state.hidden = true; app.hidden = false; };

  // ------------------------------------------------------------------ montar o modelo (arquiteto)
  async function editor() {
    let t;
    try { t = await API.briefingTemplate(); } catch (err) { if (err.status === 401) return location.replace('login.html'); return fail(err.message); }
    let list = t.questions.map((q) => ({ ...q, options: q.options || [] }));
    let isDefault = t.isDefault;

    const row = (q, i) => `
      <li class="bf-q" data-i="${i}">
        <div class="bf-q-top">
          <span class="bf-n" aria-hidden="true">${i + 1}</span>
          <label class="sr-only" for="bq-${i}">Pergunta ${i + 1}</label>
          <input id="bq-${i}" data-f="text" maxlength="200" value="${esc(q.text)}" placeholder="Escreva a pergunta">
          <div class="bf-q-tools">
            <button type="button" class="ct-x" data-move="-1" aria-label="Subir a pergunta ${i + 1}" ${i === 0 ? 'disabled' : ''}>↑</button>
            <button type="button" class="ct-x" data-move="1" aria-label="Descer a pergunta ${i + 1}" ${i === list.length - 1 ? 'disabled' : ''}>↓</button>
            <button type="button" class="ct-x" data-remove aria-label="Apagar a pergunta ${i + 1}" ${list.length <= 3 ? 'disabled' : ''}>×</button>
          </div>
        </div>
        <div class="bf-q-opts">
          <label>Tipo <select data-f="type">${Object.entries(TYPES).map(([k, v]) => `<option value="${k}" ${q.type === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
          <label class="bf-check"><input type="checkbox" data-f="required" ${q.required ? 'checked' : ''}> Obrigatória</label>
          ${q.type !== 'text' ? `<label class="bf-wide">Opções (uma por linha)<textarea data-f="options" rows="3">${esc(q.options.join('\n'))}</textarea></label>` : ''}
        </div>
      </li>`;

    const paint = () => {
      app.innerHTML = `
        <header class="ct-head">
          <span class="eyebrow">Meu briefing${isDefault ? ' · usando o modelo padrão da match.IA' : ''}</span>
          <h1>Programa de necessidades</h1>
          <p class="ct-muted">As perguntas que você manda ao cliente antes da proposta. Elas são copiadas no envio: mudar aqui vale para os próximos clientes. As respostas aparecem na proposta, no Espaço do projeto e no seu assistente de IA.</p>
        </header>
        <form class="ct-card ct-form" id="bfForm" novalidate>
          <ol class="bf-list">${list.map(row).join('')}</ol>
          <div class="ct-stage-foot">
            <button type="button" class="btn btn-secondary btn-sm" id="bfAdd" ${list.length >= 25 ? 'disabled' : ''}>+ Pergunta</button>
            <p class="ct-muted">${list.length} de até 25 perguntas</p>
          </div>
          <p class="ct-error" id="bfError" role="alert"></p>
          <div class="ct-actions">
            ${!isDefault ? '<button type="button" class="btn btn-tertiary btn-sm" id="bfReset">Voltar ao modelo padrão</button>' : ''}
            <button type="submit" class="btn btn-primary">Salvar meu briefing</button>
          </div>
          <p class="ct-muted" id="bfSaved" role="status"></p>
        </form>`;
    };

    const read = () => {
      app.querySelectorAll('.bf-q').forEach((li) => {
        const q = list[Number(li.dataset.i)];
        q.text = li.querySelector('[data-f="text"]').value;
        q.type = li.querySelector('[data-f="type"]').value;
        q.required = li.querySelector('[data-f="required"]').checked;
        const opts = li.querySelector('[data-f="options"]');
        if (opts) q.options = opts.value.split('\n').map((o) => o.trim()).filter(Boolean);
      });
    };

    app.addEventListener('change', (e) => {
      if (e.target.matches('[data-f="type"]')) { read(); paint(); }
    });
    app.addEventListener('click', async (e) => {
      const li = e.target.closest('.bf-q');
      if (e.target.closest('#bfAdd')) {
        read();
        list.push({ text: '', type: 'text', required: false, options: [] });
        paint();
        app.querySelector(`#bq-${list.length - 1}`)?.focus();
      } else if (li && e.target.closest('[data-move]')) {
        read();
        const i = Number(li.dataset.i);
        const j = i + Number(e.target.closest('[data-move]').dataset.move);
        [list[i], list[j]] = [list[j], list[i]];
        paint();
      } else if (li && e.target.closest('[data-remove]')) {
        read();
        list.splice(Number(li.dataset.i), 1);
        paint();
      } else if (e.target.closest('#bfReset')) {
        if (!confirm('Voltar às perguntas padrão da match.IA? As suas perguntas personalizadas serão descartadas.')) return;
        const r = await API.resetBriefingTemplate();
        list = r.questions.map((q) => ({ ...q, options: q.options || [] }));
        isDefault = true;
        paint();
      }
    });
    app.addEventListener('submit', async (e) => {
      e.preventDefault();
      read();
      const err = app.querySelector('#bfError');
      err.textContent = '';
      try {
        const r = await API.saveBriefingTemplate(list.filter((q) => q.text.trim()));
        list = r.questions.map((q) => ({ ...q, options: q.options || [] }));
        isDefault = false;
        paint();
        app.querySelector('#bfSaved').textContent = 'Salvo. Os próximos briefings que você enviar já saem com estas perguntas.';
      } catch (ex) { err.textContent = ex.message; }
    });
    paint();
    show();
  }

  // ------------------------------------------------------------------ responder / ler
  function answersHtml(b) {
    return `<dl class="bf-answers">${b.questions.map((q) => {
      const v = b.answers[q.id];
      const text = Array.isArray(v) ? v.join(', ') : v;
      return `<div><dt>${esc(q.text)}</dt><dd>${text ? esc(text) : '<span class="ct-muted">sem resposta</span>'}</dd></div>`;
    }).join('')}</dl>`;
  }

  function fieldHtml(q, i) {
    const req = q.required ? ' <span class="bf-req" aria-hidden="true">*</span>' : '';
    if (q.type === 'text') return `
      <div class="ct-row">
        <label for="ba-${i}">${esc(q.text)}${req}</label>
        <textarea id="ba-${i}" data-q="${esc(q.id)}" rows="3" maxlength="1500" ${q.required ? 'required' : ''}></textarea>
      </div>`;
    const type = q.type === 'choice' ? 'radio' : 'checkbox';
    return `
      <fieldset class="bf-choices" data-q="${esc(q.id)}" data-type="${q.type}">
        <legend>${esc(q.text)}${req}</legend>
        ${q.options.map((o, j) => `<label class="bf-chip"><input type="${type}" name="ba-${i}" value="${esc(o)}" id="ba-${i}-${j}"> <span>${esc(o)}</span></label>`).join('')}
      </fieldset>`;
  }

  async function view(id) {
    let b;
    try { b = await API.briefing(id); } catch (err) { if (err.status === 401) return location.replace('login.html'); return fail(err.message); }
    const head = `
      <header class="ct-head">
        <span class="eyebrow">Briefing · ${esc(b.project.name)}</span>
        <h1>${b.role === 'client' && b.status === 'sent' ? `${esc(b.names.architect.split(' ')[0])} quer conhecer o seu projeto` : 'Programa de necessidades'}</h1>
        <p class="ct-muted">${b.role === 'client' ? `Enviado por ${esc(b.names.architect)} em ${when(b.sentAt)}.` : `Enviado para ${esc(b.names.client)} em ${when(b.sentAt)}.`}${b.answeredAt ? ` Respondido em ${when(b.answeredAt)}.` : ''}</p>
      </header>
      ${b.message ? `<blockquote class="bf-message">“${esc(b.message)}”</blockquote>` : ''}`;

    if (b.status === 'answered') {
      app.innerHTML = `${head}
        <div class="ct-banner is-ok"><strong>Briefing respondido.</strong> ${b.role === 'architect' ? 'As respostas já aparecem na hora de montar a proposta e no seu assistente de IA.' : 'O arquiteto já recebeu as suas respostas.'}</div>
        <section class="ct-card">${answersHtml(b)}</section>
        <p class="ct-actions" style="margin-top:16px">${b.role === 'architect' ? `<a class="btn btn-primary" href="contrato.html?hire=${esc(b.hire)}">Montar a proposta</a>` : '<a class="btn btn-secondary" href="dashboard.html">Voltar ao painel</a>'}</p>`;
      return show();
    }
    if (b.role === 'architect') {
      app.innerHTML = `${head}
        <div class="ct-banner">Aguardando as respostas de ${esc(b.names.client)} — você recebe um aviso quando ele responder.</div>
        <section class="ct-card"><ol class="bf-preview">${b.questions.map((q) => `<li>${esc(q.text)}${q.required ? ' <span class="bf-req">*</span>' : ''}${q.options?.length ? `<small>${esc(q.options.join(' · '))}</small>` : ''}</li>`).join('')}</ol></section>`;
      return show();
    }
    app.innerHTML = `${head}
      <form class="ct-card ct-form" id="bfAnswer" novalidate>
        <p class="ct-muted">Responda com calma — quanto mais o arquiteto entender da sua rotina, mais certeira sai a proposta. Campos com * são obrigatórios.</p>
        ${b.questions.map(fieldHtml).join('')}
        <p class="ct-error" id="bfError" role="alert"></p>
        <div class="ct-actions"><button type="submit" class="btn btn-primary">Enviar respostas</button></div>
      </form>`;
    app.querySelector('#bfAnswer').addEventListener('submit', async (e) => {
      e.preventDefault();
      const answers = {};
      app.querySelectorAll('[data-q]').forEach((el) => {
        if (el.tagName === 'TEXTAREA') answers[el.dataset.q] = el.value;
        else if (el.dataset.type === 'choice') answers[el.dataset.q] = el.querySelector('input:checked')?.value || '';
        else answers[el.dataset.q] = [...el.querySelectorAll('input:checked')].map((x) => x.value);
      });
      const btn = e.target.querySelector('[type="submit"]');
      btn.disabled = true;
      try {
        await API.answerBriefing(b.id, answers);
        view(b.id);
      } catch (err) {
        app.querySelector('#bfError').textContent = err.message;
        btn.disabled = false;
      }
    });
    show();
  }

  if (!API.token() || !API.currentUser()) { location.replace('login.html'); return; }
  const id = qs.get('id');
  if (id && /^[a-f\d]{24}$/i.test(id)) view(id);
  else if (API.currentUser().role === 'architect') editor();
  else fail('Briefing não encontrado.');
})();
