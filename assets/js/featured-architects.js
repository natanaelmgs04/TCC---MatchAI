/**
 * Vitrine "Arquitetos em destaque" no topo de destaques.html — crossfade de
 * foto + seletor de avatares trocando nome/cargo/bio, no mesmo espírito de
 * uma vitrine de estúdio criativo. Dados (nome, cidade, bio, nota, id pro
 * link de perfil) são reais, vindos do mesmo ranking por mérito de sempre
 * (MatchAPI.architects); só as fotos são ilustrativas por enquanto — os
 * arquitetos de demonstração não têm foto própria cadastrada ainda.
 */
document.addEventListener('DOMContentLoaded', async () => {
  const section = document.getElementById('featuredHero');
  if (!section) return;

  const PLACEHOLDER_PHOTOS = [
    'assets/img/photos/arquiteto-hero-1.webp',
    'assets/img/photos/arquiteto-hero-2.webp',
    'assets/img/photos/arquiteto-hero-3.webp',
    'assets/img/photos/arquiteto-hero-4.webp',
    'assets/img/photos/arquiteto-hero-5.webp',
    'assets/img/photos/arquiteto-hero-6.webp',
    'assets/img/photos/arquiteto-hero-7.webp',
    'assets/img/photos/arquiteto-hero-8.webp',
  ];
  const ROLE_FALLBACKS = [
    'Arquitetura residencial', 'Interiores', 'Arquitetura de conceito', 'Estilo e materiais',
    'Paisagismo e circulação', 'Uso do espaço', 'Detalhamento técnico', 'Direção de estúdio',
  ];

  let architects = [];
  try {
    const result = await MatchAPI.architects({ pageSize: 8 });
    architects = result.architects || [];
  } catch { /* offline: seção some, o resto da página segue normal */ }

  if (!architects.length) return;
  section.style.display = 'flex';

  const slides = architects.map((a, i) => {
    const location = [a.city, a.state].filter(Boolean).join('/');
    const role = [a.profile?.styles?.[0], location].filter(Boolean).join(' · ') || ROLE_FALLBACKS[i % ROLE_FALLBACKS.length];
    const bio = a.profile?.bio
      || `${a.name} atua${a.city ? ` em ${a.city}` : ''}${a.profile?.yearsExperience ? `, ${a.profile.yearsExperience} anos de experiência` : ''}${a.avgRating ? `, nota ${a.avgRating}` : ''}.`;
    return { id: a.id, name: a.name, role, bio, photo: PLACEHOLDER_PHOTOS[i % PLACEHOLDER_PHOTOS.length] };
  });

  const bgWrap = document.getElementById('fhBgs');
  bgWrap.innerHTML = slides.map((s, i) =>
    `<div class="fh-bg${i === 0 ? ' active' : ''}" style="background-image:url('${s.photo}')"></div>`).join('');

  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const avatarsWrap = document.getElementById('fhAvatars');
  avatarsWrap.innerHTML = slides.map((s, i) => `
    <button type="button" class="fh-avatar-btn${i === 0 ? ' active' : ''}" data-index="${i}" aria-label="Ver ${esc(s.name)}">
      <span class="fh-avatar-dot"></span>
      <span class="fh-avatar-thumb"><img src="${s.photo}" alt="${esc(s.name)}" loading="lazy"></span>
    </button>`).join('');

  const descEl = document.getElementById('fhDesc');
  const nameEl = document.getElementById('fhName');
  const roleEl = document.getElementById('fhRole');
  const linkEl = document.getElementById('fhLink');

  function restartFade(el) {
    el.classList.remove('fh-fade');
    void el.offsetWidth;
    el.classList.add('fh-fade');
  }

  function setActive(index) {
    avatarsWrap.querySelectorAll('.fh-avatar-btn').forEach((btn, i) => btn.classList.toggle('active', i === index));
    bgWrap.querySelectorAll('.fh-bg').forEach((bg, i) => bg.classList.toggle('active', i === index));
    const s = slides[index];
    descEl.textContent = s.bio;
    nameEl.textContent = s.name;
    roleEl.textContent = s.role;
    linkEl.href = `arquiteto.html?id=${s.id}`;
    restartFade(descEl);
    restartFade(nameEl);
  }

  avatarsWrap.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-index]');
    if (btn) setActive(Number(btn.dataset.index));
  });

  setActive(0);
});
