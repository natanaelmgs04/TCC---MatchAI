/**
 * Perfis detalhados do time, abertos ao clicar em cada card na página Sobre.
 * Quem não tiver `bio` cai no estado "perfil em breve" (renderPlaceholder).
 * A foto vem de assets/img/team/<id>.png — sem o arquivo, o círculo cai de
 * volta pras iniciais automaticamente.
 */
const FOUNDERS = {
  natanael: {
    name: 'Natanael Martins Gomes Santos',
    role: 'Produto & Tecnologia',
    initials: 'NM',
    photo: 'assets/img/team/natanael.png',
    eyebrow: 'Fundador · Produto & Tecnologia',
    tagline: 'Levou o match.IA da ideia ao produto — moldando a experiência, a IA e cada detalhe da interface.',
    bio: [
      'Responsável pelo produto e pela experiência do match.IA: desenhou o fluxo de match, integrou a IA generativa (Gemini) que explica cada compatibilidade em linguagem natural, e adaptou o back-end — construído pelo Roberto — para sustentar essas funcionalidades.',
      'Também desenhou o design system da plataforma — tipografia, cores, componentes e o modo escuro — com atenção a acessibilidade (contraste WCAG, navegação por teclado) e conformidade com a LGPD.',
      'Gosta de levar um projeto até o detalhe que ninguém pediu: o foco de teclado certo, a transição que não atrasa, o estado vazio que não parece um erro.'
    ],
    factsLeft: [
      { label: 'Frente', value: 'Produto & front-end' },
      { label: 'IA aplicada', value: 'Gemini · integração & explicações' },
      { label: 'Formação', value: 'Técnico em Informática, FIAP School' }
    ],
    factsRight: [
      { label: 'No projeto', value: 'Produto, IA & design system' },
      { label: 'Também cuida de', value: 'Acessibilidade & LGPD' },
      { label: 'Turma', value: '3EMIB — FIAP School' }
    ],
    links: [
      { label: 'GitHub', url: 'https://github.com/natanaelmgs04' },
      { label: 'E-mail', url: 'mailto:natanaelmgs04@gmail.com' }
    ]
  },
  alex: {
    name: 'Alex Chen Marubayashi',
    role: 'Back-end',
    initials: 'AC',
    photo: 'assets/img/team/alex.png',
    eyebrow: 'Fundador · Back-end',
    tagline: 'Mantém de pé a parte que ninguém vê, mas que faz o match acontecer.',
    bio: [
      'Atua no back-end do match.IA: a camada de servidor e banco de dados que guarda cadastros, perfis de clientes e arquitetos e sustenta o cálculo de compatibilidade entre eles.',
      'É a frente que garante que o que aparece na tela — o score de match, o ranking, as mensagens — venha de dados consistentes e de respostas rápidas da API.',
      'Trabalha junto do Roberto, que construiu a base do back-end, e do Natanael, que conecta essas respostas à interface e à IA generativa.'
    ],
    factsLeft: [
      { label: 'Frente', value: 'Back-end' },
      { label: 'Tecnologias', value: 'Node.js · Express · MongoDB' },
      { label: 'Formação', value: 'Técnico em Informática, FIAP School' }
    ],
    factsRight: [
      { label: 'No projeto', value: 'API, dados e regras do match' },
      { label: 'Trabalha com', value: 'Roberto e Natanael' },
      { label: 'Turma', value: '3EMIB — FIAP School' }
    ]
  },
  cinthia: {
    name: 'Cinthia Yamamoto Gushiken',
    role: 'Identidade & produto',
    initials: 'CY',
    photo: 'assets/img/team/cinthia.png',
    eyebrow: 'Fundadora · Identidade & produto',
    tagline: 'Cuida de como o match.IA se apresenta — e de como ele faz sentido para quem usa.',
    bio: [
      'Atua na identidade e no produto do match.IA: a forma como a marca se mostra e como a experiência se organiza para clientes e arquitetos, da primeira tela ao resultado do match.',
      'Olha o projeto pelos dois lados da plataforma — quem procura um arquiteto e quem quer ser encontrado — para que a proposta de valor apareça de forma clara, sem jargão.',
      'Ajuda a manter coerência entre o que a marca promete e o que o produto entrega: estilo, personalização e autoria do arquiteto no centro.'
    ],
    factsLeft: [
      { label: 'Frente', value: 'Identidade & produto' },
      { label: 'Foco', value: 'Experiência de clientes e arquitetos' },
      { label: 'Formação', value: 'Técnico em Informática, FIAP School' }
    ],
    factsRight: [
      { label: 'No projeto', value: 'Marca, narrativa e produto' },
      { label: 'Também cuida de', value: 'Coerência entre marca e produto' },
      { label: 'Turma', value: '3EMIB — FIAP School' }
    ]
  },
  italo: {
    name: 'Ítalo Santos de Morais',
    role: 'Marketing',
    initials: 'IS',
    photo: 'assets/img/team/italo.png',
    eyebrow: 'Fundador · Marketing',
    tagline: 'Faz a proposta do match.IA chegar a quem precisa dela.',
    bio: [
      'Responsável pelo marketing do match.IA: como a proposta — encontrar o arquiteto certo por compatibilidade, e não por tentativa e erro — é comunicada a clientes e arquitetos.',
      'Traduz a pesquisa de campo do TCC em mensagem: as dores reais de quem contrata um projeto e de quem projeta viram o argumento central do que o time apresenta.',
      'Pensa nos canais e no posicionamento para que a plataforma seja conhecida pelos públicos certos desde o início.'
    ],
    factsLeft: [
      { label: 'Frente', value: 'Marketing' },
      { label: 'Foco', value: 'Posicionamento e comunicação' },
      { label: 'Formação', value: 'Técnico em Informática, FIAP School' }
    ],
    factsRight: [
      { label: 'No projeto', value: 'Mensagem, canais e público' },
      { label: 'Parte de', value: 'Pesquisa de campo do TCC' },
      { label: 'Turma', value: '3EMIB — FIAP School' }
    ]
  },
  julya: {
    name: 'Julya Vitoria Souza Vieira',
    role: 'Gestão',
    initials: 'JV',
    photo: 'assets/img/team/julya.png',
    eyebrow: 'Fundadora · Gestão',
    tagline: 'Mantém as frentes do time andando no mesmo ritmo, do início à entrega.',
    bio: [
      'Responsável pela gestão do projeto match.IA: organiza prazos, entregas e prioridades para que produto, tecnologia, identidade e marketing avancem de forma alinhada.',
      'Faz a ponte entre as frentes do time e a orientação do TCC, acompanhando o que já está pronto, o que depende de quem e o que precisa ser decidido em seguida.',
      'Cuida também do lado de negócio do projeto: como a plataforma se sustenta e como o time apresenta isso para a banca.'
    ],
    factsLeft: [
      { label: 'Frente', value: 'Gestão do projeto' },
      { label: 'Foco', value: 'Prazos, entregas e alinhamento' },
      { label: 'Formação', value: 'Técnico em Informática, FIAP School' }
    ],
    factsRight: [
      { label: 'No projeto', value: 'Planejamento e coordenação' },
      { label: 'Também cuida de', value: 'Modelo de negócio' },
      { label: 'Turma', value: '3EMIB — FIAP School' }
    ]
  },
  roberto: {
    name: 'Roberto de Andrade Paiva Filho',
    role: 'Identidade visual & back-end',
    initials: 'RP',
    photo: 'assets/img/team/roberto.png',
    eyebrow: 'Fundador · Identidade visual & back-end',
    tagline: 'Construiu a base técnica sobre a qual o match.IA foi montado.',
    bio: [
      'Construiu o back-end original da plataforma — a API em Node.js, Express e MongoDB, que nasceu no repositório Arkitetum.AI — e o banco de materiais arquitetônicos usado no cálculo de compatibilidade.',
      'É também responsável pela identidade visual do projeto, dando à marca a linguagem que aparece em toda a plataforma.',
      'As funcionalidades novas do match.IA foram acrescentadas sobre essa base, e mudanças no back-end passam pela revisão dele antes de irem para o repositório principal.'
    ],
    factsLeft: [
      { label: 'Frente', value: 'Back-end & identidade visual' },
      { label: 'Tecnologias', value: 'Node.js · Express · MongoDB' },
      { label: 'Formação', value: 'Técnico em Informática, FIAP School' }
    ],
    factsRight: [
      { label: 'No projeto', value: 'API original e identidade da marca' },
      { label: 'Repositório', value: 'Arkitetum.AI' },
      { label: 'Turma', value: '3EMIB — FIAP School' }
    ],
    links: [
      { label: 'GitHub', url: 'https://github.com/RobPFilho' }
    ]
  }
};

