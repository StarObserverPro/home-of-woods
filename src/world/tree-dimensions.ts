import { CAMP_TREE_SPECIES } from '../content/camp-woodland.ts';
import type { CampTreeForm } from '../content/camp-woodland.ts';
import type { Tree } from './layout.ts';

export function campTreeDimensions(form: CampTreeForm) {
  const profile = CAMP_TREE_SPECIES[form.species];
  if (form.layer === 'elder') return { height: 8.8, radius: .48, crown: 3.0, crownBase: .43 };
  if (form.layer === 'old-growth') return profile;
  if (form.layer === 'canopy') {
    const size = profile.kind === 'pine' ? .67 : .61;
    return { height: profile.height * size, radius: profile.radius * .56, crown: profile.crown * .66, crownBase: profile.crownBase };
  }
  if (form.layer === 'midstory') return {
    height: profile.height * .58, radius: profile.radius * .50, crown: profile.crown * .62, crownBase: profile.crownBase - .06,
  };
  const needle = profile.kind === 'pine';
  const dryFir = form.species === 'douglas-fir';
  if (form.layer === 'pole') return {
    height: dryFir ? 9.3 : needle ? 8.4 : 7.7,
    radius: dryFir ? .175 : form.species === 'bigleaf-maple' ? .185 : .166,
    crown: dryFir ? 1.9 : needle ? 1.77 : form.species === 'bigleaf-maple' ? 2.18 : 1.62,
    crownBase: dryFir ? .39 : needle ? .31 : .35,
  };
  return { height: needle ? 5.1 : 4.5, radius: needle ? .113 : .119, crown: needle ? 1.18 : 1.37, crownBase: needle ? .27 : .33 };
}

export function treeTrunkRadius(tree: Tree) {
  const radius = tree.woodland ? campTreeDimensions(tree.woodland).radius : tree.kind === 'pine' ? .25 : .28;
  return radius * tree.scale;
}

export function treeFootRadius(tree: Tree) {
  if (tree.role === 'landmark') return 1.2 * tree.scale;
  if (tree.woodland) {
    const radius = treeTrunkRadius(tree) * 1.38;
    return tree.regeneration ? radius : Math.max(radius, (tree.kind === 'pine' ? .43 : .66) * tree.scale);
  }
  return (tree.kind === 'pine' ? .43 : .66) * tree.scale;
}

export const usesActionTree = (tree: Tree) => !tree.woodland || tree.woodland.layer === 'pole';
