# Rarity VFX R2 — perceptual enchantment, not a brightness grade

Scope: revise PR #9's scene presentation only. User rejected the static luminance/tint difference. Keep all data, IO, inventory, creation weights and UI unchanged. No merge or deployment.

Visual goal: obvious enchanted-item cue at normal play distance, not only in a close-up or at night. Soft edges do not mean low visibility. Combine a moving full-surface sheen with saturated glow, bright four-point glints anchored to the actual mesh and local soft spill. No floating star badge, vertical loot beam or floor ring. Common/uncommon/rare remain unchanged. Epic purple and legendary warm gold; preserve recognizable base form.

Reference: Blizzard's Midnight Season 1 Galaxy illusion presentation (https://worldofwarcraft.blizzard.com/en-us/news/24266321) for bright core/colored falloff/sparkle separation, not its exaggerated footprint. Reference images are not shipped game assets. All shaders and analytic star shapes here are authored code.

Acceptance: actual production scene day/dusk/night and normal-distance comparison; short motion evidence, disabled-animation legibility, occlusion, pack/re-add cleanup, bounded cache and unchanged data tests. Existing app loop owns time; no timers or new save fields. Current static meshes only; future skinned actors need a dedicated adapter.
