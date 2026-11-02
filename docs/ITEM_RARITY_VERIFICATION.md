# 物品扩展与稀有度验收

> 2026-11-02 后续：用户否决本轮静态弱自发光的视觉效果。数据结论保留，旧截图仅作对照；当前流光与星芒实现及验收见 [R2](RARITY_VFX_R2.md)。
2026-11-02。本轮叠加在 PR #8（`dff2e9bd04dfafbd593feaccd92df806c49095f1`）上，独立分支 `feat/item-properties-rarity`；不合并、不部署。所有样品与浏览器存档均为隔离生成的测试数据。

## 已执行

- `npm run check`：**123 tests passed / 0 failed**；资产检查、TypeScript、Vite 生产构建通过。去掉 9 项已经撤销的历史导入契约测试，增加 10 项扩展契约和 4 项分级/材质/制作测试；其余当前玩法回归保留。已有大 chunk 警告仍显示，没有为了通过检查隐藏警告。
- `npm run verify:evidence` 与 `node tools/audit-delivery-evidence.mjs` 通过。这两项检查原有冻结证据，不把历史测试数冒充当前运行结果。
- Chromium **156.0.8078.4** / ANGLE Vulkan SwiftShader：生产 `createScene` 加载真实场景、现有木墩模型和材质，五级并排，14:00 / 18:00 / 23:00 / 转镜头四帧；`shaderErrors=0`。额外夜间全普通样品作为不发光基线。四个材质变体在重复更新中保持稳定。
- 仓库五级名称/边框/文字标签颜色不同且一致。正常鼠标流程：从仓库取传说样品、在地图选地、转 45°、确认摆放、从仓库收回、显式保存并刷新。等级和未注册的 `futureFinish` 元数据全程保留。
- 390×844 手机视口没有横向溢出；木作卡片操作按钮均为 44 px 高。该结果是视口模拟，不是实体手机测试。
- 属性详情使用上一项实际摆放所得实例，再建立“该物品已选中”的隔离检查点加载；名称显示暖木墩，等级标签传说，名称计算颜色 `rgb(244, 207, 124)`。这是详情渲染/保存引用测试，不声称完成了从远景点击每种家具的命中验收。

## 柔光调整

第一次直接叠加常量自发光的夜景出现近乎纯紫/纯金的灯块感，未采用。最终材质以原有漫反射亮度与温和的世界法线项调制：正面仍有覆盖，端面与侧面、低面数折面仍可区分。实际日夜截图已查看；史诗柔紫、传说暖金，原工作台和普通木墩未一起染亮。

没有用光柱、轮廓线、地面圆环或粒子替代表面发光，也没有新增全屏泛光、点光源或透明外壳。用户未要求摆放后关闭，因此已摆放的史诗/传说仍保留柔光。

## 证据

`evidence/item-rarity/` 包含：

- `surface-day.jpg`、`surface-dusk.jpg`、`surface-night.jpg`、`surface-orbit.jpg`、`surface-night-baseline.jpg` 与 `visual-stats.json`。
- `inventory-desktop.jpg`、`inventory-mobile.jpg`、`after-placement.jpg`、`selected-detail.jpg`、`ui-check.json`、`detail-check.json`。
- 本轮 `check.log`、原冻结证据审计日志、以及对应源码摘要 `source-manifest.json`。

## 复现

先 `npm ci`、`npm run check`，用 `npm run dev -- --port 5174` 启动当前工作树。测试浏览器需另行安装 Playwright / Chromium；它不是游戏运行时依赖。可将 `PLAYWRIGHT_MODULE` 指向已有 Playwright 的 `index.mjs`，否则使用本地已安装的 `playwright` 包。

```sh
node --experimental-strip-types tools/fixtures/rarity-save.mjs > /tmp/rarity-fixture.json
node tools/verification/item-rarity-visual.mjs
node tools/verification/item-rarity-ui.mjs
node tools/verification/item-rarity-detail.mjs
```

可覆盖 `TEST_ORIGIN`、`EVIDENCE_DIR`、`FIXTURE_PATH`。fixture 页面只用于开发验证，不作为生产入口、不向真实玩家发放样品。初始真实制作权重为 60/25/10/4/1，可在内容表调整。

## 未覆盖与范围边界

实体手机 GPU、触屏多指操作、长期运行与所有未来模型/材质尚未验证。现有远景拾取可能被前景营地物件遮挡；本轮不改交互命中优先级。未添加完整装备栏、穿戴逻辑、装备经济属性或实际战斗机制；分级首先接到现有独立木作实例，之后装备复用同一解析与表现入口。
