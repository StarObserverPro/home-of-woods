# HOW-WAREHOUSE-TREES-1 实施与验证

2026-10-30；工作分支 `codex/gathering-sources`，基于 PR #3 的 4ed0c0f。没有新 PR、合并或部署。用户确认基础采集可用后，追加仓库、树种关联物产和加工数据预留；范围见 [scope](../../docs/scopes/warehouse-tree-resources.md)。

## 当前行为

- 仓库由按钮或 B 打开，支持全部、木料、林产，展示真实数量、来源和加工方向，Esc 收起。原木仍由 ForestryState.wood 唯一持有，仓库只读派生；枝杈、蘑菇仍用原 inventory。
- 五个固定宿主（两松、两栎、一巨木），共十个独立来源池。松下六簇、栎下七簇围成蘑菇圈，圈径随树的尺寸配置；同圈多个命中共用一次资源量。枝束在对应树下。树脂预留树干挂点，尚未加入其模型或采集。
- 普通资源检查树木当前个体。倒伏使关联物产失效，取消挥斧不清空；换代更新宿主身份、清除旧代资源，幼树不领取成熟资源。正式恢复调度仍未启用。
- 登记“整理枝料→小木料”“晾制蘑菇→干蘑菇”的只读加工数据服务。仓库真实消费查询，注册校验引用、数量、耗时和资源线；配比/耗时未设定，尚未执行加工。

## 检查与实机证据

`check.log`：38 项测试、7 个 GLB/地表来源与结构检查、TypeScript、生产构建通过。新增检查覆盖宿主/圈形/可达性、倒伏/换代、仓库权威余额和加工注册；既有采集、林业、导航及资源测试继续运行。模型批量绘制测试保留了原有共享资源、采空、命中与释放断言，并改为检查实际实例矩阵。

| 实机事项 | 证据 |
| --- | --- |
| 树下落枝 0→3 | [branch-result](branch-result.json) |
| 松圈 0→2、栎圈再到4，同圈仅结算一次 | [松圈](pine-circle-result.json)、[栎圈](oak-circle-result.json)、采前/采后 JPG |
| 场景点中栎圈时解析到 tree-slot-17-11 的同一来源 | [oak-circle-before](oak-circle-before.jpg)、[oak-circle-result](oak-circle-result.json) |
| 仓库分类及加工信息 | [桌面](warehouse-desktop.jpg)、[仓库文本](warehouse-view.txt)、[竖屏](warehouse-mobile.jpg) |
| 移动采集中打开仓库，时间/位置/动作冻结；Esc 后继续完成 | [warehouse-pause](warehouse-pause.json)及栎圈结果 |
| 390×844、320×844、844×390：无横向溢出，按钮至少44 CSS px | mobile-portrait.json、mobile-narrow.json、mobile-landscape.json |
| 原木采伐同步进入仓库，枝杈/蘑菇不变 | forestry-result.json |
| 三轮卸载，库存/来源不刷新，旧 owner、命中和循环清理 | lifecycle-cycles.json |
| 生产包仓库、加工查询及控制台 | production-smoke.json、production-warehouse.jpg |

本轮 38 个资源表现挂点使用原两件 GLB 的四个实例绘制批次，不为每簇复制材质或几何；命中代理不参与绘制。实际资源/GPU/帧时间采样在各快照。测试设备为 Windows / Edge / AMD Radeon 集显 / ANGLE D3D11，seed 104729；手机项是桌面视口/指针仿真，真实手机性能与多指操作仍未验证。保留约1.13 MB主包提示，没有提高预算或声称60fps。

本轮已验证仓库版本的源代码与运行资产绑定 [source-freeze](source-freeze.json)，完整运行时源码及构建配置保存在 [verified-source.zip](verified-source.zip)，静态构建在 [verified-build.zip](verified-build.zip)，各构建文件 hash 见 [verified-build](verified-build.json)。人物支线随后在同一工作区并行接入；本轮没有覆盖这些改动，也没有把后续人物组合版记为通过。人物回接后，历史证据审计默认读取本目录 verified-source.zip；仍可显式设置 HOW_VERIFICATION_SOURCE_ROOT 指向解压后的本轮源码。当前工作区另由 evidence/characters 的冻结和审计负责。前轮 evidence/gathering 的原字节保持不变；前轮未提交源码没有另存完整源归档，其指纹保留为历史标识，旧回执不作为当前版本证明。完整存档、正式恢复、人物采集骨骼动作和加工执行仍属后续。

本轮冻结交付已通过显式解压源码的只读证据审计，结果见 evidence-check.txt（sourceMode 为 explicit frozen source archive）。开发期间的两轮初检受并行人物接入触发的热重载干扰，未计入最终三轮；最终生命周期记录全部来自无热更新的生产构建，库存 3 枝杈 / 2 蘑菇保持不变，旧缓存与命中清零。验收预览只读服务绑定本轮静态构建，不依赖工作区后续修改。
