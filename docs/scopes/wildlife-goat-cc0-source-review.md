# 白山羊 CC0 模型重新选型（仅候选，不接入游戏）

日期：2026-11-02。分支：`art/cc0-mountain-goat-review`，继承 `feat/wildlife-phase2` 已撤下失败模型的状态。雄鹿继续使用原版。**本批只核实候选来源、几何和美术适配性；不启用任何羊的实际出场、不更新玩法与存档。**

## 验收对象与审美限制

目标是远景标志性**北美山羊方向**：宽厚肩胸与颈部，肩背有厚毛的体块起伏，四条独立可读的腿和黑蹄，小眼、小而纤细、向后弯的黑角。低面数与简化材质可以有，但不能是大眼、球形身体、四个短柱腿的吉祥物。远景轮廓必须能在现有山崖、树木和天空前读出。之前的 Gobkit 彩色 Goat/白色改版仍被禁用，不重新启用。

## 已下载并逐项检查的 CC0 候选

| 来源 | 官方页面及原始文件 | 实际文件与几何 | 实物检查结论 |
| --- | --- | --- | --- |
| **Innerscene — Horned Goat** | [官方页面](https://www.innerscene.com/tools/library/3d-parts/horned-goat-171680de)，[原始 GLB](https://files.innerscene.com/library/horned-goat-171680de/51ee1da9c314a54d38b7/horned-goat.glb)，网页标示 CC0 | `horned-goat.glb`，866,052 字节，33,532 三角形，22 个独立网格，无骨骼、无动画；SHA-256 `2573320775db3382a30fad70f216ae812857a1081f0d5f9be8e00a649540f3fe` | **候选底模，未准入成品**。有腿、蹄、颈部及分离的角，胜过旧玩具羊；但胸肩偏细、角太长且偏家山羊，需要简面、缩短重造角、加强肩颈和厚毛轮廓、重新绑定四足动作。 |
| OpenGameArt — Goat，Copabrangorandel | [官方作品](https://opengameart.org/content/goat)，[OBJ](https://opengameart.org/sites/default/files/goatlowrez.obj)，作品页 CC0 | `goatlowrez.obj`，1,365,119 字节，26,444 三角形，单网格，无骨骼/动作；SHA-256 `b4604b0511314fe5d686f8f87d6f8e06fea24079f96ecd04345cfb53902b4460` | **淘汰**。夸张的头部和小角、关节与蹄部形体不适合远景北美山羊；重新加工成本比第一种更高。 |
| 3DAssets.dev — Alpine Ibex | [源页](https://3dassets.dev/assets/polar-tundra-and-alpine-fauna-alpine-ibex-43a6a3f8)，CC0 | 6,286 三角形、静态 GLB | **淘汰**。是阿尔卑斯野山羊，长弯角和身体体型不对，不因其多边形较少就混作北美山羊。 |

另见 [Sketchfab 造型候选](https://sketchfab.com/3d-models/low-poly-mountain-goat-3c463a69f2794344af28807066ff6ccb)：接近所需体态，但**CC BY 不是 CC0**，本次排除；不得复制其几何或贴图。

## 结论与下一步

1. **源文件可用不代表成品通过。** 上述都没有直接符合本项目审美、带正确四足动作的完整现成模型。Innerscene 仅作为优先改造底模，不能以“已找到 CC0”冒充“已完成美术”。
2. 它的 33,532 三角形需要减面，并做分段动作（驻足、抬头、重心转移、前后腿不同步跨步）。保留现有 `wildlife.goat` 定义与远景锚点，但在侧面与三分之四视角通过本项目审查前**不得重启**。
3. 只有审核过模型轮廓和原始来源/许可后，才进入 Blender/替代工具进行定制；之后用相同相机/光照与已获认可的 Stag 对照，提交真实游戏截图，最后再考虑恢复自然偶遇。不存在先通过测试、再用“低模”解释造型失误的豁免。
4. 这只是公开仓库独立候选分支；之前已获通过的鹿、松鼠、兔子和玩法预算均不改动。

候选原始 GLB 在 `sources/innerscene/horned-goat/horned-goat.glb`，仅供未来经过审美审核的美术改造。永久可复核的文件 SHA 是上表所列值。不要将这个原文件直接添加到 `public/assets/manifest.json` 或 `src/content/assets.ts`。
