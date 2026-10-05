/**
 * Componentes visuais do painel — SVG/HTML puro, sem biblioteca de gráfico.
 *
 * Padrões adaptados (não copiados) de componentes do 21st.dev — Stats Bento,
 * Statistics Card, Dashboard Activities, Card Tabs, Glass Account Settings —
 * e das referências de dashboard do motionsites (medidor radial pontilhado,
 * barras segmentadas, números grandes), redesenhados na identidade da
 * match.IA: Playfair nos números, Inter no texto, sálvia → terracota, vidro.
 *
 * Tudo aqui só desenha a partir de dados que o painel já carrega
 * (projetos, histórico de match, favoritos, conversas, contratações) —
 * nenhum número é inventado; sem dado, o card mostra um estado vazio.
 */
const DashUI = (() => {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const idOf = (x) => (x && (x.id || x._id)) ? String(x.id || x._id) : '';

  // Ícones de traço (24×24), no mesmo peso dos ícones do assistente.
  const P = {
    home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M10 21v-6h4v6"/>',
    assistente: '<path d="M12 3l1.9 5.3L19 10l-5.1 1.7L12 17l-1.9-5.3L5 10l5.1-1.7z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>',
    projeto: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    match: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.4"/>',
    favoritos: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>',
    mensagens: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/>',
    conta: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    contratacoes: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/><path d="M3 13h18"/>',
    perfil: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="11" r="2.2"/><path d="M5.5 16a3.5 3.5 0 0 1 7 0"/><path d="M15 10h3M15 14h3"/>',
    portfolio: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/>',
    avaliacoes: '<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9 6.8 19.6l1-5.8L3.5 9.7l5.9-.9z"/>',
    metricas: '<path d="M4 20V11M10 20V5M16 20v-6M21 20H3"/>',
    comissoes: '<ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6"/><path d="M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6"/>',
    produtos: '<path d="M21 8l-9-5-9 5 9 5z"/><path d="M3 8v8l9 5 9-5V8"/><path d="M12 13v8"/>',
    modelos3d: '<path d="M12 2.8l8 4.6v9.2l-8 4.6-8-4.6V7.4z"/><path d="M4.3 7.6L12 12l7.7-4.4M12 12v8.9"/><path d="M8 5.1l8 4.6" opacity=".55"/>',
    indicacoes: '<circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M8.2 10.8l7.6-3.6M8.2 13.2l7.6 3.6"/>',
    arrow: '<path d="M7 17L17 7M8 7h9v9"/>',
    pin: '<path d="M12 21s-7-6.1-7-11a7 7 0 0 1 14 0c0 4.9-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>',
    ruler: '<path d="M3 17L17 3l4 4L7 21z"/><path d="M7 13l2 2M10 10l2 2M13 7l2 2"/>',
    wallet: '<rect x="3" y="6" width="18" height="14" rx="2"/><path d="M3 10h18"/><path d="M16 15h2"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    building: '<path d="M4 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16"/><path d="M16 9h2a2 2 0 0 1 2 2v10"/><path d="M8 7h4M8 11h4M8 15h4M3 21h18"/>',
    shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
    gift: '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M5 12v9h14v-9M12 8v13"/><path d="M12 8c-2-3.5-6-3-6-.6S10 8 12 8zm0 0c2-3.5 6-3 6-.6S14 8 12 8z"/>',
    download: '<path d="M12 4v11M7 10l5 5 5-5M4 20h16"/>',
    alert: '<path d="M12 3l9.5 17h-19z"/><path d="M12 10v4M12 17.5v.01"/>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
    eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
    bolt: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6.5 6.5 0 0 1 4 6"/>',
    megaphone: '<path d="M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1z"/><path d="M15 8.5a4.5 4.5 0 0 1 0 7M18 5.5a8.5 8.5 0 0 1 0 13"/>',
    server: '<rect x="3" y="4" width="18" height="7" rx="2"/><rect x="3" y="13" width="18" height="7" rx="2"/><path d="M7 7.5h.01M7 16.5h.01"/>',
    list: '<path d="M9 6h12M9 12h12M9 18h12"/><path d="M4 6h.01M4 12h.01M4 18h.01"/>',
    logout: '<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3"/><path d="M10 17l5-5-5-5M15 12H3"/>',
    external: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
    palette: '<path d="M12 3a9 9 0 1 0 0 18c1.2 0 1.8-.8 1.8-1.7 0-1.4-1.3-1.6-1.3-2.8 0-1 .8-1.5 1.8-1.5H17a4 4 0 0 0 4-4C21 6.6 17 3 12 3z"/><circle cx="7.5" cy="11" r="1.2"/><circle cx="10" cy="7" r="1.2"/><circle cx="15" cy="7.5" r="1.2"/>',
    refresh: '<path d="M20 11a8 8 0 0 0-14.6-4.5L3 9"/><path d="M3 4v5h5"/><path d="M4 13a8 8 0 0 0 14.6 4.5L21 15"/><path d="M21 20v-5h-5"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    badge: '<path d="M12 3l2.4 1.8 3-.2.9 2.9 2.4 1.8-1 2.8 1 2.8-2.4 1.8-.9 2.9-3-.2L12 21l-2.4-1.8-3 .2-.9-2.9L3.3 14.7l1-2.8-1-2.8 2.4-1.8.9-2.9 3 .2z"/><path d="M9 12l2 2 4-4"/>',
  };
  const icon = (name, size = 18) =>
    `<svg class="dv-ico" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || P.home}</svg>`;

  // ---------- formatação ----------
  const nf = new Intl.NumberFormat('pt-BR');
  const money = (n) => Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
  const compactMoney = (n) => {
    if (!n) return 'R$ 0';
    if (n >= 1e6) return `R$ ${(n / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`;
    if (n >= 1e3) return `R$ ${Math.round(n / 1e3).toLocaleString('pt-BR')} mil`;
    return money(n);
  };
  const rtf = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto' });
  function timeAgo(date) {
    const d = new Date(date);
    if (Number.isNaN(d.getTime())) return '';
    const s = Math.round((d - Date.now()) / 1000);
    const abs = Math.abs(s);
    if (abs < 60) return 'agora';
    if (abs < 3600) return rtf.format(Math.round(s / 60), 'minute');
    if (abs < 86400) return rtf.format(Math.round(s / 3600), 'hour');
    if (abs < 86400 * 7) return rtf.format(Math.round(s / 86400), 'day');
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
  }
  const initials = (name) => String(name || '?').split(/\s+/).filter(Boolean).map((p) => p[0]).slice(0, 2).join('').toUpperCase();

  /** Retrato ilustrativo do arquiteto (o mesmo da vitrine e do perfil). */
  function avatar(person, { size = 40, role = 'architect' } = {}) {
    const name = person?.name || '';
    const id = idOf(person) || person?.userId || name;
    // foto que a própria pessoa enviou (cliente, arquiteto ou loja)
    if (person?.avatar && typeof MatchAPI !== 'undefined') {
      return `<span class="dv-avatar" style="--s:${size}px"><img src="${esc(MatchAPI.avatarSrc(person.avatar))}" alt="" loading="lazy"></span>`;
    }
    if (role === 'architect' && typeof MatchPortraits !== 'undefined') {
      return `<span class="dv-avatar" style="--s:${size}px"><img src="${MatchPortraits.pick(id, name).photo}" alt="" loading="lazy"></span>`;
    }
    return `<span class="dv-avatar is-initials" style="--s:${size}px">${esc(initials(name))}</span>`;
  }

  // ---------- número que conta até o valor ----------
  function countUp(el, to, { format = (v) => nf.format(Math.round(v)), duration = 1000, delay = 0 } = {}) {
    if (!el) return;
    if (reduce || !Number.isFinite(to) || to === 0) { el.textContent = format(to || 0); return; }
    const t0 = performance.now() + delay;
    const ease = (t) => 1 - Math.pow(1 - t, 3);
    el.textContent = format(0);
    const tick = (now) => {
      const t = Math.min(1, Math.max(0, (now - t0) / duration));
      el.textContent = format(to * ease(t));
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    // aba em segundo plano não roda rAF: garante o valor final mesmo assim
    setTimeout(() => { el.textContent = format(to); }, delay + duration + 400);
  }
  function animateNumbers(root) {
    root.querySelectorAll('[data-count]').forEach((el, i) => {
      const to = Number(el.dataset.count);
      const dec = Number(el.dataset.dec || 0);
      const suffix = el.dataset.suffix || '';
      countUp(el, to, { delay: 80 * i, format: (v) => v.toLocaleString('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec }) + suffix });
    });
  }

  // ---------- sparkline (área + linha) ----------
  let gid = 0;
  function sparkline(values, { w = 132, h = 40 } = {}) {
    const vals = values.length > 1 ? values : [0, ...(values.length ? values : [0])];
    const max = Math.max(1, ...vals);
    const step = w / (vals.length - 1);
    const pts = vals.map((v, i) => [i * step, h - 4 - (v / max) * (h - 10)]);
    const line = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
    const id = `dvsp${++gid}`;
    const last = pts[pts.length - 1];
    return `<svg class="dv-spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">
      <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--terracotta)" stop-opacity=".28"/><stop offset="1" stop-color="var(--terracotta)" stop-opacity="0"/></linearGradient></defs>
      <path d="${line} L${w} ${h} L0 ${h}Z" fill="url(#${id})"/>
      <path class="dv-spark-line" d="${line}" fill="none" stroke="var(--terracotta)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" pathLength="1"/>
      <circle cx="${last[0].toFixed(1)}" cy="${last[1].toFixed(1)}" r="2.6" fill="var(--terracotta)"/>
    </svg>`;
  }

  // ---------- medidor radial pontilhado (0–100) ----------
  function dial(value, { label = '', sub = '' } = {}) {
    const v = Math.max(0, Math.min(100, Math.round(value || 0)));
    const N = 64, R = 88, C = 100;
    const on = Math.round((v / 100) * N);
    let dots = '';
    for (let i = 0; i < N; i++) {
      // começa embaixo à esquerda e corre no sentido horário (arco de 300°)
      const a = (120 + (i / (N - 1)) * 300) * (Math.PI / 180);
      const x = C + R * Math.cos(a), y = C + R * Math.sin(a);
      const lit = i < on;
      dots += `<circle class="dv-dot${lit ? ' is-on' : ''}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${lit ? 3.1 : 2.1}" style="--i:${i}${lit ? `; fill: color-mix(in srgb, var(--terracotta) ${Math.round((i / (N - 1)) * 100)}%, var(--sage))` : ''}"/>`;
    }
    let inner = '';
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * Math.PI * 2;
      inner += `<circle cx="${(C + 70 * Math.cos(a)).toFixed(1)}" cy="${(C + 70 * Math.sin(a)).toFixed(1)}" r="1" />`;
    }
    return `<div class="dv-dial" role="img" aria-label="${esc(label)}: ${v}%">
      <svg viewBox="0 0 200 200" aria-hidden="true">
        <defs><linearGradient id="dvDialGrad" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="var(--sage)"/><stop offset="1" stop-color="var(--terracotta)"/></linearGradient></defs>
        <g class="dv-dial-inner">${inner}</g>
        <g class="dv-dial-dots">${dots}</g>
      </svg>
      <div class="dv-dial-center"><strong data-count="${v}">${v}</strong><span>%</span>${sub ? `<em>${esc(sub)}</em>` : ''}</div>
    </div>`;
  }

  // ---------- anel de progresso ----------
  function ring(pct, { size = 112, stroke = 9 } = {}) {
    const p = Math.max(0, Math.min(100, Math.round(pct)));
    const r = (size - stroke) / 2, c = 2 * Math.PI * r;
    return `<div class="dv-ring" style="--size:${size}px" role="img" aria-label="${p}% concluído">
      <svg viewBox="0 0 ${size} ${size}" aria-hidden="true">
        <defs><linearGradient id="dvRingGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="var(--sage)"/><stop offset="1" stop-color="var(--terracotta)"/></linearGradient></defs>
        <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--line)" stroke-width="${stroke}"/>
        <circle class="dv-ring-bar" cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="url(#dvRingGrad)" stroke-width="${stroke}" stroke-linecap="round"
          stroke-dasharray="${c.toFixed(2)}" style="--off:${(c * (1 - p / 100)).toFixed(2)}; --len:${c.toFixed(2)}" transform="rotate(-90 ${size / 2} ${size / 2})"/>
      </svg>
      <div class="dv-ring-center"><strong data-count="${p}">${p}</strong><span>%</span></div>
    </div>`;
  }

  /** Mini anel de pontuação (cards de resultado do match). */
  function scoreRing(score, size = 64) {
    const p = Math.max(0, Math.min(100, Math.round(score)));
    const r = (size - 6) / 2, c = 2 * Math.PI * r;
    return `<span class="dv-score" style="--size:${size}px">
      <svg viewBox="0 0 ${size} ${size}" aria-hidden="true">
        <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--line)" stroke-width="5"/>
        <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="url(#dvRingGrad)" stroke-width="5" stroke-linecap="round"
          stroke-dasharray="${c.toFixed(2)}" stroke-dashoffset="${(c * (1 - p / 100)).toFixed(2)}" transform="rotate(-90 ${size / 2} ${size / 2})"/>
      </svg>
      <strong>${p}</strong>
    </span>`;
  }

  // ---------- barras verticais ----------
  function bars(items, { highlight = items.length - 1, unit = '' } = {}) {
    const max = Math.max(1, ...items.map((b) => b.value));
    return `<div class="dv-bars" role="img" aria-label="${esc(items.map((b) => `${b.label}: ${b.value}${unit}`).join(', '))}">
      ${items.map((b, i) => `
        <div class="dv-bar${i === highlight ? ' is-hl' : ''}${b.value ? '' : ' is-zero'}" title="${esc(b.title || b.label)}: ${b.value}${unit}">
          <span class="dv-bar-val">${b.value || ''}</span>
          <span class="dv-bar-col" style="--h:${Math.max(b.value ? 6 : 2, (b.value / max) * 100)}%; --i:${i}"></span>
          <span class="dv-bar-lab">${esc(b.label)}</span>
        </div>`).join('')}
    </div>`;
  }

  /** Barra empilhada + legenda (status de projetos, pedidos...). */
  function stacked(parts) {
    const total = parts.reduce((s, p) => s + p.value, 0);
    if (!total) return '<div class="dv-stack is-empty"><span></span></div>';
    return `<div class="dv-stack" role="img" aria-label="${esc(parts.filter((p) => p.value).map((p) => `${p.label}: ${p.value}`).join(', '))}">
      ${parts.filter((p) => p.value).map((p, i) => `<span style="--w:${(p.value / total) * 100}%; --c:${p.color}; --i:${i}" title="${esc(p.label)}: ${p.value}"></span>`).join('')}
    </div>
    <ul class="dv-legend">${parts.filter((p) => p.value).map((p) => `<li><i style="--c:${p.color}"></i>${esc(p.label)} <b>${p.value}</b></li>`).join('')}</ul>`;
  }

  /** Lista de barras horizontais (estilos mais frequentes, notas...). */
  function hbars(items, { max } = {}) {
    const m = max || Math.max(1, ...items.map((i) => i.value));
    return `<ul class="dv-hbars">${items.map((it, i) => `
      <li><span class="dv-hbar-lab">${esc(it.label)}</span>
        <span class="dv-hbar-track"><span style="--w:${(it.value / m) * 100}%; --i:${i}"></span></span>
        <b>${esc(it.display ?? it.value)}</b></li>`).join('')}</ul>`;
  }

  /** Últimas N semanas (segunda a domingo), contando datas em cada uma. */
  function weekly(dates, n = 8) {
    const start = new Date(); start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7)); // segunda desta semana
    const weeks = Array.from({ length: n }, (_, i) => {
      const s = new Date(start); s.setDate(s.getDate() - (n - 1 - i) * 7);
      return { s, value: 0 };
    });
    dates.forEach((d) => {
      const t = new Date(d).getTime();
      for (let i = n - 1; i >= 0; i--) if (t >= weeks[i].s.getTime()) { if (i < n) weeks[i].value += 1; break; }
    });
    return weeks.map((w, i) => ({
      value: w.value,
      label: i === n - 1 ? 'Agora' : w.s.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
      title: `Semana de ${w.s.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}`,
    }));
  }

  function empty(text, action = '') {
    return `<div class="dv-empty"><span class="dv-empty-rule"></span><p>${text}</p>${action}</div>`;
  }

  /** Liga as animações de entrada (barras, pontos, anéis) e os contadores. */
  function play(root) {
    animateNumbers(root);
    requestAnimationFrame(() => requestAnimationFrame(() => root.classList.add('is-in')));
    // aba em segundo plano não roda rAF: o conteúdo não pode ficar invisível
    setTimeout(() => root.classList.add('is-in'), 160);
  }

  /** Ícones no menu do painel (as abas continuam as mesmas, com a mesma lógica). */
  function decorateTabs(tabsBar) {
    if (!tabsBar || tabsBar.dataset.dv) return;
    tabsBar.dataset.dv = '1';
    tabsBar.querySelectorAll('.profile-tab').forEach((tab) => {
      const key = tab.dataset.profilePanel;
      const label = [...tab.childNodes].find((n) => n.nodeType === 3 && n.textContent.trim());
      if (label) {
        const span = document.createElement('span');
        span.className = 'dv-tab-label';
        span.textContent = label.textContent.trim();
        label.replaceWith(span);
      }
      tab.insertAdjacentHTML('afterbegin', `<span class="dv-tab-ico">${icon(key, 18)}</span>`);
    });
  }

  /** Cabeçalho de página nas abas que ainda não têm um próprio (arquiteto, loja). */
  function autoHeads(scope, eyebrow) {
    const tabsBar = scope.querySelector('.profile-tabs');
    scope.querySelectorAll('[data-profile-panel-content]').forEach((panel) => {
      const key = panel.dataset.profilePanelContent;
      if (key === 'home' || panel.querySelector(':scope > .dv-head')) return;
      const tab = tabsBar?.querySelector(`[data-profile-panel="${key}"] .dv-tab-label`);
      if (!tab) return;
      const lead = panel.querySelector(':scope > .card-lead');
      panel.insertAdjacentHTML('afterbegin', head({ key, eyebrow, title: tab.textContent, lead: lead?.textContent || '' }));
      lead?.remove();
    });
  }

  function head({ key, eyebrow, title, lead = '', actions = '' }) {
    return `<header class="dv-head">
      <span class="dv-head-ico">${icon(key, 22)}</span>
      <div class="dv-head-text">
        <span class="eyebrow">${esc(eyebrow)}</span>
        <h2>${esc(title)}</h2>
        ${lead ? `<p>${esc(lead)}</p>` : ''}
      </div>
      ${actions ? `<div class="dv-head-actions">${actions}</div>` : ''}
    </header>`;
  }

  /** Faixa de KPIs compactos no topo de uma página. */
  function kpiStrip(items) {
    return items.map((k) => `
      <div class="dv-mini">
        <span class="dv-mini-ico">${icon(k.icon, 16)}</span>
        <div><strong ${k.count != null ? `data-count="${k.count}" data-dec="${k.dec || 0}" data-suffix="${esc(k.suffix || '')}"` : ''}>${esc(k.value)}</strong><span>${esc(k.label)}</span></div>
      </div>`).join('');
  }

  return {
    icon, esc, idOf, money, compactMoney, timeAgo, initials, avatar, countUp, animateNumbers,
    sparkline, dial, ring, scoreRing, bars, stacked, hbars, weekly, empty, play, decorateTabs,
    autoHeads, head, kpiStrip, reduce,
  };
})();

/**
 * Home do cliente em bento: KPIs, melhor compatibilidade, buscas por semana,
 * top arquitetos do último match, jornada e atividade recente.
 */
const DashHome = (() => {
  const U = DashUI;
  const STATUS = [
    { key: 'draft', label: 'Rascunho', color: '#C9BBA8' },
    { key: 'matching', label: 'Buscando arquiteto', color: 'var(--terracotta)' },
    { key: 'in_progress', label: 'Em andamento', color: 'var(--sage)' },
    { key: 'completed', label: 'Concluído', color: '#5B6B5D' },
  ];
  const statusParts = (items) => STATUS.map((s) => ({ ...s, value: items.filter((p) => (p.status || 'draft') === s.key).length }));

  function kpi({ key, jump, label, value, count, dec = 0, suffix = '', foot = '', viz = '', id = '' }) {
    return `<button type="button" class="dv-card dv-kpi" data-jump-tab="${jump}">
      <span class="dv-kpi-top"><span class="dv-chip-ico">${U.icon(key, 18)}</span><span class="dv-kpi-label">${label}</span><span class="dv-kpi-go">${U.icon('arrow', 16)}</span></span>
      <strong class="dv-kpi-num"${id ? ` id="${id}"` : ''} data-count="${count ?? 0}" data-dec="${dec}" data-suffix="${suffix}">${value}</strong>
      ${viz}
      <span class="dv-kpi-foot">${foot}</span>
    </button>`;
  }

  function client(root, d) {
    const projects = d.projects || [], history = d.history || [], favorites = d.favorites || [];
    const conversations = d.conversations || [], hires = d.hires || [];
    const unread = conversations.reduce((s, c) => s + (c.unreadCount || 0), 0);
    const active = projects.filter((p) => ['matching', 'in_progress'].includes(p.status)).length;
    const weeks = U.weekly(history.map((h) => h.createdAt), 8);
    const thisWeek = weeks[weeks.length - 1].value;
    const cities = new Set(favorites.map((f) => f.city).filter(Boolean));

    // último match: melhor resultado e top 5
    const last = history[0];
    const ranked = (last?.results || []).filter((r) => r.architect).slice().sort((a, b) => b.score - a.score);
    const best = ranked[0];
    const avg = ranked.length ? ranked.reduce((sum, r) => sum + Math.min(100, r.score), 0) / ranked.length : 0;

    // jornada do cliente na plataforma (tudo a partir de dados reais)
    const steps = [
      { done: projects.length > 0, label: 'Criar um projeto', jump: 'projeto' },
      { done: projects.some((p) => (p.preferredStyles || []).length), label: 'Definir estilos do projeto', jump: 'projeto' },
      { done: history.length > 0, label: 'Rodar o match com IA', jump: 'projeto' },
      { done: favorites.length > 0, label: 'Salvar arquitetos favoritos', jump: 'match' },
      { done: conversations.length > 0, label: 'Conversar com um arquiteto', jump: 'mensagens' },
      { done: hires.length > 0, label: 'Pedir a contratação', jump: 'match' },
      { done: hires.some((h) => h.status === 'accepted'), label: 'Fechar o projeto', jump: 'match' },
    ];
    const pct = (steps.filter((s) => s.done).length / steps.length) * 100;
    const next = steps.find((s) => !s.done);

    // atividade recente (todas as fontes, mais recente primeiro)
    const events = [
      ...projects.filter((p) => p.createdAt).map((p) => ({ at: p.createdAt, icon: 'projeto', text: `Criou o projeto <b>${U.esc(p.name)}</b>` })),
      ...history.map((h) => ({ at: h.createdAt, icon: 'match', text: `Rodou o match${h.project ? ` de <b>${U.esc(h.project.name)}</b>` : ''} · ${h.results.length} arquiteto${h.results.length === 1 ? '' : 's'}` })),
      ...favorites.filter((f) => f.favoritedAt).map((f) => ({ at: f.favoritedAt, icon: 'favoritos', text: `Salvou <b>${U.esc(f.name)}</b> nos favoritos` })),
      ...conversations.filter((c) => c.lastMessageAt).map((c) => ({ at: c.lastMessageAt, icon: 'mensagens', text: `Mensagem com <b>${U.esc(c.name)}</b>` })),
      ...hires.map((h) => ({ at: h.decidedAt || h.createdAt, icon: 'contratacoes', text: h.status === 'accepted' ? `<b>${U.esc(h.architect?.name || 'Arquiteto')}</b> aceitou o projeto` : h.status === 'declined' ? `<b>${U.esc(h.architect?.name || 'Arquiteto')}</b> recusou o pedido` : `Pediu a contratação de <b>${U.esc(h.architect?.name || 'arquiteto')}</b>` })),
    ].filter((e) => e.at).sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, 6);

    root.innerHTML = `
      ${kpi({ key: 'projeto', jump: 'projeto', label: 'Projetos', value: projects.length, count: projects.length,
        viz: U.stacked(statusParts(projects)), foot: projects.length ? `${active} ativo${active === 1 ? '' : 's'}` : 'Crie o primeiro' })}
      ${kpi({ key: 'match', jump: 'match', label: 'Buscas de match', value: history.length, count: history.length, id: 'overviewMatchCount',
        viz: U.sparkline(weeks.map((w) => w.value)), foot: thisWeek ? `+${thisWeek} nesta semana` : 'Nenhuma nesta semana' })}
      ${kpi({ key: 'favoritos', jump: 'favoritos', label: 'Favoritos', value: favorites.length, count: favorites.length, id: 'overviewFavCount',
        viz: `<span class="dv-faces">${favorites.slice(0, 4).map((f) => U.avatar(f, { size: 28 })).join('')}</span>`,
        foot: favorites.length ? `em ${cities.size || 1} cidade${cities.size > 1 ? 's' : ''}` : 'Nenhum salvo' })}
      ${kpi({ key: 'mensagens', jump: 'mensagens', label: 'Não lidas', value: unread, count: unread, id: 'overviewUnreadCount',
        viz: `<span class="dv-pulse${unread ? ' is-on' : ''}"></span>`, foot: `${conversations.length} conversa${conversations.length === 1 ? '' : 's'}` })}

      <article class="dv-card dv-best">
        <header class="dv-card-head"><div><span class="eyebrow">Último match</span><h3>Melhor compatibilidade</h3></div></header>
        ${U.dial(best ? best.score : 0, { label: 'Melhor compatibilidade', sub: best ? 'compatível' : 'sem match' })}
        ${best ? `<div class="dv-dial-stats"><div><strong data-count="${Math.round(avg)}" data-suffix="%">${Math.round(avg)}%</strong><span>média do match</span></div><div><strong data-count="${ranked.length}">${ranked.length}</strong><span>arquitetos</span></div></div>` : ''}
        ${best ? `
          <a class="dv-best-who" href="arquiteto.html?id=${U.idOf(best.architect)}">
            ${U.avatar(best.architect, { size: 40 })}
            <span><strong>${U.esc(best.architect.name)}</strong><em>${U.esc(last.project?.name || 'Perfil principal')} · ${U.timeAgo(last.createdAt)}</em></span>
            ${U.icon('arrow', 16)}
          </a>`
        : U.empty('Rode o match de um projeto para ver quem combina mais com você.', '<button type="button" class="btn btn-primary btn-sm" data-jump-tab="projeto">Ir para meus projetos</button>')}
      </article>

      <article class="dv-card dv-weeks">
        <header class="dv-card-head">
          <div><span class="eyebrow">Últimas 8 semanas</span><h3>Buscas de compatibilidade</h3></div>
          <div class="dv-head-stat"><strong data-count="${history.length}">${history.length}</strong><span>no total</span></div>
        </header>
        ${U.bars(weeks)}
      </article>

      <article class="dv-card dv-top">
        <header class="dv-card-head">
          <div><span class="eyebrow">${last ? U.esc(last.project?.name || 'Perfil principal') : 'Ranking'}</span><h3>Top arquitetos do último match</h3></div>
          ${last ? '<button type="button" class="dv-link" data-jump-tab="match">Ver todos ' + U.icon('arrow', 14) + '</button>' : ''}
        </header>
        ${ranked.length ? `<ol class="dv-rank">${ranked.slice(0, 5).map((r, i) => `
          <li style="--i:${i}">
            <span class="dv-rank-n">${i + 1}</span>
            ${U.avatar(r.architect, { size: 36 })}
            <a href="arquiteto.html?id=${U.idOf(r.architect)}" class="dv-rank-name"><strong>${U.esc(r.architect.name)}</strong><em>${U.esc([r.architect.city, r.architect.state].filter(Boolean).join(' · ') || 'Localização não informada')}</em></a>
            <span class="dv-rank-bar"><span style="--w:${Math.min(100, r.score)}%"></span></span>
            <b>${Math.min(100, Math.round(r.score))}%</b>
          </li>`).join('')}</ol>`
        : U.empty('Seu ranking aparece aqui depois do primeiro match.')}
      </article>

      <article class="dv-card dv-journey">
        <header class="dv-card-head"><div><span class="eyebrow">Sua jornada</span><h3>Do sonho ao projeto fechado</h3></div></header>
        <div class="dv-journey-body">
          ${U.ring(pct)}
          <ul class="dv-steps">${steps.map((s, i) => `<li class="${s.done ? 'is-done' : ''}${s === next ? ' is-next' : ''}" style="--i:${i}"><span>${s.done ? U.icon('check', 12) : ''}</span>${s.label}</li>`).join('')}</ul>
        </div>
        ${next ? `<button type="button" class="dv-next" data-jump-tab="${next.jump}">Próximo passo: <b>${next.label}</b> ${U.icon('arrow', 14)}</button>` : '<p class="dv-next is-done">Jornada completa — bom projeto!</p>'}
      </article>

      <article class="dv-card dv-activity">
        <header class="dv-card-head"><div><span class="eyebrow">Linha do tempo</span><h3>Atividade recente</h3></div></header>
        ${events.length ? `<ol class="dv-feed">${events.map((e, i) => `
          <li style="--i:${i}"><span class="dv-feed-ico">${U.icon(e.icon, 15)}</span><p>${e.text}</p><time>${U.timeAgo(e.at)}</time></li>`).join('')}</ol>`
        : U.empty('Sua atividade aparece aqui conforme você usa o painel.')}
      </article>`;
  }

  /** Home do arquiteto, no mesmo bento. */
  function architect(root, d, user) {
    const hires = d.hires || [], conversations = d.conversations || [];
    const reviews = d.reviews || { reviews: [], average: 0, count: 0 };
    const unread = conversations.reduce((s, c) => s + (c.unreadCount || 0), 0);
    const closed = hires.filter((h) => h.status === 'accepted');
    const pending = hires.filter((h) => h.status === 'pending');
    const p = user.architectProfile || {};
    const portfolio = (p.portfolio || []).length;
    const tier = p.subscriptionTier || 'free';
    const limit = tier === 'pro' ? null : 3 + (p.bonusPortfolioSlots || 0);
    const weeks = U.weekly(hires.map((h) => h.createdAt), 8);
    const style = typeof MatchExtras !== 'undefined' ? MatchExtras.getStyleProfile(String(user.id || user._id)) : { palette: [], keywords: [] };
    const checks = [
      { done: Boolean(p.bio?.trim()), label: 'Bio sobre seu jeito de projetar', jump: 'perfil' },
      { done: portfolio > 0, label: 'Primeiro projeto no portfólio', jump: 'portfolio' },
      { done: (p.favoriteMaterials?.length || 0) > 0, label: 'Materiais favoritos', jump: 'perfil' },
      { done: style.palette.length > 0 || style.keywords.length > 0, label: 'Paleta ou palavras-chave', jump: 'perfil' },
      { done: (p.cauVerification?.status || 'none') !== 'none', label: 'Verificação do CAU/A', jump: 'perfil' },
    ];
    const pct = (checks.filter((c) => c.done).length / checks.length) * 100;
    const next = checks.find((c) => !c.done);
    const dist = [5, 4, 3, 2, 1].map((n) => ({ label: `${n} ★`, value: reviews.reviews.filter((r) => r.rating === n).length }));
    const events = [
      ...hires.map((h) => ({ at: h.decidedAt || h.createdAt, icon: 'contratacoes', text: h.status === 'accepted' ? `Projeto <b>${U.esc(h.project?.name || '')}</b> fechado com ${U.esc(h.client?.name || 'cliente')}` : h.status === 'declined' ? `Pedido de <b>${U.esc(h.client?.name || 'cliente')}</b> recusado` : `<b>${U.esc(h.client?.name || 'Cliente')}</b> quer contratar você` })),
      ...reviews.reviews.filter((r) => r.createdAt).map((r) => ({ at: r.createdAt, icon: 'avaliacoes', text: `<b>${U.esc(r.client?.name || 'Cliente')}</b> avaliou com ${'★'.repeat(r.rating)}` })),
      ...conversations.filter((c) => c.lastMessageAt).map((c) => ({ at: c.lastMessageAt, icon: 'mensagens', text: `Mensagem com <b>${U.esc(c.name)}</b>` })),
    ].filter((e) => e.at).sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, 6);

    root.innerHTML = `
      ${kpi({ key: 'contratacoes', jump: 'contratacoes', label: 'Projetos fechados', value: closed.length, count: closed.length, id: 'overviewCommissionCount',
        viz: U.sparkline(weeks.map((w) => w.value)), foot: pending.length ? `${pending.length} pedido${pending.length > 1 ? 's' : ''} aguardando` : 'Nenhum pedido pendente' })}
      ${kpi({ key: 'avaliacoes', jump: 'avaliacoes', label: 'Avaliação média', value: reviews.count ? reviews.average : '—', count: reviews.count ? Number(reviews.average) : 0, dec: reviews.count ? 1 : 0, id: 'overviewRatingValue',
        viz: `<span class="dv-stars" style="--r:${reviews.count ? (reviews.average / 5) * 100 : 0}%">★★★★★</span>`, foot: `${reviews.count} avaliaç${reviews.count === 1 ? 'ão' : 'ões'}` })}
      ${kpi({ key: 'mensagens', jump: 'mensagens', label: 'Não lidas', value: unread, count: unread, id: 'overviewArchitectUnreadCount',
        viz: `<span class="dv-pulse${unread ? ' is-on' : ''}"></span>`, foot: `${conversations.length} conversa${conversations.length === 1 ? '' : 's'}` })}
      ${kpi({ key: 'portfolio', jump: 'portfolio', label: 'Portfólio', value: portfolio, count: portfolio,
        viz: limit ? `<span class="dv-meter"><span style="--w:${Math.min(100, (portfolio / limit) * 100)}%"></span></span>` : '<span class="badge-pro">★ Pro</span>',
        foot: limit ? `${portfolio} de ${limit} vagas` : 'Portfólio ilimitado' })}

      <article class="dv-card dv-best">
        <header class="dv-card-head"><div><span class="eyebrow">Perfil público</span><h3>Força do perfil</h3></div></header>
        ${U.dial(pct, { label: 'Perfil completo', sub: 'completo' })}
        <ul class="dv-steps dv-steps-compact">${checks.map((c, i) => `<li class="${c.done ? 'is-done' : ''}${c === next ? ' is-next' : ''}" style="--i:${i}"><span>${c.done ? U.icon('check', 12) : ''}</span>${c.label}</li>`).join('')}</ul>
        ${next ? `<button type="button" class="dv-next" data-jump-tab="${next.jump}">Falta: <b>${next.label}</b> ${U.icon('arrow', 14)}</button>` : '<p class="dv-next is-done">Perfil completo — você aparece melhor no match.</p>'}
      </article>

      <article class="dv-card dv-weeks">
        <header class="dv-card-head">
          <div><span class="eyebrow">Últimas 8 semanas</span><h3>Pedidos de contratação</h3></div>
          <div class="dv-head-stat"><strong data-count="${hires.length}">${hires.length}</strong><span>no total</span></div>
        </header>
        ${U.bars(weeks)}
        ${U.stacked([
          { label: 'Aguardando', value: pending.length, color: 'var(--terracotta)' },
          { label: 'Fechados', value: closed.length, color: 'var(--sage)' },
          { label: 'Recusados', value: hires.filter((h) => h.status === 'declined').length, color: '#C9BBA8' },
        ])}
      </article>

      <article class="dv-card dv-top">
        <header class="dv-card-head"><div><span class="eyebrow">Clientes</span><h3>Distribuição das notas</h3></div>
          <div class="dv-head-stat"><strong>${reviews.count ? reviews.average : '—'}</strong><span>média</span></div></header>
        ${reviews.count ? U.hbars(dist, { max: Math.max(1, ...dist.map((x) => x.value)) }) : U.empty('Suas avaliações aparecem aqui quando o primeiro cliente avaliar você.')}
      </article>

      <article class="dv-card dv-activity dv-span-wide">
        <header class="dv-card-head"><div><span class="eyebrow">Linha do tempo</span><h3>Atividade recente</h3></div></header>
        ${events.length ? `<ol class="dv-feed">${events.map((e, i) => `
          <li style="--i:${i}"><span class="dv-feed-ico">${U.icon(e.icon, 15)}</span><p>${e.text}</p><time>${U.timeAgo(e.at)}</time></li>`).join('')}</ol>`
        : U.empty('Pedidos, avaliações e mensagens aparecem aqui.')}
      </article>`;
  }

  /**
   * Coleta os dados que o painel já carrega (cada fonte avisa quando chega)
   * e desenha a Home uma vez com tudo — sem reanimar a cada fonte nova.
   */
  function collector(root, keys, draw) {
    const data = {};
    let drawn = false, timer = null;
    const render = () => {
      if (!root) return;
      draw(root, data);
      root.classList.remove('is-loading');
      if (!drawn) { drawn = true; DashUI.play(root); } else { root.classList.add('is-in'); DashUI.animateNumbers(root); }
    };
    // se alguma fonte demorar demais (API lenta), desenha com o que tiver
    const fallback = setTimeout(() => { if (!drawn) render(); }, 4000);
    return (key, value) => {
      data[key] = value;
      if (!drawn && !keys.every((k) => k in data)) return;
      clearTimeout(fallback);
      clearTimeout(timer);
      timer = setTimeout(render, drawn ? 120 : 0);
    };
  }

  return { client, architect, collector, statusParts, STATUS };
})();
