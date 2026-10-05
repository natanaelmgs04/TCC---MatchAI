/**
 * experiencia-3d.html — última etapa do "Novo projeto".
 * Lê o rascunho do formulário (project-draft.js), monta a experiência 3D
 * (main.js) e, quando o cliente confirma no resumo, cria o projeto com as
 * escolhas do 3D junto. Sem WebGL2 (ou se algo falhar), oferece criar o
 * projeto sem a experiência — o resto do fluxo nunca fica bloqueado.
 *
 * Com ?projeto=<id> (botão no resumo do projeto, no painel) a página reabre a
 * experiência de um projeto que já existe, com as escolhas salvas, e o
 * "Concluir" atualiza esse projeto em vez de criar outro.
 */
/* global MatchAPI, MatchProjectDraft — `const` dos scripts clássicos da página (não ficam em window) */
const Draft = MatchProjectDraft;
const host = document.querySelector('[data-x3]');
const intro = host.querySelector('[data-x3-intro]');
const startBtn = intro.querySelector('[data-start]');
const bar = intro.querySelector('[role="progressbar"]');
const barLabel = intro.querySelector('[data-progress-label]');
const SESSION_EXPIRED = 'Sua sessão expirou. Entre de novo pela página de login — o que você montou fica salvo nesta aba.';
const editId = new URLSearchParams(location.search).get('projeto');
const BACK_TO_PANEL = 'dashboard.html#projeto';

/** Link compartilhado (#cfg=…, gerado pela barra de ferramentas). */
function readHashState() {
  const m = location.hash.match(/#cfg=([\w-]+)/);
  if (!m) return null;
  try {
    const bin = atob(m[1].replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))));
  } catch { return null; }
}

function setProgress(p, label) {
  const v = Math.round(p * 100);
  bar.setAttribute('aria-valuenow', String(v));
  bar.style.setProperty('--p', String(p));
  if (label) barLabel.textContent = label;
}

function webgl2() {
  try { return !!(window.WebGL2RenderingContext && document.createElement('canvas').getContext('webgl2')); }
  catch { return false; }
}

function showFallback(draft, reason) {
  intro.classList.add('is-fallback');
  const box = intro.querySelector('[data-fallback]');
  box.hidden = false;
  box.querySelector('[data-fallback-reason]').textContent = reason;
  startBtn.hidden = true;
  bar.hidden = true;
  barLabel.hidden = true;
  const create = box.querySelector('[data-create-plain]');
  const error = box.querySelector('[data-fallback-error]');
  create.addEventListener('click', async () => {
    create.disabled = true; create.textContent = 'Criando…';
    try {
      await MatchAPI.createProject(Draft.toPayload(draft, null));
      Draft.clear();
      location.href = 'dashboard.html#projeto';
    } catch (err) {
      error.textContent = err?.status === 401 ? SESSION_EXPIRED : (err?.message || 'Não foi possível criar o projeto agora.');
      create.disabled = false; create.textContent = 'Criar o projeto sem a experiência';
    }
  });
}

async function boot() {
  const draft = Draft.load();
  if (!String(draft.basics?.name || '').trim()) { location.replace('novo-projeto.html'); return; }
  host.querySelectorAll('[data-project-name]').forEach((el) => { el.textContent = draft.basics.name.trim(); });

  if (!webgl2()) { showFallback(draft, 'Este navegador não consegue abrir a experiência 3D.'); return; }

  let saveTimer = null;
  const persist = (state) => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { draft.scene = state; Draft.save(draft); }, 400);
  };

  let app;
  try {
    setProgress(0.05, 'Carregando a experiência');
    const { mount } = await import('./main.js');
    app = await mount(host, {
      initial: readHashState() || draft.scene || null,
      projectName: draft.basics.name.trim(),
      glbUrl: host.dataset.model || null,
      onProgress: setProgress,
      onChange: persist,
      onFinish: async (experience) => {
        clearTimeout(saveTimer);
        draft.scene = app.store.get();
        Draft.save(draft); // se a criação falhar, nada do que foi montado se perde
        try {
          await MatchAPI.createProject(Draft.toPayload(draft, experience));
        } catch (err) {
          throw err?.status === 401 ? { message: SESSION_EXPIRED } : err;
        }
        Draft.clear();
        location.href = 'dashboard.html#projeto';
      },
      onBack: (state) => {
        clearTimeout(saveTimer);
        draft.scene = state;
        draft.step = 3;
        Draft.save(draft);
        location.href = 'novo-projeto.html';
      },
    });
  } catch (err) {
    console.error('[experiencia-3d]', err);
    showFallback(draft, 'Não conseguimos montar a casa em 3D neste aparelho.');
    return;
  }

  startBtn.disabled = false;
  startBtn.textContent = 'Começar';
  barLabel.textContent = 'Tudo pronto';
  startBtn.focus({ preventScroll: true });
  startBtn.addEventListener('click', () => {
    intro.classList.add('is-leaving');
    setTimeout(() => { intro.hidden = true; }, 700);
    app.start();
  }, { once: true });
}

