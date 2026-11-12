# 资产登记与批准记录

天气回接采用本项目独立沙盒中已审阅的原创程序雨丝、雪花、局部镜头雨滴、水坑涟漪与材质覆雪。新储木架棚顶和立柱为原木纹、共享几何与材质组成的原创模型，既有 GLB 字节与第三方许可沿用原登记。生产入口为 scene/weather-presentation.ts、weather-particle-seeds.js、environment.ts 与 camp-props.ts，资源归原 Resources owner。强度随机样本与空间坐标独立。当前范围和实机检查见 [天气回接记录](scopes/running-selection-weather.md)。

## 跑步动作追加（2026-11-06）

现有 HOW-CHARACTERS-1 的免费 KayKit Character Animations 1.1 已准入源件 MovementBasic.glb 增选 Running_A，沿用 public/assets/licenses/KayKit-Animations-1.1-CC0.txt。采用脚本 prepare-character-assets.mjs 重新打包，仅保留实际消费的七段动作。运行时 public/assets/characters/motions.glb 为 203,564 字节，SHA-256 为 2dd813b43abf0203f4fdad58c8721d19f59fc2e2db950293b2f4b737a5168e36。源件 SHA-256 为 11422afd50abf7e8c92ea107e2e0bc94abd38023d6d15f55ad580347efbfa29e。manifest 与角色子清单同步，Models/Resources 沿用原加载和骨架资源所有权。实际步频消费移动位移，采伐止点继续使用原动作。当前运行及验证见 [本轮记录](scopes/running-selection-weather.md)。

## 山谷景观程序资产（2026-11-06）

本项目 R1/R2 沙盒原创程序几何与着色器：四组山体、外坡、河道延伸、五种外景树冠、岸石和路牌。无新增外部网格、贴图、字体下载或采购，不标为第三方 CC0；Three.js 沿用已登记 MIT 许可。主体入口为 `scene/horizon.ts`、`mountain-geometry.js`、`outer-forest.js`、`trail-material.js`、`landscape-props.js`。地形与实例按原世界轴向和比例构建；只作装饰，无新增碰撞、命中或资源身份。修整前后、预算与所有权见 [接入记录](VALLEY_HORIZON_INTEGRATION.md)。

## 营地生活程序资产回接（2026-11-05）

以下代表表现已获用户授权接入本地主体；没有新增下载模型、贴图、字体或许可包，也没有修改原 GLB 字节。本地集成与主线验证分开记录，当前结果见 [CAMP_LIFE_INTEGRATION](CAMP_LIFE_INTEGRATION.md)。

| 对象 | 来源、运行入口与适配 | 资源/状态边界 |
| --- | --- | --- |
| 松果门铃 | 项目原创程序几何及 WebAudio 短木音；`scene/housing-presentation.ts`、`bell-audio.ts`，挂在原木屋真实锚点 | 同一实例装卸；手动响铃解锁声音，卸载关闭 AudioContext |
| 长凳/边桌与工坊引导 | 项目原创 `supported-surface-presentation.ts`、`workshop-assembly-presentation.ts`；共用几何 parts、尺寸缓存与材质，边桌为空碗/板/勺陈设 | 长凳3/边桌4个基础网格批次，实际尺寸入模型；固定陈设不发食物/库存 |
| 书、碗、面包与坐姿 | 原创程序道具；`life-presentation.ts`、`seated-pose.ts`、`characters.ts` 复用已准入 KayKit 骨架和真实手掌挂点 | 骨长不变，当前角色/衣装接触单独验证；不新增人体或动作 GLB |
| 枝扫帚与有限落叶 | 原创 `broom-study.ts` / `broom-presentation.ts`；本体3网格/244三角形、可选叶形线段印记；36叶片为3个实例批次/72三角形 | 共享缓存5种几何；三处有限叶堆不增生资源，原物神谕不复制实例 |
| F100 短谢幕 | 复用原持碗、已建且挂载的汤锅/吊钩、真实附近边桌木勺 | 不召唤缺席器具；有限表现后恢复原 transform，无新增网格/经济结算 |

共享 GPU 资源仍归 Resources/Models；实例装卸撤销模型和命中。稀有度光效与阴影可能增加实际绘制次数，上表是本批基础几何预算。主体原模型许可与通知保持；上述项目原创程序几何不改标第三方 CC0。

