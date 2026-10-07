/**
 * Visualizador de arquivo do Espaço do projeto (projeto.html → Arquivos →
 * "Ver e comentar"): mostra a imagem ou a página do PDF e deixa cliente e
 * arquiteto marcarem um ponto e comentarem ali — em vez de descrever o lugar
 * da planta num texto. Os pontos ficam em fração da largura/altura (0–1),
 * então batem em qualquer tamanho de tela.
 *
 * PDF: pdf.js (pdfjs-dist, import map de projeto.html com SRI). O worker é
 * baixado com integridade conferida e roda a partir de um blob: (worker-src
 * blob: na CSP) — sem worker de outra origem.
 */
const MatchFileViewer = (() => {
  const PDFJS = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@6.4.299';
  const WORKER_SRI = 'sha384-NfW/OTMWezITv4oaALvfH7MFLwzPxEvpySmDpoALa1mtTY8MC200l0ZNFD+SOlrM';
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const when = (iso) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

  let pdfjsReady = null;
  function loadPdfjs() {
    if (!pdfjsReady) {
      pdfjsReady = (async () => {
        const pdfjs = await import('pdfjs-dist');
        const res = await fetch(`${PDFJS}/build/pdf.worker.min.mjs`, { integrity: WORKER_SRI });
        if (!res.ok) throw new Error('Não foi possível carregar o leitor de PDF.');
        const url = URL.createObjectURL(new Blob([await res.text()], { type: 'text/javascript' }));
        pdfjs.GlobalWorkerOptions.workerPort = new Worker(url, { type: 'module' });
        return pdfjs;
      })().catch((err) => { pdfjsReady = null; throw err; });
    }
    return pdfjsReady;
  }

  /**
   * open({ workspaceId, file, me }) — file: { id, name, ext, version }.
   * onChange(): chamado quando os comentários mudam (para atualizar a contagem na lista).
   */
  function open({ workspaceId, file, onChange }) {
    const API = MatchAPI;
    const isPdf = file.ext === 'pdf';
    let page = 1;
    let pages = 1;
    let notes = [];
    let showResolved = false;
    let pdfDoc = null;
    let objectUrl = '';
    let pending = null; // ponto novo ainda sem texto
    let resizeTimer = null;
    let lastSize = '';

    const dlg = document.createElement('dialog');
    dlg.className = 'fv';
    dlg.setAttribute('aria-labelledby', 'fvTitle');
    dlg.innerHTML = `
      <header class="fv-head">
        <div class="fv-title"><strong id="fvTitle">${esc(file.name)}</strong><span>v${file.version} · clique no arquivo para marcar um ponto e comentar</span></div>
        <div class="fv-pages" ${isPdf ? '' : 'hidden'}>
          <button type="button" class="fv-btn" data-fv="prev" aria-label="Página anterior">‹</button>
          <span data-fv-page>1 / 1</span>
          <button type="button" class="fv-btn" data-fv="next" aria-label="Próxima página">›</button>
        </div>
        <button type="button" class="fv-btn fv-close" data-fv="close" aria-label="Fechar">✕</button>
      </header>
      <div class="fv-body">
        <div class="fv-stage" data-fv-stage>
          <div class="fv-surface" data-fv-surface>
            <p class="fv-loading"><span class="spinner"></span> Abrindo o arquivo…</p>
            <div class="fv-pins" data-fv-pins></div>
            <form class="fv-new" data-fv-new hidden>
              <label class="sr-only" for="fvNewText">Comentário neste ponto</label>
              <textarea id="fvNewText" rows="3" maxlength="600" placeholder="O que mudar aqui?" required></textarea>
              <div class="fv-new-actions">
                <button type="button" class="btn btn-secondary btn-sm" data-fv="cancel">Cancelar</button>
                <button type="submit" class="btn btn-primary btn-sm">Comentar</button>
              </div>
            </form>
          </div>
        </div>
        <aside class="fv-side">
          <div class="fv-side-head">
            <h3>Comentários</h3>
            <label class="fv-toggle"><input type="checkbox" data-fv-resolved> mostrar resolvidos</label>
          </div>
          <ol class="fv-list" data-fv-list aria-live="polite"></ol>
          <form class="fv-general" data-fv-general>
            <label for="fvGeneral">Comentário geral ${isPdf ? 'nesta página' : 'no arquivo'}</label>
            <textarea id="fvGeneral" rows="2" maxlength="600" placeholder="Sem marcar um ponto (dá para usar só o teclado)"></textarea>
            <button type="submit" class="btn btn-secondary btn-sm">Comentar</button>
          </form>
          <p class="fv-error" data-fv-error role="alert"></p>
        </aside>
      </div>`;
    document.body.appendChild(dlg);
    const $ = (sel) => dlg.querySelector(sel);
    const surface = $('[data-fv-surface]');
    const pinsBox = $('[data-fv-pins]');
    const newForm = $('[data-fv-new]');
    const errorBox = $('[data-fv-error]');

    const fail = (err) => { errorBox.textContent = err?.message || 'Não deu certo agora. Tente de novo.'; };
    const visible = () => notes.filter((n) => (showResolved || !n.resolved));

    function paintNotes() {
      const onPage = visible().filter((n) => n.page === page);
      pinsBox.innerHTML = onPage.map((n) => `
        <button type="button" class="fv-pin${n.resolved ? ' is-resolved' : ''}" style="left:${n.x * 100}%;top:${n.y * 100}%" data-pin="${n.id}"
          aria-label="Comentário ${n.n}: ${esc(n.text)}">${n.n}</button>`).join('');
      const list = visible();
      $('[data-fv-list]').innerHTML = list.length ? list.map((n) => `
        <li class="fv-item${n.resolved ? ' is-resolved' : ''}" data-note="${n.id}">
          <button type="button" class="fv-item-go" data-go="${n.id}"><span class="fv-num">${n.n}</span>${isPdf ? `<small>pág. ${n.page}</small>` : ''}</button>
          <div class="fv-item-body">
            <div class="fv-item-meta"><strong>${esc(n.author?.name || '')}</strong><time>${when(n.createdAt)}</time></div>
            <p>${esc(n.text)}</p>
            <div class="fv-item-actions">
              <button type="button" class="fv-link" data-resolve="${n.id}" data-value="${!n.resolved}">${n.resolved ? 'Reabrir' : 'Resolver'}</button>
              ${n.mine ? `<button type="button" class="fv-link fv-danger" data-remove="${n.id}">Apagar</button>` : ''}
            </div>
          </div>
        </li>`).join('') : `<li class="fv-empty">${notes.length ? 'Todos os comentários estão resolvidos.' : 'Nenhum comentário ainda. Clique num ponto do arquivo para comentar.'}</li>`;
    }

    async function refresh(data) {
      const r = data || await API.workspaceAnnotations(workspaceId, file.id);
      notes = r.annotations;
      paintNotes();
      if (data) onChange?.();
    }

    async function renderPage() {
      const media = surface.querySelector('canvas, img');
      if (!isPdf) return;
      const p = await pdfDoc.getPage(page);
      const stage = $('[data-fv-stage]');
      const base = p.getViewport({ scale: 1 });
      // a página inteira cabe na área (planta costuma ser vista inteira); redesenha quando a área muda
      const scale = Math.max(0.3, Math.min((stage.clientWidth - 24) / base.width, (stage.clientHeight - 24) / base.height));
      lastSize = `${stage.clientWidth}x${stage.clientHeight}`;
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const vp = p.getViewport({ scale: scale * ratio });
      const canvas = media || document.createElement('canvas');
      canvas.width = Math.floor(vp.width);
      canvas.height = Math.floor(vp.height);
      canvas.style.width = `${Math.floor(vp.width / ratio)}px`;
      canvas.style.height = `${Math.floor(vp.height / ratio)}px`;
      canvas.setAttribute('aria-label', `Página ${page} de ${pages}`);
      if (!media) surface.prepend(canvas);
      await p.render({ canvas, canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
      $('[data-fv-page]').textContent = `${page} / ${pages}`;
      $('[data-fv="prev"]').disabled = page <= 1;
      $('[data-fv="next"]').disabled = page >= pages;
      paintNotes();
    }

    async function load() {
      try {
        const blob = await API.workspaceFileBlob(workspaceId, file.id);
        if (isPdf) {
          const pdfjs = await loadPdfjs();
          pdfDoc = await pdfjs.getDocument({
            data: new Uint8Array(await blob.arrayBuffer()),
            isEvalSupported: false,
            standardFontDataUrl: `${PDFJS}/standard_fonts/`,
            cMapUrl: `${PDFJS}/cmaps/`,
            wasmUrl: `${PDFJS}/wasm/`,
          }).promise;
          pages = pdfDoc.numPages;
          await renderPage();
        } else {
          objectUrl = URL.createObjectURL(blob);
          const img = new Image();
          img.alt = file.name;
          img.src = objectUrl;
          await img.decode().catch(() => {});
          surface.prepend(img);
        }
        surface.querySelector('.fv-loading')?.remove();
        await refresh();
      } catch (err) {
        surface.querySelector('.fv-loading').textContent = err?.message || 'Não foi possível abrir o arquivo.';
      }
    }

    function pointFrom(e) {
      const media = surface.querySelector('canvas, img');
      if (!media) return null;
      const r = media.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width;
      const y = (e.clientY - r.top) / r.height;
      return x >= 0 && x <= 1 && y >= 0 && y <= 1 ? { x, y } : null;
    }

    surface.addEventListener('click', (e) => {
      if (e.target.closest('.fv-pin, .fv-new')) return;
      const pt = pointFrom(e);
      if (!pt) return;
      pending = { ...pt, page };
      newForm.style.left = `${Math.min(pt.x * 100, 70)}%`;
      newForm.style.top = `${Math.min(pt.y * 100, 80)}%`;
      newForm.hidden = false;
      pinsBox.querySelector('.fv-pin.is-new')?.remove();
      pinsBox.insertAdjacentHTML('beforeend', `<span class="fv-pin is-new" style="left:${pt.x * 100}%;top:${pt.y * 100}%" aria-hidden="true">+</span>`);
      $('#fvNewText').focus();
    });

    newForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const text = $('#fvNewText').value.trim();
      if (!text || !pending) return;
      const btn = newForm.querySelector('[type="submit"]');
      btn.disabled = true;
      try {
        await refresh(await API.workspaceAddAnnotation(workspaceId, file.id, { ...pending, text }));
        newForm.hidden = true;
        $('#fvNewText').value = '';
        pending = null;
        errorBox.textContent = '';
      } catch (err) { fail(err); }
      btn.disabled = false;
    });

    $('[data-fv-general]').addEventListener('submit', async (e) => {
      e.preventDefault();
      const ta = $('#fvGeneral');
      const text = ta.value.trim();
      if (!text) return;
      try {
        await refresh(await API.workspaceAddAnnotation(workspaceId, file.id, { x: 0.5, y: 0.03, page, text }));
        ta.value = '';
        errorBox.textContent = '';
      } catch (err) { fail(err); }
    });

    dlg.addEventListener('click', async (e) => {
      const t = e.target.closest('[data-fv], [data-pin], [data-go], [data-resolve], [data-remove]');
      if (!t) return;
      if (t.dataset.fv === 'close') { dlg.close(); return; }
      if (t.dataset.fv === 'cancel') { newForm.hidden = true; pending = null; pinsBox.querySelector('.is-new')?.remove(); return; }
      if (t.dataset.fv === 'prev' && page > 1) { page -= 1; newForm.hidden = true; await renderPage(); return; }
      if (t.dataset.fv === 'next' && page < pages) { page += 1; newForm.hidden = true; await renderPage(); return; }
      const focusId = t.dataset.pin || t.dataset.go;
      if (focusId) {
        const n = notes.find((x) => x.id === focusId);
        if (n && n.page !== page) { page = n.page; await renderPage(); }
        dlg.querySelectorAll('.is-focus').forEach((el) => el.classList.remove('is-focus'));
        dlg.querySelector(`[data-pin="${focusId}"]`)?.classList.add('is-focus');
        const item = dlg.querySelector(`[data-note="${focusId}"]`);
        item?.classList.add('is-focus');
        item?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        return;
      }
      try {
        if (t.dataset.resolve) await refresh(await API.workspaceUpdateAnnotation(workspaceId, file.id, t.dataset.resolve, { resolved: t.dataset.value === 'true' }));
        if (t.dataset.remove && confirm('Apagar este comentário?')) await refresh(await API.workspaceRemoveAnnotation(workspaceId, file.id, t.dataset.remove));
      } catch (err) { fail(err); }
    });

    $('[data-fv-resolved]').addEventListener('change', (e) => { showResolved = e.target.checked; paintNotes(); });
    const sizeWatch = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (!pdfDoc || !width || `${Math.round(width + 24)}x${Math.round(height + 24)}` === lastSize) return;
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => renderPage(), 150);
    });
    sizeWatch.observe($('[data-fv-stage]'));
    dlg.addEventListener('close', () => {
      sizeWatch.disconnect();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      pdfDoc?.destroy();
      dlg.remove();
    });
    dlg.showModal();
    load();
  }

  // ------------------------------------------------------------------ comparar versões
  /** Abre um arquivo (blob) para desenhar em canvas: PDF (pdf.js) ou imagem. */
  async function openDoc(blob, ext) {
    if (ext === 'pdf') {
      const pdfjs = await loadPdfjs();
      const pdf = await pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()), isEvalSupported: false, standardFontDataUrl: `${PDFJS}/standard_fonts/`, cMapUrl: `${PDFJS}/cmaps/`, wasmUrl: `${PDFJS}/wasm/` }).promise;
      return { pages: pdf.numPages, pdf, destroy: () => pdf.destroy() };
    }
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.src = url;
    await img.decode();
    return { pages: 1, img, destroy: () => URL.revokeObjectURL(url) };
  }

  /** Desenha a página no canvas cabendo em maxW × maxH (px de CSS). */
  async function drawPage(doc, canvas, page, maxW, maxH) {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    if (doc.pdf) {
      const p = await doc.pdf.getPage(Math.min(page, doc.pages));
      const base = p.getViewport({ scale: 1 });
      const scale = Math.max(0.2, Math.min(maxW / base.width, maxH / base.height));
      const vp = p.getViewport({ scale: scale * ratio });
      canvas.width = Math.floor(vp.width);
      canvas.height = Math.floor(vp.height);
      canvas.style.width = `${Math.floor(vp.width / ratio)}px`;
      canvas.style.height = `${Math.floor(vp.height / ratio)}px`;
      await p.render({ canvas, canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
      return;
    }
    const { naturalWidth: w, naturalHeight: h } = doc.img;
    const scale = Math.min(maxW / w, maxH / h);
    canvas.width = Math.floor(w * scale * ratio);
    canvas.height = Math.floor(h * scale * ratio);
    canvas.style.width = `${Math.floor(w * scale)}px`;
    canvas.style.height = `${Math.floor(h * scale)}px`;
    canvas.getContext('2d').drawImage(doc.img, 0, 0, canvas.width, canvas.height);
  }

  /**
   * compare({ workspaceId, older, newer }) — as duas versões lado a lado ou
   * sobrepostas com uma régua deslizante (bom para ver o que mudou na planta).
   */
  function compare({ workspaceId, older, newer }) {
    const API = MatchAPI;
    const dateOf = (f) => new Date(f.createdAt).toLocaleDateString('pt-BR');
    let mode = 'side';
    let page = 1;
    let pages = 1;
    let docs = [];
    let timer = null;
    const dlg = document.createElement('dialog');
    dlg.className = 'fv fv-compare';
    dlg.setAttribute('aria-labelledby', 'fvcTitle');
    dlg.innerHTML = `
      <header class="fv-head">
        <div class="fv-title"><strong id="fvcTitle">Comparar versões: ${esc(newer.name)}</strong><span>v${older.version} (${dateOf(older)}) × v${newer.version} (${dateOf(newer)})</span></div>
        <div class="fvc-modes" role="radiogroup" aria-label="Modo de comparação">
          <button type="button" class="fv-btn is-on" role="radio" aria-checked="true" data-mode="side">Lado a lado</button>
          <button type="button" class="fv-btn" role="radio" aria-checked="false" data-mode="overlay">Sobrepor</button>
        </div>
        <div class="fv-pages" data-fvc-pages hidden>
          <button type="button" class="fv-btn" data-fvc="prev" aria-label="Página anterior">‹</button>
          <span data-fvc-page>1 / 1</span>
          <button type="button" class="fv-btn" data-fvc="next" aria-label="Próxima página">›</button>
        </div>
        <button type="button" class="fv-btn fv-close" data-fvc="close" aria-label="Fechar">✕</button>
      </header>
      <div class="fvc-body" data-fvc-body>
        <p class="fv-loading"><span class="spinner"></span> Abrindo as duas versões…</p>
      </div>`;
    document.body.appendChild(dlg);
    const body = dlg.querySelector('[data-fvc-body]');

    async function paint() {
      if (docs.length < 2) return;
      const w = body.clientWidth - 32;
      const h = body.clientHeight - (mode === 'overlay' ? 80 : 60);
      if (mode === 'side') {
        body.innerHTML = `
          <div class="fvc-side">
            <figure><figcaption>v${older.version} · antes</figcaption><canvas data-c="0"></canvas></figure>
            <figure><figcaption>v${newer.version} · depois</figcaption><canvas data-c="1"></canvas></figure>
          </div>`;
        const half = window.matchMedia('(max-width: 820px)').matches ? w : (w - 16) / 2;
        await Promise.all(docs.map((d, i) => drawPage(d, body.querySelector(`[data-c="${i}"]`), page, half, h)));
      } else {
        body.innerHTML = `
          <div class="fvc-overlay">
            <div class="fvc-stack" data-stack>
              <canvas data-c="0"></canvas>
              <canvas data-c="1" class="fvc-top"></canvas>
              <span class="fvc-line" aria-hidden="true"></span>
            </div>
            <label class="fvc-slider">v${older.version} <input type="range" min="0" max="100" value="50" data-slider aria-label="Mostrar mais da versão antiga ou da nova"> v${newer.version}</label>
          </div>`;
        const [a, b] = [body.querySelector('[data-c="0"]'), body.querySelector('[data-c="1"]')];
        await drawPage(docs[0], a, page, w, h);
        await drawPage(docs[1], b, page, parseFloat(a.style.width), parseFloat(a.style.height)); // mesmo tamanho para alinhar
        b.style.width = a.style.width;
        b.style.height = a.style.height;
        const stack = body.querySelector('[data-stack]');
        const set = (v) => { stack.style.setProperty('--cut', `${v}%`); };
        set(50);
        body.querySelector('[data-slider]').addEventListener('input', (e) => set(e.target.value));
      }
      dlg.querySelector('[data-fvc-page]').textContent = `${page} / ${pages}`;
      dlg.querySelector('[data-fvc="prev"]').disabled = page <= 1;
      dlg.querySelector('[data-fvc="next"]').disabled = page >= pages;
    }

    (async () => {
      try {
        const blobs = await Promise.all([older, newer].map((f) => API.workspaceFileBlob(workspaceId, f.id)));
        docs = await Promise.all(blobs.map((b, i) => openDoc(b, [older, newer][i].ext)));
        pages = Math.max(docs[0].pages, docs[1].pages);
        dlg.querySelector('[data-fvc-pages]').hidden = pages <= 1;
        await paint();
      } catch (err) {
        body.innerHTML = `<p class="fv-loading">${esc(err?.message || 'Não foi possível abrir as versões.')}</p>`;
      }
    })();

    dlg.addEventListener('click', async (e) => {
      const t = e.target.closest('[data-fvc], [data-mode]');
      if (!t) return;
      if (t.dataset.fvc === 'close') { dlg.close(); return; }
      if (t.dataset.mode) {
        mode = t.dataset.mode;
        dlg.querySelectorAll('[data-mode]').forEach((b) => { const on = b === t; b.classList.toggle('is-on', on); b.setAttribute('aria-checked', String(on)); });
      }
      if (t.dataset.fvc === 'prev' && page > 1) page -= 1;
      if (t.dataset.fvc === 'next' && page < pages) page += 1;
      await paint();
    });
    let lastW = 0;
    const watch = new ResizeObserver(([entry]) => {
      const w = Math.round(entry.contentRect.width);
      if (Math.abs(w - lastW) < 8) return;
      lastW = w;
      clearTimeout(timer);
      timer = setTimeout(paint, 200);
    });
    watch.observe(body);
    dlg.addEventListener('close', () => { watch.disconnect(); docs.forEach((d) => d.destroy()); dlg.remove(); });
    dlg.showModal();
  }

  return { open, compare };
})();
