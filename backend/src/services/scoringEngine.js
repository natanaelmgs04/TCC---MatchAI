const overlap = (left = [], right = []) =>
  left.filter((value) => right.map(String).includes(String(value))).length;
const capped = (value, cap) => Math.min(value, cap);

export function scoreArchitect(client, architect) {
  const c = client.clientProfile || {},
    a = architect.architectProfile || {};
  const styles = capped(overlap(c.preferredStyles, a.styles) * 10, 30);
  const materials = capped(
    overlap(c.preferredMaterials, a.favoriteMaterials) * 5,
    15,
  );
  const location = a.workingAreas?.some((area) =>
    [client.city, client.state]
      .filter(Boolean)
      .some((place) => area.toLowerCase().includes(place.toLowerCase())),
  )
    ? 20
    : 0;
  const property = a.specialties?.some(
    (s) =>
      c.propertyType && s.toLowerCase().includes(c.propertyType.toLowerCase()),
  )
    ? 15
    : 0;
  const availability =
    a.availability === "available" ? 10 : a.availability === "limited" ? 5 : 0;
  const experience = capped(a.yearsExperience || 0, 10);
  const score =
    styles + materials + location + property + availability + experience;
  const reasons = [
    styles && "estilo arquitetônico compatível",
    materials && "preferências de materiais em comum",
    location && "atendimento na sua região",
    property && "especialidade relevante para o projeto",
    experience && `${a.yearsExperience} anos de experiência`,
  ].filter(Boolean);
  const breakdown = [
    { label: "Estilo", value: styles, max: 30 },
    { label: "Materiais", value: materials, max: 15 },
    { label: "Localização", value: location, max: 20 },
    { label: "Especialidade", value: property, max: 15 },
    { label: "Disponibilidade", value: availability, max: 10 },
    { label: "Experiência", value: experience, max: 10 },
  ];
  return { score, reasons, breakdown };
}

/** Nunca mostrar mais de 100% de compatibilidade — a soma dos fatores do
 * match por projeto passa de 100 (o bônus de metragem soma até +5), então a
 * exibição em % precisa clampar em vez de assumir que os tetos somam 100. */
export function scoreToPercent(score) {
  return Math.min(100, Math.round(score));
}

/** Peça de portfólio que melhor combina com o projeto, pelo total de
 * pontos de estilo + material (a metragem é avaliada depois, só contra essa
 * peça vencedora — ver scoreProjectToArchitect). */
function bestPortfolioMatch(project, architect) {
  const portfolio = architect.architectProfile?.portfolio || [];
  let best = null;
  for (const item of portfolio) {
    const styles = capped(overlap(project.preferredStyles, item.styles) * 10, 30);
    const materials = capped(overlap(project.preferredMaterials, item.materials) * 5, 15);
    const fit = styles + materials;
    if (!best || fit > best.fit) best = { item, styles, materials, fit };
  }
  return best;
}

function areaProximityScore(clientArea, itemArea) {
  if (!clientArea || !itemArea) return 0;
  return Math.abs(clientArea - itemArea) / itemArea <= 0.3 ? 5 : 0;
}

/**
 * Match por projeto: em vez de comparar o projeto contra o perfil agregado
 * do arquiteto, compara contra CADA peça do portfólio e usa a que melhor
 * combina como "motivo" do match — é o que realmente implementa "o match vem
 * do projeto do cliente e do portfólio do arquiteto", não de um perfil
 * estático escolhido uma vez.
 */
