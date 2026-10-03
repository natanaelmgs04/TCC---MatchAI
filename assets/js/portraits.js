/**
 * Retrato ilustrativo de um arquiteto enquanto ele não tem foto própria
 * (os arquitetos de demonstração não têm). Escolha fixa a partir do id — a
 * mesma pessoa aparece na vitrine (destaques.html) e no perfil (arquiteto.html)
 * — e coerente com o primeiro nome (retratos femininos para nomes femininos).
 *
 * Cada retrato tem o recorte da pessoa alinhado pixel a pixel
 * (arquiteto-hero-N-cut.webp, gerado por assets/img/dev/cutout_portraits.py),
 * usado no hero editorial do perfil: o nome rola entre o fundo e a pessoa.
 */
const MatchPortraits = (() => {
  const FEMININE = [1, 2, 4];
  const MASCULINE = [3, 5, 6, 7, 8];
  // nomes femininos que não terminam em "a"
  const FEMININE_NAMES = new Set(['beatriz', 'ines', 'raquel', 'isabel', 'carmen', 'liz', 'ester', 'ruth', 'miriam', 'iris', 'luz', 'mel']);
  const MASCULINE_A = new Set(['luca', 'joshua', 'nikita', 'andrea']);

  const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const isFeminine = (name) => {
    const first = norm(name).split(/\s+/)[0] || '';
    if (FEMININE_NAMES.has(first)) return true;
    if (MASCULINE_A.has(first)) return false;
    return first.endsWith('a');
  };
  const hash = (s) => [...String(s || '')].reduce((sum, ch) => (sum * 31 + ch.charCodeAt(0)) >>> 0, 7);

  function pick(id, name) {
    const pool = isFeminine(name) ? FEMININE : MASCULINE;
    const n = pool[hash(id) % pool.length];
    return {
      photo: `assets/img/photos/arquiteto-hero-${n}.webp`,
      cutout: `assets/img/photos/arquiteto-hero-${n}-cut.webp`,
    };
  }

  return { pick, isFeminine };
})();
