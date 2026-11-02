# 森林之家 · 北美山羊开放许可素材重新选型

**候选审查 ID：HOW-WILDLIFE-GOAT-OPEN-2 · 2026-11-02**

结论：**优先采用 toofball（@picklecobra）的 `Low Poly Mountain Goat` 作为下一轮可修改模型候选**；放宽 CC0 → 允许 CC BY，但视觉匹配比许可证“更省事”优先。此处是已经核实公开许可和作者页面的**资产选型**，不是导入、定稿、完成动画或游戏实机验收。前一只 Gobkit 羊仍须保持禁用；已获认可的 Quaternius 雄鹿不改动。

## 视觉选择：低模、低表情密度、像真正站在山崖上的动物

![toofball Low Poly Mountain Goat 来源缩略图](https://media.sketchfab.com/models/3c463a69f2794344af28807066ff6ccb/thumbnails/876940ed681c43909dde99fa278e905f/e756d039c5694238b5cafd0ef30cf979.jpeg)

*上图为 toofball 在 Sketchfab 上的作品预览；并非森林之家内部渲染。作者 toofball，作品 [Low Poly Mountain Goat](https://sketchfab.com/3d-models/low-poly-mountain-goat-3c463a69f2794344af28807066ff6ccb)，许可 CC BY（页面显示 Creative Commons Attribution）。*

| 选择 | 来源／规格／许可 | 与本游戏的关系 | 当前状态 |
| --- | --- | --- | --- |
| **首选：toofball – Low Poly Mountain Goat** | [Sketchfab 模型原页](https://sketchfab.com/3d-models/low-poly-mountain-goat-3c463a69f2794344af28807066ff6ccb)。页面显示可下载，CC Attribution、约 **1.6k triangles / 981 vertices** | 已有浅奶油色、黑色短弯角、清楚的蹄和四条腿；比例接近动物而非大眼吉祥物，网格量与低模森林相符。还需加厚肩颈、调整瘦腿与背部毛块，并用现有鹿的光照／材质对照 | **视觉首选，待通过官方途径取得原始文件并核验 SHA、材质、骨架及完整许可** |
| 对照：Zafflex – Low-poly Goat | [Sketchfab](https://sketchfab.com/3d-models/low-poly-goat-e08bb2e734004870b1ed4c21f111a854)，CC Attribution、约 **1.6k triangles / 881 vertices** | 低模量级相近；但目前缺少可信的完整侧面和斜侧面审查图，不因下载次数较多直接取代首选 | 备选，未准入 |
| 对照：sambasivarao – Goat | [Sketchfab](https://sketchfab.com/3d-models/goat-a1008ad98bdf420e80d46c29af1928c4)，CC Attribution、约 **1.6k triangles / 801 vertices** | 同量级、贴图低模候选；原始体态与浅色统一效果尚未审查 | 备选，未准入 |
| 已取得：Innerscene – Horned Goat | [原始 CC0 素材及实测](wildlife-goat-cc0-source-review.md)，**33,532 triangles、无骨架** | 结构细节能改，但原生角过长、肩身偏瘦、减面与 rig 成本高，优先级低于更合适的现成低模 | 保留在 sources，**不加载到游戏** |
| 明确不选：Sloyd ShaderAndre – Mountain Goat | [原站 CC BY 4.0 素材](https://www.sloyd.ai/free-3d-models/model/mountain-goat-az746qdi) | 虽然白身、有完整几何，但有粗大的双螺旋公羊角，是 ram 的视觉语汇；不能代替北美山羊 | 淘汰 |
| 明确不选：WildMesh 真实山羊试用版 | [Sketchfab](https://sketchfab.com/3d-models/mountain-goat-demo-free-download-8852133c070f4b3b8f243fbf6075bf7f) | 高细节，但作者另写“仅个人使用、商用须购付费版”；与页面泛用许可提示冲突，不做公开项目的素材依据 | 淘汰，**不用 NC、ND 或存在商用许可冲突的文件** |

选择标准不是最少三角形，也不是动画最多，而是：轮廓可辨、角种类正确、腿有明确关节、肩颈有力量感、材质跟现有 Stag 协调。加拿大国家公园的[山羊／大角羊识别说明](https://www.parcs.canada.ca/pn-np/ab/banff/nature/faune-wildlife/mammal/ongules/bovids)可用于核对：北美山羊是白毛、短而细的黑角，并非盘绕大角羊。

## 后续正式接入门槛

1. **先取得模型原件**。Sketchfab Download API 要求经合法授权的用户登录；不绕过认证抓缓存或第三方受限 CDN。当前没有从该来源获得实际原件，也不能写原件 SHA。通过站内下载后，登记来源、包内文件和校验值。
2. **修的是形体，不是只改色**。保持小眼、短黑角和低面数主轮廓；适当加强肩背凸起、胸颈厚度与低模毛束；不要凭空生成大眼、夸张毛团或改成阿尔卑斯岩羊的长弯角。身体与四肢根节点可单独绑定；面数先以原件 ~1.6k 量级为目标，按实际 rig/LOD 结果审。
3. **动作先验轮廓**。在崖边固定锚点上完成驻足、头颈转动、缓慢横移一至两步和稳固重心转移。对脚底贴地、前后腿错相、身体俯仰单独看侧面帧；不让模型整只上下弹跳代替步态。
4. **实际游戏看两层镜头**。先在相同材质／方向光下与已认可的 Stag 做侧面、三分之四视图，接着核验右侧峡谷石肩自然游戏镜头。相机看不到动物、太小、像石块或角不清楚都不通过；场景检视截图不能单独替代真实偶遇。
5. **许可与分发**。CC BY 可用于商业游戏和公开仓库，但应在 `docs/ASSET_REGISTER.md`、`public/third-party-notices.txt`、游戏可访问的署名处登记作者、作品链接、实际 CC BY 版本、原许可链接和修改说明。外部参考图不是实际接入 GLB。
6. **接线限制**。复用 `wildlife.goat` 远景定义、已有崖边锚点、同一 3 只哺乳动物总量／1 只大型动物上限，以及“镜头移开消失、同窗口不补刷”机制。严格在通过视觉审查后才将新 GLB 写入 `RUNTIME_MODELS`。

## 交付边界

本分支只新增选型记录和公开预览 URL。**不采购、不宣称已有 toofball 原文件、不触碰正在运行的鹿／松鼠／野兔、不恢复 Gobkit 山羊、不开 PR、不合并、不部署。** 现有已经取得并核实的 Innerscene CC0 原件依旧保留作为备份。模型取得和美术施工须另有明确、可审查的资产接入提交。
