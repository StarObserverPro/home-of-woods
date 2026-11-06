# 独立道具、去向与宿主关系（数据契约）

2026-11-05 当前可玩补充：松果门铃、会客长凳/备餐边桌、枝扫帚和手作木碗已随营地生活回接本地主体；Z57/Z83 与 F100 只在已评审代表载体上开放，合同见 [CAMP_LIFE_INTEGRATION](CAMP_LIFE_INTEGRATION.md)。本文的初版注册与计划槽位设计保留；人物当前穿戴状态另见 [玩家衣柜](PLAYER_WARDROBE.md)。

本文件承接「住」类词条筛选支线对**独立道具的去向与关系**的共识，维护注册及唯一归属边界；当前已开放的代表用途以上方接入合同为准，仍在筛选的词条不因注册而自动成为效果。

## 先判断道具是什么，再决定它去哪里

- **独立 Item**：可以独立制作、获得、持有、安装、拆卸或换位，且稀有度、词条和效果属于它自己。松果门铃、纸条箱、铜壶等适合作为这种道具的候选类型。它们只有**一个**实例身份；装到营地后不再同时出现在可取用库存里。
- **原料/可堆叠物**：木料、帆布卷、五金包等仍按 `inventory.stacks` 的规格、数量及运输位置管理；只作材料，不因可能成为附属品而自动拥有独立实例。
- **宿主设施的固定改造**：修屋顶、绷绳、固定支架等以 `workshop.upgrades` 记录宿主结构的变化，未必是可拆卸的独立道具。已上线的 `workshop.mounted['camp-fire:top']` 是早期**固定部件/可切换外装**状态，并不等于独立 Item 的物品归属。
- **制作中的 Assembly**：按图纸判断几何合法性，完工后写入实例的简化 `geometry`；不是永久的散件数据库。把**已经做好的独立道具**挂到门口/锅架属于 Mounting，与制作中的 Assembly 不同。
- **具体效果与词条**：物品的 `traits`、`rarityId`、未来 `effect` 配置都属于实例；宿主不复制它们，也不因挂了一个东西而永久修改自身等级。宿主只提供槽位、锚点、环境/事件上下文，例如来客、夜间、篝火点燃。

## 静态注册与当前数据位置

| 注册/状态 | 负责的事实 | 当前代码 |
| --- | --- | --- |
| 堆叠物定义 | 木料、林产、材料与类型 | `content/items.ts` → `ITEM_CATALOG.items` |
| 独立成品定义 | 名称、用途、可制作图纸引用、是否允许挂接、表现资源引用 | `content/owned-item-definitions.ts` → `ITEM_CATALOG.ownedItems` |
| 宿主槽位 | 宿主设施/独立宿主物品、可用槽种类、锚点 ID、事件上下文及依赖 | `content/item-attachment-slots.ts` |
| 道具实例 | 身份、图纸来源、等级、词条、可选几何参数、当前归属 | `inventory.instances[]` |
| 安装关系 | **只在道具实例上**记录 `location:{kind:'mounted',hostId,slotId}` | `domain/owned-items.ts`；纯关系验证在 `domain/item-attachment-contract.ts`，装卸事务在 `domain/item-attachments.ts` |
| 既有设施升级 | 宿主修缮、固定模块进度、历史耗材账本 | `workshop.upgrades` |
| 既有可换外装 | `camp-fire:top` 固定支架/附件的旧逻辑 | `workshop.mounted`；暂无自动改写 |

`ITEM_CATALOG` 将两类定义纳入同一个 ID 命名空间；堆叠材料与独立实例仍保留各自适用的验证/事务规则。这不是第二份仓库、存档或者独立道具所有权表。

## 安装和拆卸的唯一事实

- 独立道具在 `inventory.instances` 中仅存在一份；`mounted` 是 `ItemLocation` 的一种互斥状态，与 `inventory`、`world` 同级。操作通过同一库存事务返回新候选状态，不用复制到 `Host.attachments[]`。
- 安装只接受已注册、当前开放的独立道具与开放槽位，确认物品允许的 `mountKinds`、宿主种类、空槽和必要的前置结构。固定宿主可用 `cabin`、`tent`、`camp-fire` 之类稳定 ID；可移动物品作为宿主时，`hostId` 必须指向另一条真实实例，槽位定义说明允许的宿主物品类型。
- 同一 `(hostId,slotId)` 只能被一件物品占用；不能挂自己身上、形成循环、引用不存在的物品宿主。静态宿主 ID 与可移动实例 ID 的性质由槽位注册决定。
- 拆卸把同一个实例归还库存，保持 `instanceId`、`definitionId`、`blueprintId`、`rarityId`、`traits`、`geometry` 等全部字段。安装/卸载仅替换位置核心键；未知扩展元数据保留，不能留下过期 `hostId/slotId`。
- `mountedItemSources()` 返回安装道具自身的 ID、词条、等级和宿主提供的触发上下文，未来由效果消费层依据道具词条判断；它**不向宿主写入效果**，也不自动实施词条。
- 未知普通实例、未知附加属性照旧往返。未知安装槽会导致保护存档，不擅自当作库存位置或空槽；未知独立物品即使位置可验证，也不允许当前客户端创建新的安装动作。

