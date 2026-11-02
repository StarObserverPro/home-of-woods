# Rarity VFX R3: quiet legendary and three display modes

Continue PR #9 at e221ecc. Latest user clarification wins: keep epic exactly at the approved R2 appearance, only lower legendary, with a stronger night cap. Keep purple epic / gold legendary; no changes to rarity data, crafting or world saves.

Add full / simple / off in the normal Operations panel, with a local display preference independent of world saves. Full retains the approved motion. Simple restores base material and places one nonanimated, surface-conforming star decal per high-rarity item (not a camera-facing sprite). Off restores originals and removes all world rarity cues; UI names/colors remain.

Verify day/night, epic regression at fixed phase, all modes, static orientation, depth occlusion, 100 mode/grade/pack cycles, real UI persistence including blocked storage, existing tests, build, screenshots and documentation. No merge or deployment. Reuse current Three.js addons and resource owner; no new package or render loop.
