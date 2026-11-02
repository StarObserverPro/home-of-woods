# Item extension contract and rarity

Authorized 2026-11-02: discard historical-save compatibility; refactor item IO before adding rarity. Based on PR #8 so wood transfers are covered. No merge or deployment.

Goal: strict identity/count/ownership core; open JSON attributes with centrally registered typed defaults. Unknown attributes and unsupported values survive read/edit/write. Quantity changes and physical transfers preserve complete batch identities. New optional attributes do not require format migrations. Real semantic changes still require a new core version.

Visible acceptance: inventory/detail names, frames and labels agree across five tiers. Epic/legendary models have gentle full-surface emission, retain wood shading, and do not recolor shared bench materials. No beams, outline-only substitutes, particles, full-screen bloom or economic bonuses. Verify daylight/dusk/night, camera rotation, placement/pack/reload and narrow viewport.

Scope: content/domain/app persistence, workshop UI and reusable scene material cache, tests and documentation. Start a clean v2 save database; leave old database untouched. No historical decoder chains, equipment-slot system, physical-engine redesign or asset changes.

Delivered verification: 123 tests, assets/types/build and historical audits passed; production-scene day/dusk/night/orbit captures and real warehouse/place/rotate/pack/save/reload pointer flow passed. Detail color validated on an isolated preselected checkpoint. Real phone GPU and distant occluded item hit targeting remain unverified. See ITEM_RARITY_VERIFICATION.md for exact limits and evidence.
