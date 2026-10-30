# HOW-GATHERING-1 验证记录

日期：2026-10-30。实施基于 PR #3 的 `4ed0c0f`，当前在本地 `codex/gathering-sources`；未开新 PR、合并或部署。源代码与运行资产见 [source-freeze](source-freeze.json)，范围和参数见 [GATHERING_GUIDE](../../docs/GATHERING_GUIDE.md)。原 R4 和 integration 文件保持历史原字节，其来源校验绑定原提交；本目录单独登记采集支线。

## 已验证

- 两类来源共用注册、命中、合法站位、动作和候选/提交链路。桌面实际点中落枝堆，走近后枝杈 0→3；蘑菇 0→2。见 [枝杈结果](branches-result.json)、[蘑菇结果](mushrooms-result.json)、[采集录像](captures/gathering.webm)。模型消失、来源版本加一、HUD 数量和收获提示一致。
- 前两类之后又采集一处落枝，库存为枝杈 6、蘑菇 2。随后途中取消剩余蘑菇采集，来源仍为初始 1，库存不变。见 [cancelled](cancelled.json)。先前两次操作取消尝试晚于瞬时采集完成，其中一次额外落枝已正常结算，未将这些尝试记成取消成功。
- 三轮实际卸载重入保持上述库存和来源剩余量；新 owner 每轮为 35 geometry / 9 material / 178 extras，命中 4；旧 owner 清零、命中 0、旧循环停止，见 [lifecycle-cycles](lifecycle-cycles.json)。GPU/帧时原值保留，不将数量收敛写成帧率达标。
- 原有采伐实际走近、挥斧中暂停、恢复、倒树成桩；原木 0→5、额度可用 24→19，采集库存不变，见 [forestry-paused](forestry-paused.json)、[forestry-result](forestry-result.json)。
- 390×844 竖屏落枝采集与 844×390 横屏蘑菇结果可用；无横向溢出，显示的产品按钮宽高至少 44 CSS px。摇杆移动约 2.19、镜头按钮改变 yaw。见 [竖屏](mobile-portrait.json)、[输入](mobile-input.json)、[横屏](mobile-landscape.json)及对应 JPG。
- 单元/几何检查覆盖注册失败、两类合法路径、候选无副作用、旧版本/重放、取消/目标变化/障碍、采集采伐互斥、动作接收桩、序列化、两种恢复策略及具体 GLB 的共享资源和命中注销。正式恢复配置为空，测试恢复不被当作生产恢复已启用。

## 资产与画面

两件源部件重新按具体 CC0 审查，源 hash、前后尺寸和加工过程见 [asset-normalization](asset-normalization.json)。运行资产约 24.8 KB，无新增纹理；共享模型和命中代理沿用 Resources owner。查看 [桌面采前近景](desktop-branches-before.jpg)、[桌面采后](desktop-mushrooms-after.jpg)、[竖屏](mobile-branches-after.jpg)、[横屏](mobile-landscape.jpg)。

## 验证边界

设备为本机 Windows / AMD Radeon 集显 / Edge（ANGLE D3D11），seed 104729。手机项是桌面浏览器视口与指针操作验证，没有真实手机性能、多指触控或强制图形上下文恢复证据。当前零耗时采集没有新增骨骼动作。完整存档、正式恢复调度、日历和用途尚未启用。构建保留约 1.1 MB 主包提示；本轮没有提高预算或声称 60fps。

`npm.cmd run check`：33 项测试、7 个 GLB/地表来源与结构检查、类型及生产构建通过。`npm.cmd run verify:evidence` 的历史与本批审计均通过（evidence-check.txt）；生产包实测 E 键发起落枝、按钮采集蘑菇，库存 3 / 2，控制台错误 0，生产录像写入接口返回 404，见 [production-smoke](production-smoke.json)及[最终画面](production-result.jpg)。采集视频为 VP9 / 1528×682，289 帧，包时间跨度 19.903 秒，完整解码无错误，见 media.json。证据审计只读，核对当前冻结源和本轮回执，不改写旧截图/录像或伪造历史通过。
