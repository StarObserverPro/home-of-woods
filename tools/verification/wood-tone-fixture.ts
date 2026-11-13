// Share Vite's single Three.js module with the production factories in browser tests.
export * as THREE from 'three';
export {Resources} from '../../src/scene/resources.ts';
export {WOOD_TONES} from '../../src/content/wood-tones.ts';
export {woodCoordinates,woodMaterial} from '../../src/scene/wood-grain.ts';
export {scrapGeometry,scrapMaterial} from '../../src/scene/scrap-geometry.ts';
export {createAmbientOcclusion} from '../../src/scene/lighting/ambient-occlusion.ts';
