# 粗木界面样板台

入口：开发服务器 `/sandbox/timber-ui/`。这是共享 UI 的可操作检视页，不是游戏运行时或游戏画面的替代品。

## 可以检查什么

- 长板、短块、竖条、大窗口在真实 CSS 尺寸下的轮廓、切角、厚度与色面数量。
- 纵剖、横截、树皮、刨花与凹槽的用途及同一色板。
- 原生按钮的 hover、active、focus-visible、aria-pressed、disabled、aria-busy 状态。
- 点击「换块木料」验证稳定种子；「长文字」检查换行；「纯色回退」检查撤去纹理后是否仍可辨认功能。
- 「营地木作」的取料、制作、忙碌、完成与缺料状态。它只改变当前页面的样料数字，不读取或写入游戏库存、存档。
- 一个真正放在 Shadow DOM 中的小窗口，使用同一份 `theme.css?inline` 与同一个无框架挂载器。
- 根安全框、窗口内容框、行内控件的跨层对齐；同排顶底、首末列和等距关系。

## 辅助线与干净画面

点击「对齐辅助线」可同时开启或关闭样板台与 Shadow 小窗的辅助线，按钮的 `aria-pressed` 同步状态。打开 `/sandbox/timber-ui/?uiGrid=1` 时默认开启，也可在某个主题根设置 `data-ui-grid-debug="true"`。普通入口默认关闭；再次点击按钮即可查看同一状态的干净画面。

本页和 Shadow DOM 内的主题根使用 `data-ui-grid-root="module"`；主游戏使用 `data-ui-grid-root="viewport"`。窗口、内容区域、同行控件、状态提示和 HUD 的 `data-ui-grid` 属性分别选用 `window`、`content`、`row`、`notice`、`hud`。辅助线读取真实矩形，由共享 `grid-guides.ts` 和 `mountTimberTheme` 管理，不另画一套检视页专用参考框；辅助层不占布局空间，不接收指针，也不改变键盘顺序。

完整数值与层次规则见 [DESIGN](../../DESIGN.md#跨层次网格与辅助线)：基本单位 4px，常用间隔 8px、区段间隔 12px；屏幕安全边桌面 24px，宽度不大于 700px 或高度不大于 520px 时为 8px，各边还需取对应安全区的较大值。窗口上/侧内边距为 24px，宽度不大于 540px 或高度不大于 520px 时为 20px，下方统一 32px。标题、分类、操作行和状态文字沿所属内容框对齐。

桌面、390px、320px、844×390 分别保留辅助线图和干净图，使用相同 seed、内容和操作状态。真实矩形的同轨误差不超过 1 CSS px；网格列宽与文字允许分数坐标，木头的装饰切角不作为测量基准。开启辅助线前后应保持布局和交互不变；页面原有纵向滚动与至少 44×44 CSS px 的命中区域继续保留。

## 共用源与维护边界

本页通过 `src/ui/timber/surface.ts`、`mount.ts`、`grid-guides.ts` 和 `theme.css` 消费生产主题。`style.css` 仅定义检视页布局，不复制木纹生成、色板、边缘、辅助线或交互状态规则。已有图标继续引用 `public/assets/ui-r1/icons/`。

`data-how-ui="timber"` 标明主题根；`data-timber-surface` 选择用途，`data-timber-material`、`data-timber-tone`、`data-timber-seed` 选择材料、色调与稳定变体。形状由用途和真实尺寸共同决定。不同框架、Shadow DOM 与后续离线打包都从同一源文件导入，不维护第二套皮肤。

页面可以自然滚动；按钮命中区保持至少 44×44 CSS px。没有游戏 RAF、额外 Three.js renderer 或持久化状态。卸载时清理 ResizeObserver、主题挂载器、辅助线、事件与示例定时器。验证范围归 [本轮记录](../../docs/scopes/timber-ui-system.md)，实际报告和截图见 [PR36 checks](https://github.com/StarObserverPro/home-of-woods/pull/36/checks) 的对应提交；本节规定检查方式，不自行宣称新增对齐规则或主游戏验收已经通过。
