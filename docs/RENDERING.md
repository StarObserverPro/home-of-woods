# 运行时、数据与资源管理

2026-11-23 Rainier 山麓表现接入：地域权重仍消费唯一地表；空气透视消费共享太阳、天光与天气；高位导航镜头加入按画幅适配的广角和克制的前后焦外。默认远林仍为 `mass`，`farForest=impostor` 提供图集 A/B。实现、成本估算、诊断入口及实际 GPU 验证状态统一维护在 [Rainier 渲染实现](RAINIER_RENDERING.md)；生态来源及美术缩尺见 [生态原型](RAINIER_ECOLOGY.md)。本轮不改变经营树 ID、资源和存档所有权。

光照/阴影共享规则见 [SHADOW_RULES](SHADOW_RULES.md)：生成和调度共用，室外环境、人物、室内按类别配置；场景与资源所有权独立。新林地按未来正式模块接入，旧沙盒本轮不回填，木作入场快照和室内专题边界以该文档为准。

天气与湿度已获准回接。domain/weather 消费唯一游戏时间，runtime 在正常推进、睡觉和恢复后结算。scene/weather-presentation 复用原相机、Resources 和渲染循环，降水位置与密度阈值采用独立稳定随机数，强度在完整空间范围内增减粒子。四处水坑、地表洇湿、覆雪、屋顶遮蔽与局部镜头雨滴由原场景更新；储木架新增遮雨棚，立柱几何与导航碰撞共用配置。天气与湿度继续由原世界存档写入者保存。实际结果见 [天气回接记录](scopes/running-selection-weather.md)。

2026-11-06 跑动由 app/runtime 的会话输入决定，domain/movement 封顶点地寻路最后一步，characters 按实际位移选 Walking_A / Running_A 并取样步频。跑动输入在菜单、暂停、失焦及隐藏时复位。道具拖动由原 Pointer Events 钩子发送原实例身份，scene 普通拾取与拖动物品拾取共用遮挡命中，app/item-transfers 松手复核后调用原摆放／收回事务。天气与湿度有独立沙盒入口和存储，当前主体入口见 [本轮记录](scopes/running-selection-weather.md)。

2026-11-06 山谷景观接入继续使用唯一循环、地表和 Resources；外景仅增加装饰网格，溪流延伸共享原水面表现。当前所有者及回退见 [山谷景观接入](VALLEY_HORIZON_INTEGRATION.md)。

2026-11-05 营地生活代表功能已回接本地主体；当前制作/住房/饮食/清扫、坐立接触与恢复合同见 [CAMP_LIFE_INTEGRATION](CAMP_LIFE_INTEGRATION.md)。继续使用下述唯一 GameState、循环、地表与资源所有者；原 R4 证据保留其历史范围。

对应 HOW-BASELINE-1.0。M0 与有限采伐的 R4 实现已获用户授权回接工作分支，已通过 PR #3/#4 合并至 main，未部署；原 R4 验证与主体回接验证分开记录。本文保留后续 M1/M2 的契约，并标明当前已经存在的所有者。参考水晶花园的库存事务、主循环、道具生命周期和交互注册，不移植其他项目业务或私有记录。

## 当前实现

采集支线新增 content/items、qualities、gatherables、assets，world/gathering-layout，domain/gathering-registry、gathering、gathering-view、inventory，app/player-actions 和 scene/gathering-presentation、interaction-registry。固定来源、库存、动作与恢复记录进入唯一 GameState；枝杈、蘑菇与原木统一由 inventory 按物品和品质持有，forestry 只持有林业额度与树木状态。app 同步复核并提交，场景不发物品。职责、动作契约和正式恢复未启用的边界见 [GATHERING_GUIDE](GATHERING_GUIDE.md)。

| 当前文件 | 已承担的责任 |
| --- | --- |
| src/app/runtime.ts、runtime-loop.ts | 组合唯一 GameState、命令和固定步长主循环；移动、林业、暂停/隐藏及场景重入 |
| src/domain/state.ts、forestry.ts | 唯一模拟时间、树位/逐代个体、资格与距离、额度预留/取消/一次结算、树桩与原位补生 |
| src/world/surface.ts、layout.ts、domain/navigation.ts | 同一三角形地表插值、固定布局、碰撞与寻路；林业碰撞读取当前阶段 |
| src/scene/create-scene.ts、models.ts、resources.ts | 场景、相机、拾取、模型加载、共享 GPU 资源及销毁 |
| src/scene/forestry-presentation.ts、ground-material.ts、environment.ts | 消费状态的挥斧倒树、规划地被、原创雪山、天空/PMREM 与原河面材质；不提交经济 |
| src/content/rainier-ecology.ts、scene/outer-forest.js | 确定性地域外观、装饰林权重与原有实例预算；不生成经营资源或更改持久树位 |
| src/scene/atmosphere-lite.ts、atmosphere-rules.ts | 高度积分消光与天空驱动散射近似；独占 128×2 RGBA16F LUT 及材质补丁，天气量化键变化才重建 LUT |
| src/scene/overlook-optics.ts、overlook-optics-rules.ts | 导航广角投影、同次场景绘制的颜色/深度与两次全屏焦外合成；控制器拥有并释放目标，不另开 RAF 或几何深度 pass |
| src/scene/impostors/、tools/impostors/ | 远处装饰树簇的图集加载/绘制与离线导出；批次释放自身网格/材质，图集由加载所有者单独释放 |
| src/ui/App.tsx | 读取快照并发意图；持有同一会话状态引用供重入，不另存余额或复制玩法规则 |
| src/content/upgrades.ts、domain/upgrades.ts | 图纸升级路径、操作点、材料校验、实际投入账本和阶段；共用 workshop 任务与唯一世界存档 |
| src/domain/interaction-access.ts、ui/useItemDrag.ts | 分离距离资格与材料资格；鼠标/触控发送同类取放意图，app 在松手时复核并调用原事务 |

