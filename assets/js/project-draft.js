/**
 * Rascunho do "Novo projeto" compartilhado entre novo-projeto.html (formulário)
 * e experiencia-3d.html (configurador 3D). Fica no sessionStorage: some ao
 * fechar a aba, e nada vai para o servidor até o cliente confirmar
 * "Vamos transformar isso em projeto". toPayload() monta o corpo de
 * MatchAPI.createProject() juntando as três fontes de preferência.
 */
const MatchProjectDraft = (() => {
  const KEY = 'matchia_project_draft';
  const EMPTY = () => ({ v: 1, basics: { preferredStyles: [] }, styleNotes: '', feelings: [], picks: {}, experience: null });

  function load() {
    try {
      const raw = JSON.parse(sessionStorage.getItem(KEY) || 'null');
      return raw && raw.v === 1 ? { ...EMPTY(), ...raw } : EMPTY();
    } catch { return EMPTY(); }
  }
  function save(draft) {
    try { sessionStorage.setItem(KEY, JSON.stringify(draft)); } catch { /* aba anônima/cota: segue só em memória */ }
  }
  function clear() {
    try { sessionStorage.removeItem(KEY); } catch { /* idem */ }
  }

  // Estilos mais citados primeiro; desempate pela ordem em que apareceram.
  function rankStyles(lists) {
    const count = new Map();
    lists.flat().forEach((s) => count.set(s, (count.get(s) || 0) + 1));
    return [...count.entries()].sort((a, b) => b[1] - a[1]).map(([s]) => s);
  }

  function pickedOptions(draft) {
    const questions = window.MatchStyleQuestions || [];
    return questions
      .map((q) => ({ q, o: q.options.find((o) => o.id === draft.picks[q.id]) }))
      .filter((x) => x.o);
  }

  function toPayload(draft, experience) {
    const b = draft.basics || {};
    const picks = pickedOptions(draft);
    const pickStyles = rankStyles(picks.map((x) => x.o.styles));
    const expStyles = experience?.styles || [];
    const preferredStyles = [...new Set([...(b.preferredStyles || []), ...pickStyles.slice(0, 3), ...expStyles.slice(0, 2)])];
    const baseMaterials = String(b.preferredMaterials || '').split(',').map((m) => m.trim()).filter(Boolean);
    const preferredMaterials = [...new Set([...baseMaterials, ...(experience?.materials || [])])];
    const notes = [draft.styleNotes?.trim(), draft.feelings?.length ? `Sensações que quero sentir em casa: ${draft.feelings.join(', ')}.` : '']
      .filter(Boolean).join('\n');
    const payload = {
      name: (b.name || '').trim(),
      propertyType: b.propertyType,
      areaM2: b.areaM2,
      city: (b.city || '').trim(),
      state: b.state || '',
      budgetMin: b.budgetMin,
      budgetMax: b.budgetMax,
      familySize: b.familySize,
      projectGoals: (b.projectGoals || '').trim(),
      preferredStyles,
      preferredMaterials,
      styleNotes: notes,
      stylePicks: picks.map(({ q, o }) => ({ question: q.question, choice: o.label, styles: o.styles })),
    };
    if (experience) payload.experience = experience.payload;
    return payload;
  }

  return { load, save, clear, toPayload, rankStyles, pickedOptions };
})();