2026-11-03 行商 PR #16：NPC 继续采用已经登记并保存 CC0 许可证的 KayKit `visitor.glb` / `motions.glb`，现阶段带篷驴车是 `src/scene/merchant-wagon.ts` 的本地原创程序几何，不包含新增下载资产、贴图或模型；外观参考 [Codels Covered Wagon](https://codels.download/models/wagon)，但没有采用其 GLB，因此不能把参考模型冒称为本项目已集成资源。临时进出运动只消费游戏时钟，不参与物品所有权和交易结算；详见 [行商契约](MERCHANT.md)。

2026-11-02 木屋第一阶段修缮复用下表已有的原创 `cabin.glb`：`scene/cabin-repair.ts` 克隆两块屋顶板和两根门边支撑，保留原几何、材质、倒角及比例。源 GLB 字节不变，不新增第三方下载；共享资源仍由 Models 所有者释放。`scene/selection-marker.ts` 是原创四段细线提示，无贴图；篝火仅修改既有锚点。准入及实机范围见 [营地交互](CAMP_INTERACTIONS.md)。

对应 HOW-BASELINE-1.0；准入规则见 [ASSET_PIPELINE](ASSET_PIPELINE.md)，工作清单见 [ART_HUD](ART_HUD.md)。

**R4 / HOW-CHARACTERS-1 当时记录：基础场景、两项采集及角色已接入本地实现分支，当时 10 个运行模型、manifest 登记 11 个 GLB，原 ranger 归档。当前资产集合以运行时 manifest 和后续各批登记为准。** PR合并和发布另行记录；旧PR #1资产不因历史存在而准入。

## R5d 场景回接（2026-10-30）

沿用用户审看通过的 R5 程序网格/着色器与自绘神谕纹理，新增焦木端头、灰环和不规则碎面；均为本项目原创，不冒称第三方 CC0。没有新增下载、生成服务或付费资产。倒影使用已锁定 Three.js 0.186.1 的 MIT Reflector，通知继续随 public 分发；现有十个运行模型及许可不变。

运行入口为 scene/creek、camp-props、fire、altar、stone-foundation，以及 world 的闭合网格、切边和碎面。倒影单目标 512²/256²，每 3/4 帧有界更新，不重复阴影；火焰 2,808 三角形，祭坛上部 2,910 三角形、一张 512×640 状态文字纹理。文字使用系统字体，不分发字体文件。地形 19,896 三角形、166 个碎面插点，崖顶边固定，背面实际封闭。道具有稳定身份、拾取与碰撞，资源归原 owner。准入指纹、旧合成存档、修整和验证见 [场景记录](../evidence/scene-r5/README.md)。

## 条目格式

后续每个实际采用的资源填写以下字段；同一资源包可共用授权信息，但每个运行时产物必须可定位。首次实际接入同步建立机器可读 manifest，字段语义与本表一致。

| 字段 | 内容 |
| --- | --- |
| asset_id / batch_id | 稳定 ID、所属可见功能批次与 M0/M1/M2 |
| role / status | 设计参考或运行时；candidate / licensed / adapted / integrated / verified / rejected |
| source | 作者/供应方、具体资源页、包名、版本、取得日期、原文件校验值 |
| license | 具体许可名称/版本、证据文件、修改/公开入库/发布条件、所需署名与通知 |
| generated | 若适用：工具/模型版本、输入来源、简要生成信息、适用输出条件与核验日期；不写账号/密钥 |
| source_parts | 使用的模型、纹理、动画；未使用部分不打包 |
| adaptation | 比例/轴向/枢轴、轮廓/材质/色板、UV、动画/碰撞/LOD等修改摘要 |
| export | 工具版本/设置、产物格式、路径、校验值与可复现步骤 |
| integration | content ID、加载/缓存入口、实体/状态映射、碰撞/命中与释放责任 |
| evidence | 审查提交、固定场景截图、操作/性能/释放结果和实际未测项 |

状态规则：许可未明不得标 licensed；仅有截图不得标 integrated；未测性能不能标性能通过。设计稿的通过状态只针对设计参考，不升级为运行时资产验收。

## HOW-CHARACTERS-1（2026-10-30）