当前已有 IndexedDB 存档与事务备份、本地日历、营地制作/加工、行商和生活节律；完整通用建筑与在线服务仍不在本轮范围。下面的原 M1/M2 规划表保留职责方向，实际已开放接口以各模块合同及当前源码为准。实际有限林业合同见 [forestry-r4](forestry-r4.md)，参数见 [PARAMETERS](../PARAMETERS.md)，回接状态见 [scope](scopes/m0-walkable-valley.md)。

## 分层

| 层 | 负责 | 不负责 |
| --- | --- | --- |
| content | 树种、物产、配方、模型规格、生态权重、地形布局意图、文案与待调参数 | 运行时状态 |
| world | 解析布局、统一地表高程/法线、道路水岸、树位、静态边界与区域查询 | Three.js、库存结算 |
| domain | 角色、树木、库存、额度、成长、交易、祈愿、制作、建筑占地与存档类型 | DOM、React、渲染 |
| scene | 模型、材质、灯光、相机、动画、拾取、实例绘制与释放 | 独立发奖励、业务审批 |
| ui | HUD、面板、键鼠/触控提示；展示快照并发送意图 | 复制库存、许可或占地规则 |
| app | 组合根、命令分发、状态提交、主循环与唯一存档写入 | 大型模型或业务细节 |

依赖方向：world → content；domain → world/content；scene → world/domain/content；ui → domain/content；app 组装。scene 与 ui 通过 app 交换类型化事件和快照，不互相导入。

## 本地 service 与事务

Service 为纯本地规则模块，不设首版在线经济、账号或微服务。模块共享同一份 game state，不各存一份余额、日期或树木表。

当前 forestry 模块已经承担有限采伐和基础原位换代；下表其他模块按 M1/M2 的实际功能逐步建立，不先增加无人使用的空 service。

| 模块 | 责任 |
| --- | --- |
| inventory / transaction | 检查整笔材料增减与装备变更；生成候选结果或返回原因 |
| forestry | 个体资格、体量点数、即时审批、动作预留和结算 |
| forest lifecycle | 成长、资源再生、伐后原位补生与人工种植 |
| crafting / building | 配方、加工、修缮、升级、放置与实际投入回收 |
| calendar | 唯一游戏时钟及到期事项；M2 接入 prayer / merchant |
| app commit / save | 跨模块候选整笔验证后提交，唯一持久化写入 |

一次命令先校验实体、距离、状态版本、占地与资源，再同步提交完整结果；校验与提交之间不插入异步边界。失败不留下部分扣款，重复 actionId 不二次发奖。动画只消费结果，不拥有结算。

开始采伐可持有短暂预留；完成时复核个体/年度/体量，或安全取消释放。读档恢复中断动作时，先按同一规则恢复/取消预留，不能把它当作已消费和可领取的两份资源。首版不做长期交易许可证。

## 持久化数据

以下为 M1/M2 持久化语义。原 R4 的 GameState 包含 seed、time、forestry、player、selected、route、visited；本轮再加入 inventory 与 gathering（含来源、恢复及动作记录）。运行时重建复用同一引用；当前世界快照已整体持久化上述切片，刷新后校验并恢复，游戏时间不按真实离线时间补进度。

| 记录 | 最小字段语义 |
| --- | --- |
| WorldDefinition | 布局版本、生态区、开放范围、家园地块、树位、巨木、路/水 |
| GameClock | 单调游戏时间；派生日期、季度、年份 |
| TreeSlotState | 稳定树位 ID、当前个体、代次、占用、待补生时间 |
| TreeIndividual | 独立 ID、树位、树种、出生时间、尺寸/变异、健康/保护、资源池与结算记录 |
| ForestLandmark | 固定巨木 ID、位置、不可采伐语义与独立资源池 |
| ForestryLedger | 年度基础/已授特批/已用/预留，特批上限累计与命令记录 |
| InventoryState | schemaVersion、事务 revision、按 itemId 与 qualityId 合并的稀疏数量；不逐根编号普通枝条 |
| BuildingState | 建筑 ID、占地、修缮/升级状态、初始结构与实际投入 |
| FeatureState | M2 实现时加入祈愿、待生效赐福、来访和商货；不提前建空模块 |

