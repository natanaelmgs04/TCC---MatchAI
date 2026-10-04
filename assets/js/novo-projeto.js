/**
 * "Novo projeto" em página cheia (novo-projeto.html): substitui a gaveta lateral
 * na hora de CRIAR um projeto (editar continua na gaveta do painel). Quatro
 * etapas — o básico, o estilo, referências por imagem e a ponte para a
 * experiência 3D. Tudo fica num rascunho (project-draft.js) até o cliente
 * criar o projeto, aqui ou ao final da experiência 3D.
 */
document.addEventListener('DOMContentLoaded', () => {
  const user = MatchAPI.currentUser();
  if (!MatchAPI.token() || !user) { location.href = 'login.html'; return; }
  if (user.role !== 'client') { location.href = 'dashboard.html'; return; }

  const FEELINGS = ['Aconchego', 'Leveza', 'Calma', 'Sofisticação', 'Energia', 'Natureza por perto', 'Praticidade'];
  const QUESTIONS = window.MatchStyleQuestions;
  const STEPS = 4;
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (id) => document.getElementById(id);

  const draft = MatchProjectDraft.load();
  let step = 0;
  let qIndex = 0;

  // ---------- Etapa 1: o básico ----------
  const fields = { name: 'npName', areaM2: 'npArea', city: 'npCity', state: 'npState', budgetMin: 'npBudgetMin', budgetMax: 'npBudgetMax', preferredMaterials: 'npMaterials', projectGoals: 'npGoals', familySize: 'npFamily' };
  Object.entries(fields).forEach(([key, id]) => {
    const el = $(id);
    if (draft.basics[key] != null) el.value = draft.basics[key];
    el.addEventListener('input', () => { draft.basics[key] = el.value; persist(); });
  });

  // Tipo de imóvel: lista + "Outro…" com campo livre.
  const propertyType = MatchChipOther.select($('npPropertyType'), $('npPropertyTypeOther'), {
    onChange: (value) => { draft.basics.propertyType = value; persist(); },
  });
  if (draft.basics.propertyType) propertyType.set(draft.basics.propertyType);
  else draft.basics.propertyType = propertyType.get();

  const stylesBox = $('npStyles');
  stylesBox.innerHTML = MatchProjectStyles.list.map((s) =>
    `<button type="button" class="chip has-thumb${draft.basics.preferredStyles?.includes(s) ? ' active' : ''}" data-style="${s}" aria-pressed="${draft.basics.preferredStyles?.includes(s) ? 'true' : 'false'}"><img class="chip-thumb" src="${MatchProjectStyles.thumbs[s]}" alt="" loading="lazy">${s}</button>`
  ).join('');
  stylesBox.addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    const on = chip.classList.toggle('active');
    chip.setAttribute('aria-pressed', String(on));
    syncStyles();
  });
  function syncStyles() {
    draft.basics.preferredStyles = [...stylesBox.querySelectorAll('.chip.active')].map((c) => c.dataset.style);
    persist();
  }
  MatchChipOther.attach(stylesBox, { dataKey: 'style', initial: draft.basics.preferredStyles || [], onChange: syncStyles, placeholder: 'Ex.: Japandi, Boho…' });

  // ---------- Etapa 2: estilo ----------
  $('npNotes').value = draft.styleNotes || '';
  $('npNotes').addEventListener('input', (e) => { draft.styleNotes = e.target.value; persist(); });
  const feelingsBox = $('npFeelings');
  feelingsBox.innerHTML = FEELINGS.map((f) => `<button type="button" class="chip${draft.feelings.includes(f) ? ' active' : ''}" data-feeling="${f}" aria-pressed="${draft.feelings.includes(f)}">${f}</button>`).join('');
  feelingsBox.addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    const on = chip.classList.toggle('active');
    chip.setAttribute('aria-pressed', String(on));
    syncFeelings();
  });
  function syncFeelings() {
    draft.feelings = [...feelingsBox.querySelectorAll('.chip.active')].map((c) => c.dataset.feeling);
    persist();
  }
  MatchChipOther.attach(feelingsBox, { dataKey: 'feeling', initial: draft.feelings || [], onChange: syncFeelings, placeholder: 'Ex.: Liberdade, Silêncio…' });

  // ---------- Etapa 3: referências por imagem ----------
  const choices = $('npChoices');
  const dots = $('npQuizDots');
  dots.innerHTML = QUESTIONS.map(() => '<i></i>').join('');

  function renderQuestion(direction = 1) {
    const q = QUESTIONS[qIndex];
    $('npQuizCount').textContent = `${qIndex + 1} de ${QUESTIONS.length}`;
    $('npQuestion').textContent = q.question;
    $('npQuizHint').textContent = q.hint;
    [...dots.children].forEach((d, i) => { d.classList.toggle('is-done', !!draft.picks[QUESTIONS[i].id]); d.classList.toggle('is-current', i === qIndex); });
    choices.dataset.dir = direction > 0 ? 'next' : 'prev';
    choices.innerHTML = q.options.map((o, i) => {
      const selected = draft.picks[q.id] === o.id;
      return `
        <div class="np-choice${selected ? ' is-selected' : ''}" style="--i:${i}">
          <button type="button" class="np-choice-btn" role="radio" aria-checked="${selected}" data-option="${o.id}" tabindex="${selected || (!draft.picks[q.id] && i === 0) ? 0 : -1}">
            <img src="${o.image}" alt="" loading="${qIndex === 0 ? 'eager' : 'lazy'}" decoding="async">
            <span class="np-choice-label">${o.label}</span>
            <span class="np-choice-check" aria-hidden="true"></span>
          </button>
          <a class="np-choice-credit" href="${o.credit.url}" target="_blank" rel="noopener">Foto: ${o.credit.name} / Unsplash</a>
        </div>`;
    }).join('');
    choices.classList.remove('is-entering');
    void choices.offsetWidth;
    choices.classList.add('is-entering');
    // Pré-carrega as fotos da próxima pergunta enquanto o cliente decide.
    QUESTIONS[qIndex + 1]?.options.forEach((o) => { const im = new Image(); im.src = o.image; });
  }

  function choose(optionId) {
    const q = QUESTIONS[qIndex];
    draft.picks[q.id] = optionId;
    persist();
    choices.querySelectorAll('.np-choice').forEach((c) => {
      const on = c.querySelector('[data-option]').dataset.option === optionId;
      c.classList.toggle('is-selected', on);
      c.querySelector('[role="radio"]').setAttribute('aria-checked', String(on));
    });
    choices.classList.add('has-choice');
    setTimeout(() => { choices.classList.remove('has-choice'); nextQuestion(); }, reduceMotion ? 120 : 520);
  }

  function nextQuestion() {
    if (qIndex < QUESTIONS.length - 1) { qIndex += 1; renderQuestion(1); }
    else goTo(3);
  }

  choices.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-option]');
    if (btn) choose(btn.dataset.option);
  });
  // Setas movem entre as fotos, como num grupo de rádio.
  choices.addEventListener('keydown', (e) => {
    const radios = [...choices.querySelectorAll('[role="radio"]')];
    const i = radios.indexOf(document.activeElement);
    if (i < 0) return;
    const delta = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!delta) return;
    e.preventDefault();
    const next = radios[(i + delta + radios.length) % radios.length];
    radios.forEach((r) => (r.tabIndex = -1));
    next.tabIndex = 0;
    next.focus();
  });
  $('npSkipQuestion').addEventListener('click', nextQuestion);

  // ---------- Etapa 4: ponte para o 3D ----------
  function renderBridge() {
    const picked = MatchProjectDraft.pickedOptions(draft);
    const ranked = MatchProjectDraft.rankStyles([...(draft.basics.preferredStyles || []).map((s) => [s]), ...picked.map((x) => x.o.styles)]);
    $('npBridgeStyles').innerHTML = ranked.length
      ? `<span class="np-bridge-label">Seu estilo até aqui</span>${ranked.slice(0, 4).map((s, i) => `<span class="np-style-pill${i === 0 ? ' is-lead' : ''}">${s}</span>`).join('')}`
      : '';
  }

  $('npGo3d').addEventListener('click', (e) => {
    if (!validateBasics()) { e.preventDefault(); goTo(0); }
    else persist();
  });

  $('npCreateNow').addEventListener('click', async () => {
    if (!validateBasics()) { goTo(0); return; }
    const btn = $('npCreateNow');
    btn.disabled = true; btn.textContent = 'Criando…';
    try {
      await MatchAPI.createProject(MatchProjectDraft.toPayload(draft, null));
      MatchProjectDraft.clear();
      location.href = 'dashboard.html#projeto';
    } catch (err) {
      $('npError3').textContent = err.status === 401
        ? 'Sua sessão expirou. Entre de novo pela página de login — suas respostas ficam salvas nesta aba.'
        : (err.message || 'Não foi possível criar o projeto agora.');
      btn.disabled = false; btn.textContent = 'Criar o projeto sem a experiência';
    }
  });

  // ---------- Navegação entre etapas ----------
  function validateBasics() {
    const ok = Boolean(String(draft.basics.name || '').trim());
    const typeOk = Boolean(propertyType.get());
    $('npName').closest('.form-field').classList.toggle('has-error', !ok);
    $('npPropertyType').closest('.form-field').classList.toggle('has-error', !typeOk);
    $('npError0').textContent = !ok ? 'Dê um nome ao projeto para continuar.' : !typeOk ? 'Escreva qual é o tipo de imóvel (ou escolha um da lista).' : '';
    return ok && typeOk;
  }

  function goTo(next) {
    if (next > step && step === 0 && !validateBasics()) { (String(draft.basics.name || '').trim() ? $('npPropertyTypeOther') : $('npName')).focus(); return; }
    const dir = next > step ? 1 : -1;
    step = Math.max(0, Math.min(STEPS - 1, next));
    document.querySelectorAll('.np-step').forEach((s) => {
      const on = Number(s.dataset.step) === step;
      s.hidden = !on;
      if (on) { s.dataset.dir = dir > 0 ? 'next' : 'prev'; s.classList.remove('is-entering'); void s.offsetWidth; s.classList.add('is-entering'); }
    });
    document.querySelectorAll('[data-step-dot]').forEach((d) => {
      const i = Number(d.dataset.stepDot);
      d.classList.toggle('is-done', i < step);
      d.classList.toggle('is-current', i === step);
      d.toggleAttribute('aria-current', i === step);
    });
    $('npBack').style.visibility = step === 0 ? 'hidden' : 'visible';
    $('npNext').hidden = step >= 2;
    if (step === 2) renderQuestion(dir);
    if (step === 3) renderBridge();
    draft.step = step;
    persist();
    const heading = document.querySelector(`.np-step[data-step="${step}"] h2`);
    heading?.setAttribute('tabindex', '-1');
    heading?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
  }

  $('npNext').addEventListener('click', () => goTo(step + 1));
  $('npBack').addEventListener('click', () => {
    if (step === 2 && qIndex > 0) { qIndex -= 1; renderQuestion(-1); return; }
    goTo(step - 1);
  });

  function persist() { MatchProjectDraft.save(draft); }

  // Voltando da experiência 3D, reabre na última etapa vista.
  const resume = Number(draft.step) || 0;
  if (resume === 2) qIndex = Math.max(0, QUESTIONS.findIndex((q) => !draft.picks[q.id]));
  goTo(Math.min(resume, STEPS - 1));
});
