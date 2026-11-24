# Rainier 山麓营地、远树烘焙与全景镜头

实现与验证更新：2026-11-23（America/New_York）。状态：实现已接入；第五轮独立焦外 probe、完整图集烘焙及缺失图集回退通过，主营地部分模式已通过；新全景镜头的实景构图与剩余组合验收待下一轮。

## 本轮目标

将营地的地域原型明确为 Mount Rainier 西南山麓的低海拔森林。沿用已有程序树与远景林片，依据公开森林研究组织可视树型、层次和地形分布，并清楚区分调查数据与游戏美术密度。新增可复用的多视角远树烘焙入口；在当前太阳、天气和相机之上接入轻量空气透视。高位观察镜头采用大广角、宽阔清晰中景和克制的前后离焦。

本分支从 PR #47 的 `3c97da18a1446fa2a12572919a245a441b53d9fc` 开始，承接 #45 的准备预算、#46 的锚定高位镜头以及 #47 的远景视觉林片。前置 PR 保持独立审阅。

## 涉及层与所有权

- `content`：地域、树型与来源、镜头及大气参数；地形与太阳继续读取当前唯一来源。
- `scene`：离线烘焙可复用工具、运行时远树表现、大气散射近似、景深缓冲与合成。
- `tools`：烘焙导出与本轮有针对性的桌面/手机实际画面验证。
- 一个主循环；室内、检视及其他镜头保留自己的投影和输出所有权。

## 可见验收

固定 seed、时刻、天况、镜头和分辨率，比较地面与高位、最终画面与无效果、深度/散射/焦外诊断。营地及主要林冠保持可读；近处遮挡和远山无明显漏色光边；高位转向、升降、返回地面和视口调整连续。天空、环境与表面大气共享太阳和天况。烘焙图集须有可重现入口、透明边缘处理、视角选择及资源释放，并以实际渲染检查。

构建、针对性行为检查、浏览器与着色器错误及资源尺寸分别记录。CPU 耗时与软件 WebGL 的结果不能当作实体手机 GPU 帧率。

## 当前实际结果

已核对第五轮 [CI run 45303052228](https://github.com/StarObserverPro/home-of-woods/actions/runs/45303052228)，代码为 [`f3c200ef81e325aeb2a8027e2fbc5703dbf02e25`](https://github.com/StarObserverPro/home-of-woods/commit/f3c200ef81e325aeb2a8027e2fbc5703dbf02e25)。

- `optics` job：五份定向测试共 **29 项通过、0 失败**，`npm run build` 通过。独立 probe 的零效果输出字节差为 0，5 个色块最大通道差为 1/255，shader/GL 无错误；resize、关闭/恢复、挂起及目标释放检查通过。
- `valley` 的 baker 步骤：**完整通过**。25 帧确定性烘焙、透明边距、PNG RGBA 字节回读、21 次运行时视角/模式渲染及资源恢复均有报告。释放恢复至预热后的共享 DFG 缓存基线，不将 renderer 自有的一张 LUT 当作资产泄漏。
- 主营地桌面与手机：ground 的 final/repeat/off、lift 起始与过渡、overlook 的 final/repeat/off、atmosphere-only、optics-only **均已完成检查**；冻结重复帧的变化像素数均为 0。有效的深度图随后被旧 `colorBins > 8` 门槛误判，导致后续 CoC、透射率 T、散射 L、暂停 resize/旋转和返回地面未执行，`valley` 整体仍未通过。
- 缺失图集的 `mass-fallback` 独立流程：**完整通过**，包括预期 404、实体林片回退与 final/repeat/off；重复帧变化为 0。
- 第五轮使用的俯视镜头**不构成全景构图证明**。之后的新镜头已有 **4/4 本地视锥测试通过**，用真实 `crown` 网格最高点与营地地标覆盖 1280×800、16:9、844×390 和竖屏；新镜头的实景构图及剩余诊断/操作正准备下一轮验收。

25 帧主营地证据及 baker 报告位于 [artifact 14880955839](https://github.com/StarObserverPro/home-of-woods/actions/runs/45303052228/artifacts/14880955839)；正式图集 [artifact 14880945916](https://github.com/StarObserverPro/home-of-woods/actions/runs/45303052228/artifacts/14880945916) 已核对 9/9 源文件 hash，独立 probe 位于同轮 `rainier-optics-probe` artifact。真实 WebGL 后端为 Chromium / ANGLE / Vulkan SwiftShader，未测实体显卡或手机帧时，也尚未完成全气候及室内往返的实机场景矩阵。详细数值、成本和唯一验证表见 [RAINIER_RENDERING](../RAINIER_RENDERING.md#验证状态)。

## 范围边界

地域定位是风格化生态原型，不是 Rainier 的测绘复刻。保留近景树的持久身份、交互与经济；调查统计只引导视觉配置。不重建重型植物生成器，不引入全行星光谱大气或逐叶生态模拟。此轮交付分支与 PR，合并和正式部署另外执行。