TreeSlot 与 TreeIndividual 分开；实体 ID 不取自实例绘制索引。可用 worldSeed + slotId + generation 派生个体 seed，并保存身份/结果及布局版本，版本迁移不能静默重抽已存在个体。

存档统一包含 schemaVersion、布局版本和所有玩法切片，当前数据库为 `home-of-woods-save-v2`，版本与备份合同见 [WORLD_SAVE](WORLD_SAVE.md)。写入前做全状态校验；失败保留上一份有效数据，损坏/未知版本先保留原字节再报告，不擅自覆盖新档。库存与额度不得分别恢复。

物产细分、普通/精品堆叠、旧泛品保留、目录未知项与加工结果版本见 [物品扩展与存档兼容方案](ITEM_DATA_EVOLUTION.md)。身份、品质堆叠、库存切片 JSON 读写及旧会话适配已经实现；库存 schemaVersion 与运行时 revision 分开，原木已归统一库存。domain/inventory-persistence 对未知目录保留记录，对未来结构和损坏数据返回 protected 且保留原数据；app/inventory-session 在场景创建前整笔校验旧库存与旧林业余额。当前完整世界存档由 app/save-controller 经 app/world-save-store 的单笔 IndexedDB 事务写入主档和备份，包含版本和 SHA-256 摘要；损坏与未来数据受到保护。加工执行后续按 M1 接入，详见 [世界存档与目录](WORLD_SAVE.md)。

## 唯一 owner

R5d 回接：domain/scene-props 从 GameState.time 派生视觉时刻和篝火开关；camp-props 只读 inventory，altar 只消费表现状态；不增加时钟、GameState 切片或存档写入者。creek 的单个倒影目标由既有 Resources 释放。检视借用相机并暂停既有循环，结束后恢复角色跟随。

地形网格和 surface 共用切边/碎面规则，远端减点、侧壁和底部封闭。content/fixed-tree-slots 固定现有 580 个树位，防止新坡度筛选删除或重抽存档个体。新道具和神谕加入原可选身份集合。巨木导航点因祭坛碰撞从 (-8,48) 移到 (-6,48)，ID 不变。证据见 [场景回接](../evidence/scene-r5/README.md)。

| 对象 | 所有者 |
| --- | --- |
| renderer / scene / camera | scene/create-scene；其他模式显式借用相机控制 |
| requestAnimationFrame | app/runtime-loop；唯一帧调度 |
| game state / 命令提交 | app 持有 domain 状态；统一 commit |
| 游戏时间 / 到期结算 | 当前 GameState.time 由 app/runtime 固定步长推进，domain/forestry 处理林业到期；后续 calendar / 休息仍共用此唯一时钟 |
| 地表与路径事实 | world/surface 与解析布局 |
| 动态占地 / 树位使用 | domain 空间状态 |
| 共享 GPU 资源 | scene/resources 缓存 owner |
| 道具更新 / 拾取 | 当前 scene/create-scene 和 forestry-presentation；扩展时拆分，保留稳定实体映射 |
| 存档写入 | app/save-controller 唯一协调；app/world-save-store 唯一执行 IndexedDB 原子写入 |

文件名可在实现时调整，责任不可分裂。没有第二套库存、备用 RAF、模型内存档写入或外部工具的并行状态源。

### 旧木屋子空间

内景沿用原木屋的轴向，Y 向上，+Z 朝门外，+X 指向门面上窗户所在的一侧。门框中线来自外景 GLB 的本地 `(-0.6, 0.775, 3.35)` 和建筑实例的缩放、朝向，落到营地 `x=-31.96, z=-10.64`。屋前停在同一中线上 `(-31.96, -6.62)`，高度从营地可走地表读取。进屋落在室内 `(-0.96, 0, 3.216)`，朝向屋内。出门沿原门法线落回营地，面朝门外。场景在短淡入淡出中交接，相机恢复到门前并保留原有朝向和缩放。

室内有独立的 Scene、相机和 Resources，与营地共用一个 renderer、画布、角色与 RAF。屋内期间营地场景保留，停止画面更新、室外绘制、倒影和降水提交。主时钟及烹煮、树木到期等规则照常结算。回营地时从当前世界状态恢复绘制。内景第一次进屋创建，之后复用，退出游戏运行时统一释放。存档保存门外落脚点，重读从门前继续。

