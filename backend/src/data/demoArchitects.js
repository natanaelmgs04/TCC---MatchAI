/**
 * Arquitetos fictícios para a fase inicial da plataforma (e para o banco local).
 * Sem telefone, site ou Instagram de propósito: dados inventados poderiam
 * apontar para pessoas reais. Os e-mails usam o domínio inexistente
 * "match.arquitetos.demo", então nenhum e-mail chega a ninguém.
 * Em produção, as contas são criadas pelo painel da equipe (Usuários →
 * Arquitetos de demonstração) com isDemo: true e senha aleatória.
 */
export const DEMO_ARCHITECTS = [
  {
    name: "Fernanda Albuquerque",
    email: "fernanda.albuquerque@match.arquitetos.demo",
    city: "São Paulo",
    state: "SP",
    architectProfile: {
      styles: [
        "Moderno",
        "Minimalista"
      ],
      specialties: [
        "Residencial unifamiliar",
        "Interiores"
      ],
      yearsExperience: 12,
      workingAreas: [
        "São Paulo",
        "Grande São Paulo",
        "SP"
      ],
      favoriteMaterials: [
        "Concreto aparente",
        "Madeira de demolição",
        "Vidro"
      ],
      bio: "Especialista em residências minimalistas com forte presença de luz natural e materiais crus.",
      availability: "available",
      priceRange: {
        min: 200000,
        max: 450000
      }
    }
  },
  {
    name: "Ricardo Nogueira Prado",
    email: "ricardo.prado@match.arquitetos.demo",
    city: "Rio de Janeiro",
    state: "RJ",
    architectProfile: {
      styles: [
        "Contemporâneo",
        "Alto padrão"
      ],
      specialties: [
        "Alto padrão",
        "Residencial unifamiliar"
      ],
      yearsExperience: 20,
      workingAreas: [
        "Rio de Janeiro",
        "RJ",
        "Niterói"
      ],
      favoriteMaterials: [
        "Mármore Carrara",
        "Granito",
        "Aço"
      ],
      bio: "Vinte anos projetando residências e coberturas de alto padrão na Zona Sul carioca.",
      availability: "unavailable",
      priceRange: {
        min: 600000,
        max: 1500000
      }
    }
  },
  {
    name: "Juliana Matsuda",
    email: "juliana.matsuda@match.arquitetos.demo",
    city: "São Paulo",
    state: "SP",
    architectProfile: {
      styles: [
        "Escandinavo",
        "Biofílico"
      ],
      specialties: [
        "Apartamento",
        "Interiores"
      ],
      yearsExperience: 7,
      workingAreas: [
        "São Paulo",
        "SP"
      ],
      favoriteMaterials: [
        "Carvalho",
        "Cortiça",
        "Bambu"
      ],
      bio: "Projetos de interiores que aproximam apartamentos urbanos da natureza, com paletas claras e plantas.",
      availability: "available",
      priceRange: {
        min: 150000,
        max: 350000
      }
    }
  },
  {
    name: "Marcos Villela",
    email: "marcos.villela@match.arquitetos.demo",
    city: "Belo Horizonte",
    state: "MG",
    architectProfile: {
      styles: [
        "Industrial",
        "Brutalista"
      ],
      specialties: [
        "Comercial",
        "Reforma"
      ],
      yearsExperience: 15,
      workingAreas: [
        "Belo Horizonte",
        "MG"
      ],
      favoriteMaterials: [
        "Concreto aparente",
        "Tijolo aparente",
        "Aço"
      ],
      bio: "Referência em retrofit de galpões e lofts comerciais com estética industrial exposta.",
      availability: "available",
      priceRange: {
        min: 250000,
        max: 600000
      }
    }
  },
  {
    name: "Camila Duarte Reis",
    email: "camila.reis@match.arquitetos.demo",
    city: "Curitiba",
    state: "PR",
    architectProfile: {
      styles: [
        "Clássico",
        "Contemporâneo"
      ],
      specialties: [
        "Residencial unifamiliar",
        "Alto padrão"
      ],
      yearsExperience: 18,
      workingAreas: [
        "Curitiba",
        "PR",
        "Grande Curitiba"
      ],
      favoriteMaterials: [
        "Mármore Carrara",
        "Carvalho",
        "Travertino"
      ],
      bio: "Reinterpreta linhas clássicas em residências contemporâneas, com acabamentos atemporais.",
      availability: "available",
      priceRange: {
        min: 500000,
        max: 1200000
      }
    }
  },
  {
    name: "Thiago Bezerra Lima",
    email: "thiago.lima@match.arquitetos.demo",
    city: "Fortaleza",
    state: "CE",
    architectProfile: {
      styles: [
        "Rústico",
        "Biofílico"
      ],
      specialties: [
        "Paisagismo",
        "Residencial unifamiliar"
      ],
      yearsExperience: 9,
      workingAreas: [
        "Fortaleza",
        "CE",
        "Litoral do Ceará"
      ],
      favoriteMaterials: [
        "Madeira de demolição",
        "Tijolo aparente",
        "Cortiça"
      ],
      bio: "Casas de praia e sítios que dialogam com o entorno natural, priorizando ventilação cruzada.",
      availability: "available",
      priceRange: {
        min: 180000,
        max: 400000
      }
    }
  },
  {
    name: "Patrícia Andrade Costa",
    email: "patricia.costa@match.arquitetos.demo",
    city: "Porto Alegre",
    state: "RS",
    architectProfile: {
      styles: [
        "Minimalista",
        "Escandinavo"
      ],
      specialties: [
        "Apartamento",
        "Interiores"
      ],
      yearsExperience: 5,
      workingAreas: [
        "Porto Alegre",
        "RS"
      ],
      favoriteMaterials: [
        "Carvalho",
        "Porcelanato",
        "Vidro"
      ],
      bio: "Apartamentos compactos e funcionais, com marcenaria sob medida e paleta neutra.",
      availability: "available",
      priceRange: {
        min: 120000,
        max: 280000
      }
    }
  },
  {
    name: "Eduardo Salgado Faria",
    email: "eduardo.faria@match.arquitetos.demo",
    city: "Salvador",
    state: "BA",
    architectProfile: {
      styles: [
        "Contemporâneo",
        "Alto padrão"
      ],
      specialties: [
        "Comercial",
        "Alto padrão"
      ],
      yearsExperience: 22,
      workingAreas: [
        "Salvador",
        "BA"
      ],
      favoriteMaterials: [
        "Granito",
        "Aço",
        "Revestimento cerâmico"
      ],
      bio: "Projetos comerciais e corporativos de grande porte, do estudo de viabilidade à entrega de obra.",
      availability: "limited",
      priceRange: {
        min: 700000,
        max: 2000000
      }
    }
  },
  {
    name: "Beatriz Lacerda Moura",
    email: "beatriz.moura@match.arquitetos.demo",
    city: "Goiânia",
    state: "GO",
    architectProfile: {
      styles: [
        "Rústico",
        "Clássico"
      ],
      specialties: [
        "Residencial unifamiliar",
        "Reforma"
      ],
      yearsExperience: 11,
      workingAreas: [
        "Goiânia",
        "GO",
        "Interior de Goiás"
      ],
      favoriteMaterials: [
        "Madeira de demolição",
        "Tijolo aparente",
        "Ardósia"
      ],
      bio: "Reformas de casas antigas com respeito à estrutura original e toque rústico contemporâneo.",
      availability: "available",
      priceRange: {
        min: 200000,
        max: 500000
      }
    }
  },
  {
    name: "Gustavo Peixoto Amaral",
    email: "gustavo.amaral@match.arquitetos.demo",
    city: "Recife",
    state: "PE",
    architectProfile: {
      styles: [
        "Industrial",
        "Moderno"
      ],
      specialties: [
        "Interiores",
        "Comercial"
      ],
      yearsExperience: 3,
      workingAreas: [
        "Recife",
        "PE",
        "Olinda"
      ],
      favoriteMaterials: [
        "Concreto aparente",
        "Vidro",
        "Alumínio"
      ],
      bio: "Arquiteto em início de carreira, focado em interiores comerciais enxutos e de rápida execução.",
      availability: "available",
      priceRange: {
        min: 100000,
        max: 250000
      }
    }
  }
];
