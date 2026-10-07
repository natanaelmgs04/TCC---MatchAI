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

  return { open };
})();