入门时复制当时的天光方向、颜色、直射与环境强度及曝光基准。随后按游戏时钟与天气数值更新室内天光取样。室内自行解算一张 1024² 方向影图，墙体、原外观屋顶缺口和两块修补板参与遮光，前窗提供局部天光，壁灯有自己的暖光。镜头剖开近墙时，围护投影和接触暗部保持原有边界。屋内只摆入固定围护和壁灯，家具取得与摆放仍按营地生活规划迭代。

林业完成在同步步骤中结算原木、已用点数、释放预留和补生时间；之后表现倾倒、树桩及倒伏源树短暂停留。倒伏源树不再参与拾取，树桩沿用原 slotId；新个体换代，不因切换表现而改写奖励。云、水和动作表现都借用同一应用循环，减少动态效果不会创建另一时钟。

### 帐篷子空间与布面

`content/tent.ts` 维护外观尺度、布面弧度、织物参数、陈设尺寸和三个稳定挂点；`content/tent-room.ts` 在同一 +Z 门向和 1.6 倍尺度下登记 `tent:interior`。门前停靠点 `(-44, 11.15)` 经右侧肩点 `(-39, 11.15)` 接入营地现有导航网格，避开原有工作台；每段连接都按运行时完整碰撞集合检查。点击门会走近并进入，帐内以独立局部坐标行走，三件陈设的碰撞消费同一尺寸。门帘开合与帐内访问属于会话状态；刷新后回到保存的合法门前，门帘默认掀起。

帐内复用木屋已使用的一个 renderer、一个共享角色、一个主循环和淡切覆层。室外场景在帐内停止绘制，天光仍从主时钟和天气取样。`scene/tent/room.ts` 惰性创建并复用，镜头剖去朝向观察者的布面，完整双层曲面继续作为阴影围护；三件陈设保留位置和接触遮蔽。内景通过共享 `lighting/interior-lighting.ts` 使用 `SHADOW_PROFILES.interior`，并调用同一 `snappedShadowPose` 与世界尺度到 texel 的偏移、柔化换算。只有一张 1024² 方向影图，门口填光不新增点光阴影。

帐内角色使用 `lighting/interior-materials.ts` 缓存的独立材质，保留原户外材质与 canopy/AO/air 的 uniform 所有者；几何、骨骼与贴图仍共享，眨眼贴图在角色更新后同步。这样避免同一材质在两个 `onBeforeCompile` 布局间往返时命中 Three 已缓存的程序，却沿用另一布局的 uniform 表。退出恢复原材质，重入复用帐内材质，最终由各自 Resources 释放。镜头按真实网格顶点、风幅余量及当前宽高比拟合，预留 HUD 空间；用户缩放仍可主动靠近。布内散射和衬里反光用随昼夜与天气变化的半球填光近似；夜间另有一盏无阴影的方向补光，让钵沿、鼓身和角色保留受光层次。门帘关闭减弱门口光，仍保留布面反射近似。

