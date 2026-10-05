/**
 * Página de um modelo do Estúdio 3D (modelo-3d.html?id=…): o arquiteto e os
 * clientes com quem ele compartilhou veem o mesmo modelo, giram, baixam e
 * comentam. O .glb vem da API com o login (não é público) e é aberto pelo
 * GLTFLoader a partir do ArrayBuffer.
 *
 * Render sob demanda: só desenha quando a câmera mexe (ou enquanto gira
 * sozinho no começo), e para quando a aba fica em segundo plano.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const API = MatchAPI; // const global de api.js (script clássico): visível aqui, mas não em window
const $ = (id) => document.getElementById(id);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const id = new URLSearchParams(location.search).get('id');
const me = API.currentUser();
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

if (!API.token() || !me) location.href = `login.html?next=${encodeURIComponent(location.pathname + location.search)}`;
$('m3Back').href = 'dashboard.html#modelos3d';

let model = null;

const KIND = { object: 'Objeto 3D', floorplan: 'Planta 3D' };
const SOURCE = { text: 'gerado a partir de texto', image: 'gerado a partir de imagem' };
const when = (d) => new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

function showState(text) {
  $('m3State').hidden = false;
  $('m3State').innerHTML = text;
  $('m3Layout').hidden = true;
}

async function load() {
  if (!id) return showState('Modelo não informado. <a href="dashboard.html">Voltar ao painel</a>');
  try {
    model = await API.model3d(id);
  } catch (err) {
    return showState(`${esc(err.message || 'Não foi possível abrir o modelo.')} <a href="dashboard.html">Voltar ao painel</a>`);
  }
  $('m3State').hidden = true;
  $('m3Layout').hidden = false;
  paintHead();
  paintActions();
  paintComments();
  if (model.isOwner) setupShare();
  if (model.status === 'success') startViewer();
  else waitForResult();
}

function paintHead() {
  document.title = `${model.title} — Modelo 3D — match.IA`;
  $('m3Kind').textContent = KIND[model.kind] || 'Modelo 3D';
  $('m3Title').textContent = model.title;
  const by = model.isOwner ? 'Seu modelo' : `De ${model.owner?.name || 'arquiteto'}`;
  const bits = [by, SOURCE[model.source], model.project ? `projeto "${model.project.name}"` : '', when(model.createdAt)];
  $('m3Meta').textContent = bits.filter(Boolean).join(' · ');
  if (model.prompt) {
    const p = document.createElement('p');
    p.className = 'm3-prompt';
    p.textContent = `"${model.prompt}"`;
    $('m3Meta').after(p);
  }
}

function paintActions() {
  const a = $('m3Actions');
  const parts = [];
  if (model.status === 'success') parts.push('<button type="button" class="btn btn-secondary btn-sm" data-act="download">Baixar .glb</button>');
  if (model.isOwner) {
    parts.push('<button type="button" class="btn btn-secondary btn-sm" data-act="rename">Renomear</button>');
    parts.push('<button type="button" class="btn btn-tertiary btn-sm m3-danger" data-act="delete">Excluir</button>');
  }
  a.innerHTML = parts.join('');
}

$('m3Actions').addEventListener('click', async (e) => {
  const act = e.target.closest('[data-act]')?.dataset.act;
  if (!act) return;
  if (act === 'download') {
    try {
      const blob = await API.authBlob(`/models3d/${encodeURIComponent(model.id)}/file`);
      const url = URL.createObjectURL(blob);
      const link = Object.assign(document.createElement('a'), { href: url, download: `${model.title.replace(/[^\p{L}\p{N} _-]/gu, '').trim() || 'modelo'}.glb` });
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (err) { alert(err.message); }
  }
  if (act === 'rename') {
    const title = prompt('Novo nome do modelo:', model.title);
    if (!title || !title.trim() || title.trim() === model.title) return;
    try { model = await API.renameModel3d(model.id, title.trim()); paintHead(); } catch (err) { alert(err.message); }
  }
  if (act === 'delete') {
    if (!confirm('Excluir este modelo? Os clientes com quem você compartilhou também deixam de ver.')) return;
    try { await API.deleteModel3d(model.id); location.href = 'dashboard.html#modelos3d'; } catch (err) { alert(err.message); }
  }
});

// ---------- enquanto gera ----------
function waitForResult() {
  const msg = $('m3StageMsg');
  const paint = () => {
    if (model.status === 'failed') {
      msg.innerHTML = `<strong>Não foi possível gerar este modelo.</strong><span>${esc(model.error || 'Tente de novo com outra descrição ou imagem.')}</span>`;
      return;
    }
    msg.innerHTML = `<strong>Gerando o modelo…</strong><span class="m3-bar"><i style="width:${Math.max(4, model.progress)}%"></i></span><span>${model.progress}% · costuma levar de 1 a 3 minutos. Pode sair desta página: você recebe um aviso quando ficar pronto.</span>`;
  };
  paint();
  if (model.status === 'failed') return;
  const t = setInterval(async () => {
    try {
      model = await API.model3d(model.id);
    } catch { return; }
    paint();
    if (model.status === 'success') {
      clearInterval(t);
      paintActions();
      startViewer();
    } else if (model.status === 'failed') clearInterval(t);
  }, 3000);
}

// ---------- visualizador ----------
async function startViewer() {
  const stage = $('m3Stage');
  const msg = $('m3StageMsg');
  if (!window.WebGL2RenderingContext) {
    msg.innerHTML = '<strong>Seu navegador não mostra 3D.</strong><span>Use o botão "Baixar .glb" para abrir o modelo em outro programa.</span>';
    return;
  }
  msg.innerHTML = '<span class="spinner"></span><span>Abrindo o modelo…</span>';
  let buffer;
  try {
    buffer = await (await API.authBlob(`/models3d/${encodeURIComponent(model.id)}/file`)).arrayBuffer();
  } catch (err) {
    msg.innerHTML = `<strong>${esc(err.message)}</strong>`;
    return;
  }

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  stage.prepend(renderer.domElement);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  const sun = new THREE.DirectionalLight(0xffffff, 1.2);
  sun.position.set(3, 6, 4);
  scene.add(sun, new THREE.HemisphereLight(0xffffff, 0xd8cfc4, 0.6));

  const camera = new THREE.PerspectiveCamera(40, 1, 0.01, 1000);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.autoRotate = !reduceMotion;
  controls.autoRotateSpeed = 0.8;

  const draco = new DRACOLoader().setDecoderPath('https://unpkg.com/three@0.186.1/examples/jsm/libs/draco/gltf/');
  const loader = new GLTFLoader().setDRACOLoader(draco);
  let root;
  try {
    const gltf = await loader.parseAsync(buffer, '');
    root = gltf.scene;
  } catch {
    msg.innerHTML = '<strong>Não consegui abrir este arquivo 3D.</strong><span>Baixe o .glb para tentar em outro programa.</span>';
    renderer.dispose();
    renderer.domElement.remove();
    return;
  } finally {
    draco.dispose();
  }
  scene.add(root);

  // enquadra pelo tamanho do modelo
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  root.position.sub(center);
  const radius = Math.max(size.length() / 2, 0.01);
  const dist = radius / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2)) * 1.05;
  camera.position.set(dist * 0.75, dist * 0.45, dist * 0.75);
  camera.near = dist / 100;
  camera.far = dist * 100;
  camera.updateProjectionMatrix();
  controls.target.set(0, 0, 0);
  controls.minDistance = radius * 0.4;
  controls.maxDistance = dist * 4;
  controls.update();

  let needsRender = true;
  const requestRender = () => { needsRender = true; };
  controls.addEventListener('change', requestRender);
  controls.addEventListener('start', () => { controls.autoRotate = false; $('m3Hint').hidden = true; });

  const resize = () => {
    const w = stage.clientWidth, h = stage.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(h, 1);
    camera.updateProjectionMatrix();
    requestRender();
  };
  new ResizeObserver(resize).observe(stage);
  resize();

  const loop = () => {
    controls.update();               // damping e auto-rotação disparam 'change'
    if (!needsRender) return;
    needsRender = false;
    renderer.render(scene, camera);
  };
  let visible = true;
  const sync = () => renderer.setAnimationLoop(visible && !document.hidden ? loop : null);
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; sync(); }).observe(stage);
  document.addEventListener('visibilitychange', sync);
  sync();

  msg.innerHTML = '';
  msg.hidden = true;
  $('m3Hint').hidden = false;
}

// ---------- compartilhar (dono) ----------
async function setupShare() {
  $('m3Share').hidden = false;
  const select = $('m3ShareSelect');
  let candidates = [];
  try { candidates = await API.model3dCandidates(); } catch { /* lista vazia */ }
  const paintPeople = () => {
    const shared = new Set(model.sharedWith.map((p) => p.id));
    const free = candidates.filter((c) => !shared.has(c.id));
    select.innerHTML = free.length
      ? free.map((c) => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('')
      : '<option value="">Nenhum outro cliente disponível</option>';
    select.disabled = !free.length;
    $('m3ShareBtn').disabled = !free.length;
    $('m3People').innerHTML = model.sharedWith.length
      ? model.sharedWith.map((p) => `<li><span>${esc(p.name)}</span><button type="button" class="m3-link" data-unshare="${esc(p.id)}">Parar de compartilhar</button></li>`).join('')
      : '<li class="m3-muted">Ainda não compartilhado com ninguém.</li>';
    if (!candidates.length) {
      $('m3People').insertAdjacentHTML('beforeend', '<li class="m3-muted">Aparecem aqui os clientes com quem você já conversou ou que pediram contratação.</li>');
    }
  };
  paintPeople();
  $('m3ShareBtn').addEventListener('click', async () => {
    if (!select.value) return;
    $('m3ShareBtn').disabled = true;
    try { model = await API.shareModel3d(model.id, select.value); paintPeople(); } catch (err) { alert(err.message); $('m3ShareBtn').disabled = false; }
  });
  $('m3People').addEventListener('click', async (e) => {
    const cid = e.target.closest('[data-unshare]')?.dataset.unshare;
    if (!cid || !confirm('Parar de compartilhar com este cliente?')) return;
    try { model = await API.unshareModel3d(model.id, cid); paintPeople(); } catch (err) { alert(err.message); }
  });
}

