import test from "node:test";
import assert from "node:assert/strict";
import { scoreArchitect, rankArchitects, scoreProjectToArchitect, scoreToPercent } from "../src/services/scoringEngine.js";
import { recomputeProfileFromPortfolio } from "../src/services/portfolioProfile.js";
import { deletePortfolio } from "../src/controllers/dashboardController.js";
import User from "../src/models/User.js";

function makeClient(overrides = {}) {
  return {
    city: "São Paulo",
    state: "SP",
    clientProfile: { preferredStyles: [], preferredMaterials: [], propertyType: undefined, ...overrides },
  };
}

function makeArchitect(overrides = {}) {
  return {
    architectProfile: {
      styles: [], favoriteMaterials: [], workingAreas: [], specialties: [],
      availability: "available", yearsExperience: 0, ...overrides,
    },
  };
}

test("scores matching architecture traits without exceeding 100", () => {
  const result = scoreArchitect(
    {
      city: "São Paulo",
      clientProfile: {
        preferredStyles: ["Modern"],
        preferredMaterials: ["wood"],
        propertyType: "residential",
      },
    },
    {
      architectProfile: {
        styles: ["Modern"],
        favoriteMaterials: ["wood"],
        workingAreas: ["São Paulo"],
        specialties: ["Residential"],
        availability: "available",
        yearsExperience: 12,
      },
    },
  );
  assert.equal(result.score, 70);
});

test("no overlap at all scores 0 with no reasons", () => {
  const client = makeClient();
  const architect = makeArchitect({ availability: "unavailable" });
  const { score, reasons } = scoreArchitect(client, architect);
  assert.equal(score, 0);
  assert.deepEqual(reasons, []);
});

test("style overlap adds 10 points per shared style", () => {
  const client = makeClient({ preferredStyles: ["Moderno", "Minimalista"] });
  const architect = makeArchitect({ styles: ["Moderno"], availability: "unavailable" });
  const { score, reasons } = scoreArchitect(client, architect);
  assert.equal(score, 10);
  assert.ok(reasons.includes("estilo arquitetônico compatível"));
});

test("style score is capped at 30 even with many overlaps", () => {
  const styles = ["Moderno", "Minimalista", "Industrial", "Clássico"];
  const client = makeClient({ preferredStyles: styles });
  const architect = makeArchitect({ styles, availability: "unavailable" });
  assert.equal(scoreArchitect(client, architect).score, 30);
});

test("material overlap adds 5 points per shared material, capped at 15", () => {
  const materials = ["Concreto aparente", "Madeira", "Vidro", "Aço"];
  const client = makeClient({ preferredMaterials: materials });
  const architect = makeArchitect({ favoriteMaterials: materials, availability: "unavailable" });
  assert.equal(scoreArchitect(client, architect).score, 15);
});

test("location match is case-insensitive and adds a flat 20 points", () => {
  const client = makeClient();
  const architect = makeArchitect({ workingAreas: ["SÃO PAULO", "Grande SP"], availability: "unavailable" });
  const { score, reasons } = scoreArchitect(client, architect);
  assert.equal(score, 20);
  assert.ok(reasons.includes("atendimento na sua região"));
});

test("property type match against specialties adds 15 points", () => {
  const client = makeClient({ propertyType: "Apartamento" });
  const architect = makeArchitect({ specialties: ["Apartamento", "Interiores"], availability: "unavailable" });
  const { score, reasons } = scoreArchitect(client, architect);
  assert.equal(score, 15);
  assert.ok(reasons.includes("especialidade relevante para o projeto"));
});

test("availability scores 10 for available, 5 for limited, 0 for unavailable", () => {
  const client = makeClient();
  assert.equal(scoreArchitect(client, makeArchitect({ availability: "available" })).score, 10);
  assert.equal(scoreArchitect(client, makeArchitect({ availability: "limited" })).score, 5);
  assert.equal(scoreArchitect(client, makeArchitect({ availability: "unavailable" })).score, 0);
});

