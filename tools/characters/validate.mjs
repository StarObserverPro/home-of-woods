import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {CHARACTER_QUALITY_VERSION, CHARACTER_QUALITY_TIERS, CHARACTER_SURFACE_STANDARD, CHARACTER_IMPORT_RULES} from '../../src/content/character-quality.ts';
import {inspectGlbFile, imageDimensions} from './glb-inspect.mjs';

const STATUSES = ['pending', 'legacy', 'ready'];
const VISIBILITIES = ['public', 'local-only'];
const REVIEW_ITEMS = ['proportions', 'wardrobe', 'deformation'];
const square = (image, sizes) => image.width === image.height && sizes.includes(image.width);
// Only requirements introduced by this new character standard are advisory on
// existing fallbacks. Invalid GLB data, broken references and missing files are
// still failures; declaring an asset legacy must never conceal corruption.
const LEGACY_ADVISORY = new Set(['base-atlas-size', 'texture-dimension', 'missing-base-atlas', 'missing-normals', 'missing-uv', 'missing-skin', 'too-many-influences']);

export function validateConfig(config) {
  if (config?.contractVersion !== CHARACTER_QUALITY_VERSION) throw new Error(`config.contractVersion must be ${CHARACTER_QUALITY_VERSION}`);
  if (!Array.isArray(config.assets)) throw new Error('config.assets must be an array');
  const ids = new Set();
  for (const asset of config.assets) {
    if (!asset || typeof asset.id !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(asset.id) || ids.has(asset.id)) throw new Error('Each asset needs a unique lowercase id');
    ids.add(asset.id);
    if (!Object.hasOwn(CHARACTER_QUALITY_TIERS, asset.tier)) throw new Error(`${asset.id}: unknown tier ${asset.tier}`);
    if (!STATUSES.includes(asset.status)) throw new Error(`${asset.id}: status must be pending, legacy or ready`);
    if (!VISIBILITIES.includes(asset.visibility)) throw new Error(`${asset.id}: visibility must be public or local-only`);
    if (asset.file !== undefined && asset.file !== null && (typeof asset.file !== 'string' || !asset.file.length)) throw new Error(`${asset.id}: file must be a nonempty path or null`);
    if (asset.variants !== undefined && !Array.isArray(asset.variants)) throw new Error(`${asset.id}: variants must be an array`);
    const variants = new Set();
    for (const variant of asset.variants ?? []) {
      if (!variant || typeof variant.id !== 'string' || variants.has(variant.id)) throw new Error(`${asset.id}: variants need unique ids`);
      variants.add(variant.id);
      if (variant.baseColorFile !== undefined && (typeof variant.baseColorFile !== 'string' || !variant.baseColorFile.length)) throw new Error(`${asset.id}: invalid variant texture path`);
    }
    for (const key of REVIEW_ITEMS) if (asset.review?.[key] !== undefined && !['pending', 'approved'].includes(asset.review[key])) throw new Error(`${asset.id}: invalid ${key} review state`);
    if (asset.expected?.bones !== undefined && (!Number.isInteger(asset.expected.bones) || asset.expected.bones < 1)) throw new Error(`${asset.id}: expected.bones must be positive`);
    if (asset.expected?.blink !== undefined && !['morph', 'bone', 'either'].includes(asset.expected.blink)) throw new Error(`${asset.id}: invalid expected blink capability`);
    if (asset.expected?.animations !== undefined && (!Array.isArray(asset.expected.animations) || asset.expected.animations.some(name => typeof name !== 'string'))) throw new Error(`${asset.id}: expected.animations must be names`);
  }
  return config;
}

