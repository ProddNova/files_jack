import { buildHouse } from './build/houses.js';
import { buildTower } from './build/towers.js';
import { buildWall } from './build/walls.js';
import { buildTree, buildFlower } from './build/nature.js';
import { buildProp } from './build/props.js';
import { buildBridge } from './build/bridges.js';
import { buildField } from './build/fields.js';

export { MAT, disposeGroup } from './build/common.js';
export { houseDims, houseRect, HOUSE_STYLES, HOUSE_LIMITS, ROOF_TYPES, ROOF_COLORS, FACADE_CHOICES } from './build/houses.js';
export { TOWER_STYLES, TOWER_TOPS, STONES, towerRadius } from './build/towers.js';
export { WALL_STYLES, wallHalf, MERLON_STYLES } from './build/walls.js';
export { FLOWER_NAMES, TREE_TYPES, pickTreeType } from './build/nature.js';
export { PROP_STYLES, PROP_RADIUS, propRadius } from './build/props.js';
export { BRIDGE_STYLES } from './build/bridges.js';
export { CROPS, CROP_NAMES, fieldDims } from './build/fields.js';

// Every object kind and the function that draws it from its saved data.
export const BUILDERS = {
  house: buildHouse,
  tower: buildTower,
  wall: buildWall,
  tree: buildTree,
  flower: buildFlower,
  prop: buildProp,
  bridge: buildBridge,
  field: buildField,
};

export const isNature = (kind) => kind === 'tree' || kind === 'flower';