// ---------------------------------------------------------------------------
// Reabrir um projeto que já existe
// ---------------------------------------------------------------------------
const editKey = (id) => `matchia_x3_edit_${id}`;
function readEdit(id) {
  try { return JSON.parse(sessionStorage.getItem(editKey(id)) || 'null'); } catch { return null; }
}
function writeEdit(id, state) {
  try { sessionStorage.setItem(editKey(id), JSON.stringify(state)); } catch { /* aba anônima: segue só em memória */ }
}
function clearEdit(id) {
  try { sessionStorage.removeItem(editKey(id)); } catch { /* idem */ }
}

/** Projetos salvos antes de guardarmos a cena crua: refaz o que dá a partir do resumo. */
function sceneFromExperience(exp) {
  if (!exp) return null;
  if (exp.scene) return exp.scene;
  const surfaces = Object.fromEntries(Object.entries(exp.surfaces || {}).map(([k, s]) => [k, s?.id]).filter(([, id]) => id));
  const [h, m] = String(exp.time || '').split(':').map(Number);
  return { preset: exp.preset, surfaces, time: Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : undefined, furniture: {} };
}

/**
 * Troca no projeto o que veio da experiência anterior pelo que veio desta:
 * estilos e materiais que o cliente escreveu no formulário ficam.
 */
function mergeIntoProject(project, experience, materialById) {
  const old = project.experience || {};
  const fromPicks = new Set((project.stylePicks || []).flatMap((p) => p.styles || []));
  const oldStyles = (old.styles || []).slice(0, 2).filter((s) => !fromPicks.has(s));
  const preferredStyles = [...new Set([...(project.preferredStyles || []).filter((s) => !oldStyles.includes(s)), ...experience.styles.slice(0, 2)])];
  const oldMaterials = new Set(Object.values(old.surfaces || {}).map((s) => materialById[s?.id]?.matchName).filter(Boolean));
  const preferredMaterials = [...new Set([...(project.preferredMaterials || []).filter((m) => !oldMaterials.has(m)), ...experience.materials])];
  return { experience: experience.payload, preferredStyles, preferredMaterials };
}

function pointLinksToPanel() {
  host.querySelectorAll('a[href="novo-projeto.html"]').forEach((a) => { a.href = BACK_TO_PANEL; a.textContent = 'Voltar ao painel'; });
}

/** Sem 3D, o projeto já existe: só explica e deixa o link de volta ao painel. */
function showEditFallback(reason) {
  intro.classList.add('is-fallback');
  const box = intro.querySelector('[data-fallback]');
  box.hidden = false;
  box.querySelector('[data-fallback-reason]').textContent = reason;
  box.querySelectorAll('p:not([data-fallback-reason]):not([data-fallback-error]), [data-create-plain]').forEach((el) => { el.hidden = true; });
  startBtn.hidden = true;
  bar.hidden = true;
  barLabel.hidden = true;
}

async function bootEdit(id) {
  pointLinksToPanel();
  let project;
  try {
    project = (await MatchAPI.projects()).find((p) => String(p._id) === id);
  } catch (err) {
    if (err?.status === 401) { location.replace('login.html'); return; }
  }
  if (!project) { location.replace(BACK_TO_PANEL); return; }
  const name = project.name || 'Meu projeto';
  host.querySelectorAll('[data-project-name]').forEach((el) => { el.textContent = name; });
  document.title = `Experiência 3D · ${name} — match.IA`;

  if (!webgl2()) {
    showEditFallback('Este navegador não consegue abrir a experiência 3D.');
    return;
  }

  let saveTimer = null;
  const persist = (state) => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => writeEdit(id, state), 400);
  };

  let app;
  try {
    setProgress(0.05, 'Carregando a experiência');
    const [{ mount }, { MATERIAL_BY_ID }] = await Promise.all([import('./main.js'), import('./data/options.js')]);
    app = await mount(host, {
      mode: 'edit',
      initial: readHashState() || readEdit(id) || sceneFromExperience(project.experience),
      projectName: name,
      glbUrl: host.dataset.model || null,
      onProgress: setProgress,
      onChange: persist,
      onFinish: async (experience) => {
        clearTimeout(saveTimer);
        writeEdit(id, app.store.get()); // se salvar falhar, nada do que foi montado se perde
        try {
          await MatchAPI.updateProject(id, mergeIntoProject(project, experience, MATERIAL_BY_ID));
        } catch (err) {
          throw err?.status === 401 ? { message: SESSION_EXPIRED } : err;
        }
        clearEdit(id);
        location.href = BACK_TO_PANEL;
      },
      onBack: (state) => {
        clearTimeout(saveTimer);
        writeEdit(id, state);
        location.href = BACK_TO_PANEL;
      },
    });
  } catch (err) {
    console.error('[experiencia-3d]', err);
    showEditFallback('Não conseguimos montar a casa em 3D neste aparelho.');
    return;
  }

  startBtn.disabled = false;
  startBtn.textContent = project.experience ? 'Continuar de onde parei' : 'Começar';
  barLabel.textContent = 'Tudo pronto';
  startBtn.focus({ preventScroll: true });
  startBtn.addEventListener('click', () => {
    intro.classList.add('is-leaving');
    setTimeout(() => { intro.hidden = true; }, 700);
    app.start();
  }, { once: true });
}

const user = MatchAPI.currentUser();
if (!MatchAPI.token() || !user) location.replace('login.html');
else if (user.role !== 'client') location.replace('dashboard.html');
else if (editId && /^[a-f\d]{24}$/i.test(editId)) bootEdit(editId);
else boot();
