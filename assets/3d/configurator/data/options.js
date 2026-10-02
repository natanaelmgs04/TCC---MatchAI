/**
 * Catálogo da experiência 3D (experiencia-3d.html). Tudo que o cliente pode
 * escolher vive aqui — o código só lê. Para adicionar um material novo basta
 * um objeto em MATERIALS; para uma superfície nova, um objeto em SURFACES e
 * o mesmo id marcado nas peças do modelo (userData.surface no procedural,
 * ou o nome do material "surf-<id>" num house.glb — ver house.js).
 *
 * `styles` usa só o vocabulário de PROJECT_STYLES (assets/js/data/project-styles.js);
 * `matchName` é o nome que os arquitetos usam nos materiais do portfólio —
 * os dois alimentam o motor de match quando o projeto é criado.
 * `mood` pesa no medidor aconchegante/luminoso/intimista.
 */

export const SURFACES = [
  { id: 'piso',            label: 'Piso',                 accepts: ['madeira', 'pedra'],          weight: 2.2 },
  { id: 'parede-destaque', label: 'Parede de destaque',   accepts: ['tinta', 'pedra', 'madeira'], weight: 1.4 },
  { id: 'paredes',         label: 'Paredes',              accepts: ['tinta', 'pedra'],            weight: 2.2 },
  { id: 'ripado',          label: 'Painel ripado',        accepts: ['madeira'],                   weight: 0.8 },
  { id: 'estofados',       label: 'Estofados',            accepts: ['tecido'],                    weight: 1.4 },
  { id: 'detalhes',        label: 'Almofadas e detalhes', accepts: ['tecido'],                    weight: 1.0 },
  { id: 'cama',            label: 'Roupa de cama',        accepts: ['tecido'],                    weight: 0.9 },
  { id: 'tapetes',         label: 'Tapetes',              accepts: ['tecido'],                    weight: 0.8 },
  { id: 'marcenaria',      label: 'Marcenaria',           accepts: ['madeira'],                   weight: 1.0 },
];

// Etiquetas flutuantes sobre a maquete, ligadas por um fio até a peça.
export const FLOATING_LABELS = ['estofados', 'ripado', 'paredes', 'piso', 'cama'];

export const TABS = [
  { id: 'madeira', label: 'Madeira' },
  { id: 'pedra',   label: 'Pedra' },
  { id: 'tecido',  label: 'Tecido' },
  { id: 'tinta',   label: 'Tinta' },
  { id: 'moveis',  label: 'Móveis' },
];

const m = (id, label, tab, pattern, base, accent, roughness, mood, styles, matchName) =>
  ({ id, label, tab, pattern, base, accent, roughness, mood, styles, matchName });

