/**
 * Botão "+ Outros..." para listas de chips de múltipla escolha: o usuário
 * digita uma opção que não está na lista e ela vira um chip marcado, igual aos
 * outros (mesmo visual de .chip-add / .chip-input-group do cadastro).
 *
 * Quem usa continua lendo os chips ativos do contêiner como sempre — o chip
 * novo leva o mesmo data-atributo (`dataKey`) dos chips da lista. O clique para
 * marcar/desmarcar fica com a página (delegação no contêiner).
 *
 *   MatchChipOther.attach(box, { dataKey: 'style', initial: ['Japandi'], onChange })
 */
window.MatchChipOther = (() => {
  const norm = (s) => String(s || '').trim().toLocaleLowerCase('pt-BR');

  function makeChip(dataKey, value) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip custom active';
    chip.dataset[dataKey] = value;
    chip.setAttribute('aria-pressed', 'true');
    chip.textContent = value;
    return chip;
  }

  function attach(container, { dataKey, initial = [], onChange, maxLength = 40, placeholder = 'Digite e confirme' } = {}) {
    const existing = () => [...container.querySelectorAll('.chip')];
    const find = (value) => existing().find((c) => norm(c.dataset[dataKey]) === norm(value));

    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'chip-add';
    addBtn.textContent = '+ Outros...';
    container.appendChild(addBtn);

    // Valores salvos que não estão na lista sugerida (ex.: rascunho, projeto existente).
    initial.filter((v) => v && !find(v)).forEach((v) => container.insertBefore(makeChip(dataKey, v), addBtn));

    addBtn.addEventListener('click', () => {
      addBtn.hidden = true;
      const group = document.createElement('span');
      group.className = 'chip-input-group';
      group.innerHTML = `<input type="text" maxlength="${maxLength}" aria-label="Outra opção"><button type="button" class="confirm" title="Adicionar" aria-label="Adicionar">✓</button><button type="button" class="cancel" title="Cancelar" aria-label="Cancelar">×</button>`;
      const input = group.querySelector('input');
      input.placeholder = placeholder;
      container.insertBefore(group, addBtn);
      input.focus();

      const close = () => { group.remove(); addBtn.hidden = false; addBtn.focus(); };
      const commit = () => {
        const value = input.value.trim().replace(/\s+/g, ' ');
        if (value) {
          const same = find(value);
          if (same) {
            same.classList.add('active');
            same.setAttribute('aria-pressed', 'true');
          } else {
            container.insertBefore(makeChip(dataKey, value), addBtn);
          }
          onChange?.();
        }
        close();
      };
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); commit(); }
        if (e.key === 'Escape') { e.preventDefault(); close(); }
      });
      group.querySelector('.confirm').addEventListener('click', commit);
      group.querySelector('.cancel').addEventListener('click', close);
    });
  }

  /**
   * <select> com a opção "Outro…": mostra um campo de texto ao lado.
   * `get()` devolve o valor final (da lista ou digitado); `set(v)` aceita
   * qualquer valor — se não estiver na lista, cai em "Outro" com o texto preenchido.
   */
  function select(selectEl, otherInput, { onChange } = {}) {
    const OTHER = '__other';
    if (![...selectEl.options].some((o) => o.value === OTHER)) {
      selectEl.add(new Option('Outro…', OTHER));
    }
    const sync = () => {
      const isOther = selectEl.value === OTHER;
      otherInput.hidden = !isOther;
      if (isOther && document.activeElement === selectEl) otherInput.focus();
    };
    const api = {
      get: () => (selectEl.value === OTHER ? otherInput.value.trim() : selectEl.value),
      set: (value) => {
        if (value && ![...selectEl.options].some((o) => o.value === value && o.value !== OTHER)) {
          selectEl.value = OTHER;
          otherInput.value = value;
        } else if (value) {
          selectEl.value = value;
        }
        otherInput.hidden = selectEl.value !== OTHER;
      },
    };
    selectEl.addEventListener('change', () => { sync(); onChange?.(api.get()); });
    otherInput.addEventListener('input', () => onChange?.(api.get()));
    otherInput.hidden = selectEl.value !== OTHER;
    return api;
  }

  return { attach, select };
})();
