# 采集物注册与接入

对应用户指定的 v1.0 指导（2026-10-30）、HOW-BASELINE-1.0。实施基于 PR #3 的 `4ed0c0f`，位于本地 `codex/gathering-sources`；当前 main 仍是 `d22ac56`。范围见 [scope](scopes/gathering-sources.md)，前轮证据为 [gathering v1](../evidence/gathering/README.md)；当前仓库与树木物产见 [本轮验证](../evidence/warehouse-tree-resources/README.md)及[范围](scopes/warehouse-tree-resources.md)。

## 同一套注册与采集流程

| 层 / 文件 | 已实现责任 |
| --- | --- |
| content/items、gatherables、assets | 稳定物品/来源定义、产物、资产引用、动作标签、恢复类型与候选数值 |
| world/gathering-layout | 五个固定树木宿主、十个 sourceId；按树种配置蘑菇圈和树下枝束，hostRef 登记宿主与树位，挂点读取统一地表 |
| domain/gathering-registry | 重复 ID、引用、数值、恢复策略、动作、锚点及可达性校验 |
| domain/gathering、inventory、gathering-view | 来源数量/版本/恢复状态、动作、最小库存与候选；向 UI 提供纯数据快照 |
| app/player-actions、runtime | 采集/采伐互斥，合法寻路、同一游戏时间与同步整笔提交 |
| scene/gathering-presentation、interaction-registry | 模型、非阻挡命中代理、稳定来源映射、显隐和注销；不写业务资源 |
| ui/App | 展示名称/原因/产物/数量/动作列表，按钮或 E 发送同一种明确采集意图 |

树上枝杈使用 `branch` / `forage.branch-pile`（保留定义 ID）/ `gather.climb`；蘑菇簇使用 `mushroom` / `forage.mushroom-cluster` / `gather.pluck`。两类共用上述流程，同一蘑菇圈的多个簇共用一个来源池。落枝已改为对应树木的独立物产池，正式季度恢复调度尚未接入。

## 状态与一次结算

点选只查看；明确发起后，远处先寻找合法站位和路径，到达后复核目标、来源版本、动作占用、距离及整段地表/碰撞。不能隔建筑或河道采集。移动、取消、切换目标和场景销毁终止未提交动作。暂停和隐藏冻结同一游戏时间。

候选生成不变更资源；app 同步重新校验，再一次写入来源扣减、库存增加、完成动作和结算记录。旧候选、旧目标、重复提交和表现重读不发物品。`GameState.inventory` 统一登记物产与原木，按 `itemId + qualityId` 堆叠；新产物明确为普通，旧会话数据为未分级，林业账本只管额度。没有轻料转结构料的规则。库存格式、未知目录隔离及旧余额适配见 [物品数据演进](ITEM_DATA_EVOLUTION.md)。

`GatherActionView` 包含 actionId / actorId / sourceId / motionTag / 世界坐标 targetAnchor / phase / progress。阶段为 approaching、performing、completed、cancelled。人物线只消费这些语义，不写资源，不依赖骨骼名。当前动作耗时为 0，到达后直接完成、进度为 1；接口测试使用独立的 2 秒配置验证进行中进度。人物模型、骨骼、弯腰/伸手动画未接入。

## 恢复契约与参数

当前完整世界存档会一起保存来源、宿主、库存和动作；开始采集时冻结产物与耗时，读档恢复进行中动作或已完成标记，不补满资源池、不再次发资源。类别、类型与通用去处通过目录登记，HUD 按类型汇总，具体内容和保护机制见 [世界存档与物品目录](WORLD_SAVE.md)。

- `period-refill`：输入单调周期索引，同周期和旧周期幂等，新周期补至配置容量，跨多周期不叠加。
- `after-depletion`：最后一份采空才记录游戏时间，各点独立；到期恢复容量并清除等待，部分采集不重置计时。
- `regenerationCandidate` 接受受控时间/周期和配置。生产 `REGENERATION_CONFIG` 为空，也没有临时补货计时器；采空后保持耗尽，注册、加载、重入和换外观不补货。
- 首批候选：每来源初始 1 次；枝杈每次 3 份、蘑菇每次 2 份；范围 2.4、耗时 0。恢复周期/时长与正式经济未定，测试容量和等待值不是正式参数。

## 素材、生命周期和后续接线

重新核对 Kenney Nature Kit 2.1 两个具体 GLB、随包 CC0 与当前官方资产页后，只采用 campfire_logs 和 mushroom_tanGroup。`tools/build-gathering-assets.mjs` 保留低面拓扑，统一尺寸、根节点和非金属材质。源部件在 sources/kenney，产物在 public/assets/gathering，hash 与入口沿用既有 manifest 和 [ASSET_REGISTER](ASSET_REGISTER.md)。

同类实例共享几何/材质；耗尽隐藏模型，命中代理保留状态查询。卸载注销表现与命中，缓存 owner 释放资源，来源/库存保留在唯一 GameState。后续人物表现、正式恢复调度、用途与整体存档分别接入，不另建背包或时钟。已增加只读加工数据服务与仓库查询；尚无加工执行、持久存档、完整日历、修屋、交易或祈愿，不宣称 M1/M2 完成。尚未开新 PR、合并或部署。

## 仓库、树种物产与加工数据（2026-10-30 追加）

仓库通过按钮或 B 打开，可按木料/林产分类，展示数量、来源与加工方向；Esc 关闭。domain/warehouse-view 从原木权威余额和 inventory 派生视图，UI 不另存一份仓库余额。面板使用同一运行时暂停/输入模式；打开后冻结游戏时间和移动，关闭后继续。

content/tree-resources 提供当前虚构松/栎树的玩法与美术配置：松圈 6 簇、栎圈 7 簇，半径随宿主体量变化，每个地面点都消费共享高程。枝束在对应树下；树脂预留树干挂点和树种资格，未增加树脂模型或采集。五个宿主为两松、两栎及守林巨木，合计十个资源池、38 个表现挂点；通过四个实例绘制批次共享原有两件 GLB。

普通来源保留稳定 sourceId 和 slotId，当前个体身份保存在来源状态。采伐倒伏使其关联物产失效；取消采伐不清空物产；树木换代清空旧代次资源并更新身份，幼树不会获得成熟树库存。正式恢复仍未启用，场景重建不补货。巨木资源绑定永久地标，保护状态不因采集改变。

content/processing 与 domain/processing 登记并查询整理枝料、晾制蘑菇两条加工方向；输入/输出引用、工作条件、数量和耗时有校验。当前配比/耗时为明确未配置值，仓库展示后续方向，未执行制作。注册拒绝重复/悬空物品、无效参数及小型木料直接生成结构木。后续加工执行继续使用唯一库存和整笔事务。

当前动作时长、独立碎柴池、木料规格与旧存档迁移以 [五动作接入说明](ACTION_WOOD_INTEGRATION.md) 为准。
