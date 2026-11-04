/**
 * Hosts expose attachment points, not a second owner or a copy of the item's
 * rarity, traits, effects, blueprint, model or inventory record.
 */
export type AttachmentHost =
  | { kind: 'fixture'; id: string }
  | { kind: 'item'; definitionId: string };
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
  {
    slotId: 'cabin:entry-hanging', host: { kind: 'fixture', id: 'cabin' },
    kind: 'entrance-hanging', status: 'planned',
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