export function scoreProjectToArchitect(project, client, architect) {
  const a = architect.architectProfile || {};
  const best = bestPortfolioMatch(project, architect);
  const styles = best?.styles || 0;
  const materials = best?.materials || 0;
  const areaBonus = best ? areaProximityScore(project.areaM2, best.item.areaM2) : 0;

  // Onde a obra acontece: a cidade/UF do projeto; sem elas, a do cliente.
  const places = projectPlaces(project, client);
  const location = places.length && architectServes(architect, places) ? 20 : 0;
  const property = a.specialties?.some(
    (s) => project.propertyType && s.toLowerCase().includes(project.propertyType.toLowerCase()),
  )
    ? 15
    : 0;
  const availability =
    a.availability === "available" ? 10 : a.availability === "limited" ? 5 : 0;
  const experience = capped(a.yearsExperience || 0, 10);
  const score = styles + materials + location + property + availability + experience + areaBonus;

  const reasons = [
    styles && best?.item?.title ? `combina com o projeto "${best.item.title}" do portfólio` : styles && "estilo arquitetônico compatível",
    materials && "preferências de materiais em comum",
    location && "atendimento na sua região",
    property && "especialidade relevante para o projeto",
    areaBonus && "já atendeu projetos de metragem parecida",
    experience && `${a.yearsExperience} anos de experiência`,
  ].filter(Boolean);
  const breakdown = [
    { label: "Estilo", value: styles, max: 30 },
    { label: "Materiais", value: materials, max: 15 },
    { label: "Localização", value: location, max: 20 },
    { label: "Especialidade", value: property, max: 15 },
    { label: "Disponibilidade", value: availability, max: 10 },
    { label: "Experiência", value: experience, max: 10 },
    { label: "Metragem", value: areaBonus, max: 5 },
  ];
  return { score, reasons, breakdown, matchedPortfolioItem: best?.item || null, locationKnown: places.length > 0 };
}

// "São Paulo", "sao paulo" e "SÃO PAULO" são o mesmo lugar.
const normPlace = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** Cidade e UF onde o projeto acontece; cai na do cliente se o projeto não tiver. */
export function projectPlaces(project, client) {
  const fromProject = [project?.city, project?.state].filter(Boolean);
  const places = fromProject.length ? fromProject : [client?.city, client?.state].filter(Boolean);
  return places.map(normPlace).filter(Boolean);
}

/** O arquiteto atende algum desses lugares (áreas de atuação, ou a cidade/UF dele)? */
function architectServes(architect, places) {
  const a = architect.architectProfile || {};
  const areas = [...(a.workingAreas || []), architect.city, architect.state].filter(Boolean).map(normPlace);
  // UF (2 letras) só vale igual — senão "sp" casaria com "Espírito Santo".
  return areas.some((area) => places.some((place) => (place.length <= 2 ? area === place : area === place || area.includes(place))));
}

/** Equivalente a categorizeMatches, mas por projeto — mesma lógica de
 * separação por indisponibilidade/região/orçamento, só trocando a função de
 * pontuação de perfil↔perfil por projeto↔portfólio. */
export function categorizeProjectMatches(project, client, architects) {
  const evaluated = architects.map((architect) => {
    const { score, reasons, breakdown, matchedPortfolioItem, locationKnown } = scoreProjectToArchitect(project, client, architect);
    const a = architect.architectProfile || {};
    const locationValue = breakdown.find((b) => b.label === "Localização")?.value || 0;
    const availabilityValue = breakdown.find((b) => b.label === "Disponibilidade")?.value || 0;
    const coreScore = score - locationValue - availabilityValue;
    const projectCity = project?.city || client?.city;
    const sameCity = !!(projectCity && architect.city && normPlace(projectCity) === normPlace(architect.city));
    return {
      architect,
      score,
      reasons,
      breakdown,
      matchedPortfolioItem,
      coreScore,
      sameCity,
      available: a.availability !== "unavailable",
      // Sem localização conhecida (cadastro e projeto sem cidade), ninguém é
      // "fora da região" — mesma regra do orçamento: só separa quando dá pra provar.
      inRegion: !locationKnown || locationValue > 0,
      inBudget: budgetsOverlap(project.budget, a.priceRange),
    };
  });

  const main = [], unavailable = [], outOfRegion = [], outOfBudget = [], uncategorized = [];
  for (const e of evaluated) {
    if (e.coreScore <= 0) { uncategorized.push(e); continue; }
    if (!e.available) unavailable.push(e);
    else if (!e.inRegion) outOfRegion.push(e);
    else if (!e.inBudget) outOfBudget.push(e);
    else main.push(e);
  }

  const byBestScore = (a, b) => b.score - a.score;
  const byCoreScore = (a, b) => b.coreScore - a.coreScore;
  return {
    main: main.sort(byBestScore).slice(0, 4),
    unavailable: unavailable.sort(byCoreScore).slice(0, 3),
    outOfRegion: outOfRegion.sort(byCoreScore).slice(0, 3),
    outOfBudget: outOfBudget.sort(byCoreScore).slice(0, 3),
    uncategorized,
  };
}

