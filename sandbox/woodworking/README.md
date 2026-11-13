# 森林之家 · 木作间 0.2

立体木料选面 → 量具辅助定位 → 设止锯深度 → 明确下锯 → 检查/一次收尾 → 收件。鼠标点击只选面，拖动只转视角；没有徒手画直线要求。图纸只供参考，不能作为工作面。

在仓库根目录执行：

```sh
cd sandbox/woodworking
npm ci
npm test
npm run build
npm pack
```

`dist/woodworking.html` 为单文件独立试玩页，包含示例宿主、库存和草稿；支持普通浏览器本地打开。若浏览器禁用本地存储，页内提示仅本次会话保留。`dist/woodworking.js` 是无运行时外部依赖的 ESM 挂载包，声明在 `dist/types`。正式游戏默认菜单尚未开放这间练习台。

## 怎么锯第一支榫

初始 90 × 30 × 30 mm 方料，图纸总长 80、榫长 20、榫宽 14 mm。选择“截端”，点击顶面或“建议面”，从 A 端量 80 mm；可以先锯入 10 mm，再把深度设为 30 mm 继续。浅锯不发余料，贯穿后才断开。

剩下两侧榫颊从端面进入，标线从近侧 B 基准量起分别是 8 和 22 mm，纵向锯入 20 mm。两肩从 A 端量 60 mm，分别从近侧和远侧进入 8 mm。肩先、颊先都允许；不必遵循标签排列。默认锯缝放在各自的废料侧，改变该选择会真实改变结果。深度视角仍是同一木料，也可以回到立体视角。

这是用于理解工序的示例尺寸，试玩不会替玩家持续投影正确线。进深和位置滑块的初值不等于正确答案。此版的满行程往复、1 mm 锯缝和公差是游戏抽象，并非现实承重木作指导。

“检查/试配”显示预制槽、冲突面和分数。少量偏厚可明确确认一次减材收尾；过薄或锯伤保留结构不能补回。收尾后重新检查实际几何，工艺分含收尾成本。自动收尾不是已实现的手动凿子。

## 挂载

```ts
import { mountWoodworking } from '@home-of-woods/woodworking'

const view = mountWoodworking(panel, {
  stocks: availableSquareBlanks,
  draft: savedDraft,
  tools: { saw: true, autoFinish: true, brush: true },
  onDraftChange: saveDraft,
  onComplete: settleWorkpiece,
  onDiscard: discardWorkpiece,
})
view.setPaused(true)
view.setPaused(false)
view.destroy()
```

量具辅助从首件开放，`straightedge`/旧提示参数不再决定能否准确放样。`autoFinish` 独立控制辅助收尾，旧 `chisel:false` 仅在未设置 `autoFinish` 时作为兼容禁用信号，不开放凿子操作。

宿主拥有库存、当前活动工单、暂停和存档。`onComplete`/`onDiscard` 可以异步；提交前界面进入等待状态，失败保留当前工件供重试。关闭界面不会弃料。主线入口仍是 `integration/mount-camp.ts`，复用唯一库存事务；原料必须是已登记的直方料，不能把圆木当作已刨平木坯。

草稿 v2 保存操作及布局。恢复与结算根据操作重建实体，不接受客户端伪造的分数、网格或余料。示例使用 `home-of-woods.handwork.sandbox.v2`，不覆盖 v1 草稿。旧版原型草稿不做静默转换；v1 结算分支仅保留原宿主合同回归，不把旧操作变成新试件。

完成品继续输出已存在的 `FinishedWork` 包络，并附带体积平衡和是否辅助收尾。可复用余段按实际尺寸进入宿主库存；小块、锯屑和薄屑只记体积，没有几何实体，也不进入 Woodcraft 物理岛。本轮没有兑换细碎燃料的新物品。

## 内核与边界

- `solid.ts`：精确正交实体减法、连通块、外露面；显示和命中同源。
- `machining.ts`：有限锯切参数、夹持/可达性、实际去料与材料账。
- `tenon.ts`：图纸建议、成形检查、评分、一次收尾与回放。
- `workbench.ts` / `viewport.ts`：控件、同一木料的立体投影、观察与选面。

依然使用轻量 Canvas 立体投影，未引入新的 Three.js/WebGL 运行时。无常驻动画循环，变动才重绘。刀具往复覆盖整个行程轴，玩家设置的是向内进深；不模拟每一锯齿或手腕轨迹。48 次加工为本练习的上限。凿槽、钻孔、斜切、木纤维断裂、多零件配做和新图纸尚未实现；接入审查见 [传统工具与工序](../../docs/WOODWORKING_TOOLS.md)。

## 验证

单测包括新有限切削/材料/回放及真实营地事务，也保留旧合同测试。UI 验证使用独立 Playwright，不加入运行依赖：

```sh
CHROME_PATH=/path/to/chromium PLAYWRIGHT_CORE=/path/to/playwright-core \
  QA_EVIDENCE_DIR=/tmp/woodworking-evidence node test/browser.mjs
```

浏览器脚本默认导航真实单文件页并检查刷新；`INLINE_ONLY=1` 仅用于受管本地浏览器禁止导航时的内嵌画面验证，**不将其计作刷新验证**。桌面与模拟触控覆盖真实选面、滑块/数值、浅锯续锯、肩先、试配、一次收尾、报废、收件和 ESM 挂载暂停/销毁/恢复。实际结果与版本绑定见 [本轮记录](../../docs/scopes/woodworking-finite-saw.md)。没有实体手机性能结论。
