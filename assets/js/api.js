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

  return {
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
    suggestedProducts: (projectId) => request(`/projects/${encodeURIComponent(projectId)}/suggested-products`, { auth: true }),
    createStoreReferral: (productId, projectId) => request('/stores/referrals', { method: 'POST', auth: true, body: { productId, projectId } }),
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
