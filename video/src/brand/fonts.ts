// Fontes da marca pelo pacote oficial (o render espera carregar antes do 1º quadro).
// Só os pesos usados no site — cada peso a mais é download a mais em todo render.
import { loadFont as loadPlayfair } from "@remotion/google-fonts/PlayfairDisplay";
import { loadFont as loadInter } from "@remotion/google-fonts/Inter";
import { loadFont as loadPoppins } from "@remotion/google-fonts/Poppins";

const playfair = loadPlayfair("normal", { weights: ["500", "600", "700"], subsets: ["latin"] });
loadPlayfair("italic", { weights: ["500", "600"], subsets: ["latin"] });
const inter = loadInter("normal", { weights: ["400", "500", "600", "700"], subsets: ["latin"] });
const poppins = loadPoppins("normal", { weights: ["600", "700"], subsets: ["latin"] });

export const font = {
  display: playfair.fontFamily, // títulos e frases de impacto (itálico = ênfase, como no site)
  body: inter.fontFamily, // texto, legendas, números de interface
  logo: poppins.fontFamily, // wordmark "match.IA" e rótulos curtos de marca
} as const;
