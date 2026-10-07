/**
 * Vitrine "projetos que já viraram match" — substitui o showcase 3D em
 * index.html/projetos.html. Duas colunas: carrossel de projetos reais com
 * match verificado (aprovação mútua) à esquerda, ranking dos arquitetos com
 * melhor mérito (nota + histórico de projetos fechados + bônus Pro, mesma
 * ordenação de destaques.html) à direita — um top-5 compacto, não um
 * substituto do diretório completo.
 */
document.addEventListener('DOMContentLoaded', async () => {
  const track = document.getElementById('showcaseTrack');
  const ranking = document.getElementById('showcaseRanking');
  if (!track || !ranking) return;

  // Mesmas fotos de perfil já usadas no diretório de arquitetos
  // (destaques.js) — reaproveitadas aqui pro card compacto do ranking.
  const PROFILE_PHOTOS = [
    'assets/img/photos/photo-1580489944761-15a19d654956.webp',
    'assets/img/photos/photo-1507003211169-0a1dd7228f2d.webp',
    'assets/img/photos/photo-1573496359142-b8d87734a5a2.webp',
    'assets/img/photos/photo-1519085360753-af0119f7cbe7.webp',
    'assets/img/photos/photo-1500648767791-00dcc994a43e.webp',
  ];

  function projectCardHtml(c) {
    const img = /^(https?:|assets\/|data:image\/)/.test(String(c.image || '')) ? c.image : '';
    return `
      <div class="showcase-card spotlight tilt">
        <div class="showcase-card-media">
          ${img ? `<img src="${esc(img)}" alt="${esc(c.title)}" loading="lazy">` : '<div class="showcase-card-noimg"></div>'}
          ${typeof c.compatibilityScore === 'number' ? `<span class="showcase-compat">${c.compatibilityScore}% match</span>` : ''}
        </div>
        <div class="showcase-card-info">
          <h4>${esc(c.title)}</h4>
          <p>${esc(c.architectName || 'Arquiteto')}${c.style ? ` · ${esc(c.style)}` : ''}${c.areaM2 ? ` · ${esc(c.areaM2)} m²` : ''}</p>
        </div>
      </div>`;
  }

  // Ranking em formato de leaderboard: posição (coroa no pódio), foto, nome,
  // especialidade/cidade e a nota à direita. Sem setas de "subiu/desceu" de
  // propósito — a API não guarda histórico de posição, e inventar não dá.
  const CROWN = '<svg class="lb-crown" viewBox="0 0 24 24" aria-hidden="true"><path d="M11.56 3.27a.5.5 0 0 1 .88 0l2.95 5.6a1 1 0 0 0 1.52.3l4.27-3.67a.5.5 0 0 1 .8.52l-2.83 10.25a1 1 0 0 1-.96.73H5.81a1 1 0 0 1-.96-.73L2.02 6.02a.5.5 0 0 1 .8-.52l4.27 3.67a1 1 0 0 0 1.52-.3z"/><path d="M5 21h14"/></svg>';
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const me = (() => { try { return MatchAPI.currentUser()?.id || null; } catch { return null; } })();

  function rankingItemHtml(a, i) {
    const rank = i + 1;
    const location = [a.city, a.state].filter(Boolean).join(' · ');
    const style = a.profile?.styles?.[0];
    const closed = a.profile?.closedProjectsCount || 0;
    const byline = [style, location || 'Localização não informada', closed ? `${closed} projeto${closed > 1 ? 's' : ''} fechado${closed > 1 ? 's' : ''}` : '']
      .filter(Boolean).join(' · ');
    // mesmo rosto em todo o site (assets/js/portraits.js): foto enviada ou o retrato fixo do arquiteto
    const photo = typeof MatchPortraits !== 'undefined' ? MatchPortraits.photoFor(a) : PROFILE_PHOTOS[i % PROFILE_PHOTOS.length];
    const isMe = me && String(a.id) === String(me);
    const rated = a.avgRating > 0;
    const badges = [
      a.isPro ? '<span class="lb-badge lb-badge--pro" title="Assinante Pro">Pro</span>' : '',
      a.isVerifiedTrackRecord ? '<span class="lb-badge lb-badge--ok" title="Trajetória verificada">✓</span>' : '',
    ].join('');
    return `
      <a class="lb-row${rank <= 3 ? ` lb-row--podium lb-row--${rank}` : ''}${isMe ? ' is-me' : ''}" role="listitem" href="arquiteto.html?id=${esc(a.id)}" style="--i:${i}">
        <span class="lb-rank"><b>${rank}</b>${rank <= 3 ? CROWN : ''}</span>
        <img class="lb-avatar" src="${photo}" alt="" loading="lazy" width="44" height="44">
        <span class="lb-who">
          <strong>${esc(a.name)}${isMe ? ' <em>você</em>' : ''}</strong>
          <small>${esc(byline)}</small>
        </span>
        ${badges ? `<span class="lb-badges">${badges}</span>` : ''}
        <span class="lb-value">
          ${rated ? `<b><span aria-hidden="true">★</span> ${a.avgRating.toFixed(1)}</b><small>${a.reviewCount} avaliaç${a.reviewCount === 1 ? 'ão' : 'ões'}</small>` : '<b class="lb-new">Novo</b><small>sem avaliações</small>'}
        </span>
      </a>`;
  }

  // as linhas entram em sequência quando a lista aparece na tela
  function revealRows() {
    if (!('IntersectionObserver' in window)) { ranking.classList.add('is-in'); return; }
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { ranking.classList.add('is-in'); io.disconnect(); } }, { threshold: 0.25 });
    io.observe(ranking);
  }

  const prevBtn = document.getElementById('showcasePrev');
  const nextBtn = document.getElementById('showcaseNext');
  let carousel3d = null;

  try {
    const [caseStudies, archResult] = await Promise.all([
      MatchAPI.featuredCaseStudies(12),
      MatchAPI.architects({ pageSize: 5 }),
    ]);

    // Carrossel 3D exige espaço e alguns cards pra fazer sentido girar;
    // window.ProjectCarousel3D.create já recusa sozinho (retorna null) em
    // prefers-reduced-motion, telas pequenas ou poucos itens — nesses casos
    // caímos na lista simples com scroll que já existia.
    carousel3d = window.ProjectCarousel3D?.create(track, caseStudies) || null;

    if (!carousel3d) {
      track.innerHTML = caseStudies.length
        ? caseStudies.map(projectCardHtml).join('')
        : '<p class="showcase-empty">Ainda não temos projetos publicados o suficiente — os primeiros matches confirmados aparecerão aqui.</p>';
    }

    if (archResult.architects.length) {
      ranking.classList.add('lb');
      ranking.setAttribute('role', 'list');
      ranking.setAttribute('aria-label', 'Ranking dos arquitetos com melhor mérito');
      ranking.innerHTML = archResult.architects.map(rankingItemHtml).join('');
      revealRows();
    } else {
      ranking.innerHTML = '<p class="showcase-empty">Nenhum arquiteto cadastrado ainda.</p>';
    }
  } catch {
    track.innerHTML = '<p class="showcase-empty">Não foi possível carregar a vitrine agora.</p>';
    ranking.innerHTML = '';
  }

  prevBtn?.addEventListener('click', () => {
    if (carousel3d) carousel3d.prev();
    else track.scrollBy({ left: -320, behavior: 'smooth' });
  });
  nextBtn?.addEventListener('click', () => {
    if (carousel3d) carousel3d.next();
    else track.scrollBy({ left: 320, behavior: 'smooth' });
  });
});
