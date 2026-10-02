/**
 * experiencia-3d.html — última etapa do "Novo projeto".
 * Lê o rascunho do formulário (project-draft.js), monta a experiência 3D
 * (main.js) e, quando o cliente confirma no resumo, cria o projeto com as
 * escolhas do 3D junto. Sem WebGL2 (ou se algo falhar), oferece criar o
 * projeto sem a experiência — o resto do fluxo nunca fica bloqueado.
 */
/* global MatchAPI, MatchProjectDraft — `const` dos scripts clássicos da página (não ficam em window) */
const Draft = MatchProjectDraft;
const host = document.querySelector('[data-x3]');
const intro = host.querySelector('[data-x3-intro]');
const startBtn = intro.querySelector('[data-start]');
const bar = intro.querySelector('[role="progressbar"]');
const barLabel = intro.querySelector('[data-progress-label]');
const SESSION_EXPIRED = 'Sua sessão expirou. Entre de novo pela página de login — o que você montou fica salvo nesta aba.';

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

const user = MatchAPI.currentUser();
if (!MatchAPI.token() || !user) location.replace('login.html');
else if (user.role !== 'client') location.replace('dashboard.html');
else boot();