用户授权修正止点后回接；本地实现分支已接入，未开新 PR、合并或部署。来自 Kay Lousberg 官方免费包 [Adventurers 2.0](https://kaylousberg.itch.io/kaykit-adventurers) 的 Rogue 及 [Character Animations 1.1](https://kaylousberg.itch.io/kaykit-character-animations)。两个包随附 CC0，具体许可分别保存于 `public/assets/licenses/KayKit-Adventurers-2.0-CC0.txt`、`KayKit-Animations-1.1-CC0.txt`，允许修改、游戏使用和公开再分发；保留作者及修改记录。免费包已核验，不包含付费扩展或工具账号输出。

| 资产 | 原件、修整与规格 | 运行入口 |
| --- | --- | --- |
| how-character-player / visitor | 同一 Rogue 源，移除披风、黑发黑眉，眉眼/高光小幅重绘；玩家苔绿、访客赭红。每个 6,418 顶点、7,574 三角、23 骨、1 蒙皮网格/材质；GLB 447,308 / 447,476 字节 | public/assets/characters/player.glb、visitor.glb；scene/characters；玩家与访客独立骨架 |
| how-character-motions | General、MovementBasic、CombatMelee、Simulation 中选用 Idle_A、Walking_A、Running_A、PickUp、Waving、Melee_2H_Attack_Slice / Chop，移除演示人体网格；203,564 字节 | public/assets/characters/motions.glb；消费唯一应用时钟，访客仅抽取头/手臂轨道 |
| how-character-axe | 本项目 Blender 原创单刃斧，11,400 字节，非金属风格材质；不同于第三方模型，未标 CC0 | public/assets/characters/axe.glb；两掌挂点约束刚性柄，实际刃面接触检测 |

采用的源文件限于 `sources/kaykit/adventurers/` 和 `sources/kaykit/animations/`，原文件与产物 hash、取得版本、修改、入口在 manifest；未复制整套免费包。`tools/build-characters.py`、`build-character-axe.py` 在独立 Blender 5.2.3 后台进程生成 `art/characters/*.blend` 和 GLB，`prepare-character-assets.mjs` 组装六段动作，`register-character-assets.mjs` 登记规范字节。原 Rogue 图与重绘图保留在编辑源，工程打包图像且移除外部绝对图像路径。

树干接触读取现有真实几何；竖劈承托桩为原创诊断几何。Models/Resources 统一拥有共享几何、材质、图像纹理及克隆后的独立 skeleton；每实例骨纹理一并释放。旧 `m0/ranger.glb` 仅作历史归档，运行角色引用已替换。本轮来源、实际采伐、手机视口与释放结果见 [角色证据](../evidence/characters/README.md)，不沿用旧人物结论。

## 实际资产

R4 已于2026-10-30获准回接，当前状态为实现分支已集成，PR待审查，尚未合并或部署。五个 HOW-M0-R3 原创运行GLB共704,240字节，规范字节与原来源保持；回接差异与新检查另见 ../evidence/integration/。

## R4 新增表现与参考

| 内容 | 实际来源、输入与运行入口 | 权利与分发边界 |
| --- | --- | --- |
| 林下 / 草甸规划色块 | 本轮原创分区与色板；src/content/biomes.ts、src/scene/ground-material.ts。5 个林下区、3 个清空区，程序方格色块结合原路径、河道与法线；无新增图像纹理 | 项目原创代码和参数，不冒标 CC0；分区不是实时树木状态或现实生态数据 |
| PNW 风格雪山 | 当前 R2 由 src/scene/mountain-geometry.js 与 horizon.ts 生成四组固定山体，保留冰斗/刃脊及岩雪面色，替换原 R5d 六组轮廓；形态知识参考 [NPS 冰川说明](https://www.nps.gov/mora/learn/nature/mount-rainier-glaciers.htm)、[NPS 地质说明](https://www.nps.gov/mora/learn/nature/geologicformations.htm) 和 [USGS 冰川地形说明](https://www.usgs.gov/volcanoes/mount-rainier/science/glaciers-help-shape-mount-rainier) | PNW 为美术方向，没有下载/分发网页图像、真实山岳 DEM 或摄影纹理，不声称具名实景复原；远山不承担可玩地表或碰撞事实 |
| 程序河水 | src/scene/environment.ts 中 createRiverAppearance，替换原河面材质，加入深浅/岸沫/流纹/法线变化；无新增水面网格或纹理 | 本轮原创 shader；保留 R3 world 河道和水面高程，不把颜色变化当作水深或水文模拟 |
| 斧头 / 树桩 / 木屑 | src/scene/forestry-presentation.ts 中原创七边柄、倒角斧头、树桩/年轮和固定池 18 片木屑；倒树与幼树复用既有原创 GLB | 运行时生成的共享几何与非金属材质，由 Resources 所有者释放；表现只消费 domain 状态，不结算奖励。稳定树位保留，后代身份在 state 中登记 |
| 透明 HUD | src/ui/App.tsx、src/ui/style.css；本轮整理现有 UI、SVG 符号、文字阴影、透明地图和工具组，无新增字体或图标包 | 项目代码内的原生 DOM/CSS/SVG；不包含 Sky Porch UI 或业务逻辑 |
| Sky 天空 / PMREM | 已锁定的 Three.js 0.186.1：three/addons/objects/Sky.js 与 PMREMGenerator；动态云和固定白昼天空、一次生成的 128 尺寸环境图 | Three.js 为 MIT，版权与条件见依赖 LICENSE，并由锁文件约束版本；属于软件依赖，不是 CC0 美术资源。发布时保留依赖版权与许可要求 |
| Sky Porch 天光 / 薄雾参考 | 用户明确指认的自有站 [Sky Porch](https://sky-porch.starobserverpro.chatgpt.site)；本轮以 Sites 核对 owner、v35。公开源为 atmosphere.js?v=20261018-sunset2、evening-sky.js?v=20261018-sunset2、app.js?v=20261018-enrich4。当前仅按本山谷改写白昼天光及高度衰减近地薄雾方法 | 未发现站点许可声明，不写成 CC0、公共领域或第三方授权。原始 JS 只读抓取在 art/reference/sky-porch/，不进入候选包；站点业务、其他资产和私有资料不迁移。Three Sky 的 MIT 与该参考站的来源边界分别登记 |

新增程序参数集中在 content；R4 从 public/assets/m0/ 读取原五个 GLB，采集支线另加载 public/assets/gathering/ 的两个 GLB。Sky Porch 抓取与 R3 API 回执同属本地参考材料，不是运行依赖，也不是白名单回接资产。天空云相位、水流与林业表现消费唯一 app 循环；共享资源释放、真实浏览器 shader 和最终场景成本应在当前组合版本检查，不能引用 R3 成绩宣称 R4 通过。

## 延用的 R3 模型与地表追踪

本节为原 R3 五模型的历史登记。采集批次新增如下两项，不改变原模型来源。

| 资产 | 来源、权利与修整 | 运行入口 |
| --- | --- | --- |
| how-gathering-branches（9,536 字节） | Kenney Nature Kit 2.1 / campfire_logs.glb；CC0，允许修改、游戏使用和公开分发；居中落地，1.9×0.32×1.25，暖木色、粗糙度 .68、金属度 0、保留拓扑 | public/assets/gathering/branches.glb；gathering-presentation / interaction-registry |
| how-gathering-mushrooms（15,272 字节） | 同包 mushroom_tanGroup.glb；同一 CC0，居中落地，1.5×0.95×1.25，奶油柄/赭色菌盖、粗糙度 .68、金属度 0、保留拓扑 | public/assets/gathering/mushrooms.glb；同一加载和命中流程 |

2026-10-30 重新核对[官方资产页](https://kenney.nl/assets/nature-kit)与随包 [CC0 许可](../public/assets/licenses/Kenney-Nature-Kit-CC0.txt)；原包 SHA-256 为 fa7974a0d342bfe63c38664ba9f8ec1a4aab8ea25f099bdc56870e33588c4d9d，只把采用的两个部件保存在 sources/kenney。加工脚本 tools/build-gathering-assets.mjs 使用锁定 Three.js 的 glTF 解析、bounds 和线性色彩变换，不修改既有 Blender 工程，不将第三方网格改标项目原创。前后尺寸/hash 在 [asset-normalization](../evidence/gathering/asset-normalization.json)，完整来源和加载/释放入口沿用 manifest。默认不阻挡行走，独立命中，共享资源由 Models/Resources 释放。本批实现/验证边界见[采集证据](../evidence/gathering/README.md)。

以下保留原批次来源、修改和规范字节。五个 GLB 均为 R3 定制模型；项目没有因此取得第三方资源的额外权利，也没有将生成稿或定制模型标为 CC0。

| 资产 | 本版修整 | 文件 / 字节 | 许可与输入 |
| --- | --- | --- | --- |
| 针叶树 | 三层八边圆润树冠、短粗干、非金属暖绿；远景同轮廓简化 | public/assets/m0/pine.glb / 86,536 | 本轮原创网格；MJ R3 作为视觉指导，无图片像素或第三方网格嵌入 |
| 阔叶树 / 巨木 | 六团圆润树冠、粗分枝；巨木保持独立地标身份 | public/assets/m0/broadleaf.glb / 56,516 | 本轮原创网格；MJ R3 作为视觉指导 |
| 破屋 | 厚木墙、凹入门窗、缺失屋板与外露粗屋架；独立占地 | public/assets/m0/cabin.glb / 360,284 | 本轮原创；按 R3 更新色板、屋顶与显示比例 |
| 帐篷 | 厚 A 型布面、支架、地垫；独立根与占地 | public/assets/m0/tent.glb / 78,128 | 本轮原创；按需求及 R3 统一比例、奶油色材料 |
| 基础人物 | 大头短肢、背包、围巾；四个独立肢体轴供步行动作 | public/assets/m0/ranger.glb / 122,776 | 按项目需求原创，无第三方模型或角色参考输入 |

完整 SHA-256、加工入口、输入类型、运行入口在 public/assets/manifest.json。src/content/valley-r3.json 另登记为 worldSource：154,825 字节，SHA-256 9c273840effff74647f950e3ef914a1f46129bafe42fe1b9f8979fa67ee3913f。它是原创生成参考的地面标注加人工地形修整，未冒称现实测量或 CC0 数据。

## 选型与源文件

曾下载并试用 Kenney Nature Kit 2.1 中 tree_pineRoundC、tree_oak，具体包 License.txt 为 CC0。几何轮廓与本轮确认的圆润成团方向不符，R3 改为针对性定制；原候选位于 sources/kenney/，旧适配结果位于 archive-technical-r1/。这两棵候选没有进入本版运行时。原包与CC0许可只留在设计归档，不作为本PR运行资产复制。

Blender 5.2.3 LTS，独立 factory-startup 后台进程。tools/build-assets.py 导出 Y-up GLB，使用嵌入资源、不透明非金属材质；art/woodland-m0.blend 仅写本沙盒场景，五个模型在编辑源中分列放置。源场景只包含本项目对象。

重新导出可产生等价三角形的索引顺序差异和约 5.96e-8 的浮点尾数差异。已比较顶点属性、JSON 与有向三角形集合；本分支保留已审查的规范 GLB 字节，运行产物始终按 manifest 核对。地表数据重建则已验证字节级 hash 一致。

## 运行与验证入口

模型读取 / 合批：src/scene/models.ts。初始位置和碰撞：src/world/layout.ts；林业状态与成长后的碰撞：src/domain/forestry.ts。统一地表：src/world/surface.ts。组合、拾取与遮挡：src/scene/create-scene.ts。共享资源：src/scene/resources.ts。app/runtime-loop 是唯一帧调度者，app/runtime 持有唯一状态。R4 场景表现入口见上表，合同见 [docs/forestry-r4.md](forestry-r4.md)、[docs/hud-r4.md](hud-r4.md)。

verify:assets 检查实际 GLB hash、大小、嵌入资源、非金属材质和人物肢体轴，同时检查地表 hash、完整网格及有限高程。世界行为测试检查固定树位、落地插值、可达路径、建筑 / 树干 / 水岸 / 边界碰撞。R4 的 forestry / forestry-presentation 测试覆盖保护、距离、额度、单次结算、换代、真实 GLB 倾倒与树桩拾取；environment 测试覆盖实际几何预算、确定性、模块资源释放和河面事实保留。测试不代替浏览器最终视觉与性能，实机范围见 ../VERIFICATION.md。

R3概念方向得到认可，R4已获明确回接与准备实现PR的授权；代码和资产现位于实现分支。回接授权不替代后续视觉审查、PR合并或部署批准。

## 输出权利与软件通知核验（2026-10-30）

Midjourney母版来自本任务原创提示词和局部编辑，没有使用他人放大图或私人参考。核对[官方条款第4节](https://docs.midjourney.com/hc/en-us/articles/32083055291277-Terms-of-Service)（生效日2026-05-27）：生成者的输出权利仍受第三方权利与条款条件约束；年收入超过100万美元的公司或其员工须满足Pro/Mega条件。本登记不把生成稿写成CC0，也不公开账号或订阅标识。五个GLB是独立制作的项目网格，没有嵌入概念图像素。

地表输入来自本任务通过官方Atlas CLI/API产生的配对RGBD，再作人工标注和玩法修整。核对[World Labs条款3.3节](https://www.worldlabs.ai/terms-of-service)（更新日2026-01-21）：付费输出与API输出权利分别见3.3(b)/(d)，免费网页账户输出受3.3(a)限制，不混作同一授权。本批记录的工具链为官方API链路，不包含原始整景输出、账号回执或服务代码；来源署名保留为World Labs Atlas。

Three、React、ReactDOM、Scheduler的完整MIT版权与许可文字随[公开构建通知](../public/third-party-notices.txt)分发。Sky Porch仅参考用户自有站的天光/薄雾方法，未复制源站JS或业务，未声明其为CC0。

## 仓库与树种物产的表现复用

本轮继续使用 how-gathering-branches / how-gathering-mushrooms 原始规范字节及已核验许可，未新增第三方素材。树种配置只改变按宿主的地面位置、圈半径、簇数、缩放和朝向；10 个资源池通过 38 个挂点、4 个实例绘制批次呈现。批次借用缓存几何/材质，由同一 Resources owner 释放。仓库图标由 ui/Warehouse.tsx 内原生 SVG 绘制，不含新字体、图标包或生成图片。来源变化、命中、卸载和画面证据见 [本轮验证](../evidence/warehouse-tree-resources/README.md)。

## 五动作接入

继续使用已登记 KayKit、项目树、枝束与蘑菇原始 GLB，未新增第三方素材。src/scene/actions 从已接受沙盒抽取原创程序动作和下部树干/断面网格，不标为 CC0。主资源 SHA 不变；中等树静态合批与动态断口共用构造，原始共享资产不被修改或由动作适配器释放。来源详情见原登记；本轮行为与画面见 [集成证据](../evidence/action-wood/README.md)。

## 树形与林下生产资产
本批为项目原创程序网格，来源为本仓库树形/林下沙盒的已认可版本，不标记为第三方 CC0。生产入口 `scene/forest-shapes.js`、`scene/understory-geometry.js`、`scene/understory.js`；适配包含枝干合并、低段裁切、远景细分、共享缓存、地表与遮罩筛选。无外部下载或新增贴图。树实例身份仍为 world 固定树位，地被为不可采集装饰。几何/材质/实例释放归 Resources；动作临时对象归既有 forestry owner。旧 GLB 留作历史许可与验证材料，新树入口不消费其轮廓。预算与证据见 [回接记录](FOREST_INTEGRATION.md)。

## 最终动物素材

四种运行模型及来源统一见 [最终动物接入](WILDLIFE_GUIDE.md) 与 `public/assets/manifest.json`：Gobkit CC0 松鼠／野兔、Quaternius CC0 雄鹿、项目原创 1908 三角形／21 关节北美山羊。来源原件、许可证、重建脚本保留，旧 Gobkit 羊和候选素材不进入当前树。四个最终 GLB 使用交付版本原始字节；仅将野兔营地锚点移出 Woodcraft 碰撞区。


2026-11-03「家宅平安」第一批外部装配件由 `src/scene/camp-exteriors.ts` 使用本仓库原创低多边形几何生成（帐篷布面局部复用已登记 `tent.glb` 网格）；不接入外部资产、下载或贴图，不冒标 CC0。新建几何和材质均由 `Resources` 释放，只有顶层 12 个部件状态属于既有营地设施，来源/装配范围见 [家宅平安](CAMP_EXTERIORS.md)。

## HOW-WARDROBE-1（2026-11-04，基础实现候选）

本分支未下载、复制或重贴图库外服装资产；`src/scene/wardrobe-visual.ts` 为新编写的基础程序几何（软檐帽、背包、手套、领巾），依附现有 KayKit 23 骨 `head/chest/handslotl/handslotr`，共享几何材质由 `Resources` 回收。`src/content/wardrobe.ts` 的 78 条为设计版型清单（`design-only`、`meshAssetId=null`），**不是 78 个已可使用的源 GLB**。现有单蒙皮角色的衣裤鞋及腰带尚未独立换网格；不能将该阶段列为整套换装美术验收。后续来源、适配和准入见 [玩家衣柜基础](PLAYER_WARDROBE.md)。

## HOW-UI-ART-R1（2026-11-05，用户批准采用）

来源是本轮内置 imagegen 生成的森林生活图标及界面母版；后续母版只以第一张生成图作风格参考，无外部参考图片、图标包或字体输入。生成图不标为 CC0。用户审阅风格后要求增加细分，随后明确要求将这些图标用于现有菜单。

采用 79 个语义图标的 64／128 px PNG 和 1 张空白物品格，共 159 个 PNG，约 2.35 MiB；逐文件路径、字节数、SHA256 与母版批次记录在 `public/assets/ui-r1/manifest.json`。母版、实际提示词、透明修订及裁切元数据保留在本地独立设计沙盒 `sandbox/ui-art-r1/`，不随本生产合批提供；当时的预览检查保留为[历史记录](history/ui-art-r1-2026-11-05/VERIFICATION.md)。加工包括透明底噪清理、按透明间隙校正裁切、留边及尺寸重采样，无第三方许可证改写。

接入入口为 `src/ui/GameIcon.tsx`、`art-icons.ts` 和 `menu-art.css`，用于常驻工具、仓库、随身、行商、图纸、衣柜、木作与营地日用品。等级色仍由既有物品规则控制，图标本身不新增物品、树种材料账本或等级规则。只采用小尺寸图标和空格皮肤，母版、512px 插值图及整套候选不进入生产目录。图片由浏览器按菜单实际出现加载，无 Three.js 几何／纹理缓存或场景命中对象；关闭菜单后 DOM 释放，原图缓存由浏览器管理。

[tools/prepare-ui-art.mjs](../tools/prepare-ui-art.mjs) 是可选的本地取用工具，需要另有本地设计母版所派生的 `sandbox/ui-art-r1/manifest.json` 和对应 PNG 导出物；这些输入不在本生产包内。构建和 CI 直接使用已提交的正式 PNG 与 manifest，不依赖或自动运行该工具。`verify:assets` 已增加 UI 文件的路径、哈希、PNG 头和尺寸校验。实际游戏菜单操作与手机视口结果见 [接入 scope](scopes/menu-clarity-art-r1.md)。

## 木料区碎柴代理（2026-11-05）

碎柴投放复用 `scene/woodcraft-presentation.ts` 的项目原创九边形圆柱几何和木色共享材质，`domain/woodcraft.woodShape` 将其限制为长 0.4、半径 0.07 的玩具比例短料。Rapier 读取同一尺寸生成凸包，不复制第三方模型或贴图，不改燃料物品身份；几何/材质由既有 Resources 释放，刚体由局部物理岛 owner 释放。每岛仍限 32 件、碎柴每件一个凸包；专项验证及实际画面范围见 [取放与晾晒 scope](scopes/material-storage-drying-fix.md)。

## HOW-UI-RUSTIC-R2（2026-11-06）

`public/assets/ui-r2/wood-bark.svg`、`wood-bark-horizontal.svg`、`wood-split.svg`：本项目本轮自绘 SVG，来自用户已确认的独立 UI 样稿，允许随本项目源代码修改、分发；不标注为第三方 CC0。无外部字体、下载链接或第三方图像嵌入。仅用于 UI 边框、标题与按钮背景，无碰撞、动画、场景资源或物品身份。图标仍使用 R1 已登记资产。

## 2026-11-06 碎柴与可采枝杈程序表现

- 来源：本项目新增程序几何；未下载新的第三方图片或模型，不将项目生成物标作 CC0。
- 碎柴：`src/content/scrap-shape.ts` 为可见/碰撞共用顶点；`src/scene/scrap-geometry.ts` 生成短断口、劈裂面和地面小堆。入口为 woodcraft / gathering / haul / characters 表现，几何与材质归 Resources 缓存释放。
- 枝杈：`src/scene/branch-attachment.ts` 生成渐细分叉枝，读取现有树模型枝段元数据并消费 action-tree 的实际变换；宿主树侧枝和可采枝条共享连接位置。旧 branches GLB 仍用于原有其他道具，不改变其来源/许可。
- 初期淡木纹预览的 256×256 原创颜色图集保留在项目外独立沙盒；正式游戏采用下节的函数木纹。所用 Three.js 库保留 MIT 许可。
- 本轮规格与实际验证：[范围记录](scopes/wood-materials-and-grain-preview.md)。

### 本地原创函数木纹（2026-11-06）

`src/scene/wood-grain.ts` / `src/content/wood-grain.ts` 为本项目原创程序化表面，由已批准 R2 独立试样公式接入；不包含第三方图片、生成式图片或新增下载资产，不标记为第三方 CC0。原木树皮/切面、加工木件顺纹共享材质与坐标约定， Resources 统一释放。接入、预算和视觉验证见 [记录](scopes/woodgrain-mainline.md)。

## HOW-CABIN-INTERIOR-1 · 独立内装审计（2026-11-12）

本批用于 [木屋内装展台](scopes/cabin-interior-audit.md)，正常游戏不自动获得家具。采用作者 Kay Lousberg 的 [官方 Furniture Bits 1.0 仓库](https://github.com/KayKit-Game-Assets/KayKit-Furniture-Bits-1.0)，固定提交 `96d5930a8dbdb363409bbc2d3341718b00e17c9c`；[作者资产页](https://kaylousberg.itch.io/furniture-bits)与随包许可均明确为 CC0。只取公开免费版本，不含付费 Extra/Source 部件。确切原件和许可见 [来源记录](../sources/kaykit/furniture-bits/README.md)，运行时许可随 `public/assets/cabin-interior/KayKit-Furniture-Bits-1.0-CC0.txt` 分发。

| 运行时文件 | 采用源件 | 三角形 / 字节 | 修整与用途 |
| --- | --- | --- | --- |
| `bed.glb` | `bed_single_B` | 534 / 26,796 | 床以底面中心落地，实际枕头/毯子接触高度独立于床头高度 |
| `table.glb` | `table_medium` | 168 / 10,736 | 按物品目录缩放，桌面 Y=1.02；提灯与碗是独立支撑子件 |
| `stool.glb` | `chair_stool_wood` | 216 / 12,320 | 凳面 Y=0.58，坐姿与安全接近点由空间目录定义 |
| `wall-shelf.glb` | `shelf_B_large` | 212 / 11,588 | 三层采用源架板，配项目原创立柱；上层可用面 Y=1.75、背唇最高1.9 |
| `rug.glb` | `rug_rectangle_stripes_A` | 68 / 4,136 | 编织条纹外观；薄层地面装饰，不阻挡导航 |

五件网格合计1,198三角形，配一张未修改的1024²渐变图集 `furniture-atlas.png`（15,605字节），运行文件合计81,181字节（不含清单/许可）。图集 SHA-256：`de62db37a80d1801c3d9eb674890ae04b04469e0c149481a51fa250562c628dc`。逐原件/产物 SHA-256、尺寸、字节数和改动摘要在 [资源清单](../public/assets/cabin-interior/manifest.json)。[重建脚本](../tools/prepare-cabin-assets.mjs)只无损重打包GLB并共享本地纹理；源顶点、法线、UV和PNG保持原始字节。运行时材质将蓝布区域映射为森林绿并轻调木色，不修改原作者图集，也不把改色产物冒称原创或改变原许可。

木箱、铁炉、提灯、厚壁木碗与盆栽为本项目程序几何，入口为 `sandbox/cabin-interior/src/scene/furniture.ts`，不标CC0。木箱有真实内腔与独立箱盖；炉体有真实炉膛、厚门框和空心烟管；提灯只消费点亮状态、不私自创建光源；木碗连续旋转截面包含内壁；盆栽叶片明确为双面薄植物表面。木箱/架框/木碗复用已登记的原项目函数木纹。本家具模块采用 Three.js 的 MIT 库模块与项目原创拼装逻辑，未复制第三方 skills 的实现文件。

`loadFurnitureAssets(Resources)`一次载入五件模板，一张图集被共享；实例移除不释放共用几何和材质，全部资源由展台的 Resources 所有者卸载时释放。纹理释放之外，加载器产生的 ImageBitmap 按对象身份去重，随同一资源 owner 调用 `close()`，不提前关闭仍在使用的共享图像。内容、支撑面、摆放/开合状态由展台 domain 唯一管理；场景不烘焙独立提灯、碗或绿植的副本。

[独立资产检查](../tools/verify-cabin-assets.mjs)校验五件原始 glTF/二进制、运行时 GLB、未修改的 PNG 以及来源/分发两份完整 CC0 通知的 SHA-256，并检查 GLB 结构、共享本地图集、原始网格二进制与 accessor 不变；许可 SHA 同存 manifest。该命令已在本轮资产上执行通过。构建、实机画面与连续交互的真实结果见本轮 scope；资产完整性检查本身不构成视觉通过声明。

围护采用 Scott Sun 的 [Threejs-Awesome-Graphics-Agent-Skills](https://github.com/scottstts/Threejs-Awesome-Graphics-Agent-Skills) 中 `threejs-procedural-geometry` 附带的完整 `geometry-quality-kit`（6 个 JS 模块，MIT，Copyright 2026 Scott Sun），来自 2026-11-12 的已安装 skill 快照。工具文件与许可保存在 [vendor 目录](../sandbox/cabin-interior/src/vendor/geometry-quality-kit/README.md)。本项目用 `panelWithHoles` / `cleanMesh` / `toGeometry` 生成有实际门窗洞的厚墙，并运行 `auditMeshData` 检查闭合拓扑；墙体计划、分段、材质、窗框、门和屋顶为本项目组合逻辑。工具自检 171/171 通过；不将 MIT 工具标为本项目原创或 CC0。
