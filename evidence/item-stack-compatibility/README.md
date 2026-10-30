# 物品身份 品质堆叠与兼容检查

日期：2026-10-30。版本：HOW-ITEM-STACKS-1。实现位于本地 `codex/gathering-sources` 未提交工作区，基础提交为 `4ed0c0f4d047540fb50095ef11bf4cc4fc042529`；没有新 PR、合并或部署。范围见 [scope](../../docs/scopes/item-stack-compatibility.md)，数据契约见 [物品演进](../../docs/ITEM_DATA_EVOLUTION.md)。

## 已实现

- 物品 ID 保持稳定，目录明确材料、形态、默认品质及活跃/计划/退役状态；本轮不增加菌种或木种。
- 库存以 `itemId + qualityId` 独立堆叠，普通、精品、未分级不互相合并；原木、枝杈与蘑菇共用唯一库存，林业账本继续持有额度。
- 整笔候选在修改前校验所有投入，重复输入不能超额消费，产出不能为同笔投入垫资；采集拒绝过期候选，采伐保持一次结算。
- 库存切片具有 schemaVersion，运行时 revision 不写入切片。JSON 加载对目录未知项保留完整身份与数量；未来结构、额外字段、非法数量及重复堆叠返回 protected，并保留原始输入。
- 场景进入前整笔适配旧会话：旧泛品保留原 ID 并标为未分级，旧林业原木余额转入库存后移除；冲突或失败不改变会话、额度、树木或资源池。
- 仓库显示品质与待识别项；未知物品/品质不提供加工方向，库存事务拒绝使用它们。恢复定义后，原有库存重新识别。

## 实际检查

`npm.cmd run check` 通过：11 个注册 GLB 与地表资源检查、52 项行为/几何/生命周期测试、TypeScript 和 Vite 生产构建。新增 11 项物品兼容测试在 [item-compatibility.test.ts](../../tests/item-compatibility.test.ts)，其余采集、采伐与角色测试保留原语义并改查唯一库存。[check.log](check.log) 保留实际输出；Vite 的大包提示仍存在，未调整预算。

实机开发构建用正常入口采得 2 份普通蘑菇，卸载重入一次后仍为 2 份；Esc 关闭、B 打开和无控制台错误已检查。冻结的生产构建另用正常入口采得 3 份普通枝杈，仓库与 HUD 一致，脚本均来自编译后的 `/assets/`，无开发客户端或控制台错误，见 [生产检查](production-smoke.json)与[生产截图](production-desktop.jpg)。

[独立检查页](review.html) 使用同一库存加载器、目录、仓库投影和 UI，展示示例库存：普通蘑菇 6、精品 2、未分级 4、原木 5、未知物品 7、未知品质枝杈 3，共 27 份。JSON 往返后恢复示例定义，仍为 27 份；示例数据不进入游戏进度。通过开发服务器打开 `http://127.0.0.1:4202/evidence/item-stack-compatibility/review.html`，可重复操作。该页面不属于生产构建。

| 实际视口 | 检查内容 | 截图 |
| --- | --- | --- |
| 1280×720 | 独立品质堆叠、详情、滚动 | [桌面](quality-desktop.jpg) |
| 390×844 | 普通/精品/未分级分别显示 | [手机竖屏](quality-mobile.jpg)、[待识别](unknown-mobile.jpg) |
| 320×844 | 品质与数量不重叠，分类不换行 | [窄屏](quality-narrow.jpg)、[实机仓库](game-mobile.jpg) |
| 844×390 | 横屏仓库与纵向滚动 | [横屏](quality-landscape.jpg) |

四种视口均无横向溢出，仓库按钮触控框不小于 44×44；实际 DOM 尺寸与操作结果见 [ui-checks.json](ui-checks.json)。手机为桌面浏览器视口验证，未替代真实手机设备检查。

## 证据绑定

本轮运行时指纹为 `d4fd629c4c7a25c7b6215c46333832ab4e8b5f31ebfbe0093530585270c61293`，文件清单见 [source-freeze.json](source-freeze.json)。[verified-source.zip](verified-source.zip) 保存受测运行时、测试源码与本轮检查页；[verified-build.zip](verified-build.zip) 保存该源码构建的生产包。两者不包含 node_modules、源美术或其他阶段的历史证据；来源与构建哈希、环境和检查摘要见 [verified-build.json](verified-build.json)。

`npm.cmd run verify:evidence` 保留前轮冻结证据校验，并追加本轮 `tools/audit-item-evidence.mjs`：复核源归档、构建归档、日志、截图哈希、视口尺寸和实际记录。旧 R4、采集、仓库、角色回执没有改写，继续绑定各自版本；本轮当前行为由 `npm test` 检查，后续源码变更须重新执行适用测试。

冻结生产预览：`http://127.0.0.1:4203/`，由独立进程直接读取 verified-build.zip，后续重建 dist 不改变此预览。若本地预览进程停止，可解压生产包后使用静态服务器查看。

## 后续边界

本轮提供库存切片编解码和旧会话适配，没有单独自动保存库存。完整世界存档须由唯一 app 写入者一起恢复库存、时间、额度、树木、资源池与动作，并验证跨切片引用；M1-07 尚未完成。具体菌种、木种、加工执行、加工定量守恒和耗时任务恢复按后续功能接入。
