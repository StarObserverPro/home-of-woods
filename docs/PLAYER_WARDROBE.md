# 玩家衣柜基础：模型、穿戴与候选版型

2026-11-04 · 分支 `feat/starter-wardrobe-foundation` · 本文件记录此分支实现的基础能力和没有实现的资产工作，不作为美术最终验收。

## 目标与美术边界

服装是《森林之家》的生活装备，不是战斗职业装。优先森林劳作、休闲、旅行、轻猎装、隐匿感较弱的游侠装；保留短披肩、风衣、小型挎包、工作围裙。排除板甲、巨型肩甲、法师长袍、尖锐魔幻装备和全身硬质盔甲。稀有度属于物品本身，和词条数无关，不靠臃肿外形表现高级；配色词条同类至多一个，组合词条效果留到下一阶段接线。

## 第一阶段：已经登记的穿戴合同

- 角色依旧使用现有 KayKit Adventurers 2.0 Rogue 修整版，以及 `Idle_A / Walking_A / PickUp / Melee_2H_Attack_* / Waving` 和动作分支；不替换角色、不改现有 23 骨、骨骼克隆和工具接触止点。
- 8 个独立槽位：`player:top` 上衣、`player:legs` 裤装、`player:feet` 鞋靴、`player:head` 帽子、`player:back` 背负、`player:hands` 手套、`player:waist` 腰带、`player:neck` 领巾。可留空；发型和胡须属于下一阶段外观自定义，不作为发放装备的掉落槽。
- `player` 是既有 attachment 注册中的 `fixture` host；所有新手物品是 `inventory.instances` 中唯一的 owned item，通过 `location.kind='mounted'` 挂到 `hostId='player'`。不会在 `player.equipment` 再保存副本；这样沿用同一套库存 revision、保存校验、物品品级和词条扩展字段。
- `changeWardrobe` 从背包穿上、卸下、先退下旧件再装备新件，重用现成 `mountIndependentItem / unmountIndependentItem`；无材料成本、无动画耗时、无战斗数值。一次换装只形成最终库存更新，失败不修改原库存。随身/仓库现有入口新增「穿戴」页，可在其中查看 8 槽及可用替换物。
- 在运行时真正创建新世界时由 `createStarterState` 初始化 8 件 `common`、空词条的新手装。它们是开局赠予，`blueprint.starter-outfit` 只是来源标识，**没有对应可制作的合成配方，也没有出售或刷新的入口**。现阶段仅保证新游戏可穿戴；旧存档若不适配可直接重开，无需另设补发与跨版本迁移。
- 角色身上的 **帽子/背包/手套/领巾** 通过自制轻量低多边形几何附加到 KayKit 的 head/chest/handslot 骨；同时适用于常态人物与程序化动作替身。卸下后立即隐藏；所有几何/材质仍归现有 `Resources` 托管。这四件是简化视觉占位件，不是已通过 Blender 人工审模的正式服装网格。
- 现有角色 `player.glb` 是 6418 顶点、7574 三角、**单蒙皮网格**，头发/衣服/裤子/鞋靴等仍烘焙在一个蒙皮网格和贴图中。**上衣、裤装、鞋和腰带目前可穿脱的是物品记录；对应视觉底层仍保留，不能认为已经做到了真正裸身/换版型**。不要把本阶段称为“完整三维自由换装”。

## 设计版型库（待适配，不等于模型资产）

`src/content/wardrobe.ts` 统一登记 78 种目标造型：上衣 20、裤装 20、鞋靴 8、帽子 9、背负 6、手套 5、腰带 5、领巾 5。每条当前状态均为 `design-only`，`meshAssetId=null`；颜色替换不算新增版型，也没有伪造下载数量。

后续真正接入时，一件模型须有：原始素材/作者/具体许可证与随包文件/源链接/修改来源/hash/原格式/目标 GLB/骨架或骨权重适配/遮蔽身体区域/三角数/装备槽位/玩家动画检验，以及近景截图。素材库登记和可运行资产要分成 `design-only → source-confirmed → rigged → inspected → active` 五档，不能越级。

## 候选来源、可取部分与许可

| 来源 | 适合取用/学习的地方 | 接入结论 |
|---|---|---|
| [KayKit Adventurers 2.0](https://kaylousberg.itch.io/kaykit-adventurers) | 已用 Rogue 的比例、骨架、纹理与动作；配件风格统一 | 项目已持有免费包与 CC0 随附许可；主角色继续沿用 |
| [Quaternius Modular Character Outfits Fantasy](https://quaternius.com/packs/modularcharacteroutfitsfantasy.html) | 官方标 CC0，12 套/62 模块；只筛 peasant / ranger / 实用轻装部分 | 原角色与 KayKit 不同骨架；须 Blender 修改拓扑、重蒙皮、遮蔽基础身体，不能直接宣称可穿 |
| [Quaternius Ultimate Modular Characters](https://quaternius.com/packs/ultimatemodularcharacters.html) | 男性角色轻装/生活装参考 | 部件改型需骨架适配；未引入二进制素材 |
| [Quaternius Ultimate Modular Women](https://quaternius.com/packs/ultimatemodularwomen.html) | 女性角色轻装/生活装参考，为将来多样人物预留 | 同上 |
| [Kenney Mini Characters](https://kenney.nl/assets/mini-characters) | CC0，明亮的低多边形比例、头部配饰 | 不是 KayKit 现成换装件 |
| [NoLimitNexus/game-models](https://github.com/NoLimitNexus/game-models) | KayKit Rig_Medium + 独立贴身 base body / 19 个 modular GLB / region hiding；展示了可行架构 | 仓库未声明自制模型的明确开源许可证，**只参考技术组织和代码设计思路，不复制其原创网格** |

本 PR 没有将外部 CC0 包大批复制到 `public/`；只有本仓库自制的骨骼附加基本几何。正式素材接入必须按 `docs/ASSET_PIPELINE.md`、`docs/ASSET_REGISTER.md` 做准入验证。

## 第二阶段：需解决的模型真正模块化

在 Blender 对已修整的 Rogue 重建中性底身与可隐藏身体区域 `head/torso/upper-arms/lower-arms/upper-legs/lower-legs/feet/hands`；**不要简单整块隐藏上臂造成短袖下手臂缺失**。以 KayKit 23 骨和现有六动作保持骨权重、比例和网格骨骼索引兼容；新衣既可独立 SkinnedMesh 也可按批导出；运行时同一套骨架驱动所有附件，装备 slot 只负责按 manifest 组合/隐藏。头发应放进独立外观模块，可选短发/长发/马尾/发髻等并处理帽子遮挡，染色不另算版型。

第一批只需一件真正可剥离的上衣+裤子+鞋，配合现有四个骨挂附件组成视觉完整的八槽新手装，然后跑 `idle/walk/gather/chop/pray`、近景旋转、玩家与 NPC 同屏、手机视口和载入/卸载。验证通过再批量复制到二十套版型；未来各等级的词条仍依附物品实例而不是模型或衣柜槽位。

## 验收与暂缓

当前开发检查：专测八槽穿脱、不复制物品、模型显示和构建；旧存档历史兼容与全量证据回放不阻挡此模块。详见 `tests/wardrobe.test.ts`。尚未完成：Blender 服装独立源、外部模型二进制采纳、真人审美筛选、手机 GPU 与视觉防穿模验证、装备提升容量或属性、发型自由更换、批量 78 个独立 GLB。未经审验不得声称已完成。
