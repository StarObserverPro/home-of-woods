import { WARDROBE_SLOTS } from './wardrobe.ts';
/**
 * Hosts expose attachment points, not a second owner or a copy of the item's
 * rarity, traits, effects, blueprint, model or inventory record.
 */
export type AttachmentHost =
  | { kind: 'fixture'; id: string }
  | { kind: 'item'; definitionId: string }
  | { kind: 'character'; id: string };
export type AttachmentSlotDefinition = {
  slotId: string;
  host: AttachmentHost;
  kind: string;
  status: 'active' | 'planned';
  /** Scene resolves this semantic anchor; no free-form mesh or position in saves. */
  anchorId: string;
  /** Environmental information available to an attached item's future effects. */
  contexts: readonly string[];
  /** Optional fixture construction or mount prerequisite, enforced by action module. */
  requires?: { upgradeId: string; activeLegacySlot?: string; activeLegacyPart?: string };
};
export const HOST_ATTACHMENT_SLOTS: readonly AttachmentSlotDefinition[] = [
  // Character wardrobe anchors are semantic. Actual rig fittings and player UI are not enabled yet.
  { slotId:'player:headwear', host:{kind:'character',id:'player'}, kind:'headwear',
    status:'planned', anchorId:'character.head', contexts:['equipped','movement','weather'] },
  { slotId:'player:upper-body', host:{kind:'character',id:'player'}, kind:'upper-body',
    status:'planned', anchorId:'character.torso', contexts:['equipped','movement','weather'] },
  { slotId:'player:lower-body', host:{kind:'character',id:'player'}, kind:'lower-body',
    status:'planned', anchorId:'character.legs', contexts:['equipped','movement','weather'] },
  { slotId:'player:footwear', host:{kind:'character',id:'player'}, kind:'footwear',
    status:'planned', anchorId:'character.feet', contexts:['equipped','movement','terrain'] },
  { slotId:'player:back-gear', host:{kind:'character',id:'player'}, kind:'back-gear',
    status:'planned', anchorId:'character.back', contexts:['equipped','movement','carrying'] },
  { slotId:'player:hand-left', host:{kind:'character',id:'player'}, kind:'hand-gear',
    status:'planned', anchorId:'character.hand-left', contexts:['equipped','action','movement'] },
  { slotId:'player:hand-right', host:{kind:'character',id:'player'}, kind:'hand-gear',
    status:'planned', anchorId:'character.hand-right', contexts:['equipped','action','movement'] },
  ...WARDROBE_SLOTS.map(slot => ({
    slotId:slot.slotId, host:{kind:'fixture' as const,id:'player'}, kind:slot.kind,
    status:'active' as const,anchorId:slot.anchorId,contexts:slot.contexts,
  })),
  {
    slotId: 'cabin:entry-hanging', host: { kind: 'fixture', id: 'cabin' },
    kind: 'entrance-hanging', status: 'active',
    anchorId: 'cabin.entry.hanging', contexts: ['visitor-arrival', 'wind', 'night'],
  },
  {
    slotId: 'cabin:message-hook', host: { kind: 'fixture', id: 'cabin' },
    kind: 'message-hanging', status: 'planned',
    anchorId: 'cabin.entry.message', contexts: ['visitor-arrival', 'message-received'],
  },
  {
    slotId: 'camp-fire:pot-hanger', host: { kind: 'fixture', id: 'camp-fire' },
    kind: 'pot-hanging', status: 'planned',
    anchorId: 'camp-fire.hook.pot', contexts: ['fire-lit', 'cooking'],
    requires: { upgradeId: 'camp-fire:hook', activeLegacySlot: 'camp-fire:top', activeLegacyPart: 'camp-fire:hook' },
  },
];
