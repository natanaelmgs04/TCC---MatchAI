document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('loginForm');
  const codeForm = document.getElementById('codeForm');
  const formError = document.getElementById('formError');
  const apiBanner = document.getElementById('apiBanner');
  const apiBaseLabel = document.getElementById('apiBaseLabel');
  const submitBtn = document.getElementById('submitBtn');
  const codeBtn = document.getElementById('codeBtn');
  const codeInput = document.getElementById('loginCode');
  let challenge = null; // login em duas etapas: desafio de 10 minutos devolvido pela API
  apiBaseLabel.textContent = MatchAPI.base();

  if (MatchAPI.currentUser()) location.href = 'dashboard.html';

  const showError = (text) => {
    formError.textContent = text;
    formError.classList.toggle('show', !!text);
  };

  function askCode(email) {
    form.hidden = true;
    codeForm.hidden = false;
    document.getElementById('codeLead').textContent = `Este aparelho é novo para a sua conta. Enviamos um código de 6 dígitos para ${email || 'o seu e-mail'} — ele vale por 10 minutos.`;
    codeInput.value = '';
    codeInput.focus();
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    showError('');
    document.getElementById('email').closest('.form-field').classList.remove('has-error');
    document.getElementById('password').closest('.form-field').classList.remove('has-error');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Entrando...';
    try {
      const res = await MatchAPI.login({
        email: document.getElementById('email').value.trim(),
        password: document.getElementById('password').value,
      });
      if (res.twoFactor) {
        challenge = res.challenge;
        askCode(res.email);
        return;
      }
      MatchAPI.setSession(res.token, res.user);
      location.href = 'dashboard.html';
    } catch (err) {
      showError(err.offline
        ? `Não foi possível conectar à API em ${MatchAPI.base()}. Rode o back-end (Arkitetum.AI) localmente com "npm run dev".`
        : err.message || 'E-mail ou senha inválidos.');
      if (err.offline) apiBanner.classList.add('show');
      else {
        document.getElementById('email').closest('.form-field').classList.add('has-error');
        document.getElementById('password').closest('.form-field').classList.add('has-error');
      }
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Entrar';
    }
  });

  codeForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    showError('');
    const code = codeInput.value.replace(/\D/g, '');
    if (code.length !== 6) { showError('Digite os 6 números do código.'); return; }
    codeBtn.disabled = true;
    codeBtn.textContent = 'Conferindo...';
    try {
      const res = await MatchAPI.loginVerify(challenge, code);
      MatchAPI.setSession(res.token, res.user);
      location.href = 'dashboard.html';
    } catch (err) {
      showError(err.message || 'Código incorreto.');
      if (err.status === 401) { codeForm.hidden = true; form.hidden = false; }
    } finally {
      codeBtn.disabled = false;
      codeBtn.textContent = 'Confirmar e entrar';
    }
  });

  document.getElementById('resendCode').addEventListener('click', async () => {
    showError('');
    try {
      const res = await MatchAPI.loginResend(challenge);
      document.getElementById('codeLead').textContent = `Mandamos outro código para ${res.email}.`;
    } catch (err) { showError(err.message); }
  });

  document.getElementById('backToLogin').addEventListener('click', () => {
    challenge = null;
    codeForm.hidden = true;
    form.hidden = false;
    showError('');
  });
});
