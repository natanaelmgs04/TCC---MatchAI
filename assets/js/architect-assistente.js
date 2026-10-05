/**
 * Assistente de IA do arquiteto (aba "Assistente" do painel do arquiteto).
 * Adaptação enxuta do MatchAssistant (assistente.js): o arquiteto escolhe
 * um projeto que fechou com um cliente pela plataforma (MatchAPI.architectProjects)
 * e conversa com a IA pra receber sugestões de como desenvolvê-lo — sem
 * fotos, sem briefing, sem passo de "enviar para arquitetos" (isso é só do
 * lado do cliente). Reaproveita as mesmas classes .ai-* do card de chat do
 * cliente (definidas em assistente.css, sem depender do palco decorativo
 * com shader/robô 3D, que é exclusivo da aba do cliente).
 */
const ArchitectAssistant = (() => {
  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  };
  const SVG = (d, size = 16) => `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const ICONS = {
    back: SVG('<path d="m15 18-6-6 6-6"/>', 14),
    send: SVG('<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>', 17),
    arrowUp: SVG('<path d="M12 19V5"/><path d="M5.5 11.5L12 5l6.5 6.5"/>', 18),
    arrow: SVG('<path d="m9 18 6-6-6-6"/>', 18),
  };
  const plain = (t) => String(t || '').replace(/\*\*(.+?)\*\*/g, '$1').replace(/^\s*\*\s+/gm, '- ').replace(/^#+\s*/gm, '');
  const STATUS_LABEL = { draft: 'Rascunho', matching: 'Buscando arquiteto', in_progress: 'Em andamento', completed: 'Concluído' };

  const CARD_HTML = `
    <div class="ai-card">
      <div class="ai-view" data-view="picker">
        <div class="ai-card-head">
          <img src="assets/img/mark.png" alt="" width="30" height="30">
          <div class="ai-card-id">
            <strong class="logo-word">match<span class="ia">.IA</span></strong>
            <span class="ai-status"><i aria-hidden="true"></i> Online</span>
          </div>
        </div>
        <div class="ai-picker" data-ref="pickerList"></div>
      </div>

      <div class="ai-view" data-view="chat" hidden>
        <div class="ai-card-head">
          <button type="button" class="ai-pill" data-ref="back" aria-label="Trocar de projeto">${ICONS.back} Projetos</button>
          <div class="ai-card-id">
            <strong class="logo-word">match<span class="ia">.IA</span></strong>
            <span class="ai-status"><i aria-hidden="true"></i> Online</span>
          </div>
          <button type="button" class="ai-pill" data-ref="resetBtn" title="Apagar esta conversa e recomeçar">Reiniciar</button>
        </div>
        <div class="ai-thread" data-ref="thread" role="log" aria-live="polite" aria-label="Conversa"></div>
        <div class="ai-compose">
          <p class="ai-error" data-ref="error" role="alert"></p>
          <div class="mo-pill" data-ref="pill">
            <span class="mo-pill-glow" aria-hidden="true"></span>
            <span class="mo-pill-aurora" aria-hidden="true"><i></i><i></i><i></i></span>
            <svg class="mo-spark" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 3.5l1.7 4.8 4.8 1.7-4.8 1.7L10 16.5l-1.7-4.8L3.5 10l4.8-1.7L10 3.5z"/><path d="M18 14.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7.7-1.8z"/></svg>
            <textarea class="ai-input" data-ref="input" rows="1" maxlength="1500"
                      placeholder="Pergunte como desenvolver este projeto…" aria-label="Mensagem para o assistente"></textarea>
            <button type="button" class="ai-send" data-ref="send" aria-label="Enviar" disabled>${ICONS.arrowUp}</button>
          </div>
          <span class="ai-hint">Enter envia · Shift+Enter quebra a linha</span>
        </div>
      </div>
    </div>`;

  function mount(host) {
    host.innerHTML = CARD_HTML;
    const card = host.querySelector('.ai-card');
    const $ = (ref) => card.querySelector(`[data-ref="${ref}"]`);
    const refs = Object.fromEntries(
      ['pickerList', 'back', 'resetBtn', 'thread', 'input', 'error', 'send', 'pill'].map((r) => [r, $(r)]),
    );
    const views = { picker: card.querySelector('[data-view="picker"]'), chat: card.querySelector('[data-view="chat"]') };
    // orbe que pensa (assets/js/morph-orb.js); sem o script, cai no "digitando…"
    const orb = typeof MorphOrb !== 'undefined' ? MorphOrb.attach(card, { compose: refs.pill, thread: refs.thread }) : null;

    let projects = [];
    let project = null;
    let busy = false;
    let loadToken = 0;

    function setView(name) {
      Object.entries(views).forEach(([k, v]) => { v.hidden = k !== name; });
    }

    function renderPicker() {
      refs.pickerList.textContent = '';
      refs.pickerList.append(el('div', 'ai-picker-title', 'Seus projetos'));
      if (!projects.length) {
        refs.pickerList.append(el('p', 'ai-empty', 'Você ainda não tem projetos fechados pela plataforma. Quando um cliente confirmar o resumo do projeto com você, ele aparece aqui.'));
        return;
      }
      projects.forEach((p) => {
        const b = el('button', 'ai-project');
        b.type = 'button';
        const main = el('span', 'ai-project-main');
        const meta = [p.client?.name, STATUS_LABEL[p.status] || 'Em andamento', p.propertyType].filter(Boolean).join(' · ');
        main.append(el('strong', '', p.name), el('span', '', meta));
        b.append(main);
        b.insertAdjacentHTML('beforeend', ICONS.arrow);
        b.addEventListener('click', () => openProject(p));
        refs.pickerList.append(b);
        // Etapas, arquivos, biblioteca e lista de compras do projeto ficam no Espaço do projeto.
        const ws = el('a', 'ai-project-ws', 'Abrir espaço do projeto →');
        ws.href = `projeto.html?id=${encodeURIComponent(p._id)}`;
        refs.pickerList.append(ws);
      });
    }

    async function refresh() {
      try { projects = await MatchAPI.architectProjects(); }
      catch { projects = []; }
      if (!project) renderPicker();
    }

    function showPicker() {
      project = null;
      setView('picker');
      renderPicker();
    }
    refs.back.addEventListener('click', showPicker);

    const scrollDown = () => { refs.thread.scrollTop = refs.thread.scrollHeight; };
    function addUser(text) {
      const m = el('div', 'ai-msg ai-msg--user');
      m.append(el('div', 'ai-bubble', text));
      refs.thread.append(m); scrollDown();
      return m;
    }
    function addBot(text, pending) {
      const m = el('div', 'ai-msg ai-msg--bot' + (pending ? ' mo-pending' : ''));
      const av = el('img', 'ai-avatar'); av.src = 'assets/img/mark.png'; av.alt = '';
      const body = el('div', 'ai-msg-body');
      if (text) body.append(el('div', 'ai-bubble', plain(text)));
      m.append(av, body);
      refs.thread.append(m); scrollDown();
      return { root: m, body };
    }
    function addTyping() {
      const { root, body } = addBot('');
      const dots = el('div', 'ai-bubble ai-typing');
      dots.innerHTML = '<i></i><i></i><i></i>';
      dots.setAttribute('aria-label', 'O assistente está digitando');
      body.append(dots);
      return root;
    }
    const showError = (msg) => { refs.error.textContent = msg || ''; };
    function setBusy(v) {
      busy = v;
      refs.send.classList.toggle('is-busy', v);
      refreshComposer();
    }
    function refreshComposer() {
      refs.send.disabled = busy || !refs.input.value.trim();
    }

    refs.input.addEventListener('input', () => { showError(''); refreshComposer(); });
    refs.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); }
    });

    async function send() {
      const text = refs.input.value.trim();
      if (!text || busy || !project) return;
      showError('');
      setBusy(true);
      const userEl = addUser(text);
      refs.input.value = '';
      const request = MatchAPI.architectAssistantSend(project._id, { text });
      const myProject = project;
      try {
        if (orb) {
          const res = await orb.think(request);
          if (!res || project !== myProject) return;
          const { body } = addBot(res.reply, true);
          await orb.unfold(body.querySelector('.ai-bubble'));
        } else {
          const typing = addTyping();
          try { const res = await request; typing.remove(); addBot(res.reply); }
          catch (e) { typing.remove(); throw e; }
        }
      } catch (err) {
        orb?.cancel();
        userEl.remove();
        refs.input.value = text;
        showError(err.message || 'Não foi possível enviar agora.');
      } finally { setBusy(false); refs.input.focus({ preventScroll: true }); }
    }
    refs.send.addEventListener('click', send);

    async function openProject(p) {
      project = p;
      const token = ++loadToken;
      refs.thread.textContent = '';
      refs.input.value = ''; showError('');
      setView('chat');
      refreshComposer();
      const loading = addTyping();
      try {
        const data = await MatchAPI.architectAssistantChat(p._id);
        if (token !== loadToken) return;
        loading.remove();
        if (!data.messages.length) {
          addBot(`Vamos planejar "${p.name}", de ${p.client?.name || 'seu cliente'}. Me pergunte sobre próximos passos, materiais, layout ou cronograma que eu uso o que já se sabe do projeto.`);
        }
        data.messages.forEach((m) => { if (m.role === 'user') addUser(m.text); else addBot(m.text); });
        scrollDown();
        refs.input.focus({ preventScroll: true });
      } catch (err) {
        if (token !== loadToken) return;
        loading.remove();
        showError(err.message || 'Não foi possível carregar a conversa agora.');
      }
    }

    refs.resetBtn.addEventListener('click', async () => {
      if (!project || busy) return;
      if (!confirm('Apagar esta conversa e recomeçar?')) return;
      try { await MatchAPI.architectAssistantReset(project._id); openProject(project); }
      catch (err) { showError(err.message || 'Não foi possível reiniciar agora.'); }
    });

    setView('picker');
    refresh();
    return { refresh };
  }

  return { mount };
})();
