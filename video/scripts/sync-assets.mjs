// Copia para public/site/ os assets do site que os vídeos usam (marca, fotos,
// equipe, narração). public/site/ é gerado: não edite lá — edite em ../assets
// e rode `npm run sync` de novo.
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const site = resolve(here, "..", "..", "assets");
const out = resolve(here, "..", "public", "site");

const items = [
  "img/mark.svg",
  "img/mark.png",
  "img/mark-light.png",
  "img/logo-full.png",
  "img/photos",
  "img/team",
  "audio/explainer",
];

// Cópia arquivo a arquivo: o fs.cpSync do Node 24 falha dentro do OneDrive
// em caminhos com acento ("Finanças e gestão...") com um erro de unlink vazio.
function copy(src, dest) {
  if (statSync(src).isDirectory()) {
    mkdirSync(dest, { recursive: true });
    for (const name of readdirSync(src)) copy(join(src, name), join(dest, name));
  } else {
    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(src, dest);
  }
}

rmSync(out, { recursive: true, force: true });
for (const item of items) {
  const src = join(site, item);
  if (!existsSync(src)) {
    console.warn(`  (faltando) assets/${item}`);
    continue;
  }
  copy(src, join(out, item));
  console.log(`  ✓ assets/${item}`);
}
console.log("Assets do site copiados para public/site/");
