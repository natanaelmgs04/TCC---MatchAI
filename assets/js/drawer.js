/**
 * Menu lateral deslizante — lista de itens (projetos do cliente ou peças de
 * portfólio do arquiteto) que abre um detalhe ao clicar, no mesmo espírito
 * do menu de conversas do Claude Desktop: a lista é sempre "de volta" a um
 * clique de distância do detalhe. Um único módulo genérico serve os dois
 * papéis — quem chama `open()` decide o que a lista/detalhe mostram.
 */
const ProjectDrawer = (() => {
  let overlay, panelEl, lastFocused, focusCtl, cfg;

  function build() {
    if (overlay) return;
    overlay = document.createElement('div');
    overlay.className = 'project-drawer-overlay';
    overlay.innerHTML = `
      <div class="project-drawer" role="dialog" aria-modal="true" aria-label="Meus itens">
        <div class="drawer-header">
          <button type="button" class="drawer-back" hidden aria-label="Voltar à lista">←</button>
          <h3 class="drawer-title"></h3>
          <button type="button" class="drawer-close" aria-label="Fechar">×</button>
        </div>
        <div class="drawer-body"></div>
      </div>`;
    document.body.appendChild(overlay);
    panelEl = overlay.querySelector('.project-drawer');
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    overlay.querySelector('.drawer-close').addEventListener('click', close);
    overlay.querySelector('.drawer-back').addEventListener('click', showList);
    focusCtl = MatchExtras.trapFocus(panelEl, { onEscape: close });
  }

  function open(config) {
    build();
    cfg = config;
    lastFocused = document.activeElement;
    overlay.querySelector('.drawer-title').textContent = cfg.title;
    document.body.classList.add('no-scroll');
    overlay.classList.add('open');
    // openId: pula direto pro detalhe de um item (ex.: clicou num card da
    // grade "Seus projetos" fora da gaveta) em vez de sempre abrir na lista.
    const target = config.openId != null ? cfg.items().find((item) => String(cfg.idOf(item)) === String(config.openId)) : null;
    if (target) showDetail(target);
    else showList();
  }

  function close() {
    if (!overlay) return;
    overlay.classList.remove('open');
    document.body.classList.remove('no-scroll');
    lastFocused?.focus();
  }

  function showList() {
    overlay.querySelector('.drawer-back').hidden = true;
    const body = overlay.querySelector('.drawer-body');
    const items = cfg.items();
    body.innerHTML = `
      <button type="button" class="btn btn-primary btn-sm drawer-new-btn">${cfg.newLabel || '+ Novo'}</button>
      <div class="drawer-list">${
        items.length
          ? items.map((item) => `<button type="button" class="drawer-list-item" data-drawer-id="${cfg.idOf(item)}">${cfg.cardHtml(item)}</button>`).join('')
          : `<p class="drawer-empty">${cfg.emptyLabel || 'Nada por aqui ainda.'}</p>`
      }</div>`;
    body.querySelector('.drawer-new-btn').addEventListener('click', () => (cfg.onNew ? cfg.onNew() : showDetail(null)));
    body.querySelectorAll('[data-drawer-id]').forEach((el) => {
      el.addEventListener('click', () => showDetail(items.find((item) => String(cfg.idOf(item)) === el.dataset.drawerId)));
    });
    focusCtl.focusFirst();
  }

  function showDetail(item) {
    overlay.querySelector('.drawer-back').hidden = false;
    const body = overlay.querySelector('.drawer-body');
    body.innerHTML = '';
    cfg.renderDetail(item, body, { back: showList, close });
    focusCtl.focusFirst();
  }

  return { open, close };
})();
