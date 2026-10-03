document.addEventListener('DOMContentLoaded', async () => {
  // Quem pede menos animação no sistema também não quer rolagem suave.
  const SCROLL_BEHAVIOR = matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
  const STYLES = ['Moderno', 'Contemporâneo', 'Minimalista', 'Industrial', 'Clássico', 'Rústico', 'Escandinavo', 'Biofílico', 'Brutalista', 'Alto padrão'];
  // Mesmas fotos da vitrine "Estilos arquitetônicos" da home -- o filtro
  // vira uma miniatura do estilo em vez de só um nome, mais fácil de
  // reconhecer rápido numa lista de 10 opções.
  const STYLE_THUMBS = {
    'Moderno': 'assets/img/photos/photo-1600585154340-be6161a56a0c.webp',
    'Contemporâneo': 'assets/img/photos/photo-1600566753190-17f0baa2a6c3.webp',
    'Minimalista': 'assets/img/photos/photo-1600210492486-724fe5c67fb0.webp',
    'Industrial': 'assets/img/photos/photo-1567767292278-a4f21aa2d36e.webp',
    'Clássico': 'assets/img/photos/photo-1600607687920-4e2a09cf159d.webp',
    'Rústico': 'assets/img/photos/photo-1523755231516-e43fd2e8dca5.webp',
    'Escandinavo': 'assets/img/photos/photo-1586023492125-27b2c045efd7.webp',
    'Biofílico': 'assets/img/photos/photo-1545324418-cc1a3fa10c00.webp',
    'Brutalista': 'assets/img/photos/photo-1494526585095-c41746248156.webp',
    'Alto padrão': 'assets/img/photos/photo-1600596542815-ffad4c1539a9.webp',
  };
  // Fotos de perfil (o cadastro real ainda não tem esse campo) — retratos
  // diversos, cicla por índice pra cada arquiteto renderizado.
  const PROFILE_PHOTOS = [
    'assets/img/photos/photo-1580489944761-15a19d654956.webp',
    'assets/img/photos/photo-1507003211169-0a1dd7228f2d.webp',
    'assets/img/photos/photo-1573496359142-b8d87734a5a2.webp',
    'assets/img/photos/photo-1519085360753-af0119f7cbe7.webp',
    'assets/img/photos/photo-1500648767791-00dcc994a43e.webp',
    'assets/img/photos/photo-1544005313-94ddf0286df2.webp',
    'assets/img/photos/photo-1560250097-0b93528c311a.webp',
    'assets/img/photos/photo-1472099645785-5658abf4ff4e.webp',
  ];
  const grid = document.getElementById('archGrid');
  const empty = document.getElementById('archEmpty');
  const filters = document.getElementById('styleFilters');
  const cityFilter = document.getElementById('cityFilter');
  const experienceFilter = document.getElementById('experienceFilter');
  const ratingFilter = document.getElementById('ratingFilter');
  const loadMoreBtn = document.getElementById('loadMoreBtn');
  const PAGE_SIZE = 9;
  const MAX_COMPARE = 4;

  let activeStyle = '';
  let currentPage = 1;
  let loadedArchitects = [];
  let requestSeq = 0;
  const compareSelection = new Map();

  function ratingText(a) {
    return a.reviewCount ? `★ ${a.avgRating} (${a.reviewCount})` : 'Sem avaliações ainda';
  }

  function quoteLine(p) {
    const style = (p.styles || [])[0];
    if (style && p.yearsExperience) return `Especialista em ${style} — ${p.yearsExperience} anos de experiência.`;
    if (style) return `Especialista em ${style}.`;
    if (p.yearsExperience) return `${p.yearsExperience} anos de experiência em arquitetura.`;
    return 'Perfil em construção na plataforma.';
  }

  // Nome, cidade e bio são digitados pelo arquiteto: entram escapados.
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

  function cardHtml(a, i) {
    const p = a.profile || {};
    const verified = p.cauVerification?.status === 'verified' ? '<span class="status-pill badge-validated">✓ Verificado</span>' : '';
    const proBadge = a.isPro ? '<span class="badge-pro">★ Pro</span>' : '';
    const trackRecordBadge = a.isVerifiedTrackRecord ? '<span class="status-pill badge-validated">Trajetória verificada</span>' : '';
    const checked = compareSelection.has(a.id) ? 'checked' : '';
    const location = esc([a.city, a.state].filter(Boolean).join(' · ') || 'Localização não informada');
    const ratingSuffix = a.reviewCount ? ` · ★ ${a.avgRating}` : '';
    // foto do próprio arquiteto; sem foto, o mesmo retrato ilustrativo do perfil
    const photo = a.avatar ? MatchAPI.avatarSrc(a.avatar)
      : typeof MatchPortraits !== 'undefined' ? MatchPortraits.pick(a.id, a.name).photo : PROFILE_PHOTOS[i % PROFILE_PHOTOS.length];
    return `
      <div class="arch-card">
        <label class="arch-card-compare">
          <input type="checkbox" data-compare="${a.id}" ${checked}> Comparar
        </label>
        <a href="arquiteto.html?id=${a.id}" class="arch-card-link">
          <div class="arch-card-photo"><img src="${photo}" alt="" loading="lazy"></div>
          <div class="arch-card-body">
            <h4>${esc(a.name)}</h4>
            <span class="arch-card-meta">${location}${ratingSuffix}</span>
            <p class="arch-card-quote">${esc(quoteLine(p))}</p>
            ${(verified || proBadge || trackRecordBadge) ? `<div class="arch-card-badges">${verified}${proBadge}${trackRecordBadge}</div>` : ''}
          </div>
        </a>
      </div>`;
  }

  function buildFilters() {
    filters.innerHTML = `<button type="button" class="chip active" data-style="">Todos</button>` +
      STYLES.map(s => `<button type="button" class="chip has-thumb" data-style="${s}"><img class="chip-thumb" src="${STYLE_THUMBS[s]}" alt="" loading="lazy">${s}</button>`).join('');
    filters.querySelectorAll('.chip').forEach(chip => {
      chip.addEventListener('click', () => {
        filters.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        activeStyle = chip.dataset.style;
        loadArchitects({ reset: true });
      });
    });
  }

  function currentParams(page) {
    return {
      style: activeStyle,
      city: cityFilter.value.trim(),
      minExperience: experienceFilter.value,
      minRating: ratingFilter.value,
      page,
      pageSize: PAGE_SIZE,
    };
  }

  function bindCompareCheckboxes() {
    grid.querySelectorAll('[data-compare]').forEach(box => {
      box.addEventListener('click', (e) => e.stopPropagation());
      box.addEventListener('change', () => {
        const id = box.dataset.compare;
        if (box.checked) {
          if (compareSelection.size >= MAX_COMPARE) {
            box.checked = false;
            const note = document.getElementById('compareLimitNote');
            note.style.display = 'block';
            clearTimeout(note._hideTimer);
            note._hideTimer = setTimeout(() => { note.style.display = 'none'; }, 3000);
            return;
          }
          const arch = loadedArchitects.find(a => a.id === id);
          if (arch) compareSelection.set(id, arch);
        } else {
          compareSelection.delete(id);
        }
        updateCompareBar();
      });
    });
  }

  function skeletonCardHtml() {
    return `
      <div class="skeleton-result">
        <div class="skeleton-block avatar"></div>
        <div class="skeleton-lines">
          <div class="skeleton-block line" style="width:40%;"></div>
          <div class="skeleton-block line" style="width:70%;"></div>
          <div class="skeleton-block line" style="width:30%;"></div>
        </div>
      </div>`;
  }

  async function loadArchitects({ reset = false } = {}) {
    const seq = ++requestSeq;
    if (reset) {
      currentPage = 1;
      loadedArchitects = [];
      grid.innerHTML = skeletonCardHtml().repeat(PAGE_SIZE);
    }
    empty.style.display = 'none';
    loadMoreBtn.disabled = true;
    try {
      const { architects, hasMore, total } = await MatchAPI.architects(currentParams(currentPage));
      if (seq !== requestSeq) return; // uma busca mais recente já foi disparada, descarta esta resposta atrasada
      loadedArchitects = reset ? architects : loadedArchitects.concat(architects);
      const countLabel = document.getElementById('archResultCount');
      if (!loadedArchitects.length) {
        grid.innerHTML = '';
        empty.style.display = 'block';
        loadMoreBtn.style.display = 'none';
        if (countLabel) countLabel.textContent = '';
        return;
      }
      if (countLabel) countLabel.textContent = `${total} arquiteto${total === 1 ? '' : 's'} encontrado${total === 1 ? '' : 's'}`;
      grid.innerHTML = loadedArchitects.map((arch, i) => cardHtml(arch, i)).join('');
      bindCompareCheckboxes();
      loadMoreBtn.style.display = hasMore ? 'inline-flex' : 'none';
      loadMoreBtn.disabled = false;
    } catch (err) {
      if (seq !== requestSeq) return;
      if (reset) grid.innerHTML = '';
      if (err.offline) document.getElementById('apiBanner').classList.add('show');
      if (!loadedArchitects.length) {
        empty.style.display = 'block';
        empty.querySelector('p').textContent = err.message || 'Não foi possível carregar os arquitetos agora.';
      }
      loadMoreBtn.disabled = false;
    }
  }

  // ---------------- Comparador (sem precisar entrar) ----------------
  function updateCompareBar() {
    const bar = document.getElementById('compareBar');
    const count = compareSelection.size;
    document.getElementById('compareCount').textContent = `${count} selecionado${count === 1 ? '' : 's'}`;
    document.getElementById('runCompareBtn').disabled = count < 2;
    bar.style.display = count > 0 ? 'block' : 'none';
    if (!count) document.getElementById('compareSection').style.display = 'none';
  }

  document.getElementById('clearCompareBtn').addEventListener('click', () => {
    compareSelection.clear();
    grid.querySelectorAll('[data-compare]').forEach(b => { b.checked = false; });
    updateCompareBar();
  });

  document.getElementById('runCompareBtn').addEventListener('click', () => {
    const items = Array.from(compareSelection.values());
    const section = document.getElementById('compareSection');
    document.getElementById('compareContent').innerHTML = `
      <table class="compare-table">
        <thead><tr><th>Arquiteto</th>${items.map(a => `<th>${esc(a.name)}</th>`).join('')}</tr></thead>
        <tbody>
          <tr><th>Localização</th>${items.map(a => `<td>${[a.city, a.state].filter(Boolean).join(' · ') || '—'}</td>`).join('')}</tr>
          <tr><th>Experiência</th>${items.map(a => `<td>${a.profile?.yearsExperience || 0} anos</td>`).join('')}</tr>
          <tr><th>Estilos</th>${items.map(a => `<td>${(a.profile?.styles || []).join(', ') || '—'}</td>`).join('')}</tr>
          <tr><th>Especialidades</th>${items.map(a => `<td>${(a.profile?.specialties || []).join(', ') || '—'}</td>`).join('')}</tr>
          <tr><th>Disponibilidade</th>${items.map(a => `<td>${{ available: 'Disponível', limited: 'Limitada', unavailable: 'Indisponível' }[a.profile?.availability] || '—'}</td>`).join('')}</tr>
          <tr><th>Avaliação</th>${items.map(a => `<td>${a.reviewCount ? `★ ${a.avgRating} (${a.reviewCount})` : 'Sem avaliações'}</td>`).join('')}</tr>
          <tr><th>Perfil</th>${items.map(a => `<td><a href="arquiteto.html?id=${a.id}" class="btn btn-secondary btn-sm">Ver perfil</a></td>`).join('')}</tr>
        </tbody>
      </table>`;
    section.style.display = 'block';
    section.scrollIntoView({ behavior: SCROLL_BEHAVIOR, block: 'start' });
  });

  let debounceTimer;
  const debouncedReset = () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => loadArchitects({ reset: true }), 350);
  };
  cityFilter.addEventListener('input', debouncedReset);
  experienceFilter.addEventListener('change', () => loadArchitects({ reset: true }));
  ratingFilter.addEventListener('change', () => loadArchitects({ reset: true }));
  loadMoreBtn.addEventListener('click', () => {
    currentPage += 1;
    loadArchitects();
  });

  buildFilters();
  loadArchitects({ reset: true });
});