test("experience contributes 1 point per year, capped at 10", () => {
  const client = makeClient();
  const architect = makeArchitect({ availability: "unavailable", yearsExperience: 25 });
  const { score, reasons } = scoreArchitect(client, architect);
  assert.equal(score, 10);
  assert.ok(reasons.includes("25 anos de experiência"));
});

test("rankArchitects filters out zero-score results, sorts descending, and caps at 4", () => {
  const client = makeClient({ preferredStyles: ["Moderno"] });
  const architects = [
    makeArchitect({ styles: ["Moderno"], yearsExperience: 1 }),
    makeArchitect({ availability: "unavailable" }),
    makeArchitect({ styles: ["Moderno"], yearsExperience: 20 }),
    makeArchitect({ styles: ["Moderno"], yearsExperience: 5 }),
    makeArchitect({ styles: ["Moderno"], yearsExperience: 3 }),
    makeArchitect({ styles: ["Moderno"], yearsExperience: 2 }),
  ];
  const ranked = rankArchitects(client, architects);
  assert.equal(ranked.length, 4);
  const scores = ranked.map((r) => r.score);
  assert.deepEqual(scores, [...scores].sort((a, b) => b - a));
  assert.equal(scores[0], 30);
});

test("scoreProjectToArchitect picks the best-matching portfolio item, not the aggregate profile", () => {
  const project = { preferredStyles: ["Moderno"], preferredMaterials: ["Vidro"] };
  const client = { city: "São Paulo", state: "SP" };
  const architect = {
    architectProfile: {
      workingAreas: [], specialties: [], availability: "unavailable", yearsExperience: 0,
      portfolio: [
        { title: "Casa Rústica", styles: ["Rústico"], materials: ["Madeira"] },
        { title: "Apê Moderno", styles: ["Moderno"], materials: ["Vidro"] },
      ],
    },
  };
  const { score, reasons, matchedPortfolioItem } = scoreProjectToArchitect(project, client, architect);
  assert.equal(score, 15); // 10 (1 estilo em comum * 10) + 5 (1 material em comum * 5)
  assert.equal(matchedPortfolioItem.title, "Apê Moderno");
  assert.ok(reasons.some((r) => r.includes("Apê Moderno")));
});

test("scoreProjectToArchitect adds up to 5 points for areaM2 proximity to the winning item, 0 when either side lacks the field", () => {
  const client = { city: "", state: "" };
  const architectWithArea = {
    architectProfile: {
      workingAreas: [], specialties: [], availability: "unavailable", yearsExperience: 0,
      portfolio: [{ title: "A", styles: ["Moderno"], materials: [], areaM2: 100 }],
    },
  };
  const projectClose = { preferredStyles: ["Moderno"], preferredMaterials: [], areaM2: 110 };
  const projectFar = { preferredStyles: ["Moderno"], preferredMaterials: [], areaM2: 500 };
  const projectNoArea = { preferredStyles: ["Moderno"], preferredMaterials: [] };

  assert.equal(scoreProjectToArchitect(projectClose, client, architectWithArea).score, 15); // 10 (estilo) + 5 (metragem, dentro de 30%)
  assert.equal(scoreProjectToArchitect(projectFar, client, architectWithArea).score, 10); // 10 + 0 (muito longe)
  assert.equal(scoreProjectToArchitect(projectNoArea, client, architectWithArea).score, 10); // 10 + 0 (projeto sem areaM2)
});

test("scoreToPercent never displays above 100 even with every bonus stacked", () => {
  assert.equal(scoreToPercent(105), 100);
  assert.equal(scoreToPercent(70), 70);
});

test("recomputeProfileFromPortfolio produces the deduplicated union of styles/materials across every piece", () => {
  const user = {
    architectProfile: {
      portfolio: [
        { title: "A", styles: ["Moderno", "Industrial"], materials: ["Vidro"] },
        { title: "B", styles: ["Industrial"], materials: ["Vidro", "Aço"] },
      ],
    },
  };
  recomputeProfileFromPortfolio(user);
  assert.deepEqual(user.architectProfile.styles.sort(), ["Industrial", "Moderno"]);
  assert.deepEqual(user.architectProfile.favoriteMaterials.sort(), ["Aço", "Vidro"]);
});

