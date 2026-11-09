import { buildHouse } from './build/houses.js';
import { buildTower } from './build/towers.js';
import { buildWall } from './build/walls.js';
import { buildTree, buildFlower } from './build/nature.js';
import { buildProp } from './build/props.js';

export { MAT, disposeGroup } from './build/common.js';
export { houseDims, houseRect, HOUSE_STYLES } from './build/houses.js';
export { TOWER_STYLES, TOWER_RADIUS } from './build/towers.js';
export { WALL_STYLES, wallHalf } from './build/walls.js';
export { FLOWER_NAMES, TREE_TYPES, pickTreeType } from './build/nature.js';
export { PROP_STYLES, PROP_RADIUS } from './build/props.js';

// Every object kind and the function that draws it from its saved data.
export const BUILDERS = {
  house: buildHouse,
  tower: buildTower,
  wall: buildWall,
  tree: buildTree,
  flower: buildFlower,
  prop: buildProp,
};

export const isNature = (kind) => kind === 'tree' || kind === 'flower';
