/**
 * Estimador de orçamento — calculadora 100% client-side, sem dependência do
 * back-end. Os valores de R$/m² são faixas aproximadas ilustrativas (não uma
 * fonte de dados de mercado em tempo real), por isso o resultado sempre
 * aparece como faixa + aviso, nunca como um número único e definitivo.
 * Recalcula ao vivo a cada mudança de campo, sem precisar de um botão
 * "calcular" — o resultado já nasce preenchido com os valores padrão.
 *
 * Os comparativos (por acabamento e por região) usam a MESMA fórmula com um
 * fator trocado — mostram o efeito de cada escolha, não dados novos.
 */
document.addEventListener('DOMContentLoaded', () => {
  const REGION_BASE = { capital: 2200, media: 1700, pequena: 1300 };
  const REGION_LABEL = { capital: 'Capital / região metropolitana', media: 'Cidade média', pequena: 'Interior / cidade pequena' };
  const REGION_SHORT = { capital: 'Capital', media: 'Cidade média', pequena: 'Interior' };
  const TYPE_MULT = { unifamiliar: 1.1, apartamento: 0.9, reforma: 0.85, interiores: 0.6, comercial: 1.0, paisagismo: 0.5 };
  const TYPE_LABEL = { unifamiliar: 'Residencial unifamiliar', apartamento: 'Apartamento (reforma)', reforma: 'Reforma geral', interiores: 'Interiores / marcenaria', comercial: 'Comercial', paisagismo: 'Paisagismo' };
  const FINISH_MULT = { economico: 0.75, medio: 1.0, alto: 1.6 };
  const FINISH_LABEL = { economico: 'Econômico', medio: 'Médio', alto: 'Alto padrão' };
  const STYLE_MULT = {
    'Moderno': 1.0, 'Contemporâneo': 1.05, 'Minimalista': 0.95, 'Industrial': 1.05,
    'Clássico': 1.15, 'Rústico': 1.0, 'Escandinavo': 1.0, 'Biofílico': 1.1,
    'Brutalista': 1.1, 'Alto padrão': 1.3,
  };
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const money = (n) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
  const short = (n) => n >= 1e6
    ? `R$ ${(n / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} mi`
    : `R$ ${Math.round(n / 1e3).toLocaleString('pt-BR')} mil`;
  const form = document.getElementById('budgetForm');
  const rangeEl = document.getElementById('budgetRangeValue');
  const areaInput = document.getElementById('bArea');
  const areaRange = document.getElementById('bAreaRange');
  const val = (name) => form.querySelector(`input[name="${name}"]:checked`)?.value;
  const perM2For = ({ regiao, tipo, acabamento, estilo }) =>
    REGION_BASE[regiao] * TYPE_MULT[tipo] * FINISH_MULT[acabamento] * (STYLE_MULT[estilo] || 1);

  // número que corre do valor anterior até o novo
  let shown = { low: 0, high: 0 }, raf = 0;
  function animateRange(low, high) {
    cancelAnimationFrame(raf);
    const from = { ...shown };
    if (reduce || !from.high) { shown = { low, high }; rangeEl.textContent = `${short(low)} – ${short(high)}`; return; }
    const t0 = performance.now(), dur = 520;
    const step = (now) => {
      const t = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - t, 3);
      shown = { low: from.low + (low - from.low) * e, high: from.high + (high - from.high) * e };
      rangeEl.textContent = `${short(shown.low)} – ${short(shown.high)}`;
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    setTimeout(() => { shown = { low, high }; rangeEl.textContent = `${short(low)} – ${short(high)}`; }, dur + 200);
  }

  function paintSlider() {
    const min = Number(areaRange.min), max = Number(areaRange.max);
    const pct = ((Math.min(max, Math.max(min, Number(areaRange.value))) - min) / (max - min)) * 100;
    areaRange.style.setProperty('--p', `${pct}%`);
  }

  function calculate() {
    const area = Number(areaInput.value);
    if (!area || area <= 0) return;
    const sel = { tipo: val('tipo'), regiao: val('regiao'), acabamento: val('acabamento'), estilo: val('estilo') };
    const perM2 = perM2For(sel);
    const low = perM2 * area * 0.85;
    const high = perM2 * area * 1.15;
    animateRange(low, high);

    document.getElementById('budgetPerM2').textContent = `≈ ${money(perM2)} por m² · ${area.toLocaleString('pt-BR')} m² · de ${money(low)} a ${money(high)}`;
    document.getElementById('bqLow').textContent = `mín. ${short(low)}`;
    document.getElementById('bqMid').textContent = `médio ${short(perM2 * area)}`;
    document.getElementById('bqHigh').textContent = `máx. ${short(high)}`;
    document.getElementById('budgetBreakdown').innerHTML = `
      <span>${TYPE_LABEL[sel.tipo]}</span>
      <span>${REGION_LABEL[sel.regiao]}</span>
      <span>${FINISH_LABEL[sel.acabamento]}</span>
      <span>${sel.estilo}</span>`;

    // comparativo por acabamento (R$/m²), com o escolhido em destaque
    const finishes = Object.keys(FINISH_MULT).map((k) => ({ k, v: perM2For({ ...sel, acabamento: k }) }));
    const fMax = Math.max(...finishes.map((f) => f.v));
    document.getElementById('bqFinishBars').innerHTML = finishes.map((f) => `
      <div class="bq-bar${f.k === sel.acabamento ? ' is-on' : ''}">
        <span class="bq-bar-val">${money(f.v)}</span>
        <span class="bq-bar-col"><span style="height:${(f.v / fMax) * 100}%"></span></span>
        <span class="bq-bar-lab">${FINISH_LABEL[f.k]}</span>
      </div>`).join('');

    // comparativo por região (total médio da obra)
    const regions = Object.keys(REGION_BASE).map((k) => ({ k, v: perM2For({ ...sel, regiao: k }) * area }));
    const rMax = Math.max(...regions.map((r) => r.v));
    document.getElementById('bqRegionBars').innerHTML = regions.map((r) => `
      <li class="${r.k === sel.regiao ? 'is-on' : ''}">
        <span>${REGION_SHORT[r.k]}</span>
        <span class="bq-hbar"><span style="width:${(r.v / rMax) * 100}%"></span></span>
        <b>${short(r.v)}</b>
      </li>`).join('');
  }

  // área: número, controle deslizante e atalhos sempre em sincronia
  areaRange.addEventListener('input', () => { areaInput.value = areaRange.value; paintSlider(); });
  areaInput.addEventListener('input', () => { areaRange.value = areaInput.value; paintSlider(); });
  form.querySelectorAll('[data-area]').forEach((btn) => btn.addEventListener('click', () => {
    areaInput.value = areaRange.value = btn.dataset.area;
    paintSlider();
    calculate();
  }));

  form.addEventListener('input', calculate);
  form.addEventListener('change', calculate);
  form.addEventListener('submit', (e) => { e.preventDefault(); calculate(); });
  paintSlider();
  calculate();
});