function checkMeasurement(inspection, asset) {
  const tier = CHARACTER_QUALITY_TIERS[asset.tier], issues = [];
  const add = (severity, code, message) => issues.push({severity, code, message});
  for (const issue of inspection.issues) add('error', issue.code, issue.message);
  const totals = inspection.totals;
  if (totals.triangles < 1) add('error', 'empty-model', 'Default scene contains no character triangles');
  for (const [field, limit] of [['triangles', tier.triangles.maximum], ['materials', tier.materials], ['drawCalls', tier.drawCalls], ['bones', tier.bones], ['morphTargetsMaximum', tier.morphTargets], ['texturePixels', tier.texturePixels]]) {
    if (totals[field] > limit) add('error', `budget-${field}`, `${field}: ${totals[field]} exceeds ${asset.tier} limit ${limit}`);
  }
  if (totals.triangles > tier.triangles.target && totals.triangles <= tier.triangles.maximum)
    add('note', 'above-target', `${totals.triangles} triangles fit the hard cap; review against the ${tier.triangles.target} target before retaining excess detail`);
  if (totals.triangles < tier.triangles.target)
    add('note', 'below-target', 'Below the triangle target: keep the mesh if silhouette and bending read well; never subdivide solely to reach the target');
  if (!inspection.capabilities.normals) add('error', 'missing-normals', 'All visible primitives need normals');
  if (!inspection.capabilities.uv0) add('error', 'missing-uv', 'All visible primitives need UV0 for the common character atlas');
  if (!inspection.capabilities.skinned) add('error', 'missing-skin', 'A runtime character needs an authored skin for breathing and gestures');
  for (const primitive of inspection.primitives) {
    if (primitive.skin !== null && (!primitive.attributes.includes('JOINTS_0') || !primitive.attributes.includes('WEIGHTS_0')))
      add('error', 'missing-weights', `Mesh ${primitive.mesh}:${primitive.primitive} has a skin but no complete weights`);
    if (primitive.attributes.some(name => /^(JOINTS|WEIGHTS)_[1-9]\d*$/.test(name)))
      add('error', 'too-many-influences', `Mesh ${primitive.mesh}:${primitive.primitive} exceeds ${CHARACTER_IMPORT_RULES.maximumSkinInfluences} influences per vertex`);
  }
  if ('unclassified' in inspection.partTriangles)
    add('note', 'body-accessories-unclassified', 'Total triangles are measured; body/accessory subdivision needs mesh.extras.howCharacterPart or a separate authoring report');
  const baseSizes = asset.tier === 'hero' ? [CHARACTER_SURFACE_STANDARD.bodyAtlas, CHARACTER_SURFACE_STANDARD.heroCloseupAtlas] : [CHARACTER_SURFACE_STANDARD.bodyAtlas];
  let hasBaseColor = false;
  for (const material of inspection.materials) {
    for (const texture of material.textures) {
      const image = inspection.images[texture.image];
      if (!image?.width || !image?.height) continue;
      if (texture.slot === 'baseColorTexture') {
        hasBaseColor = true;
        // A separately named eye material may use the small shared eye atlas.
        const isEye = /(^|[\s_.:-])(eye|eyes)([\s_.:-]|$)/i.test(material.name ?? '');
        if (isEye ? !square(image, [64, 128, CHARACTER_SURFACE_STANDARD.eyeAtlasMaximum]) : !square(image, baseSizes))
          add('error', 'base-atlas-size', `${material.name ?? material.index}: base-color atlas ${image.width}×${image.height}; expected ${isEye ? '64/128/256 square eyes' : baseSizes.join(' or ') + ' square body atlas'}`);
      }
      const dimension = /normalTexture/i.test(texture.slot) ? CHARACTER_SURFACE_STANDARD.normalAtlasMaximum
        : ['metallicRoughnessTexture', 'occlusionTexture'].includes(texture.slot) ? CHARACTER_SURFACE_STANDARD.packedMaskAtlasMaximum
        : tier.textureDimension;
      if (Math.max(image.width, image.height) > dimension) add('error', 'texture-dimension', `${texture.slot}: ${image.width}×${image.height} exceeds ${dimension}`);
      if (!inspection.primitives.filter(p => p.material === material.index).every(p => p.attributes.includes(`TEXCOORD_${texture.uv}`)))
        add('error', 'texture-uv', `${texture.slot} references missing UV${texture.uv}`);
    }
  }
  if (!hasBaseColor) add('error', 'missing-base-atlas', 'No embedded base-color atlas is used by the visible character');
  if (asset.expected?.bones !== undefined && totals.bones !== asset.expected.bones) add('error', 'expected-bones', `Expected ${asset.expected.bones} preserved bones, measured ${totals.bones}`);
  for (const name of asset.expected?.animations ?? []) if (!inspection.animations.some(clip => clip.name === name)) add('error', 'animation', `Expected animation ${name} is missing`);
  const blink = asset.expected?.blink;
  if (blink) {
    const morph = inspection.capabilities.blinkMorphs.length > 0, bone = inspection.capabilities.blinkBoneCandidates.length > 0;
    if ((blink === 'morph' && !morph) || (blink === 'bone' && !bone) || (blink === 'either' && !morph && !bone))
      add('error', 'blink-capability', `No named ${blink} blink control was detected; generic eye-bone candidates still require a real blink review`);
  }
  return issues;
}

