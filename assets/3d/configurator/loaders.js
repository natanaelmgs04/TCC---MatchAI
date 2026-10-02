/**
 * Um par GLTFLoader + DRACOLoader para a página inteira, com cache por URL.
 * O caminho do decodificador Draco acompanha a versão do three no import map.
 */
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

const draco = new DRACOLoader().setDecoderPath('https://unpkg.com/three@0.186.1/examples/jsm/libs/draco/gltf/');
export const gltfLoader = new GLTFLoader().setDRACOLoader(draco);

const cache = new Map();
export function loadModel(url, onProgress) {
  if (!cache.has(url)) cache.set(url, gltfLoader.loadAsync(url, onProgress));
  return cache.get(url);
}

/** Encerra os workers do Draco depois que todos os modelos da tela carregaram. */
export function releaseDecoder() {
  draco.dispose();
}
