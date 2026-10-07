/**
 * Retrato ilustrativo de um arquiteto enquanto ele não tem foto própria
 * (os arquitetos de demonstração não têm). É a ÚNICA fonte de foto de
 * arquiteto do site: vitrine (destaques.html), ranking e destaques da home,
 * painel e perfil (arquiteto.html) chamam MatchPortraits.photoFor(), então a
 * mesma pessoa tem o mesmo rosto em todo lugar — e coerente com o primeiro
 * nome (retratos femininos para nomes femininos).
 *
 * Os retratos de estúdio têm o recorte da pessoa alinhado pixel a pixel
 * (arquiteto-hero-N-cut.webp, gerado por assets/img/dev/cutout_portraits.py),
 * usado no hero editorial do perfil. Os que não têm recorte (cutout: null)
 * aparecem no perfil como retrato em arco, igual a uma foto enviada.
 */
const MatchPortraits = (() => {
  const dir = 'assets/img/photos/';
  const studio = (n) => ({ photo: `${dir}arquiteto-hero-${n}.webp`, cutout: `${dir}arquiteto-hero-${n}-cut.webp` });
  const plain = (file) => ({ photo: `${dir}${file}`, cutout: null });

  const FEMININE = [studio(1), studio(2), studio(4), plain('photo-1580489944761-15a19d654956.webp'), plain('photo-1573496359142-b8d87734a5a2.webp')];
  const MASCULINE = [studio(3), studio(5), studio(6), studio(7), studio(8)];

  // Arquitetos de demonstração (backend/src/data/demoArchitects.js): cada um com
  // um retrato só dele, para a vitrine não repetir rosto. A chave é o nome
  // completo, que é fixo — o id muda de um banco para o outro.
  const FIXED = {
    'fernanda albuquerque': FEMININE[0],
    'camila duarte reis': FEMININE[1],
    'juliana matsuda': FEMININE[2],
    'patricia andrade costa': FEMININE[3],
    'beatriz lacerda moura': FEMININE[4],
    'thiago bezerra lima': MASCULINE[0],
    'ricardo nogueira prado': MASCULINE[1],
    'eduardo salgado faria': MASCULINE[2],
    'marcos villela': MASCULINE[3],
    'gustavo peixoto amaral': MASCULINE[4],
  };

  // nomes femininos que não terminam em "a"
  const FEMININE_NAMES = new Set(['beatriz', 'ines', 'raquel', 'isabel', 'carmen', 'liz', 'ester', 'ruth', 'miriam', 'iris', 'luz', 'mel']);
  const MASCULINE_A = new Set(['luca', 'joshua', 'nikita', 'andrea']);

  const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().replace(/\s+/g, ' ');
  const isFeminine = (name) => {
    const first = norm(name).split(' ')[0] || '';
    if (FEMININE_NAMES.has(first)) return true;
    if (MASCULINE_A.has(first)) return false;
    return first.endsWith('a');
  };
  const hash = (s) => [...String(s || '')].reduce((sum, ch) => (sum * 31 + ch.charCodeAt(0)) >>> 0, 7);

  // Contas reais que ainda não enviaram foto: retratos que NÃO são de nenhum
  // arquiteto de demonstração, para ninguém aparecer com o rosto de outro.
  const OTHER_FEMININE = [plain('photo-1544005313-94ddf0286df2.webp')];
  const OTHER_MASCULINE = [
    plain('photo-1500648767791-00dcc994a43e.webp'), plain('photo-1507003211169-0a1dd7228f2d.webp'),
    plain('photo-1519085360753-af0119f7cbe7.webp'), plain('photo-1560250097-0b93528c311a.webp'),
    plain('photo-1472099645785-5658abf4ff4e.webp'),
  ];

  /** { photo, cutout } do retrato ilustrativo (cutout null = sem recorte). */
  function pick(id, name) {
    const fixed = FIXED[norm(name)];
    if (fixed) return fixed;
    const pool = isFeminine(name) ? OTHER_FEMININE : OTHER_MASCULINE;
    return pool[hash(id || name) % pool.length];
  }

  /** Foto para mostrar: a que o arquiteto enviou ou, sem ela, o retrato ilustrativo. */
  function photoFor(a) {
    if (a?.avatar && typeof MatchAPI !== 'undefined') return MatchAPI.avatarSrc(a.avatar);
    return pick(a?.id || a?._id, a?.name).photo;
  }

  return { pick, photoFor, isFeminine };
})();