test("portfolio subdocuments retain a generated object id that deletePortfolio can target", () => {
  const user = new User({
    name: "Architect",
    email: "architect@example.com",
    phone: "123",
    passwordHash: "hash",
    role: "architect",
    architectProfile: {
      portfolio: [{ title: "First", projectUrl: "https://example.com" }],
    },
  });

  const project = user.architectProfile.portfolio[0];
  assert.ok(project._id);
  assert.equal(String(project._id).length >= 12, true);
});

test("deletePortfolio can remove a legacy project portfolio item that never gained a generated _id", async () => {
  const req = {
    params: { id: "Legacy House" },
    user: {
      role: "architect",
      architectProfile: {
        portfolio: [
          { title: "Legacy House", projectUrl: "https://example.com/legacy" },
          { title: "Second", projectUrl: "https://example.com/second" },
        ],
      },
      save: async function () { return this; },
    },
  };

  const res = {
    statusCode: 0,
    payload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    },
  };

  await deletePortfolio(req, res);

  assert.equal(req.user.architectProfile.portfolio.length, 1);
  assert.equal(req.user.architectProfile.portfolio[0].title, "Second");
  assert.equal(res.statusCode, 200);
});

test("deletePortfolio removes the selected project from an architect's portfolio", async () => {
  const req = {
    params: { id: "project-2" },
    user: {
      role: "architect",
      architectProfile: {
        portfolio: [
          { _id: "project-1", title: "First" },
          { _id: "project-2", title: "Second" },
        ],
      },
      save: async function () { return this; },
    },
  };

  const res = {
    statusCode: 0,
    payload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    },
  };

  await deletePortfolio(req, res);

  assert.equal(req.user.architectProfile.portfolio.length, 1);
  assert.equal(req.user.architectProfile.portfolio[0]._id, "project-1");
  assert.equal(res.statusCode, 200);
});

// ---- Localização do match (cidade/UF do projeto) ----
import { categorizeProjectMatches, projectPlaces } from "../src/services/scoringEngine.js";

const archSP = {
  _id: "a-sp", name: "Arq SP", city: "São Paulo", state: "SP",
  architectProfile: { availability: "available", workingAreas: ["São Paulo", "SP"], specialties: ["Residencial unifamiliar"], priceRange: { min: 100000, max: 500000 }, yearsExperience: 5, portfolio: [{ title: "Casa", styles: ["Moderno"], materials: [] }] },
};
const archES = {
  _id: "a-es", name: "Arq ES", city: "Vitória", state: "ES",
  architectProfile: { availability: "available", workingAreas: ["Espírito Santo"], specialties: [], yearsExperience: 5, portfolio: [{ title: "Casa", styles: ["Moderno"], materials: [] }] },
};

test("match sem cidade em lugar nenhum não manda ninguém para 'fora da região'", () => {
  const { main, outOfRegion } = categorizeProjectMatches({ preferredStyles: ["Moderno"] }, { name: "Cliente sem cidade" }, [archSP, archES]);
  assert.equal(outOfRegion.length, 0);
  assert.equal(main.length, 2);
});

test("a cidade do projeto vale mais que a do cliente e ignora acento/maiúsculas", () => {
  assert.deepEqual(projectPlaces({ city: "SAO PAULO", state: "sp" }, { city: "Recife" }), ["sao paulo", "sp"]);
  const { main, outOfRegion } = categorizeProjectMatches({ preferredStyles: ["Moderno"], city: "sao paulo" }, { city: "Recife" }, [archSP, archES]);
  assert.deepEqual(main.map((e) => e.architect.name), ["Arq SP"]);
  assert.deepEqual(outOfRegion.map((e) => e.architect.name), ["Arq ES"]);
});

test("UF de duas letras só casa exata (SP não casa com 'Espírito Santo')", () => {
  const { main } = categorizeProjectMatches({ preferredStyles: ["Moderno"], state: "SP" }, {}, [archES]);
  assert.equal(main.length, 0);
});
