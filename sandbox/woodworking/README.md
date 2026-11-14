# 森林之家 · 木作台 0.3

在同一张工作台上选面、定线、定深、下锯和试配。加工用按钮；拖动木料、方向按钮与正面/侧看只改变观察角度。旋转、换工序与试配不改变比例；只有显式加减缩放、换料或视口尺寸改变才重新设定画面尺度。

## 运行

在仓库根目录先 `npm ci`，再进入本目录执行 `npm ci && npm test && npm run build`。使用仓库锁定的 Node.js 22.14+。打开 `dist/woodworking.html` 即可离线试玩；Three.js、手锯 GLB、桌面贴图和共享 Timber UI 都已打入文件，不依赖 CDN。该页是提供练习材料的独立宿主，不是主游戏免费发料入口。

`npm pack` 产生 `@home-of-woods/woodworking` 组件包，导出 `mountWoodworking`。原 `WoodworkingOptions` / `WoodworkingMount` 合同保留；`getDraft()`、`setPaused()`、`destroy()` 分别取草稿、暂停和卸载。宿主仍负责唯一材料事务与保存；`integration/mount-camp.ts` 是现有营地适配器。正式营地菜单/材料供应没有在此分支擅自启用。

操作记录与材料守恒沿用有限锯切 V2；0.1 手绘草稿不静默转换。断续锯切、两刀接通后脱料、一次自动修整、不可修复损伤、真实库存重试/重复收件规则保持不变。完整凿槽、斜切、圆孔和手动凿削未实现。

## 画面与资产

`src/viewport.ts` 使用按需绘制的 3D 工作台。没有背景常驻动画循环；只有输入、尺寸/状态变化、资源加载和短时锯切表现请求帧。选面网格直接来自 `solid.ts` 的实际暴露表面；端纹和侧纹在原始木料坐标中连续。锯切动画不结算资源。

手锯采用 Poly Haven CC0 模型，不是工具图标挤出；工作台为少量板/腿几何，使用其 CC0 木桌贴图。原始输入、许可、作者、修改和复建入口见 `../../sources/polyhaven/woodworking/README.md`。运行模型 2,548 三角面，纹理经过降采样与风格化。分发包含 Three.js MIT 与 CC0 声明。UI 直接复用根目录 `DESIGN.md` 与 `src/ui/timber/`，相机按钮是共享主题内显式选择的半透明观察控件，不影响主游戏普通木块按钮。

## 验证

`npm test` 为加工、库存与视角比例单测；`node test/browser.mjs` 运行构建页面的实际浏览器操作。使用 `QA_EVIDENCE_DIR` 指定临时截图/报告目录，`CHROME_PATH` 可指定 Chromium。默认真实文件导航，不能以注入 HTML 的截图替代真实刷新验证。具体结果与未验证边界见 `../../docs/scopes/woodworking-game-stage.md`。