布面使用 Three.js `MeshPhysicalMaterial` 的 sheen、确定性纤维高度/粗糙度图及有 mip 的 512² 几何纹带；材质 API 见 [Three.js 官方说明](https://threejs.org/docs/pages/MeshPhysicalMaterial.html)。粗糙度保持高值，细纹在远处由 mip 平均，花纹保留宽色带。每秒最多更新 24 次局部布面顶点，最大位移 0.035 个模型单位，脊、边与支撑固定，暂停不推进风相位，减少动态效果恢复静态曲布。绷绳不穿门前通道。

`?inspect=1` 的 `tentNear`、`tentSide`、`tentFar` 使用同一主场景；`tentMaterial=clay|normals|wireframe` 检查形体与通道，`tentWindTime=0` 固定布面相位，`optics=off` 可停后处理。`stats.tentExterior`、`sceneSpace.tent` 记录几何/纹理/独立资源及当前门帘状态。实际检查与已知边界见 [本批 scope](scopes/tent-felt-subspace.md)。

## 时间与生命周期

主循环顺序：输入意图 → domain 固定步长/到期事项 → 快照同步 → 视觉更新 → render。玩法不依赖帧率；大幅休息按到期时间和稳定次序推进，不靠海量渲染帧补算。

页面隐藏、图形上下文丢失、取证冻结与卸载时停止玩法和渲染。显式暂停/检视时，只有尚未完成的视觉准备或镜头移动可借用同一 RAF 的 presentation 模式：`render(state, 0, presentationDt)` 不推进世界、动作、天气和固定步长余量；准备收敛后停止。恢复模拟会重置帧时间基线，不补算暂停时间。普通面板的暂停行为由统一模式规定，组件不能各自启停时间。

仓库侧栏是整理模式：人物、游戏时钟及制作/修缮进度暂停，同一循环仅推进局部木料固定步长并渲染，使拖出的木料能够落稳。开启仓库先取消未提交的点击投放/摆放草稿；关闭后恢复正常模式。没有增加独立 RAF 或第二个游戏时钟。

start/resume 不叠加帧链；pause 取消待执行帧；destroy 幂等且销毁后不可复活。异步加载返回时检查生命周期，离场的资源应归还而非重新挂回。道具更新、输入、ResizeObserver、命中项、渲染目标与资源引用在卸载时清理。

## 地形、树位与导入场景

地面每处只有一份基础表面事实；道路、河岸、地表材质、角色落地和建造查询共用。水体是显式的独立水层，不以额外地面贴片修补缝隙。普通实体根位置来自 world，模型在根下使用局部坐标。

`scene/creek.ts` 的中段与上下游延长段共享反射纹理及投影矩阵。每次主场景更新只开放一次反射刷新，由最先绘制的可见河段执行，随后各段消费同一份结果，避免近端延长段先读到上一帧缓存。保留桌面每 3 帧、手机每 4 帧的节流及失效刷新；反射期间不重复更新阴影，不增加渲染循环。

固定经营树位、家园空地、道路、河道与巨木 footprint 预先排除冲突。采伐暂空树位仍属森林再生范围。新增建筑不能靠删除树位或景观来获得空间。

Marble 2 可用于空间建立与交互试验。接入时将可玩地表、碰撞、锚点、树位和道路解析进本项目 world；可交互对象分离为稳定实体，操作转成 app 命令。整景贴图/splat/不可分离模型适合经审核的背景用途，不能充当可采伐林木或可修缮建筑。

外部工具不拥有本游戏的日历、库存、许可、再生和存档。输出先按 ASSET_PIPELINE 核验许可与修整，运行时不依赖生成账号、临时下载 URL 或远程生成请求。

## 多山地图与资源生命周期

近景经营林使用完整交互，中景降低几何/阴影细节，外围群山使用景观表现。先加载一片可玩区；扩张时以分区加载模型、命中和装饰，加载/回收距离留滞回，不能把整个多山地图一并高精度常驻。

同类树、石头、围栏共享几何和材质；可用实例绘制，instance → entity 映射始终同步。个体大小/色差/有限轮廓变体不等于逐树新建材质。LOD 切换不能改变目标身份、资源或碰撞规则。

卸载 chunk 只卸表现，不删除 domain 数据；到期状态统一结算或按时间有界补算，不为每棵远处树建立独立定时器。共享资源由缓存引用计数或等价机制释放，局部对象不能遍历误销毁其他实例的材质。

缓存键含规格、变体与版本；按需加载经批准资源，只提交实际使用文件，不打包整套素材库。性能阈值在 M0 目标设备采样后确定，不把未测帧率写成结果。

## 验证

冻结 R4 的原始版本为 [source-freeze.json](../evidence/r4/source-freeze.json) 中的指纹；当时已有 19 项测试、类型/构建、浏览器 shader 编译、桌面/手机视口输入、五次卸载重入与当前游戏录像记录，详见 [VERIFICATION](../VERIFICATION.md)。用户授权回接后，最终分支检查另存 evidence/integration，不覆盖或改写原 R4 回执。真实手机性能/多指操作、强制图形上下文恢复和未来存档/年度行为仍需对应证据。

验证固定 seed/相机/状态的家园全景、树木阶段、修缮、互动和移动端；记录设备、浏览器、视口、实体数、draw calls、三角形、纹理/几何计数与帧时间。重复预览、区块往返、暂停恢复和卸载后资源计数应收敛。

行为重点：巨木/幼树禁伐、年度边界、特批上限、重复结算、逐树资源容量、原位换代、人工种植冲突、材料单向转换、建筑投入回收与存档往返。不要用源码字符串匹配代替实际状态与交互测试。

## 角色、接触与骨架所有权

`scene/characters` 是唯一角色表现适配器，消费 app 的 GameState.time；不建立 RAF、不提交库存或采伐结果。玩家按空闲/行走/采集/采伐切换原包动作，营地访客从 Idle 基姿只叠加头与手臂轨道。SkeletonUtils.clone 为每个实体复制独立骨架；模型缓存共享几何/材质/纹理，Resources 同时拥有纹理与独立 skeleton，销毁时释放 boneTexture。迟到加载由终端 owner 立即释放。

`character-grip` 从左右掌槽同步刚性斧柄；`axe-contact` 对实际斧刃与树干世界几何作保守投影，搜索首次达到最大入木边界的姿态，整套骨骼停留后反向回收。树干轻微受击偏转时重新收紧止点。竖劈使用承托圆桩顶面，不允许斧刃穿底。几何采样缓存不持有额外 GPU 资源。木屑消费实际接触点，domain 仍按原 3.6 秒事务一次提交。

动作检视暂停唯一模拟钟并隔离输入，保留和恢复相机；木段/承托桩只作诊断表现。当前组合版验证见 [角色回接](../evidence/characters/README.md)。

## 仓库与树木物产追加

content/tree-resources、world/gathering-layout 管理按树种的圈形挂点及固定宿主；domain/gathering 在采伐后同步宿主代次与可用性，不发放成熟资源。scene/gathering-presentation 使用缓存模型的四个实例绘制批次，命中代理与资源池身份分开，更新只改实例矩阵。domain/warehouse-view 从唯一权威余额派生仓库视图，ui/Warehouse 只读展示；仓库面板通过 runtime.setInterfaceOpen 共用暂停与输入所有者。content/processing、domain/processing 的实际只读数据服务由仓库消费，不存在加工执行旁路。当前版本与旧采集证据分别冻结，见 [本轮记录](../evidence/warehouse-tree-resources/README.md)。

## 五动作与木料用途接入（2026-10-30）

前置 PR #3/#4 已合并；本次新增上树采枝、蹲采蘑菇、拾取燃料碎柴、定向断口伐倒与坛前祈祷，以及按总量/单件规格选择同一库存批次。旧落枝入口迁移为树上枝杈，地面碎柴独立为燃料。规格、存档迁移、尚未配置的稀有掉落与祭祀规则、验证范围统一见 [接入说明](ACTION_WOOD_INTEGRATION.md)。本批通过 [PR #5](https://github.com/StarObserverPro/home-of-woods/pull/5) 合并至 main，未部署；不代表完整 M1/M2 完成。

## 八树形与林下回接
Models 的固定树形缓存同时提供静态合并与动作 source，远景按形态/变体实例绘制；物种视觉映射只读 world，不改 Tree.kind 与存档。createUnderstory 的装饰数据只在建场时生成，唯一 render 消费宿主生长/伐倒状态，Resources 统一回收。不新增 RAF 或写入者。详见 [回接](FOREST_INTEGRATION.md)。

## 物品等级：全表面柔光

`item-surface.ts` 在标准材质上增加弱表面发光项，使用物体世界法线和原有漫反射亮度温和调制，避免夜间成为无明暗的纯色块。覆盖所有材质槽；端面/侧面、原有贴图、粗糙度、深度和阴影行为保留。不是 Fresnel 轮廓线，也不添加光柱、粒子、透明外壳、额外点光源或全屏 bloom。

变体按“原材质 UUID × 稀有度”缓存，模型绑定按实例保存。普通/优秀/稀有用原材质；史诗/传说各有木色与端面变体，五件样品合计 4 个额外材质，无额外模型 draw call。禁止原地修改工作台和木墩共用的材质；切回非发光等级恢复原材质。所有变体由既有 Resources 统一释放，材质模块不另建循环。

当前 Three.js WebGL 标准 shader 在 `emissivemap_fragment` 后叠加该项，独立 uniform 与 program cache key 保证缓存正确；浏览器验收需检查 shaderErrors。测试覆盖日间/黄昏/夜间与转镜头，证据及强度调整说明见 [ITEM_RARITY_VERIFICATION.md](ITEM_RARITY_VERIFICATION.md)。

### 稀有物品表面特效 R2

初版静态提亮/染色已被用户否决。当前史诗/传说改为全表面流光、亮核及贴面四角星芒，柔边而不隐藏特效。每个发光网格增加一个点精灵批次；材质隔离、深度遮挡、暂停和减少动态效果沿用既有生命周期。数据层和 UI 不变。当前实现与实机动图见 [R2](RARITY_VFX_R2.md)；本节替代旧段落的“无粒子、零额外绘制”视觉实现描述。

## 稀有特效 R3（三档显示）

在 R2 上增加完整／简化／关闭。完整档仅降低传说强度，史诗不变；简化档恢复原材质并附加一枚实际表面投影贴花；关闭档撤下所有稀有特效。`item-emblem.ts` 复用现有 DecalGeometry 与 Resources，不新增主循环。显示偏好由 `app/display-preferences.ts` 独立管理，不改变世界状态；渲染统计通过 `rarityVfx` 暴露，避免被业务 workshop 快照覆盖。当前规范和复现见 [RARITY_VFX_R3](RARITY_VFX_R3.md)，本段优先于此前弱自发光阶段的已废弃表现约束。

## 最终动物表现

`domain/wildlife` 决定会话内出入场；`scene/wildlife-presentation` 只消费视图、现有相机和时钟。最终四种模型由 Models 可选加载；私有骨架／材质退出时释放，共享模型归 Resources。主循环、物理岛固定步长、三档稀有特效和原存档写入者均不另建副本。当前范围与组合验证见 [最终动物接入](WILDLIFE_GUIDE.md)。

## 营地生活表现与姿态交接（2026-11-05）

`domain/housing` 与 `interaction-access` 共享座面、正前起身位、脚下地形及身体/书碗通道预检；侧后方接近先绕过真实碰撞。场景只借用座点，世界玩家保留合法站位。`characters` 恢复上一坐姿基态再采样动作，`seated-pose` 保持骨长，`life-presentation` / `broom-presentation` 在其后施加有限持物表现；结束、移动和新动作释放控制权。开始摆放先取消饭/扫帚表现并 `render(state,0)`。

`housing-presentation`、`supported-surface-presentation` 与 `workshop-assembly-presentation` 读取真实实例几何和同一制作任务。用餐/扫叶先由 domain 一次提交，再显式交给场景；场景无经济回调、独立 RAF 或存档写入。几何、材质、实例和骨架归既有 Resources owner；F100 仅借用现场原物，结束/取消恢复原 transform。世界替换后清理事件去重历史，普通取消保留去重。

稀有度与奇趣偏好分别为 `home-of-woods.rarity-vfx`、`home-of-woods.whimsy`；均不属于世界经济状态。具体玩法与本轮验证见 [营地生活接入](CAMP_LIFE_INTEGRATION.md)。

## 函数木纹与远景退色（2026-11-06）

用户接受的 R2 木纹已接回本地主体。`scene/wood-grain.ts` 在几何变换/合批前附加构件坐标，使用 Resources 所有的共享 MeshStandardMaterial；材质编译钩子可与现有珍稀光效叠加。原木侧面为树皮、端面为年轮、加工木件为顺纹，不新增图片纹理、渲染循环或后处理通道。

`content/wood-grain.ts` 管理浓淡及退色阈值：纹理面屏幕尺度约 36 → 12 像素平滑退色，视距 28 → 48 场景单位再作整体退色，远处保留原基础色。先计算覆盖度，完全退色后跳过纹理形状计算；仅使用材质内的导数平滑，不修改全局抗锯齿设置。库存架和采伐树桩原有独立年轮网格由函数年轮替代。

接入范围、验证和回退见 [函数木纹回接](scopes/woodgrain-mainline.md)。

## 树皮与可采树杈（PR23/28/33 整合）

Models/Resources 共享两张 128² 树皮贴图；动作树只借用，卸载不销毁共享图。近景静态合批通过 `barkWeight` 区分木质和冠叶，景观实例不绑定树皮纹理。树冠淡化保留木质不透明，树皮、天气和 PR33 间接遮蔽组合在同一材质编译链，不增加渲染循环或叠画一层。

采集枝杈继续由 `branch-attachment` 读取实际 composed `woodSegments` 的接点，形体保留 PR28 的相连渐细枝；`harvest-branches` 给该形体复用树皮，绘制与拾取共用几何和矩阵。地面碎柴继续采用函数木纹与稳定实例色阶。地面行动点、库存事务和树木身份不变。PR23 的早期独立结果见 [树木表面审计](TREE_SURFACE_AUDIT.md)，不可当作整合后画面的复测证明。

## 东岸扩区与距离管理（2026-11-05）

content/regions 定义经营林区边界、通路端点和距离参数；world/regions 提供空间归属、区域图与独立赐福覆盖。桥的通行状态从原 workshop.upgrades 施工记录派生，没有第二个开桥标志。navigation 先经过区域通路端点，再做有界局部 A*；直接行走与点击移动均使用同一 traversal 桥面和栏边约束。角色、搬运掉落、目的地及选中提示使用同一可行走表面。

scene/streamed-forest 将 24 单位区块中的细节 Mesh 和命中映射按 43/57 单位加载/释放；卸载后不保留动作树和树桩表现。远景经营树与原景观林共用实例批次，只提交当前可见数量，避免用零缩放掩藏实例却照付顶点开销。共享树形几何与材质由原 Resources 缓存持有，区块不能释放它们。林下植被实例和采集命中跟随加载集合，地面搬运物按邻近范围创建表现。

区块的期望范围、准备中的对象和已提交范围分开管理。正式场景把准备任务交给 `frame-work-queue`，每帧桌面最多使用 3 ms、小视口 1.5 ms 的软时间片，另外最多执行 12 个小步骤；一次只准备一棵近景 Mesh，整个区块就绪后才在同帧切换近远树、命中集合及已加载范围。JavaScript 单步不可抢占，统计公开实际超支和最长步骤；该上限不包括主渲染、GPU 上传/编译或玩法模拟，不能解释成整帧硬保证。独立适配器保留同步入口，正式游戏明确传入共享队列。

远景实例采用 ID 到槽位的映射，以尾项交换移除、追加和局部属性更新维护连续提交前缀；倒树和树桩的旧远景当帧撤下。世界替换和销毁取消未提交任务。地被同样压紧矩阵及颜色并同步包围体，稳定帧不重复上传；外出林地的树冠透明度通过批次索引定位。`stats.frameWork` 和 `stats.streaming` 区分任务耗时、步数、超支、取消、准备与提交，不用 RAF 间隔推断 GPU 耗时。范围和验证见 [每帧场景准备预算](scopes/frame-work-budget.md)。

模拟范围独立为 76 单位；离开范围的成长记录保留绝对到期时间，返回时按唯一 GameState.time 有界补算，不补发物产、不删除欠料。当前场景仍共用一片固定的自适应地形与低成本远山、营地道具；本轮未实现无限地形生成、地形纹理流送或跨区常驻物理。将来扩大总地表时沿用相同地表事实和接缝规则。

领域约束、资源归属、浏览器复现与实际检查见 [WORLD_EXPANSION](WORLD_EXPANSION.md)。

开发服务器的 inspect 模式额外提供有界固定步进入口，用同一个 tick 在两次画面之间推进至多 5 秒，供软件 WebGL 环境复核长途搬运。调用期间暂停既有帧调度，结束后按原暂停/隐藏状态恢复，卸载撤销入口；生产构建不安装该控制。没有独立时间源、库存写入或跳过导航的传送。

## 固定观察点与受控回收

`content/camera.ts` 与 `scene/anchored-overlook.ts` 只管理室外导航镜头。默认 yaw -0.13、俯仰 0.24、zoom 0.76、半径 110 保持原值。手动俯仰目标超过 0.38 rad 或 zoom 小于 0.70 时，捕获已呈现的 look target；升高、转向和缩放始终围绕同一个地面中心，不接受空中平移。保留原 0.12–1.15 rad 和 0.48–2.4 zoom 范围。缩远时，原控制器将目标半径平滑扩展至最多 220；投影随画幅放宽，具体规则见 [Rainier 镜头](RAINIER_RENDERING.md#高位广角与克制的焦外)。输入改变目标，逐帧上限为 yaw 0.65 rad/s、俯仰 0.35 rad/s、log zoom 0.55/s、半径 30 世界单位/s；每帧最多计入 0.1 秒，不补跑失焦时间。

键盘、摇杆与点击路线均经过 `prepareForMovement()`。高位发出走动意图后，先回到不高于默认俯仰、不远于默认缩放的步行构图，锚点在降落期间保持不动；随后按最多 30 世界单位/s 接回角色跟随目标。两段都完成后 `groundReady` 才允许角色移动；等待期间不弹出路线节点，也不重算或丢弃路线。已有家具近景可通过抬高/缩远解除聚焦，从真实相机半径起按 30 世界单位/s 退回当前缩放对应的导航半径，投影交接保持连续，整个过程计入 pending；换选目标后恢复自动聚焦。

屋内、场景检视、角色检视借用自己的镜头，室外 rig 暂存而不推进。动作和摆放保留近景取景；新增升降和缩远入口在其占有镜头时不可用。动作需要从高位接管时先请求回收。R/复位走同一受控回收，不改人物、世界状态或存档。暂停时可由唯一 RAF 的 presentation 模式完成相机与准备任务；普通世界/动作动画仍收到 dt=0。

`getCameraPlan()` 暴露真实 `currentCamera`、最终目标 `desiredCamera`、沿相同速度/回收规则预测的 0.1、0.25 和 0.5 秒 `forecastCameras`，以及 mode/owner、锚点、current/desired pose、lift、groundReady 和 advanceScale。预测使用实际 FOV、aspect、near/far、移动端 1.45 倍 zoom 及同一地形净空；被借用的镜头直接保留实际投影，不虚构其未来路径。`setCameraAdvanceScale(0..1)` 缩减高位转向、升高、缩远和半径扩张，回收/复位始终可继续。镜头推进前重新检查新输入对应的预测集合，避免第一步抢跑，也避免连续拖动因反复重置门禁而停住。

`forest-view-plan.ts` 使用原远景几何的完整包围球与每棵树的实际变换，计算当前及短前瞻视锥并集；另保留当前实体阴影视锥和水平水面镜像可见的树，所有边界加 5 世界单位 guard。太阳 shadow camera 在规划前由本帧灯光姿态显式更新。仅压缩远景实例提交集合；树形、材质、冠影场源名单和近处交互细节不变。每批视野任务每步最多处理 8 棵树，通过同一个每帧工作队列执行；新视角更新待处理集合，不重启游标。预测集合准备好才允许继续高位扩张/转向。

实际相机完成后再核对当前画面。地面急转、检视或回收造成当前树缺失时，当帧补交并单独统计 `streaming.immediateViewRepairs`；这部分以及视锥规划本身不计入协作队列的毫秒预算。统计 `forestView` 暴露当前、预测、反射和实体阴影所需数量、就绪状态与当帧补交量。已经可见的场景仍每帧绘制；这里分摊的是实例准备，不能据此声称整个 CPU/GPU 帧有硬上限。

范围及验证状态见[本次相机范围](scopes/anchored-overlook.md)。本功能不改中距离树形、材质、树木 ID、碰撞与资源结算。
