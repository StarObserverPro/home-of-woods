# 第二阶段动物 · 历史游戏截图与视觉退回

**2026-11-02 评审结论：鹿保留，羊视觉不合格、运行时停用。** 羊的球形身体、巨眼、短肢和粗角不符合约定的远景低模动物方向。此前“视觉验收通过”的结论撤回，不再用“以后微调”将其作为合格资产保留。

下列原始图片和 `browser/report.json` 不删除、不改写，保留技术追溯。截图通过本游戏自身的 Three.js 截图接口生成，检视模式临时展示动物，不能证明随机偶遇恰好发生。报告的 `passed` 仅对应当时加载、投影、暂停和资源释放等技术断言，**不等于美术获认可**。

- [桌面 · 保留的雄鹿](browser/desktop-stag.png)
- [桌面 · 已退回的羊，禁止作为风格范例](browser/desktop-goat.png)
- [窄屏 · 保留的雄鹿](browser/mobile-stag.png)
- [窄屏 · 已退回的羊](browser/mobile-goat.png)
- [原始浏览器技术记录](browser/report.json)

原记录采用 GitHub-hosted Chromium / SwiftShader，390×844 为视口模拟，不是物理手机 GPU 测试。停用补丁的新结论以相应提交 CI 为准；本目录不冒充新补丁截图。后续执行 `tools/capture-wildlife-phase2.mjs` 会写入独立的 `evidence/wildlife-goat-withdrawal/browser/`，检查羊没有被请求或展示，不覆盖这批历史图片。

当前功能和边界见 [第二阶段指导](../../docs/WILDLIFE_PHASE2.md)，替代模型的准入标准见 [视觉退回 scope](../../docs/scopes/wildlife-goat-withdrawal.md)。**新山羊模型与新的视觉验收尚未完成。**
