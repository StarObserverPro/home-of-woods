# R5 本轮实机与检查

本页记录 R5a。R5b 的当前结论见 [R5b 验证](VERIFICATION-R5B.md)；R5a 的原始指纹已另存 [r5a-source-freeze](evidence/r5a-source-freeze.json)，不将旧截图/47项结论自动继承给 R5b。

日期：2026-10-30；固定 seed 104729。独立沙盒，无主体回接、PR、合并或部署。来源起点与选择见 [intake](evidence/intake.json)，最终源码/测试/资产指纹见 [source-freeze](evidence/source-freeze.json)。

## 已验证

- 47 项本轮执行的行为/实际模型/资源测试通过：[测试日志](evidence/check-tests.log)。覆盖原库存、品质、单次事务、林业/采集、角色接触、GLB 加载失败与缓存；新增地形流形/一致绕向、远山封闭、原木数量映射/不写库存、道具释放、日夜/碰撞。
- TypeScript 与生产构建通过：[构建日志](evidence/check-build.log)。保留约 911kB 单个 JS 包的 Vite 体积提示，没有提高阈值掩盖它。
- 桌面 1440×900、手机竖屏 390×844 和横屏 844×390，Edge/ANGLE AMD Radeon D3D11；当前检查不是实体手机性能验收。水面反射尺寸为 512² / 256²，按每 3 / 4 帧刷新，移动横屏也使用低档；着色器错误计数 0。
- 场景按钮实际切换白昼/黄昏/夜晚、火焰开关、原木 0/6/18/32、祭坛四状态；点选祭坛显示“林间祭坛 · 回应”。仓库检查确认 32 根真实余额，场景可见 18 根。减少动态与关闭倒影可用。
- 三次卸载重入保持 32 根和一个画布，旧循环停止；owner 的几何、材质、extras 归零。[实际 DOM 观察转录](evidence/lifecycle-observation.json)保留完整边界：renderer 的纹理统计仍显示 1，三次均未增长，同时上下文已销毁，不能宣称纹理计数为 0。重入按钮在异步加载时禁用，先让 UI 提交，再启动加载，防止重入重叠。
- 地表从 45,000 个顶面三角形降为总计 18,000（17,640 顶面加封边/底面）；每条共享边恰有两个面、绕向一致，无 DoubleSide 遮掩。远山也补齐侧面和底面。角色/路/水岸/碰撞仍消费同一地表事实。
- 当前捕获中常见帧时 P50 约 16.7ms，桌面混合视角 P95 约 33–50ms；这组数据包含共享 Windows 桌面、反射更新帧与观察点切换，不能扩展成所有设备稳定 60fps。全景的反射更新帧可达约 548 calls / 656k triangles，开销并非只有水面自身；倒影可关闭，手机降低目标尺寸与频率。
- 离线审看页已经内嵌实际采用的 10 个 GLB；校验嵌入字节与准入文件完全一致、没有外部 JS/CSS、模块语法有效。浏览器工具拒绝 file 协议，故未自动执行双击本地 HTML 的验证，HTTP 开发入口实机结果与静态包检查分别记录。

## 实机画面

每张 PNG 旁有同名 JSON，记录视口、相机、状态、GPU、预算与帧时。它们由当前运行时渲染后立即捕获，不是外部设计稿。

| 场景 | 画面 |
| --- | --- |
| 山谷全景 | [桌面](evidence/captures/desktop-overview-14-ready-wood0-1.png) |
| 河水、倒影与急流 | [桌面](evidence/captures/desktop-creek-14-ready-wood0-2.png) |
| 折面山崖 | [桌面](evidence/captures/desktop-cliffs-14-ready-wood0-3.png) |
| 从外侧观察封边 | [桌面](evidence/captures/desktop-edge-14-ready-wood0-4.png) |
| 6 根原木和白昼篝火 | [桌面](evidence/captures/desktop-camp-14-ready-wood6-5.png) |
| 黄昏 / 夜间篝火 | [黄昏](evidence/captures/desktop-camp-18-ready-wood18-6.png)、[夜晚](evidence/captures/desktop-camp-23-ready-wood18-7.png) |
| 祭坛四状态 | [沉寂](evidence/captures/desktop-altar-14-dormant-wood18-9.png)、[待供奉](evidence/captures/desktop-altar-14-ready-wood18-10.png)、[回应](evidence/captures/desktop-altar-23-answering-wood18-8.png)、[休眠](evidence/captures/desktop-altar-14-resting-wood18-11.png) |
| 手机夜间营地 | [390×844](evidence/captures/mobile-camp-23-ready-wood32-1.png) |
| 手机祭坛回应 | [390×844](evidence/captures/mobile-altar-23-answering-wood32-2.png) |

最新横屏溪流图的文件前缀由宽度生成，可能带 desktop；实际 844×390 尺寸及 256² 目标以旁边 JSON 为准。早期后台节流、穿地相机及裁切错误的试验图已剔除，不纳入结果。

## 去留与边界

待用户视觉审看。篝火尚无燃料交易，祭坛不扣供品/发奖励，昼夜没有接完整季年经济，沙盒不写主体存档。真实手机、多指与持续长时间性能、正式祈愿/燃料经济、世界存档属于后续工作。

主体在本轮期间仍有其他工作继续变动；本沙盒是 intake 所记录时点的独立快照，未追随或覆盖后续主体变化。回接前需要对当时最新库存/存档、地表和运行时重新适配。