export async function validateCharacterAssets(config, {root = process.cwd(), requireAll = false} = {}) {
  validateConfig(config);
  const absoluteRoot = path.resolve(root), assets = [];
  for (const asset of config.assets) {
    const result = {id: asset.id, tier: asset.tier, declaredStatus: asset.status, visibility: asset.visibility, file: asset.file ?? null, status: 'pending-assets', issues: [], inspection: null, variants: []};
    const add = (severity, code, message) => result.issues.push({severity, code, message});
    const localBoundary = file => {
      const relative = path.relative(absoluteRoot, path.resolve(absoluteRoot, file)).split(path.sep).join('/');
      return /^(public|sources)\//.test(relative);
    };
    if (asset.visibility === 'local-only' && asset.file && localBoundary(asset.file)) add('error', 'private-source-boundary', 'Local-only models must stay outside public/ and tracked source-asset directories');
    if (!asset.file) {
      add(asset.status !== 'pending' || requireAll ? 'error' : 'note', 'pending-assets', 'No model file has been acquired/exported; no measurements or quality pass are claimed');
      assets.push(result); continue;
    }
    try {
      result.inspection = await inspectGlbFile(path.resolve(absoluteRoot, asset.file));
      result.inspection.file = asset.file;
    } catch (error) {
      const missing = error.code === 'ENOENT';
      add(missing && asset.status === 'pending' && !requireAll ? 'note' : 'error', missing ? 'pending-assets' : 'unreadable-model', missing ? 'Model is absent locally; actual counts remain unmeasured' : error.message);
      result.status = missing ? 'pending-assets' : 'failed';
      assets.push(result); continue;
    }
    const measured = checkMeasurement(result.inspection, asset);
    // Legacy is measured honestly but is not retroactively treated as a new intake.
    result.issues.push(...measured.map(issue => asset.status === 'legacy' && issue.severity === 'error' && (issue.code.startsWith('budget-') || LEGACY_ADVISORY.has(issue.code)) ? {...issue, severity: 'warning'} : issue));
    if (requireAll && asset.status === 'pending') add('error', 'pending-intake', 'A file is present, but this asset is still staged for preparation; --require-all needs an explicitly ready intake');
    if (asset.status !== 'legacy') {
      if (asset.source?.modification !== true || asset.source?.gameUse !== true || !asset.source?.evidence)
        add('error', 'source-rights', 'Record the actual source evidence and permission to modify and use the model in this game');
      if (asset.visibility === 'public' && asset.source?.redistribution !== true)
        add('error', 'redistribution', 'Public assets require recorded redistribution permission; keep private input local');
    }
    for (const variant of asset.variants ?? []) {
      const record = {id: variant.id, file: variant.baseColorFile ?? null, status: 'pending', dimensions: null};
      if (variant.baseColorFile) {
        if (asset.visibility === 'local-only' && localBoundary(variant.baseColorFile)) add('error', 'private-variant-boundary', `Local-only variant ${variant.id} must not be placed in public/ or sources/`);
        try {
          record.dimensions = imageDimensions(await readFile(path.resolve(absoluteRoot, variant.baseColorFile)));
          const accepted = asset.tier === 'hero' ? [1024, 2048] : [1024];
          if (!record.dimensions || !square(record.dimensions, accepted)) add('error', 'variant-texture', `${variant.id}: unreadable or nonstandard body atlas`);
          else record.status = 'measured';
        } catch (error) {
          add(asset.status === 'ready' ? 'error' : 'warning', 'variant-pending', `${variant.id}: ${error.code === 'ENOENT' ? 'texture not available yet' : error.message}`);
        }
      }
      result.variants.push(record);
    }
    const pendingReview = REVIEW_ITEMS.filter(key => asset.review?.[key] !== 'approved');
    if (pendingReview.length) add('note', 'manual-review', `Still needs comparison against the actual J01: ${pendingReview.join(', ')}; numbers do not prove visual consistency`);
    if (!asset.variants || asset.variants.length < CHARACTER_SURFACE_STANDARD.variantCount)
      add('note', 'variant-plan', `Plan ${CHARACTER_SURFACE_STANDARD.variantCount} total color/detail variants per reusable NPC; missing variants are not counted as produced assets`);
    if (asset.status === 'pending') result.status = 'pending-review';
    else if (result.issues.some(issue => issue.severity === 'error')) result.status = 'failed';
    else if (asset.status === 'legacy') result.status = 'legacy-inspected';
    else if (pendingReview.length) result.status = 'needs-visual-review';
    else result.status = 'passed-technical';
    assets.push(result);
  }
  const errors = assets.flatMap(asset => asset.issues.filter(issue => issue.severity === 'error').map(issue => ({asset: asset.id, ...issue})));
  return {contractVersion: CHARACTER_QUALITY_VERSION,
    summary: {assets: assets.length, measured: assets.filter(a => a.inspection).length, pendingAssets: assets.filter(a => a.status === 'pending-assets').length,
      legacy: assets.filter(a => a.status === 'legacy-inspected').length, staging: assets.filter(a => a.declaredStatus === 'pending' && a.inspection).length,
      needsReview: assets.filter(a => ['pending-review', 'needs-visual-review'].includes(a.status)).length,
      passedTechnical: assets.filter(a => a.status === 'passed-technical').length, failed: assets.filter(a => a.status === 'failed').length, errors: errors.length},
    // Staging is an honest before-state, not a new runtime admission. Report all
    // its errors, but gate only ready assets and structurally broken legacy files.
    // --require-all also blocks unfinished staging, even if a model exists.
    strictFailure: assets.some(asset => (requireAll || asset.declaredStatus !== 'pending') && asset.issues.some(issue => issue.severity === 'error')),
    completion: 'Asset metrics and declared source permissions only; visual review, texture painting, retopology and gameplay integration are separate work.',
    assets};
}