export const MATERIALS = [
  // Madeira — tábuas no piso, veio na marcenaria e no ripado
  m('carvalho-mel',      'Carvalho mel',      'madeira', 'wood', '#c79a5f', '#a5773f', 0.62, { cozy: 3, bright: 1 }, ['Escandinavo', 'Rústico'], 'Madeira natural'),
  m('carvalho-claro',    'Carvalho claro',    'madeira', 'wood', '#dcc59e', '#c2a676', 0.6,  { bright: 3, cozy: 1 }, ['Escandinavo', 'Minimalista'], 'Madeira clara'),
  m('nogueira',          'Nogueira',          'madeira', 'wood', '#7a4a2d', '#59331d', 0.55, { cozy: 2, moody: 1 }, ['Contemporâneo', 'Alto padrão'], 'Madeira nogueira'),
  m('carvalho-defumado', 'Carvalho defumado', 'madeira', 'wood', '#5b4434', '#3e2d21', 0.58, { moody: 3 },          ['Contemporâneo', 'Industrial'], 'Madeira escura'),
  m('freijo-ebanizado',  'Freijó ebanizado',  'madeira', 'wood', '#302a26', '#1f1b18', 0.5,  { moody: 3 },          ['Moderno', 'Alto padrão'], 'Madeira ebanizada'),

  // Pedra
  m('travertino',        'Travertino',        'pedra', 'travertine', '#d8ccb6', '#bfae8e', 0.82, { bright: 2, cozy: 1 }, ['Contemporâneo', 'Alto padrão'], 'Travertino'),
  m('marmore-branco',    'Mármore branco',    'pedra', 'marble',     '#ece9e4', '#a9a39a', 0.32, { bright: 3 },          ['Clássico', 'Alto padrão'], 'Mármore'),
  m('cimento-queimado',  'Cimento queimado',  'pedra', 'cement',     '#9c9891', '#85817a', 0.78, { moody: 1, bright: 1 }, ['Industrial', 'Minimalista'], 'Cimento queimado'),
  m('concreto-aparente', 'Concreto aparente', 'pedra', 'concrete',   '#8d8982', '#6f6b65', 0.9,  { moody: 2 },          ['Brutalista', 'Industrial'], 'Concreto aparente'),
  m('ceramica-terracota','Cerâmica terracota','pedra', 'tiles',      '#b06e52', '#8f5640', 0.74, { cozy: 3 },           ['Rústico', 'Biofílico'], 'Cerâmica'),

  // Tecido
  m('boucle',            'Bouclê',            'tecido', 'boucle',  '#ece5d8', '#d6ccbb', 0.95, { bright: 2, cozy: 1 }, ['Contemporâneo', 'Escandinavo'], 'Bouclê'),
  m('linho',             'Linho cru',         'tecido', 'weave',   '#e2d8c6', '#cbbfa9', 0.92, { bright: 2, cozy: 1 }, ['Escandinavo', 'Minimalista'], 'Linho'),
  m('linho-salvia',      'Linho sálvia',      'tecido', 'weave',   '#8a9c8c', '#71837a', 0.92, { bright: 1, cozy: 1 }, ['Biofílico'], 'Linho'),
  m('la-ferrugem',       'Lã ferrugem',       'tecido', 'knit',    '#b1593b', '#8e4429', 0.95, { cozy: 3 },           ['Rústico', 'Contemporâneo'], 'Lã'),
  m('couro-conhaque',    'Couro conhaque',    'tecido', 'leather', '#99592f', '#74401f', 0.48, { cozy: 1, moody: 2 }, ['Industrial', 'Clássico'], 'Couro'),
  m('veludo-ocre',       'Veludo ocre',       'tecido', 'velvet',  '#c28b2f', '#9c6c1c', 0.7,  { cozy: 2, moody: 1 }, ['Contemporâneo'], 'Veludo'),
  m('veludo-marinho',    'Veludo marinho',    'tecido', 'velvet',  '#2b3651', '#1b2338', 0.7,  { moody: 3 },          ['Alto padrão', 'Clássico'], 'Veludo'),
  m('trico-aveia',       'Tricô aveia',       'tecido', 'knit',    '#d5c6aa', '#bba98b', 0.96, { cozy: 2, bright: 1 }, ['Escandinavo', 'Rústico'], 'Tricô'),
  m('feltro-carvao',     'Feltro carvão',     'tecido', 'felt',    '#3b3b3d', '#2c2c2e', 0.98, { moody: 3 },          ['Moderno', 'Industrial'], 'Feltro'),

  // Tinta
  m('cal-areia',  'Cal areia',     'tinta', 'limewash', '#e2cdab', '#d1b98f', 0.92, { cozy: 3 },           ['Rústico', 'Biofílico', 'Contemporâneo'], 'Pintura à cal'),
  m('off-white',  'Off-white',     'tinta', 'flat',     '#f0ece3', '#e4dfd4', 0.9,  { bright: 3 },          ['Minimalista', 'Escandinavo'], 'Pintura acrílica'),
  m('salvia',     'Verde sálvia',  'tinta', 'limewash', '#8b9d8d', '#788b7b', 0.9,  { bright: 1, cozy: 1 }, ['Biofílico', 'Escandinavo'], 'Pintura à cal'),
  m('terracota',  'Terracota',     'tinta', 'limewash', '#b2775c', '#9d6248', 0.9,  { cozy: 3 },           ['Rústico', 'Contemporâneo'], 'Pintura à cal'),
  m('azul-tinta', 'Azul-tinta',    'tinta', 'flat',     '#2f3a52', '#263047', 0.88, { moody: 3 },          ['Alto padrão', 'Contemporâneo'], 'Pintura acrílica'),
  m('grafite',    'Grafite',       'tinta', 'flat',     '#3b3a39', '#302f2e', 0.88, { moody: 2 },          ['Moderno', 'Industrial'], 'Pintura acrílica'),
];

export const MATERIAL_BY_ID = Object.fromEntries(MATERIALS.map((x) => [x.id, x]));

export const PRESETS = [
  {
    id: 'aconchegante', label: 'Aconchegante', sub: 'fim de tarde', time: 18 * 60 + 24,
    surfaces: { piso: 'carvalho-mel', 'parede-destaque': 'cal-areia', paredes: 'cal-areia', ripado: 'nogueira', estofados: 'boucle', detalhes: 'la-ferrugem', cama: 'linho', tapetes: 'trico-aveia', marcenaria: 'nogueira' },
  },
  {
    id: 'luminosa', label: 'Luminosa', sub: 'meio-dia', time: 12 * 60 + 45,
    surfaces: { piso: 'carvalho-claro', 'parede-destaque': 'off-white', paredes: 'off-white', ripado: 'carvalho-claro', estofados: 'linho', detalhes: 'linho-salvia', cama: 'linho', tapetes: 'trico-aveia', marcenaria: 'carvalho-claro' },
  },
  {
    id: 'intimista', label: 'Intimista', sub: 'noite', time: 22 * 60 + 12,
    surfaces: { piso: 'carvalho-defumado', 'parede-destaque': 'azul-tinta', paredes: 'azul-tinta', ripado: 'nogueira', estofados: 'couro-conhaque', detalhes: 'veludo-ocre', cama: 'veludo-marinho', tapetes: 'feltro-carvao', marcenaria: 'carvalho-defumado' },
  },
];

export const MOOD_WORDS = { cozy: 'aconchegante', bright: 'luminoso', moody: 'intimista' };

export const DAY_START = 6 * 60;          // 06:00
export const DAY_END = 22 * 60 + 30;      // 22:30
export const DAYLIGHT = [
  { id: 'manha',       label: 'Manhã',        time: 7 * 60 + 30,  icon: 'sunrise' },
  { id: 'meio-dia',    label: 'Meio-dia',     time: 12 * 60 + 45, icon: 'sun' },
  { id: 'fim-de-tarde',label: 'Fim de tarde', time: 18 * 60 + 30, icon: 'lamp' },
  { id: 'noite',       label: 'Noite',        time: 22 * 60 + 12, icon: 'moon' },
];

export const DEFAULT_PRESET = 'aconchegante';
