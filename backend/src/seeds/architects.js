import "../config/env.js"; // carrega backend/KEYS.env de qualquer pasta
import { connectDatabase } from "../config/database.js";
import User from "../models/User.js";
import mongoose from "mongoose";

const architects = [
  {
    name: "Fernanda Albuquerque",
    email: "fernanda.albuquerque@match.arquitetos.demo",
    phone: "11987654321",
    city: "São Paulo",
    state: "SP",
    architectProfile: {
      styles: ["Moderno", "Minimalista"],
      specialties: ["Residencial unifamiliar", "Interiores"],
      yearsExperience: 12,
      workingAreas: ["São Paulo", "Grande São Paulo", "SP"],
      favoriteMaterials: ["Concreto aparente", "Madeira de demolição", "Vidro"],
      bio: "Especialista em residências minimalistas com forte presença de luz natural e materiais crus.",
      instagram: "@fernanda.arq",
      availability: "available",
      priceRange: { min: 200000, max: 450000 },
    },
  },
  {
    name: "Ricardo Nogueira Prado",
    email: "ricardo.prado@match.arquitetos.demo",
    phone: "21988776655",
    city: "Rio de Janeiro",
    state: "RJ",
    architectProfile: {
      styles: ["Contemporâneo", "Alto padrão"],
      specialties: ["Alto padrão", "Residencial unifamiliar"],
      yearsExperience: 20,
      workingAreas: ["Rio de Janeiro", "RJ", "Niterói"],
      favoriteMaterials: ["Mármore Carrara", "Granito", "Aço"],
      bio: "Vinte anos projetando residências e coberturas de alto padrão na Zona Sul carioca.",
      website: "https://ricardoprado.arq.br",
      availability: "unavailable",
      priceRange: { min: 600000, max: 1500000 },
    },
  },
  {
    name: "Juliana Matsuda",
    email: "juliana.matsuda@match.arquitetos.demo",
    phone: "11976543210",
    city: "São Paulo",
    state: "SP",
    architectProfile: {
      styles: ["Escandinavo", "Biofílico"],
      specialties: ["Apartamento", "Interiores"],
      yearsExperience: 7,
      workingAreas: ["São Paulo", "SP"],
      favoriteMaterials: ["Carvalho", "Cortiça", "Bambu"],
      bio: "Projetos de interiores que aproximam apartamentos urbanos da natureza, com paletas claras e plantas.",
      instagram: "@juliana.biofilico",
      availability: "available",
      priceRange: { min: 150000, max: 350000 },
    },
  },
  {
    name: "Marcos Villela",
    email: "marcos.villela@match.arquitetos.demo",
    phone: "31991234567",
    city: "Belo Horizonte",
    state: "MG",
    architectProfile: {
      styles: ["Industrial", "Brutalista"],
      specialties: ["Comercial", "Reforma"],
      yearsExperience: 15,
      workingAreas: ["Belo Horizonte", "MG"],
      favoriteMaterials: ["Concreto aparente", "Tijolo aparente", "Aço"],
      bio: "Referência em retrofit de galpões e lofts comerciais com estética industrial exposta.",
      availability: "available",
      priceRange: { min: 250000, max: 600000 },
    },
  },
  {
    name: "Camila Duarte Reis",
    email: "camila.reis@match.arquitetos.demo",
    phone: "41985432109",
    city: "Curitiba",
    state: "PR",
    architectProfile: {
      styles: ["Clássico", "Contemporâneo"],
      specialties: ["Residencial unifamiliar", "Alto padrão"],
      yearsExperience: 18,
      workingAreas: ["Curitiba", "PR", "Grande Curitiba"],
      favoriteMaterials: ["Mármore Carrara", "Carvalho", "Travertino"],
      bio: "Reinterpreta linhas clássicas em residências contemporâneas, com acabamentos atemporais.",
      website: "https://camilareis.com.br",
      availability: "available",
      priceRange: { min: 500000, max: 1200000 },
    },
  },
  {
    name: "Thiago Bezerra Lima",
    email: "thiago.lima@match.arquitetos.demo",
    phone: "85992345678",
    city: "Fortaleza",
    state: "CE",
    architectProfile: {
      styles: ["Rústico", "Biofílico"],
      specialties: ["Paisagismo", "Residencial unifamiliar"],
      yearsExperience: 9,
      workingAreas: ["Fortaleza", "CE", "Litoral do Ceará"],
      favoriteMaterials: ["Madeira de demolição", "Tijolo aparente", "Cortiça"],
      bio: "Casas de praia e sítios que dialogam com o entorno natural, priorizando ventilação cruzada.",
      instagram: "@thiago.paisagismo",
      availability: "available",
      priceRange: { min: 180000, max: 400000 },
    },
  },
  {
    name: "Patrícia Andrade Costa",
    email: "patricia.costa@match.arquitetos.demo",
    phone: "51993456789",
    city: "Porto Alegre",
    state: "RS",
    architectProfile: {
      styles: ["Minimalista", "Escandinavo"],
      specialties: ["Apartamento", "Interiores"],
      yearsExperience: 5,
      workingAreas: ["Porto Alegre", "RS"],
      favoriteMaterials: ["Carvalho", "Porcelanato", "Vidro"],
      bio: "Apartamentos compactos e funcionais, com marcenaria sob medida e paleta neutra.",
      availability: "available",
      priceRange: { min: 120000, max: 280000 },
    },
  },
  {
    name: "Eduardo Salgado Faria",
    email: "eduardo.faria@match.arquitetos.demo",
    phone: "71994567890",
    city: "Salvador",
    state: "BA",
    architectProfile: {
      styles: ["Contemporâneo", "Alto padrão"],
      specialties: ["Comercial", "Alto padrão"],
      yearsExperience: 22,
      workingAreas: ["Salvador", "BA"],
      favoriteMaterials: ["Granito", "Aço", "Revestimento cerâmico"],
      bio: "Projetos comerciais e corporativos de grande porte, do estudo de viabilidade à entrega de obra.",
      website: "https://eduardofaria.arq.br",
      availability: "limited",
      priceRange: { min: 700000, max: 2000000 },
    },
  },
  {
    name: "Beatriz Lacerda Moura",
    email: "beatriz.moura@match.arquitetos.demo",
    phone: "62995678901",
    city: "Goiânia",
    state: "GO",
    architectProfile: {
      styles: ["Rústico", "Clássico"],
      specialties: ["Residencial unifamiliar", "Reforma"],
      yearsExperience: 11,
      workingAreas: ["Goiânia", "GO", "Interior de Goiás"],
      favoriteMaterials: ["Madeira de demolição", "Tijolo aparente", "Ardósia"],
      bio: "Reformas de casas antigas com respeito à estrutura original e toque rústico contemporâneo.",
      availability: "available",
      priceRange: { min: 200000, max: 500000 },
    },
  },
  {
    name: "Gustavo Peixoto Amaral",
    email: "gustavo.amaral@match.arquitetos.demo",
    phone: "81996789012",
    city: "Recife",
    state: "PE",
    architectProfile: {
      styles: ["Industrial", "Moderno"],
      specialties: ["Interiores", "Comercial"],
      yearsExperience: 3,
      workingAreas: ["Recife", "PE", "Olinda"],
      favoriteMaterials: ["Concreto aparente", "Vidro", "Alumínio"],
      bio: "Arquiteto em início de carreira, focado em interiores comerciais enxutos e de rápida execução.",
      instagram: "@gustavo.amaral.arq",
      availability: "available",
      priceRange: { min: 100000, max: 250000 },
    },
  },
];

await connectDatabase();

let created = 0;
let skipped = 0;
for (const data of architects) {
  const exists = await User.findOne({ email: data.email });
  if (exists) {
    skipped++;
    continue;
  }
  const user = new User({
    name: data.name,
    email: data.email,
    phone: data.phone,
    city: data.city,
    state: data.state,
    role: "architect",
    passwordHash: "MatchIA@Demo2026",
    architectProfile: data.architectProfile,
  });
  await user.save();
  created++;
}

console.log(`${created} arquitetos fictícios criados, ${skipped} já existiam.`);
await mongoose.disconnect();
