# 资产登记与批准记录

对应 HOW-BASELINE-1.0；准入规则见 [ASSET_PIPELINE](ASSET_PIPELINE.md)，工作清单见 [ART_HUD](ART_HUD.md)。

**当前记录：R4 基础场景、两项采集及 HOW-CHARACTERS-1 已接入本地实现分支。当前 10 个运行模型，原 ranger 仅归档；manifest 共登记 11 个 GLB。** PR合并和发布另行记录；旧PR #1资产不因历史存在而准入。

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
| how-character-motions | General、MovementBasic、CombatMelee、Simulation 中选用 Idle_A、Walking_A、PickUp、Waving、Melee_2H_Attack_Slice / Chop，移除演示人体网格；178,484 字节 | public/assets/characters/motions.glb；消费唯一应用时钟，访客仅抽取头/手臂轨道 |
| how-character-axe | 本项目 Blender 原创单刃斧，11,400 字节，非金属风格材质；不同于第三方模型，未标 CC0 | public/assets/characters/axe.glb；两掌挂点约束刚性柄，实际刃面接触检测 |

采用的源文件限于 `sources/kaykit/adventurers/` 和 `sources/kaykit/animations/`，原文件与产物 hash、取得版本、修改、入口在 manifest；未复制整套免费包。`tools/build-characters.py`、`build-character-axe.py` 在独立 Blender 5.2.3 后台进程生成 `art/characters/*.blend` 和 GLB，`prepare-character-assets.mjs` 组装六段动作，`register-character-assets.mjs` 登记规范字节。原 Rogue 图与重绘图保留在编辑源，工程打包图像且移除外部绝对图像路径。

树干接触读取现有真实几何；竖劈承托桩为原创诊断几何。Models/Resources 统一拥有共享几何、材质、图像纹理及克隆后的独立 skeleton；每实例骨纹理一并释放。旧 `m0/ranger.glb` 仅作历史归档，运行角色引用已替换。本轮来源、实际采伐、手机视口与释放结果见 [角色证据](../evidence/characters/README.md)，不沿用旧人物结论。

## 实际资产

R4 已于2026-10-30获准回接，当前状态为实现分支已集成，PR待审查，尚未合并或部署。五个 HOW-M0-R3 原创运行GLB共704,240字节，规范字节与原来源保持；回接差异与新检查另见 ../evidence/integration/。

## R4 新增表现与参考

| 内容 | 实际来源、输入与运行入口 | 权利与分发边界 |
| --- | --- | --- |
| 林下 / 草甸规划色块 | 本轮原创分区与色板；src/content/biomes.ts、src/scene/ground-material.ts。5 个林下区、3 个清空区，程序方格色块结合原路径、河道与法线；无新增图像纹理 | 项目原创代码和参数，不冒标 CC0；分区不是实时树木状态或现实生态数据 |
| PNW 风格雪山 | src/content/environment.ts 和 src/scene/environment.ts。本轮原创六组固定轮廓、冰斗/刃脊、雪线/裸岩/冰川槽与面色；形态知识参考 [NPS 冰川说明](https://www.nps.gov/mora/learn/nature/mount-rainier-glaciers.htm)、[NPS 地质说明](https://www.nps.gov/mora/learn/nature/geologicformations.htm) 和 [USGS 冰川地形说明](https://www.usgs.gov/volcanoes/mount-rainier/science/glaciers-help-shape-mount-rainier) | PNW 为美术方向，没有下载/分发网页图像、真实山岳 DEM 或摄影纹理，不声称具名实景复原；远山不承担可玩地表或碰撞事实 |
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
