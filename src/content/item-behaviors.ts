/**
 * Object actions and small local animations are independent of item crafting,
 * owning a trait and mounting an accessory. Everything here is a capability
 * declaration; 'planned' entries cannot be executed by the current game.
 */
export type ActionTrigger = 'direct' | 'movement' | 'environment';
export type ActionTarget = 'none' | 'point' | 'item' | 'environment';
export type ItemActionDefinition = {
  actionId: string;
  ownerDefinitionId: string;
  source: 'base' | 'trait';
  traitId?: string;
  status: 'active' | 'planned';
  trigger: ActionTrigger;
  target: ActionTarget;
  allowedLocations: readonly ('inventory' | 'world' | 'mounted')[];
  requiredFeatures: readonly string[];
  requiredContexts: readonly string[];
  requiredItemDefinitions: readonly string[];
  motionProfileId: string | null;
  /** Processing and gameplay consequences stay with an explicit future handler. */
  handlerId: string | null;
};

/** A local motion changes a maximum of two named child anchors. No audio or new physics world. */
export type LocalMotionChannel = {
  anchorId: string;
  axis: 'x' | 'y' | 'z';
  amplitude: number; // radians
  frequency: number; // cycles / real second
  phase: number; // radians
};
export type LocalMotionProfile = {
  motionId: string;
  status: 'active' | 'planned';
  driver: 'time' | 'movement';
  channels: readonly LocalMotionChannel[];
};

const action = (definition: ItemActionDefinition): ItemActionDefinition => definition;
export const ITEM_ACTIONS: readonly ItemActionDefinition[] = [
  action({
    actionId: 'travel.umbrella.open', ownerDefinitionId: 'travel.umbrella',
    source: 'base', status: 'planned', trigger: 'direct', target: 'none',
    allowedLocations: ['inventory','world'], requiredFeatures: ['travel.equipment'],
    requiredContexts: [], requiredItemDefinitions: [], motionProfileId: null,
    handlerId: 'travel.umbrella.toggle.future',
  }),
  action({
    actionId: 'travel.sun-hat.wear', ownerDefinitionId: 'travel.sun-hat',
    source: 'base', status: 'planned', trigger: 'direct', target: 'none',
    allowedLocations: ['inventory'], requiredFeatures: ['travel.equipment'],
    requiredContexts: [], requiredItemDefinitions: [], motionProfileId: null,
    handlerId: 'travel.headwear.equip.future',
  }),
  action({
    actionId: 'travel.spyglass.look', ownerDefinitionId: 'travel.spyglass',
    source: 'base', status: 'planned', trigger: 'direct', target: 'point',
    allowedLocations: ['inventory'], requiredFeatures: ['travel.observation'],
    requiredContexts: [], requiredItemDefinitions: [], motionProfileId: null,
    handlerId: 'travel.observation.future',
  }),
  action({
    actionId: 'travel.whistle.use', ownerDefinitionId: 'travel.whistle',
    source: 'base', status: 'planned', trigger: 'direct', target: 'none',
    allowedLocations: ['inventory'], requiredFeatures: ['travel.signalling'],
    requiredContexts: [], requiredItemDefinitions: [], motionProfileId: null,
    handlerId: 'travel.whistle.future',
  }),
  action({
    actionId: 'travel.animal-blanket.unroll', ownerDefinitionId: 'travel.animal-blanket',
    source: 'base', status: 'planned', trigger: 'direct', target: 'point',
    allowedLocations: ['inventory','world'], requiredFeatures: ['travel.placeable-gear'],
    requiredContexts: [], requiredItemDefinitions: [], motionProfileId: null,
    handlerId: 'travel.blanket.unroll.future',
  }),
];

/**
 * Reference implementations of how a single item detail could move. Both are
 * planned geometry contracts, not awarded affixes, gameplay unlocks, audio,
 * existing asset names or promises of finished animated models.
 */
export const LOCAL_MOTIONS: readonly LocalMotionProfile[] = [
  {
    motionId: 'travel.blanket.tail-sway', status: 'planned', driver: 'time',
    channels: [{anchorId:'tail-tip',axis:'z',amplitude:.14,frequency:.25,phase:0}],
  },
  {
    motionId: 'travel.pack-bow.step-sway', status: 'planned', driver: 'movement',
    channels: [
      {anchorId:'bow-left',axis:'z',amplitude:.11,frequency:1.6,phase:0},
      {anchorId:'bow-right',axis:'z',amplitude:.11,frequency:1.6,phase:Math.PI},
    ],
  },
];
