# 运行时、数据与资源管理

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
| src/ui/App.tsx | 读取快照并发意图；持有同一会话状态引用供重入，不另存余额或复制玩法规则 |

当前已有现有世界的 IndexedDB 存档与事务备份；完整日历、通用制作/交易/建筑事务模块及在线服务尚未实现。下面涉及这些功能的类型、service 与存档键是后续实现契约，不应作为已有接口调用。实际有限林业合同见 [forestry-r4](forestry-r4.md)，参数见 [PARAMETERS](../PARAMETERS.md)，回接状态见 [scope](scopes/m0-walkable-valley.md)。

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

存档统一包含 schemaVersion、布局版本和所有玩法切片，独立键 home-of-woods-save-v1。写入前做全状态校验；失败保留上一份有效数据，损坏/未知版本先保留原字节再报告，不擅自覆盖新档。库存与额度不得分别恢复。

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

林业完成在同步步骤中结算原木、已用点数、释放预留和补生时间；之后表现倾倒、树桩及倒伏源树短暂停留。倒伏源树不再参与拾取，树桩沿用原 slotId；新个体换代，不因切换表现而改写奖励。云、水和动作表现都借用同一应用循环，减少动态效果不会创建另一时钟。

## 时间与生命周期

主循环顺序：输入意图 → domain 固定步长/到期事项 → 快照同步 → 视觉更新 → render。玩法不依赖帧率；大幅休息按到期时间和稳定次序推进，不靠海量渲染帧补算。

页面隐藏、显式暂停与图形上下文丢失时停止玩法和渲染；恢复重置帧时间基线。无离线补收益。普通面板的暂停行为由统一模式规定，组件不能各自启停时间。

start/resume 不叠加帧链；pause 取消待执行帧；destroy 幂等且销毁后不可复活。异步加载返回时检查生命周期，离场的资源应归还而非重新挂回。道具更新、输入、ResizeObserver、命中项、渲染目标与资源引用在卸载时清理。

## 地形、树位与导入场景

地面每处只有一份基础表面事实；道路、河岸、地表材质、角色落地和建造查询共用。水体是显式的独立水层，不以额外地面贴片修补缝隙。普通实体根位置来自 world，模型在根下使用局部坐标。

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
