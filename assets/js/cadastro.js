document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('cadastroForm');
  const roleButtons = document.querySelectorAll('.auth-role-step');
  const formError = document.getElementById('formError');
  const formSuccess = document.getElementById('formSuccess');
  const apiBanner = document.getElementById('apiBanner');
  const apiBaseLabel = document.getElementById('apiBaseLabel');
  const submitBtn = document.getElementById('submitBtn');

  apiBaseLabel.textContent = MatchAPI.base();

  // As três opções (cliente/arquiteto/loja parceira) agora têm o mesmo peso
  // visual -- antes a loja só existia como um link discreto escondido atrás
  // de ?tipo=loja, sem botão próprio no toggle.
  const roleLabels = { client: 'cliente', architect: 'arquiteto', store: 'loja' };
  let role = 'client';
  function setRole(next) {
    role = next;
    roleButtons.forEach((btn) => btn.classList.toggle('active', btn.dataset.role === role));
    submitBtn.textContent = `Criar conta de ${roleLabels[role]}`;
    document.getElementById('storeNameField').style.display = role === 'store' ? '' : 'none';
    syncPartnerKind();
  }
  // Parceiro: loja de produtos ou prestador de serviço (marcenaria, elétrica…)
  const partnerKind = () => document.querySelector('input[name="partnerKind"]:checked')?.value || 'store';
  function syncPartnerKind() {
    const field = document.getElementById('tradesField');
    if (field) field.style.display = role === 'store' && partnerKind() === 'service' ? '' : 'none';
  }
  document.querySelectorAll('input[name="partnerKind"]').forEach((r) => r.addEventListener('change', syncPartnerKind));
  roleButtons.forEach((btn) => btn.addEventListener('click', () => setRole(btn.dataset.role)));

  const params = new URLSearchParams(location.search);
  const tipo = params.get('tipo');
  setRole(tipo === 'arquiteto' ? 'architect' : tipo === 'loja' ? 'store' : 'client');

  // Mostrar/ocultar senha -- um botão por campo, alterna o próprio type do
  // input ao lado dele via data-toggle-for.
  document.querySelectorAll('.password-toggle').forEach((btn) => {
    btn.addEventListener('click', () => {
      const input = document.getElementById(btn.dataset.toggleFor);
      const showing = input.type === 'text';
      input.type = showing ? 'password' : 'text';
      btn.setAttribute('aria-label', showing ? 'Mostrar senha' : 'Ocultar senha');
    });
  });

  function val(id) { return document.getElementById(id).value.trim(); }

  // Erro por campo (além do banner geral) — a pessoa vê exatamente qual
  // campo precisa corrigir, não só uma mensagem genérica no topo do form.
  function setFieldError(id, message) {
    const field = document.getElementById(id).closest('.form-field');
    field.classList.add('has-error');
    let msg = field.querySelector('.form-field-error');
    if (!msg) {
      msg = document.createElement('span');
      msg.className = 'form-field-error';
      field.appendChild(msg);
    }
    msg.textContent = message;
  }
  function clearFieldErrors(...ids) {
    ids.forEach((id) => {
      const field = document.getElementById(id).closest('.form-field');
      field.classList.remove('has-error');
      field.querySelector('.form-field-error')?.remove();
    });
  }

  // Foto de perfil — vira data URI (mesmo mecanismo já usado nas fotos de
  // portfólio), sem exigir um serviço de upload dedicado. Opcional.
  // A foto é reduzida no navegador (≈ 320 px) antes de ir para o servidor.
  let avatarDataUri = '';
  let avatarReady = Promise.resolve();
  MatchExtras.setupFileInput('avatarFile', 'avatarPreview', (uri) => {
    avatarDataUri = '';
    const file = document.getElementById('avatarFile').files[0];
    if (!uri || !file) { avatarReady = Promise.resolve(); return; }
    avatarReady = MatchAPI.prepareAvatar(file).then((d) => { avatarDataUri = d; }).catch(() => { avatarDataUri = ''; });
  }, { isImage: true });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    formError.classList.remove('show');
    formSuccess.classList.remove('show');
    clearFieldErrors('password', 'confirmPassword', 'email');

    const password = document.getElementById('password').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    if (password !== confirmPassword) {
      setFieldError('confirmPassword', 'As senhas não coincidem.');
      document.getElementById('confirmPassword').focus();
      return;
    }

    await avatarReady;
    const payload = {
      name: val('name'),
      email: val('email'),
      password,
      confirmPassword,
      avatarUrl: avatarDataUri || undefined,
      bio: val('bio') || undefined,
      referredBy: params.get('ref') || undefined,
    };
    if (role === 'store') {
      payload.storeName = val('storeName');
      payload.partnerKind = partnerKind();
      if (payload.partnerKind === 'service') {
        payload.trades = [...document.querySelectorAll('input[name="trades"]:checked')].map((c) => c.value).slice(0, 6);
        payload.city = val('partnerCity') || undefined;
        payload.state = val('partnerState') || undefined;
        if (!payload.trades.length) {
          alert('Escolha pelo menos um ofício.');
          return;
        }
      }
    }

    const registerFn = { client: MatchAPI.registerClient, architect: MatchAPI.registerArchitect, store: MatchAPI.registerStore }[role];

    submitBtn.disabled = true;
    submitBtn.textContent = 'Criando conta...';
    try {
      const res = await registerFn(payload);
      MatchAPI.setSession(res.token, res.user);
      formSuccess.textContent = 'Conta criada com sucesso! Redirecionando para o seu painel...';
      formSuccess.classList.add('show');
      // Sinaliza pro painel abrir direto o menu de "primeiro projeto"
      // (cliente), "primeira peça de portfólio" (arquiteto) ou "primeiro
      // produto" (loja).
      sessionStorage.setItem('matchia_just_registered', '1');
      setTimeout(() => { location.href = 'dashboard.html'; }, 900);
    } catch (err) {
      formError.textContent = err.offline
        ? `Não foi possível conectar à API em ${MatchAPI.base()}. Rode o back-end (Arkitetum.AI) localmente com "npm run dev" e tente novamente.`
        : err.message || 'Não foi possível criar a conta.';
      formError.classList.add('show');
      if (err.offline) apiBanner.classList.add('show');
      else if (/e-?mail/i.test(err.message || '')) setFieldError('email', err.message);
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = `Criar conta de ${roleLabels[role]}`;
    }
  });
});
