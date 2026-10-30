# 完整世界存档与物品类型验证

日期：2026-10-30。版本 HOW-WORLD-SAVE-1。实现位于本地 `codex/gathering-sources` 未提交工作区，基础提交 `4ed0c0f4d047540fb50095ef11bf4cc4fc042529`；没有新 PR、合并或部署。[范围](../../docs/scopes/world-save-and-item-types.md)与[结构及使用说明](../../docs/WORLD_SAVE.md)分别记录授权、数据关系、存档协议和后续边界。

## 已实现

当前 GameState 的库存、林业额度、树木代次、资源池、动作、游戏时间、位置、路径和探索状态整体保存/恢复。主档与上一份有效备份由 IndexedDB 单笔事务提交，并比较原记录以防跨页面覆盖；读取校验版本、SHA-256 和跨切片引用。损坏、未来结构或读取失败不会变成一个可写的新世界。

进行中动作保存稳定身份及启动时产物；采集同时冻结耗时。读档先暂停，继续后才推进；已结算倒树/树桩不再发资源。控制器保留不可变检查点，读取返回独立副本；场景重入仍复用 App 的唯一实时状态，不把存档缓存作为第二套可变世界。

物品目录已登记类别、类型、材质、通用去处，并校验引用和资源线。新品种按类型继承用途，HUD 按类型汇总；目录不重复写入玩家存档。没有新增具体菌种、木种、加工或交易执行。

## 工程与行为检查

`npm.cmd run check` 通过：11 个注册 GLB 与地表资源检查、70 项测试、TypeScript 和生产构建。输出见 [check.log](check.log)。新增 18 项测试位于 [world-save.test.ts](../../tests/world-save.test.ts)和[item-taxonomy.test.ts](../../tests/item-taxonomy.test.ts)，覆盖完整往返、启动时快照、动作各阶段、结构/摘要/引用破坏、旧库存迁移、并发、存储失败、独立读取副本和类型扩展。

Vite 仍提示既有的大包警告；没有调整预算或跳过检查。完整年度经济、建筑/修屋及加工仍属后续功能，当前保存覆盖现有世界，不把本轮记为整个 M1 已完成。

## 实机保存与恢复

正常采集得到 3 份普通枝料后，选择经营树开始挥斧，在动作中途暂停保存：游戏时间 `372.09999999999025`、开始时间 `370.68333333332487`、预留 5 点、已用 0 点、原木 0。刷新后这些字段和全部树木/来源/路径状态逐项一致；仅库存的临时事务 revision 在加载时重建。

继续后同一动作只获得 5 份原木，已用额度变为 5、预留回到 0。树桩阶段连续刷新两次，完整世界保持一致：枝料 3、原木 5、已结算采伐 ID 一条，宿主蘑菇池为 0，未补满。协议状态见：

- [挥斧保存前](chop-before-reload.json)、[挥斧恢复后](chop-after-reload.json)、[截图](chop-restored.jpg)。
- [树桩保存前](felled-before-reload.json)、[第一次刷新](felled-reload-1.json)、[第二次刷新](felled-reload-2.json)。
- [最终生产切换前](final-before-production.json)、[冻结生产包读取结果](production-smoke.json)：同一来源切换后，游戏时间 `459.0999999999111` 与所有世界字段仍一致，原木 5、枝料 3、已用额度 5，控制台无新错误，脚本仅来自编译后的 `/assets/`。

最终界面另记录 [生产菜单](production-menu.jpg)、[HUD](game-hud.jpg)与[类型用途](warehouse-types.jpg)。原木详情显示“原木 / 未细分木材 / 结构木作”，用途明确为后续开放。

## 真实 IndexedDB 检查

[检查页](review.html) 使用独立的 `how-world-save-test-*` 数据库及合成世界，不读写正式游戏主档。它运行实际浏览器的 IDB 适配器与 SaveControls，验证：

1. 中止一次已安排主档/备份写入的事务后，两条记录原样保留。
2. 两个控制器竞争同一检查点，只有一个成功，另一方进入 conflict，库存仍为 3 份枝料、来源已耗尽。
3. 损坏主档与有效备份并存时，普通保存禁用，自动/手动保存不改原记录；导出返回原始损坏文本。
4. 明确点击有效副本恢复后，回到备份中的零时刻世界，保存重新可用，未夹带临时世界的资源。

结果见 [保护](database-protection.json)、[恢复](database-recovery.json)、[保护截图](protected-save.jpg)与[恢复截图](recovered-save.jpg)。实际点击“导出主档”所得文件已核对为原文 `{broken-world-save`，检查副本为 [exported-corrupt.json](exported-corrupt.json)；这是有意损坏的测试文件。

额外布局检查页曾真实触发游戏主页面的竞争保护：保存被禁用，重新读取后恢复正常，见 [跨页面保护](real-page-conflict.json)及[截图](real-page-conflict.jpg)。

开发复核入口：运行 `npm.cmd run dev` 后访问 `http://127.0.0.1:5173/evidence/world-save/review.html`。检查页不包含在生产包中。

## 界面与归档

实际游戏菜单在 356×535 窄视口、保护控件在 1280×720 桌面视口检查，无横向溢出，操作按钮均至少 44×44，见 [layout-checks.json](layout-checks.json)。菜单允许纵向滚动；手机部分是浏览器视口检查，未替代真实手机设备测试。物品阶段的四种视口证据保留原版本，不用于冒充本轮新菜单检查。

最终运行时指纹 `0227c1d8b43c33f20c72303249e9f5cfef0f29044a5bd25eb0ac092db9f56fd0`，清单见 [source-freeze.json](source-freeze.json)。[verified-source.zip](verified-source.zip) 保留运行时、测试和检查页；[verified-build.zip](verified-build.zip) 保留生产包；哈希、环境与证据文件清单见 [verified-build.json](verified-build.json)。动作/事务记录按 v1 协议核对，最终控件、不可变读取缓存及生产加载另行复核。

`npm.cmd run verify:evidence` 保留既有阶段归档校验，并追加 `tools/audit-world-save-evidence.mjs` 检查本轮快照一致性、事务结果、导出原文、源码/生产包和证据哈希；旧阶段回执不充当本轮行为证明。

冻结预览为 `http://127.0.0.1:4204/`，从生产归档独立提供，同一来源保留上述检查世界。存档留在当前浏览器来源的 IndexedDB；不同来源的目录与存档不会自动搬移。
