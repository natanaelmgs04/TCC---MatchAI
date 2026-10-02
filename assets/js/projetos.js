document.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('apiBaseLabel').textContent = MatchAPI.base();
  const grid = document.getElementById('materialGrid');

  // Fotos reais do Unsplash por material (mesmas do banco — capturadas na última
  // vez que "npm run seed:materials" rodou), pra funcionar até offline.
  const FALLBACK = [
    ['Carvalho', 'Madeira', 'assets/img/photos/photo-1611072337226-1140ab367200.webp'],
    ['Nogueira', 'Madeira', 'assets/img/photos/photo-1546484396-fb3fc6f95f98.webp'],
    ['Bambu', 'Madeira', 'assets/img/photos/photo-1577199019410-0d4567e04117.webp'],
    ['Concreto aparente', 'Concreto', 'assets/img/photos/photo-1617713965103-9fda56c89fad.webp'],
    ['Granilite', 'Concreto', 'assets/img/photos/photo-1634131330605-e6dfd1a314c4.webp'],
    ['Mármore Carrara', 'Pedra', 'assets/img/photos/photo-1523251836828-b75d28b89804.webp'],
    ['Granito', 'Pedra', 'assets/img/photos/photo-1652305461546-bf0a76934433.webp'],
    ['Travertino', 'Pedra', 'assets/img/photos/photo-1724219548981-1c2a333144db.webp'],
    ['Ardósia', 'Pedra', 'assets/img/photos/photo-1542732056-648731297c97.webp'],
    ['Calcário', 'Pedra', 'assets/img/photos/photo-1581710515207-e12b6e176779.webp'],
    ['Quartzo', 'Pedra', 'assets/img/photos/photo-1623197532650-bacb8a68914e.webp'],
    ['Tijolo aparente', 'Alvenaria', 'assets/img/photos/photo-1520758594221-872948699332.webp'],
    ['Vidro', 'Vidro', 'assets/img/photos/photo-1523477593243-78bbf626fd3b.webp'],
    ['Aço', 'Metal', 'assets/img/photos/photo-1579223442946-c1c147e96598.webp'],
    ['Alumínio', 'Metal', 'assets/img/photos/photo-1666555038185-8323c553de64.webp'],
    ['Revestimento cerâmico', 'Cerâmica', 'assets/img/photos/photo-1678742755904-6c3fc8ba6602.webp'],
    ['Porcelanato', 'Cerâmica', 'assets/img/photos/photo-1714334200104-004e5d66708a.webp'],
    ['Cortiça', 'Natural', 'assets/img/photos/photo-1558051815-0f18e64e6280.webp'],
  ].map(([name, category, imageUrl]) => ({ name, category, imageUrl }));
  // A cópia local tem prioridade sobre o link salvo no banco: é a mesma foto,
  // mas não depende do domínio do Unsplash (bloqueado em algumas redes) e
  // também cobre o banco local do `npm run dev:local`, que nasce sem fotos.
  const LOCAL_PHOTO = Object.fromEntries(FALLBACK.map((m) => [m.name, m.imageUrl]));
  const photoOf = (m) => LOCAL_PHOTO[m.name] || m.imageUrl || 'assets/img/photos/fallback.webp';

  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  function render(materials) {
    grid.innerHTML = materials.map(m => `
      <div class="material-card spotlight">
        <div class="thumb"><img src="${esc(photoOf(m))}" alt="${esc(m.name)}" loading="lazy"></div>
        <div class="info">
          <span class="cat">${m.category || 'Material'}</span>
          <h4>${esc(m.name)}</h4>
        </div>
      </div>
    `).join('');
  }

  grid.innerHTML = `
    <div class="skeleton-card">
      <div class="skeleton-block thumb"></div>
      <div class="skeleton-lines">
        <div class="skeleton-block line" style="width:40%;"></div>
        <div class="skeleton-block line" style="width:70%;"></div>
      </div>
    </div>`.repeat(9);

  try {
    const materials = await MatchAPI.materials();
    render(materials.length ? materials : FALLBACK);
  } catch (err) {
    document.getElementById('apiBanner').classList.add('show');
    render(FALLBACK);
  }
});