const FounderModal = (() => {
  let overlay, panel, lastFocused;

  function build() {
    if (overlay) return;
    overlay = document.createElement('div');
    overlay.className = 'founder-modal-overlay';
    overlay.innerHTML = `
      <div class="founder-modal" role="dialog" aria-modal="true" aria-labelledby="founderName">
        <button type="button" class="founder-close" aria-label="Fechar perfil">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 5l14 14M19 5 5 19"/></svg>
        </button>
        <div id="founderInner"></div>
      </div>`;
    document.body.appendChild(overlay);
    panel = overlay.querySelector('.founder-modal');
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    overlay.querySelector('.founder-close').addEventListener('click', close);
    overlay.addEventListener('keydown', handleKeydown);
  }

  function focusableEls() {
    return Array.from(panel.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'))
      .filter(el => !el.disabled && el.offsetParent !== null);
  }

  function handleKeydown(e) {
    if (e.key === 'Escape') { close(); return; }
    if (e.key !== 'Tab') return;
    const items = focusableEls();
    if (!items.length) return;
    const first = items[0], last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  function close() {
    if (!overlay) return;
    overlay.classList.remove('open');
    document.body.classList.remove('no-scroll');
    if (lastFocused) lastFocused.focus();
  }

  function factsHtml(facts) {
    return (facts || []).map(f => `<div class="founder-fact"><span class="founder-fact-label">${f.label}</span><span class="founder-fact-value">${f.value}</span></div>`).join('');
  }

  function photoHtml(founder) {
    return `
      <div class="founder-photo-ring">
        <img class="founder-photo" src="${founder.photo || ''}" alt="${founder.name}">
        <div class="founder-avatar-fallback" style="display:none;">${founder.initials}</div>
      </div>`;
  }

  function renderDetailed(founder) {
    return `
      <div class="founder-layout">
        <div class="founder-facts founder-facts-left">${factsHtml(founder.factsLeft)}</div>
        <div class="founder-portrait">
          ${photoHtml(founder)}
          <span class="founder-role-tag">${founder.role}</span>
        </div>
        <div class="founder-facts founder-facts-right">${factsHtml(founder.factsRight)}</div>
      </div>
      <div class="founder-body">
        <span class="eyebrow">${founder.eyebrow || founder.role}</span>
        <h2 id="founderName">${founder.name}</h2>
        ${founder.tagline ? `<p class="founder-tagline">${founder.tagline}</p>` : ''}
        <div class="founder-bio">${(founder.bio || []).map(p => `<p>${p}</p>`).join('')}</div>
        ${founder.links && founder.links.length ? `<div class="founder-links">${founder.links.map(l => `<a href="${l.url}" class="btn btn-secondary btn-sm" target="_blank" rel="noopener">${l.label}</a>`).join('')}</div>` : ''}
      </div>`;
  }

  function renderPlaceholder(founder) {
    const firstName = founder.name.split(' ')[0];
    return `
      <div class="founder-layout founder-layout--solo">
        <div class="founder-portrait">
          ${photoHtml(founder)}
          <span class="founder-role-tag">${founder.role}</span>
        </div>
      </div>
      <div class="founder-body founder-body--center">
        <span class="eyebrow">Fundador</span>
        <h2 id="founderName">${founder.name}</h2>
        <p class="founder-tagline">Perfil completo em breve</p>
        <p style="color:var(--ink-soft); max-width:420px; margin:0 auto;">${firstName} ainda vai preencher este espaço com sua trajetória, principais contribuições no match.IA e um pouco mais sobre quem é fora do projeto.</p>
      </div>`;
  }

  function open(id) {
    const founder = FOUNDERS[id];
    if (!founder) return;
    build();
    lastFocused = document.activeElement;
    overlay.querySelector('#founderInner').innerHTML = founder.bio ? renderDetailed(founder) : renderPlaceholder(founder);
    // Foto que não carrega vira as iniciais (listener em vez de onerror="" no
    // HTML: a Content-Security-Policy do site bloqueia handlers embutidos).
    overlay.querySelectorAll('.founder-photo').forEach((img) => {
      const fallback = () => { img.style.display = 'none'; if (img.nextElementSibling) img.nextElementSibling.style.display = 'flex'; };
      if (!img.getAttribute('src') || (img.complete && !img.naturalWidth)) fallback();
      else img.addEventListener('error', fallback, { once: true });
    });
    overlay.classList.add('open');
    document.body.classList.add('no-scroll');
    overlay.querySelector('.founder-close').focus();
  }

  return { open, close };
})();

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('[data-founder]').forEach(btn => {
    btn.addEventListener('click', () => FounderModal.open(btn.dataset.founder));
  });
});
