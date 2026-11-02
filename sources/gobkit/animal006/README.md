# Gobkit · animal006：松鼠与野兔

仅采用作者免费目录中 `Squirrel.glb` 和 `Hare.glb`，没有导入整包。2026-11-01 核对来源：

- 作者与免费包说明：https://gobkit.com/freebies
- 作者逐文件目录：https://gobkit.com/api/free
- 原文件：https://gobkit.com/freebies/animal006/Squirrel.glb
- 原文件：https://gobkit.com/freebies/animal006/Hare.glb
- 许可正文：[CC0 1.0 Universal](../../../public/assets/licenses/gobkit-CC0-1.0.txt)。作者对这两项及免费包声明允许修改、商业使用与再分发，无强制署名；仍保留来源。

作者目录标注绑定和 idle/attack/dead/walk 动作；实取文件各含 16 骨骼。运行时只采用 idle/walk，来源原件保留不改写。使用 `node tools/prepare-wildlife-assets.mjs` 从本目录重建；`--download` 只从上述固定 URL 取回与锁定 SHA-256 一致的原件，上游变化时停止而非静默更新。普通构建和游戏不联网取素材。

修整：两者采用一致的非金属、0.68 粗糙度、底色系数；共享骨架根下居中落地，松鼠整体高 1.12、兔整体高 1.10 世界单位。未重标原资产许可证。逐文件原始/产物 hash、三角形与骨骼数见 manifest 和 evidence/wildlife-phase1/asset-normalization.json。动画无需战斗用途，未开放互动能力。
