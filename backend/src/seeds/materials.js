import "../config/env.js"; // carrega backend/KEYS.env de qualquer pasta
import { connectDatabase } from "../config/database.js";
import Material from "../models/Material.js";
import { searchReferenceImage } from "../services/imageSearchService.js";
import mongoose from "mongoose";

const materials = [
  ["Oak wood texture", "Carvalho", "Madeira"],
  ["Dark walnut wood grain", "Nogueira", "Madeira"],
  ["Bamboo texture", "Bambu", "Madeira"],
  ["Exposed concrete wall texture", "Concreto aparente", "Concreto"],
  ["Terrazzo floor texture", "Granilite", "Concreto"],
  ["Carrara marble texture", "Mármore Carrara", "Pedra"],
  ["Granite stone texture", "Granito", "Pedra"],
  ["Beige travertine tile floor", "Travertino", "Pedra"],
  ["Slate stone texture", "Ardósia", "Pedra"],
  ["Exposed red brick wall", "Tijolo aparente", "Alvenaria"],
  ["Glass architecture facade", "Vidro", "Vidro"],
  ["Steel metal texture architecture", "Aço", "Metal"],
  ["Brushed aluminum texture", "Alumínio", "Metal"],
  ["Ceramic tile texture", "Revestimento cerâmico", "Cerâmica"],
  ["Porcelain tile floor", "Porcelanato", "Cerâmica"],
  ["Cork texture material", "Cortiça", "Natural"],
  ["Limestone texture", "Calcário", "Pedra"],
  ["White quartz crystal countertop", "Quartzo", "Pedra"],
];

await connectDatabase();

let updated = 0;
let skipped = 0;
for (const [searchTerm, name, category] of materials) {
  const photo = await searchReferenceImage(searchTerm).catch(() => null);
  const update = {
    name,
    category,
    description: `Material arquitetônico: ${name}`,
  };
  if (photo) {
    update.imageUrl = photo.thumbUrl;
    update.photographerName = photo.photographerName;
    update.photographerUrl = photo.photographerUrl;
    updated++;
  } else {
    skipped++;
  }
  await Material.updateOne(
    { $or: [{ name: searchTerm }, { name }] },
    { $set: update },
    { upsert: true },
  );
}

console.log(`${materials.length} materiais processados — ${updated} com foto real do Unsplash, ${skipped} sem (chave ausente ou busca sem resultado, mantiveram a imagem anterior).`);
await mongoose.disconnect();
