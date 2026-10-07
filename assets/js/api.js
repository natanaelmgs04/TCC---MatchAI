/**
 * Camada de acesso à API do back-end match.IA (Arkitetum.AI — Node/Express + MongoDB).
 * Repositório de referência: https://github.com/RobPFilho/Arkitetum.AI
 *
 * O mesmo processo Express que serve este site também serve a API (mesma origem,
 * mesma porta — veja backend/src/server.js), então "/api" relativo sempre funciona,
 * local ou publicado. Só precisa sobrescrever se algum dia o front-end for servido
 * separado do back-end de novo — nesse caso, salve a URL completa em
 * localStorage("matchia_api_base").
 */
const MatchAPI = (() => {
  const DEFAULT_BASE = '/api';

  function base() {
    return localStorage.getItem('matchia_api_base') || DEFAULT_BASE;
  }
  function setBase(url) {
    if (url) localStorage.setItem('matchia_api_base', url.replace(/\/+$/, ''));
  }
  function token() {
    return localStorage.getItem('matchia_token');
  }
  function setSession(token, user) {
    localStorage.setItem('matchia_token', token);
    localStorage.setItem('matchia_user', JSON.stringify(user));
  }
  function clearSession() {
    localStorage.removeItem('matchia_token');
    localStorage.removeItem('matchia_user');
  }
  function currentUser() {
    try { return JSON.parse(localStorage.getItem('matchia_user') || 'null'); }
    catch { return null; }
  }

  async function request(path, { method = 'GET', body, auth = false } = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (auth) {
      const t = token();
      if (!t) throw { offline: false, status: 401, message: 'Faça login para continuar.' };
      headers.Authorization = `Bearer ${t}`;
    }
    let res;
    try {
      res = await fetch(`${base()}${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (networkError) {
      throw { offline: true, status: 0, message: 'Não foi possível conectar à API do match.IA.' };
    }
    let data = null;
    try { data = await res.json(); } catch { /* sem corpo */ }
    if (!res.ok) {
      throw { offline: false, status: res.status, message: (data && data.error) || 'Erro inesperado na API.' };
    }
    return data;
  }

  /** Endereço da foto de perfil ("/api/avatars/…") a partir da base da API. */
  function avatarSrc(path) {
    if (!path) return '';
    if (/^https?:|^data:/.test(path)) return path;
    const b = base();
    return /^https?:/.test(b) ? b.replace(/\/api\/?$/, '') + path : path;
  }

  /** Reduz uma foto escolhida no computador/celular para ≈ 480 px (WebP/JPEG), pronta para enviar. */
  function prepareAvatar(file, size = 480) {
    return new Promise((resolve, reject) => {
      if (!file || !/^image\//.test(file.type)) return reject(new Error('Escolha uma imagem (JPG, PNG ou WebP).'));
      if (file.size > 15 * 1024 * 1024) return reject(new Error('Imagem grande demais (máx. 15 MB).'));
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const side = Math.min(img.naturalWidth, img.naturalHeight);
        const sx = (img.naturalWidth - side) / 2, sy = (img.naturalHeight - side) / 2;
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = Math.min(size, side);
        canvas.getContext('2d').drawImage(img, sx, sy, side, side, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        let data = canvas.toDataURL('image/webp', 0.85);
        if (!data.startsWith('data:image/webp')) data = canvas.toDataURL('image/jpeg', 0.85);
        resolve(data);
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Não foi possível ler essa imagem.')); };
      img.src = url;
    });
  }

  /**
   * Foto/planta para o Estúdio 3D: mantém a proporção, lado maior até
   * `maxSide` px, JPEG (aceito pelos dois provedores). Fundo branco para PNG
   * com transparência (planta exportada do CAD).
   */
  function prepareImage(file, maxSide = 2048) {
    return new Promise((resolve, reject) => {
      if (!file || !/^image\/(png|jpe?g|webp)$/i.test(file.type)) return reject(new Error('Escolha uma imagem PNG, JPG ou WebP.'));
      if (file.size > 25 * 1024 * 1024) return reject(new Error('Imagem grande demais (máx. 25 MB).'));
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        if (Math.min(img.naturalWidth, img.naturalHeight) < 256) return reject(new Error('Imagem pequena demais (mínimo 256 px).'));
        const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.naturalWidth * scale);
        canvas.height = Math.round(img.naturalHeight * scale);
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.9));
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Não consegui abrir esta imagem.')); };
      img.src = url;
    });
  }

  /** Arquivo protegido (modelo .glb, prévia) baixado com o login, como Blob. */
  async function authBlob(path) {
    const t = token();
    const res = await fetch(`${base()}${path}`, { headers: t ? { Authorization: `Bearer ${t}` } : {} });
    if (!res.ok) throw new Error(res.status === 404 ? 'Arquivo não encontrado.' : 'Não foi possível baixar o arquivo.');
    return res.blob();
  }

  /** Envia um arquivo cru (sem base64) com o nome no cabeçalho — Espaço do projeto → Arquivos. */
  async function uploadRaw(path, file) {
    const t = token();
    if (!t) throw { status: 401, message: 'Faça login para continuar.' };
    let res;
    try {
      res = await fetch(`${base()}${path}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/octet-stream', 'X-File-Name': encodeURIComponent(file.name) },
        body: file,
      });
    } catch {
      throw { offline: true, status: 0, message: 'Não foi possível conectar à API do match.IA.' };
    }
    let data = null;
    try { data = await res.json(); } catch { /* sem corpo */ }
    if (!res.ok) throw { status: res.status, message: (data && data.error) || (res.status === 413 ? 'Arquivo grande demais (máximo 15 MB).' : 'Não foi possível enviar o arquivo.') };
    return data;
  }

  const ws = (id, rest = '') => `/workspace/${encodeURIComponent(id)}${rest}`;

  return {
    avatarSrc, prepareAvatar, prepareImage, authBlob,
    workspace: (id) => request(ws(id), { auth: true }),
    workspaceStageAction: (id, key, action, text) => request(ws(id, `/stages/${encodeURIComponent(key)}/${action}`), { method: 'POST', auth: true, body: { text } }),
    workspaceUpdateStage: (id, key, payload) => request(ws(id, `/stages/${encodeURIComponent(key)}`), { method: 'PATCH', auth: true, body: payload }),
    workspacePayFee: (id, key) => request(ws(id, `/stages/${encodeURIComponent(key)}/pay`), { method: 'POST', auth: true }),
    workspaceReport: () => request('/workspace/report/me', { auth: true }),
    workspaceTarget: (id, targetDate) => request(ws(id, '/target'), { method: 'PATCH', auth: true, body: { targetDate } }),
    workspaceUpload: (id, file, stage) => uploadRaw(ws(id, `/files?stage=${encodeURIComponent(stage || '')}`), file),
    workspaceFileBlob: (id, fileId) => authBlob(ws(id, `/files/${encodeURIComponent(fileId)}`)),
    workspaceDeleteFile: (id, fileId) => request(ws(id, `/files/${encodeURIComponent(fileId)}`), { method: 'DELETE', auth: true }),
    workspaceReviewFile: (id, fileId, decision, comment) => request(ws(id, `/files/${encodeURIComponent(fileId)}/review`), { method: 'POST', auth: true, body: { decision, comment } }),
    workspaceAnnotations: (id, fileId) => request(ws(id, `/files/${encodeURIComponent(fileId)}/annotations`), { auth: true }),
    workspaceAddAnnotation: (id, fileId, payload) => request(ws(id, `/files/${encodeURIComponent(fileId)}/annotations`), { method: 'POST', auth: true, body: payload }),
    workspaceUpdateAnnotation: (id, fileId, aid, payload) => request(ws(id, `/files/${encodeURIComponent(fileId)}/annotations/${encodeURIComponent(aid)}`), { method: 'PATCH', auth: true, body: payload }),
    workspaceRemoveAnnotation: (id, fileId, aid) => request(ws(id, `/files/${encodeURIComponent(fileId)}/annotations/${encodeURIComponent(aid)}`), { method: 'DELETE', auth: true }),
    workspaceCatalog: (id, q) => request(ws(id, `/catalog?q=${encodeURIComponent(q || '')}`), { auth: true }),
    workspaceAddItem: (id, payload) => request(ws(id, '/library'), { method: 'POST', auth: true, body: payload }),
    workspaceUpdateItem: (id, itemId, payload) => request(ws(id, `/library/${encodeURIComponent(itemId)}`), { method: 'PATCH', auth: true, body: payload }),
    workspaceRemoveItem: (id, itemId) => request(ws(id, `/library/${encodeURIComponent(itemId)}`), { method: 'DELETE', auth: true }),
    workspaceCopyLibrary: (id, otherId) => request(ws(id, `/library/copy-from/${encodeURIComponent(otherId)}`), { method: 'POST', auth: true }),
    workspaceConcept: (id) => request(ws(id, '/concept'), { method: 'POST', auth: true }),
    mySignature: () => request('/architects/me/signature', { auth: true }),
    saveSignature: (payload) => request('/architects/me/signature', { method: 'PUT', auth: true, body: payload }),
    models3dStatus: () => request('/models3d/status', { auth: true }),
    models3d: () => request('/models3d', { auth: true }),
    model3d: (id) => request(`/models3d/${encodeURIComponent(id)}`, { auth: true }),
    createModel3d: (payload) => request('/models3d', { method: 'POST', auth: true, body: payload }),
    renameModel3d: (id, title) => request(`/models3d/${encodeURIComponent(id)}`, { method: 'PATCH', auth: true, body: { title } }),
    deleteModel3d: (id) => request(`/models3d/${encodeURIComponent(id)}`, { method: 'DELETE', auth: true }),
    model3dCandidates: () => request('/models3d/share-candidates', { auth: true }),
    shareModel3d: (id, clientId) => request(`/models3d/${encodeURIComponent(id)}/share`, { method: 'POST', auth: true, body: { clientId } }),
    unshareModel3d: (id, clientId) => request(`/models3d/${encodeURIComponent(id)}/share/${encodeURIComponent(clientId)}`, { method: 'DELETE', auth: true }),
    commentModel3d: (id, text) => request(`/models3d/${encodeURIComponent(id)}/comments`, { method: 'POST', auth: true, body: { text } }),
    base, setBase, token, setSession, clearSession, currentUser,
    health: () => request('/health'),
    stats: () => request('/stats'),
    registerClient: (payload) => request('/auth/register/client', { method: 'POST', body: payload }),
    registerArchitect: (payload) => request('/auth/register/architect', { method: 'POST', body: payload }),
    registerStore: (payload) => request('/auth/register/store', { method: 'POST', body: payload }),
    login: (payload) => request('/auth/login', { method: 'POST', body: payload }),
    forgotPassword: (email) => request('/auth/forgot-password', { method: 'POST', body: { email } }),
    resetPassword: (token, password, confirmPassword) => request('/auth/reset-password', { method: 'POST', body: { token, password, confirmPassword } }),
    me: () => request('/dashboard/me', { auth: true }),
    updateMe: (payload) => request('/dashboard/me', { method: 'PATCH', auth: true, body: payload }),
    exportMyData: () => request('/dashboard/me/export', { auth: true }),
    deleteMyAccount: () => request('/dashboard/me', { method: 'DELETE', auth: true }),
    addPortfolio: (payload) => request('/dashboard/portfolio', { method: 'POST', auth: true, body: payload }),
    updatePortfolio: (id, payload) => request(`/dashboard/portfolio/${encodeURIComponent(id)}`, { method: 'PATCH', auth: true, body: payload }),
    setArchitectSubscription: (tier) => request('/architects/me/subscription', { method: 'POST', auth: true, body: { tier } }),
    myCommissions: () => request('/commissions/mine', { auth: true }),
    myStoreProducts: () => request('/stores/me/products', { auth: true }),
    createStoreProduct: (payload) => request('/stores/me/products', { method: 'POST', auth: true, body: payload }),
    updateStoreProduct: (id, payload) => request(`/stores/me/products/${encodeURIComponent(id)}`, { method: 'PATCH', auth: true, body: payload }),
    deleteStoreProduct: (id) => request(`/stores/me/products/${encodeURIComponent(id)}`, { method: 'DELETE', auth: true }),
    myStoreReferrals: () => request('/stores/me/referrals', { auth: true }),
    storeCatalog: () => request('/stores/me/catalog', { auth: true }),
    importStoreCatalog: (url) => request('/stores/me/catalog/import', { method: 'POST', auth: true, body: { url } }),
    clearStoreCatalog: () => request('/stores/me/catalog', { method: 'DELETE', auth: true }),
    suggestedProducts: (projectId) => request(`/projects/${encodeURIComponent(projectId)}/suggested-products`, { auth: true }),
    createStoreReferral: (productId, projectId, shareContact = false) => request('/stores/referrals', { method: 'POST', auth: true, body: { productId, projectId, shareContact } }),
    myStoreConsents: () => request('/stores/consents', { auth: true }),
    revokeStoreConsents: () => request('/stores/consents/revoke', { method: 'POST', auth: true }),
    featuredCaseStudies: (limit) => request(`/case-studies/featured${limit ? `?limit=${limit}` : ''}`),
    deletePortfolio: (id) => request(`/dashboard/portfolio/${encodeURIComponent(id)}`, { method: 'DELETE', auth: true }),
    materials: () => request('/materials'),
    architect: (id) => request(`/architects/${id}`),
    architectReferenceImage: (id) => request(`/architects/${id}/reference-image`),
    architects: (params = {}) => {
      const qs = new URLSearchParams();
      if (params.style) qs.set('style', params.style);
      if (params.city) qs.set('city', params.city);
      if (params.minExperience) qs.set('minExperience', params.minExperience);
      if (params.minRating) qs.set('minRating', params.minRating);
      qs.set('page', params.page || 1);
      qs.set('pageSize', params.pageSize || 9);
      return request(`/architects?${qs.toString()}`);
    },
    runMatch: (projectId) => request('/matches/run', { method: 'POST', auth: true, body: projectId ? { projectId } : undefined }),
    matchHistory: () => request('/matches/history', { auth: true }),
    sendMessage: (to, text) => request('/messages', { method: 'POST', auth: true, body: { to, text } }),
    conversation: (userId) => request(`/messages/${encodeURIComponent(userId)}`, { auth: true }),
    conversations: () => request('/messages/conversations', { auth: true }),
    unreadCount: () => request('/messages/unread-count', { auth: true }),
    notifications: () => request('/notifications', { auth: true }),
    notificationsUnreadCount: () => request('/notifications/unread-count', { auth: true }),
    markNotificationsRead: () => request('/notifications/read-all', { method: 'POST', auth: true }),
    createReview: (architect, rating, comment) => request('/reviews', { method: 'POST', auth: true, body: { architect, rating, comment } }),
    reviews: (architectId) => request(`/reviews/${encodeURIComponent(architectId)}`),
    moodboard: (payload) => request('/moodboard', { method: 'POST', auth: true, body: payload }),
    referenceImage: (payload) => request('/moodboard/reference-image', { method: 'POST', auth: true, body: payload }),
    moodboardPreview: (payload) => request('/moodboard/preview', { method: 'POST', body: payload }),
    projects: () => request('/projects', { auth: true }),
    createProject: (payload) => request('/projects', { method: 'POST', auth: true, body: payload }),
    updateProject: (id, payload) => request(`/projects/${encodeURIComponent(id)}`, { method: 'PATCH', auth: true, body: payload }),
    deleteProject: (id) => request(`/projects/${encodeURIComponent(id)}`, { method: 'DELETE', auth: true }),
    getValidation: (otherId) => request(`/validations/${encodeURIComponent(otherId)}`, { auth: true }),
    confirmValidation: (otherId) => request(`/validations/${encodeURIComponent(otherId)}/confirm`, { method: 'POST', auth: true }),
    pendingValidations: () => request('/validations/pending', { auth: true }),
    confirmedValidations: () => request('/validations/confirmed', { auth: true }),
    // Contratação: cliente pede, arquiteto aceita/recusa (ver backend/src/controllers/hireController.js)
    hires: () => request('/hires', { auth: true }),
    requestHire: (projectId, architectId, message) => request('/hires', { method: 'POST', auth: true, body: { projectId, architectId, message } }),
    acceptHire: (id, response) => request(`/hires/${encodeURIComponent(id)}/accept`, { method: 'POST', auth: true, body: { response } }),
    declineHire: (id, response) => request(`/hires/${encodeURIComponent(id)}/decline`, { method: 'POST', auth: true, body: { response } }),
    cancelHire: (id) => request(`/hires/${encodeURIComponent(id)}/cancel`, { method: 'POST', auth: true }),
    closedProjects: (architectId) => request(`/architects/${encodeURIComponent(architectId)}/closed-projects`),
    favorites: () => request('/favorites', { auth: true }),
    addFavorite: (architectId) => request(`/favorites/${encodeURIComponent(architectId)}`, { method: 'POST', auth: true }),
    removeFavorite: (architectId) => request(`/favorites/${encodeURIComponent(architectId)}`, { method: 'DELETE', auth: true }),
    myStats: () => request('/dashboard/me/stats', { auth: true }),
    recordProfileView: (architectId) => request(`/architects/${encodeURIComponent(architectId)}/view`, { method: 'POST' }),
    getTimeline: (otherId) => request(`/timeline/${encodeURIComponent(otherId)}`, { auth: true }),
    advanceTimeline: (otherId) => request(`/timeline/${encodeURIComponent(otherId)}/advance`, { method: 'POST', auth: true }),
    getBrief: (architectId) => request(`/briefs/${encodeURIComponent(architectId)}`, { auth: true }),
    assistantChat: (projectId) => request(`/assistant/${encodeURIComponent(projectId)}`, { auth: true }),
    assistantSend: (projectId, payload) => request(`/assistant/${encodeURIComponent(projectId)}/message`, { method: 'POST', auth: true, body: payload }),
    assistantBriefing: (projectId) => request(`/assistant/${encodeURIComponent(projectId)}/briefing`, { method: 'POST', auth: true }),
    assistantSendBriefing: (projectId, architectIds) => request(`/assistant/${encodeURIComponent(projectId)}/send`, { method: 'POST', auth: true, body: { architectIds } }),
    assistantReset: (projectId) => request(`/assistant/${encodeURIComponent(projectId)}`, { method: 'DELETE', auth: true }),
    getCaseStudy: (otherId) => request(`/case-studies/${encodeURIComponent(otherId)}`, { auth: true }),
    proposeCaseStudy: (otherId, payload) => request(`/case-studies/${encodeURIComponent(otherId)}`, { method: 'POST', auth: true, body: payload }),
    submitTestimonial: (otherId, testimonial) => request(`/case-studies/${encodeURIComponent(otherId)}/testimonial`, { method: 'POST', auth: true, body: { testimonial } }),
    approveCaseStudy: (otherId) => request(`/case-studies/${encodeURIComponent(otherId)}/approve`, { method: 'POST', auth: true }),
    publishedCaseStudies: (architectId) => request(`/case-studies/architect/${encodeURIComponent(architectId)}`),
    architectProjects: () => request('/architect-projects', { auth: true }),
    architectAssistantChat: (projectId) => request(`/architect-assistant/${encodeURIComponent(projectId)}`, { auth: true }),
    architectAssistantSend: (projectId, payload) => request(`/architect-assistant/${encodeURIComponent(projectId)}/message`, { method: 'POST', auth: true, body: payload }),
    architectAssistantReset: (projectId) => request(`/architect-assistant/${encodeURIComponent(projectId)}`, { method: 'DELETE', auth: true }),
  };
})();