export function rankArchitects(client, architects) {
  return architects
    .map((architect) => ({ architect, ...scoreArchitect(client, architect) }))
    .filter((result) => result.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);
}

/** true se as faixas se sobrepõem, ou se falta informação de um dos lados
 * (nesse caso não penaliza — só classifica "fora do orçamento" quando dá
 * pra provar que as faixas realmente não se cruzam). */
function budgetsOverlap(clientBudget, architectPriceRange) {
  const cMin = clientBudget?.min, cMax = clientBudget?.max;
  const aMin = architectPriceRange?.min, aMax = architectPriceRange?.max;
  if (cMin == null && cMax == null) return true;
  if (aMin == null && aMax == null) return true;
  const lo1 = cMin ?? -Infinity, hi1 = cMax ?? Infinity;
  const lo2 = aMin ?? -Infinity, hi2 = aMax ?? Infinity;
  return lo2 <= hi1 && hi2 >= lo1;
}

/**
 * Em vez de só descartar quem não é "o melhor match", separa por que motivo
 * cada arquiteto compatível não entrou no grupo principal — indisponível,
 * fora da região ou fora do orçamento — pra mostrar isso pro cliente em vez
 * de simplesmente escondê-lo. Quem não tem nenhuma afinidade real de
 * estilo/material/especialidade fica em `uncategorized`, pro chamador decidir
 * se entra no bônus de "bem avaliado mesmo fora do estilo".
 */
export function categorizeMatches(client, architects) {
  const clientBudget = client.clientProfile?.budget;

  const evaluated = architects.map((architect) => {
    const { score, reasons, breakdown } = scoreArchitect(client, architect);
    const a = architect.architectProfile || {};
    const locationValue = breakdown.find((b) => b.label === "Localização")?.value || 0;
    const availabilityValue = breakdown.find((b) => b.label === "Disponibilidade")?.value || 0;
    const coreScore = score - locationValue - availabilityValue;
    const sameCity = !!(
      client.city &&
      architect.city &&
      client.city.trim().toLowerCase() === architect.city.trim().toLowerCase()
    );
    return {
      architect,
      score,
      reasons,
      breakdown,
      coreScore,
      sameCity,
      available: a.availability !== "unavailable",
      inRegion: locationValue > 0,
      inBudget: budgetsOverlap(clientBudget, a.priceRange),
    };
  });

  const main = [], unavailable = [], outOfRegion = [], outOfBudget = [], uncategorized = [];
  for (const e of evaluated) {
    if (e.coreScore <= 0) { uncategorized.push(e); continue; }
    if (!e.available) unavailable.push(e);
    else if (!e.inRegion) outOfRegion.push(e);
    else if (!e.inBudget) outOfBudget.push(e);
    else main.push(e);
  }

  const byBestScore = (a, b) => b.score - a.score;
  const byCoreScore = (a, b) => b.coreScore - a.coreScore;
  return {
    main: main.sort(byBestScore).slice(0, 4),
    unavailable: unavailable.sort(byCoreScore).slice(0, 3),
    outOfRegion: outOfRegion.sort(byCoreScore).slice(0, 3),
    outOfBudget: outOfBudget.sort(byCoreScore).slice(0, 3),
    uncategorized,
  };
}