// ---------- comentários ----------
function paintComments() {
  const list = $('m3Comments');
  list.innerHTML = model.comments.length
    ? model.comments.map((c) => {
      const mine = c.author?.id === me.id;
      return `<li class="${mine ? 'is-mine' : ''}"><div class="m3-c-head"><strong>${esc(mine ? 'Você' : c.author?.name || 'Alguém')}</strong><time datetime="${esc(c.createdAt)}">${when(c.createdAt)}</time></div><p>${esc(c.text)}</p></li>`;
    }).join('')
    : '<li class="m3-muted">Nenhum comentário ainda. Use este espaço para alinhar ajustes com o cliente.</li>';
  list.scrollTop = list.scrollHeight;
}

$('m3CommentForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = $('m3CommentText');
  const text = input.value.trim();
  if (!text || !model) return;
  const btn = e.target.querySelector('button');
  btn.disabled = true;
  try {
    model = await API.commentModel3d(model.id, text);
    input.value = '';
    paintComments();
  } catch (err) { alert(err.message); }
  finally { btn.disabled = false; }
});

// novos comentários de quem está do outro lado, sem precisar recarregar
setInterval(async () => {
  if (!model || document.hidden) return;
  try {
    const fresh = await API.model3d(model.id);
    if (fresh.comments.length !== model.comments.length) { model.comments = fresh.comments; paintComments(); }
  } catch { /* tenta de novo depois */ }
}, 15000);

load();
