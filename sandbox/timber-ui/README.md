# 粗木界面样板台

入口：开发服务器 `/sandbox/timber-ui/`。这是共享 UI 的可操作检视页，不是游戏运行时或游戏画面的替代品。

## 可以检查什么

- 长板、短块、竖条、大窗口在真实 CSS 尺寸下的轮廓、切角、厚度与色面数量。
- 纵剖、横截、树皮、刨花与凹槽的用途及同一色板。
- 原生按钮的 hover、active、focus-visible、aria-pressed、disabled、aria-busy 状态。
- 点击「换块木料」验证稳定种子；「长文字」检查换行；「纯色回退」检查撤去纹理后是否仍可辨认功能。
- 「营地木作」的取料、制作、忙碌、完成与缺料状态。它只改变当前页面的样料数字，不读取或写入游戏库存、存档。
- 一个真正放在 Shadow DOM 中的小窗口，使用同一份 `theme.css?inline` 与同一个无框架挂载器。

## 共用源与维护边界

本页通过 `src/ui/timber/surface.ts`、`mount.ts` 和 `theme.css` 消费生产主题。`style.css` 仅定义检视页布局，不复制木纹生成、色板、边缘或交互状态规则。已有图标继续引用 `public/assets/ui-r1/icons/`。

`data-how-ui="timber"` 标明主题根；`data-timber-surface` 选择用途，`data-timber-material`、`data-timber-tone`、`data-timber-seed` 选择材料、色调与稳定变体。形状由用途和真实尺寸共同决定。不同框架、Shadow DOM 与后续离线打包都从同一源文件导入，不维护第二套皮肤。

页面可以自然滚动；按钮命中区保持至少 44×44 CSS px。没有游戏 RAF、额外 Three.js renderer 或持久化状态。卸载时清理 ResizeObserver、主题挂载器、事件与示例定时器。验证状态归 [本轮范围](../../docs/scopes/timber-ui-system.md)，本页不自行宣称主游戏验收通过。
