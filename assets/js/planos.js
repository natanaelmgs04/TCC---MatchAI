document.addEventListener('DOMContentLoaded', () => {
  const user = MatchAPI.currentUser();

  function refreshButtons() {
    document.querySelectorAll('[data-plan]').forEach(btn => {
      const [, planId] = btn.dataset.plan.split(':');
      if (!user) {
        btn.textContent = planId === 'free' ? 'Criar conta gratuita' : 'Assinar Pro';
        return;
      }
      if (user.role !== 'architect') {
        btn.textContent = 'Plano para conta de arquiteto';
        btn.classList.add('btn-secondary');
        btn.classList.remove('btn-primary');
        return;
      }
      const current = user.architectProfile?.subscriptionTier || 'free';
      if (current === planId) {
        btn.textContent = '✓ Plano atual';
        btn.classList.add('btn-secondary');
        btn.classList.remove('btn-primary');
      } else if (planId === 'free') {
        btn.textContent = 'Voltar para o Gratuito';
        btn.classList.add('btn-secondary');
        btn.classList.remove('btn-primary');
      } else {
        btn.textContent = 'Assinar Pro';
        btn.classList.add('btn-primary');
        btn.classList.remove('btn-secondary');
      }
    });
  }

  // O plano do usuário logado vem do próprio token/cache local, que pode
  // estar desatualizado -- busca o perfil fresco pra não mostrar "Plano
  // atual" errado logo após um upgrade feito em outra aba/sessão.
  (async () => {
    if (user && user.role === 'architect') {
      try {
        const fresh = await MatchAPI.me();
        user.architectProfile = fresh.architectProfile;
      } catch { /* usa o que já tinha em cache */ }
    }
    refreshButtons();
  })();

  document.querySelectorAll('[data-plan]').forEach(btn => {
    btn.addEventListener('click', () => {
      const [, planId] = btn.dataset.plan.split(':');

      if (!user) {
        location.href = 'cadastro.html?tipo=arquiteto';
        return;
      }
      if (user.role !== 'architect') return;

      const current = user.architectProfile?.subscriptionTier || 'free';
      if (current === planId) return;

      if (planId === 'free') {
        MatchAPI.setArchitectSubscription('free').then(() => {
          user.architectProfile = { ...user.architectProfile, subscriptionTier: 'free' };
          refreshButtons();
        }).catch(err => alert(err.message || 'Não foi possível voltar para o Gratuito agora.'));
        return;
      }

      CheckoutModal.open({
        name: 'Plano Pro',
        desc: 'Espaço do projeto em todos os seus projetos, biblioteca ilimitada e reaproveitável, assistente de IA sem limite diário, Estúdio 3D, portfólio ilimitado e selo Pro.',
        price: 79,
      }, async () => {
        try {
          await MatchAPI.setArchitectSubscription('pro');
          user.architectProfile = { ...user.architectProfile, subscriptionTier: 'pro' };
          refreshButtons();
          alert('Plano Pro ativado! Veja no seu painel.');
        } catch (err) {
          alert(err.message || 'Não foi possível ativar o Pro agora.');
        }
      });
    });
  });
});
