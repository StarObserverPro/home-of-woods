# 第二阶段动物 · 游戏内截图与验证

以下截图通过游戏自身的 Three.js 场景截图接口取得。检视模式临时展示模型以审查比例和轮廓，**不代表自然刷新恰好发生**；随机出现、镜头离开退场与冷却由对应行为测试核验。

- [桌面 · 大角雄鹿](browser/desktop-stag.png) — 对岸高坡、角形和四肢轮廓
- [桌面 · 白色山羊](browser/desktop-goat.png) — 峡谷石肩与白色体块
- [窄屏 · 大角雄鹿](browser/mobile-stag.png)
- [窄屏 · 白色山羊](browser/mobile-goat.png)
- [浏览器测试记录](browser/report.json) — 源码提交、WebGL 后端、可见性、零着色器错误与两轮场景卸载重入

本轮验证采用 GitHub-hosted Chromium / SwiftShader，390×844 仅为触屏视口模拟。模型均进入真实游戏渲染；未进行物理手机 GPU 性能测试。当前山羊为经白色化改造的低模 Goat，轮廓偏圆润玩具风，**尚不是准确的北美山羊造型**。

实现边界及后续美术项见 [第二阶段指导](../../docs/WILDLIFE_PHASE2.md)。