独立道具的去向与它的互动能力是两层不同的事实。行类新增的旅行伞、帽子、望远镜、口哨、旅行毯与背包在同一个 `ITEM_CATALOG.ownedItems` 下作为 **planned 本体**，其基础操作、词条附加动作和局部视觉运动由 [行类交互契约](ITEM_BEHAVIORS.md) 分开注册。安装在宿主上只让道具获得合法环境上下文，不能替代本体用途，也不能把实例词条复制到宿主。当前不新增任何可执行的旅行装备操作。

## 人物作为宿主的计划槽位

角色也是一种**宿主**，但并不是另一份独立库存。计划中的 `player` 宿主提供 headwear、upper-body、lower-body、footwear、back-gear 和左右手 hand-gear 槽，全部保持 `planned`；`anchorId` 是未来场景装配器使用的语义 ID，不代表当前已导出实际换装骨架。已有旅行帽与旅行背包只增加了允许的挂接种类，本体、穿戴动作和携带容量加成都未开放。

穿戴仍使用独立实例的唯一所有权：`inventory.instances[].location={kind:'mounted',hostId:'player',slotId:'player:headwear'}`。同一槽只能安装一个实例，拆卸保留身份、词条、稀有度及未知字段；角色不另存装备副本，也不能把游戏词条与外观资源选项混为一谈。装备真正产生容量、保暖等收益时，必须由业务服务读取已穿戴实例和对应效果，而不是从 `mounted` 这一状态直接推导收益。

外观施工仍待选型。当前 KayKit 原始网格的头、躯干、四肢可独立加工，但本项目的 `tools/build-characters.py` 为简化材质与批处理已把服装与身体网格合并。保留旧资产、重导出分区网格，或换用另一套兼容骨架的开放模型，都不改变这份装备归属协议。动作实现时必须使普通角色动画和 `createActor()` 程序化动作共用一份穿戴状态，避免采集或祈愿时装备消失；背包等负重视觉标签并不等于玩家已经获得可装备背包。

参考来源（只研究合法可复用的技术与资源；不得把公开但无明确授权的原创模型视为 CC0）：

- KayKit 官方 CC0 角色资产：<https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0>
- SketchpunkLabs 的 CC0 KayKit Three.js 角色/挂点演示：<https://github.com/sketchpunklabs/kaykit_char>
- Quaternius CC0 模块化服装与基础人物：<https://quaternius.com/packs/modularcharacteroutfitsfantasy.html>、<https://quaternius.com/packs/universalbasecharacters.html>
- M3 CharacterStudio 的 MIT 换装/服装遮挡管理参考：<https://github.com/M3-org/CharacterStudio>
- NoLimitNexus 同 KayKit 骨架的模块化实验（**当前未核实其原创代码和模型再利用许可，只作架构参考**）：<https://github.com/NoLimitNexus/game-models>

## 当前示例与未施工边界

现有独立实例已包括木墩、普通松果门铃、长凳/边桌、枝扫帚和手作木碗。`accessory.pinecone-doorbell` 与 `cabin:entry-hanging` 已开放真实制作、安装、响铃和拆回；纸条箱、铜壶及其未开放槽位仍为 **planned**，不能绕过图纸、材料与宿主前置。

`cabin:entry-hanging` 是当前门铃的实际挂点；`cabin:message-hook` 为纸条箱类；`camp-fire:pot-hanger` 只有在 `camp-fire:hook` 制作且处于 `camp-fire:top` 活动状态时才允许挂壶。吊钩不是铜壶，拥有吊钩不自动赠送铜壶；切换掉有锅的吊钩前，应先卸下锅或在同一事务里进行安全迁移，绝不能留下悬空物品。铜壶等计划物件的条件仍保留在挂接环境合同中；当前可玩工坊只接入已开放的门铃等代表用途。

门铃已有近身挂接按钮、真实锚点和原实例装卸，家具/扫帚已有摆收；锅具物理、其他计划物件的行为和已建固定外装向独立实例的转换仍未开放。早期帐门风铃仍沿旧升级账本运行，未来若改成可携带/可换位的独立道具，应通过一次明确的迁移，避免同时留下升级账本物品和独立实例，不能重复发放。

## 存档与版本边界

安装归属引入时，库存核心由 **5 → 6**、世界规则由 **6 → 7**；当前主体沿用规则 8 / 库存 6，版本与读取边界以 [WORLD_SAVE](WORLD_SAVE.md) 为准。旧版有效实例位置继续读取，旧档迁入当前新规则；如记录声称旧版本、却已经包含新的 `mounted` 位置，属于语义冲突，必须保护而不是猜测。旧客户端面对新规则应保护整个记录，不做降级写回。

该变化不修改材料堆叠量、运输位置、现有 `Woodcraft` 散件存档、图纸和品质判定，不增加第二个 `localStorage` 或独立世界保存器。

## 测试

`tests/item-attachments.test.ts` 检查独立定义、计划态禁止安装、装卸保留属性、互斥槽位、错误宿主、缺失引用、循环关系、恶意伪装旧版、独立库存/世界存档往返。正式接入视觉与交互时，应再补场景锚点、远近距离、实际拖拽与安装效果的浏览器验证，不能把当前数据层测试当作可玩验收。
