# Rainier 山麓营地、远树烘焙与全景镜头

实现与验证更新：2026-11-23（America/New_York）。状态：实现已接入；本轮 35 项专项检查、构建、独立焦外 probe、完整图集烘焙及桌面/手机/默认几何回退流程全部通过，共 49 帧主营地证据；未合并或部署。

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

已核对第七轮 [CI run 45309801895](https://github.com/StarObserverPro/home-of-woods/actions/runs/45309801895)，代码为 [`1cce64d63ecc13f50460a3094b951fa9f39a55ce`](https://github.com/StarObserverPro/home-of-woods/commit/1cce64d63ecc13f50460a3094b951fa9f39a55ce)，四个 job 均成功。

- `optics` job：**35/35 通过、0 失败**，包含四画幅真实 `crown`/营地几何构图；`npm run build` 通过。独立 probe 的零效果字节差为 0，5 个色块最大通道差为 1/255，shader/GL 无错误；resize、启停、挂起与释放检查通过。[probe artifact 14883005874](https://github.com/StarObserverPro/home-of-woods/actions/runs/45309801895/artifacts/14883005874)。
- 手机完整流程：**通过，23 帧**。成功加载 impostor 图集；地面、全景、俯视、独立大气/焦外、depth/CoC/T/L、真实暂停下的旋转与横竖屏切换、镜头返回均完成，四组冻结重复帧变化为 0。原图确认竖屏主峰与营地同框、横屏俯视无明显拉伸或空底、返回恢复普通构图。[mobile artifact 14882428224](https://github.com/StarObserverPro/home-of-woods/actions/runs/45309801895/artifacts/14882428224)。
- 桌面完整流程：**通过，23 帧**。完整模式与操作组完成，四组冻结重复帧变化为 0。[desktop artifact 14883277554](https://github.com/StarObserverPro/home-of-woods/actions/runs/45309801895/artifacts/14883277554)。
- 默认几何的 `mass-fallback`：**通过，3 帧**。预期 404 后以实体林片呈现峰营同框全景，final/repeat/off 完成，重复帧变化为 0；它是回退证据，不是图集加载成功证据。[fallback artifact 14882582798](https://github.com/StarObserverPro/home-of-woods/actions/runs/45309801895/artifacts/14882582798)。
- 本轮 baker：**完整通过**。25 帧确定性烘焙、透明边距、PNG RGBA 回读、21 次运行时视角/模式渲染及资源恢复均有报告，见手机 artifact 中的 `baker/report.json`。

主营地共 **49 帧（23 桌面 + 23 手机 + 3 回退）**，不含独立 probe 和 baker 图像；**9 组冻结重复帧均为 0 变化像素**。桌面 resize 为 1280×800 → 960×640 → 原尺寸，手机为 390×844 → 844×390 → 原尺寸；两者返回后均为 `optics.active=false`、额外 pass 为 0。本轮导出图集位于 [artifact 14883342388](https://github.com/StarObserverPro/home-of-woods/actions/runs/45309801895/artifacts/14883342388)。

此前发现的 24 mm 固定半径全景不足、灰度深度图阈值误判、共享河段反射更新顺序，以及暂停脚本与真实镜头面板点击契约不一致，均已分别修正；修复记录和当前验证表见 [RAINIER_RENDERING](../RAINIER_RENDERING.md#验证状态)。

真实 WebGL 后端为 Chromium / ANGLE / Vulkan SwiftShader。尚未测实体显卡或手机 GPU 帧时，当前主营地实景流程固定晴天 12:00，全气候及室内往返矩阵未完整覆盖。成本、正式图集来源及验证适用范围以 [RAINIER_RENDERING](../RAINIER_RENDERING.md)及 [ASSET_REGISTER](../ASSET_REGISTER.md#rainier-地域与远林图集2026-11-23) 为准。

## 范围边界

地域定位是风格化生态原型，不是 Rainier 的测绘复刻。保留近景树的持久身份、交互与经济；调查统计只引导视觉配置。不重建重型植物生成器，不引入全行星光谱大气或逐叶生态模拟。此轮交付分支与 PR，合并和正式部署另外执行。
