# HOW-CHARACTERS-1：角色与持斧止点回接

2026-10-30，本地 `codex/gathering-sources`，基于 PR #3 的 `4ed0c0f`，保留同工作区的采集、仓库与树木物产改动。用户明确授权修正止点后接回。当前已集成并完成本轮检查，未开新 PR、合并或部署。范围见 [scope](../../docs/scopes/character-contact-intake.md)。

本轮已验证运行时指纹（不包含随后并行进行的库存品质/兼容改动）：`158d8428c96e4f979a934c680c9f34f91d213d0926e9c0ecdd4ab7691853e782`，逐文件见 [source-freeze](source-freeze.json)。冻结包括 src、public 与构建配置；早期 R4、采集、仓库回执保留原字节，仓库历史源校验读取其原 verified-source.zip，角色完整源归档于 verified-source.zip，静态构建归档于 verified-build.zip，hash 见 verified-build.json。audit-character-evidence 校验完整冻结归档及工作区角色入口；库存兼容支线的后续组合版另行验证。

## 可见结果与入口

生产预览：http://127.0.0.1:4196/?inspect=1 。从新会话出生点展开“运行检查”，选择“检视横砍止点”或“检视竖劈止点”，再收起面板看近景；“结束动作检视”或 Esc 恢复模拟与原镜头。诊断面板展开时会覆盖左侧目标卡，实际采伐应收起后操作。林中近景可能被邻树遮挡，固定出生点截图用于清楚展示角色。

黑发/黑眉、柔化眉眼和高光、苔绿玩家与赭红访客已进入主体。玩家使用独立 23 骨骨架；访客只叠加头和手臂轨道。两只掌槽共同确定同一刚性斧柄，横砍读取实际导出树干几何，首次触及有限入木边界后整套姿态保持、再回收；树干受击偏转时收紧止点。竖劈约束承托圆桩顶面。目前竖劈是已接入的检视动作，劈柴配方和制作业务尚未开放。

角色来源、CC0 原许可、采用部件及编辑工程见 [ASSET_REGISTER](../../docs/ASSET_REGISTER.md)。没有把整套素材包、沙盒独立循环或沙盒应用接入主体。原基础 ranger 留作历史文件，当前十个运行模型由 content/assets 列出。

## 本轮验证

- [tests.log](tests.log)：41 项全部通过。真实 GLB 检查两种树干、多个方向/距离/动作阶段的接触、两掌握柄、取消不写资源；独立骨架与 boneTexture 释放、NPC 腿部不动，以及原有采伐/采集/仓库/导航检查保留。
- 资产门检查 11 个登记 GLB（含 1 个历史人物）、许可与源文件 hash、嵌入资源、蒙皮/骨架及六段动作。TypeScript 与 [生产构建](build.log)通过。
- [横砍止点](horizontal-stop.json)、[竖劈止点](vertical-stop.json)：接触余量接近 0，两掌径向偏差小于 1e-6。浏览器首次横砍规划约 16ms，实际树首次约 14ms；不作为整场景帧率成绩。
- 生产 UI 实际选树→寻路→挥斧→暂停→取消：[暂停](chop-paused.json)时木材 0、预留 5；[取消](chop-cancelled.json)后可用 24、预留 0。重新完成后[木材 5、已用 5、可用 19、成桩](forestry-result.json)，仓库原木派生为 5。
- [约 20 秒采伐录像](forestry.webm)：1280×720，WebM 时间戳跨度 19.811 秒，202 个块，1,406,309 字节；浏览器视频元数据解码无媒体错误。文件与容器记录见 [media](media.json)，未另做逐帧离线解码。
- [三轮重入](lifecycle-cycles.json)：每轮缓存 36 几何/10 材质/165 附属资源、GPU 纹理 12；旧缓存全零、角色已释放、旧循环停止、命中清空，旧 GPU 几何归零。GPU 几何因实际可见物为 33–35，旧驱动保留 1 个内部纹理计数；未将其写成零。木材及已用额度始终为 5。
- [390×844](mobile-portrait.json)、[844×390](mobile-landscape.json)：无横向溢出；仓库触控框至少 44px。[生产回执](production-smoke.json)确认静态构建脚本，无 JavaScript 错误。

截图：[主体角色与垫桩](production-vertical.jpg)、[横砍](horizontal-stop.jpg)、[手机角色](mobile-character.jpg)、[仓库](warehouse.jpg)。出生点近景另见 production-home-inspection.json；其刷新为独立新会话，不与此前采伐余额混写。仓库刚打开时的同帧快照与暂停 effect 后的快照均保留于 warehouse.json，后者明确引用 mobile-portrait.json。

本轮为 Windows / AMD Radeon / ANGLE D3D11 桌面浏览器，seed 104729。手机项是桌面视口仿真，真实手机性能与多指操作未验证。约 1.12MB 主包的构建提示保留，没有提高预算或宣称 60fps；当前会话不是持久存档。

## 重建与回退

独立 Blender factory-startup 后台运行 tools/build-characters.py、tools/build-character-axe.py，再运行 prepare-character-assets.mjs 和 register-character-assets.mjs。游戏使用唯一 app 循环，动画不发奖。本次 verify:assets、test、build 已按所列冻结执行；verify:evidence 只读复核归档与角色入口。后续改变 src 的其他支线应重新执行其组合版测试/构建并另留证据，不覆盖本轮已测指纹。

回退应撤销本 scope 的角色资源引用、scene/characters/两掌与接触模块、模型骨架/纹理所有权适配、营地角色锚点、站位距离及检视入口；保留同工作区的仓库、采集和树木物产改动，不能整体 reset 分支。角色资源、许可和 manifest 按同批次一起处理。
