# 森林之家 · 木作间

一根方料、一把手锯和一副开口试配槽。在纸上定总长、榫长和榫宽，翻转工件划出五道墨线，锯出直榫。可以把近侧榫颊刻意留厚一点，看看试配时哪一侧顶住，再用凿子薄削。首件收进作品匣后，下一件可领用直角尺。尺子只沿玩家选定的落笔位置扶正线条。

## 试玩和打包

在仓库根目录执行以下命令。需要 Node.js 22.14 或更新版本。

```sh
cd sandbox/woodworking
npm ci
npm test
npm run build
npm pack
```

- **直接试玩**　用浏览器打开 `dist/woodworking.html`。它包含完整画面、工序和示例宿主，可离线使用。样件、方料与草稿存在试玩页自己的存储空间。浏览器限制文件存储时可在同一会话继续操作。
- **挂载包**　`home-of-woods-woodworking-0.1.0.tgz` 可用 `npm install ./home-of-woods-woodworking-0.1.0.tgz` 安装。包内是浏览器 ESM 模块、内嵌样式和 TypeScript 声明，没有运行时依赖。普通静态页面也可直接导入 `dist/woodworking.js`。
- **正式工作台入口**　游戏仓库中的[营地挂载入口](integration/mount-camp.ts)已将该视图接到[库存适配器](integration/camp.ts)。示例宿主通过同一个入口挂载。游戏默认入口尚未启用这个沙盒。

## 在宿主中挂载

```ts
import { mountWoodworking } from '@home-of-woods/woodworking'

const view = mountWoodworking(panel, {
  stocks: availableBlanks,
  draft: savedDraft,
  tools: { saw: true, chisel: true, brush: true, straightedge: hasSquare },
  onDraftChange: saveWorkshopDraft,
  onComplete: settleWorkpiece,
  onDiscard: discardSawnBlank
})
view.setPaused(true)    // 随游戏暂停，冻结输入与虚影余时
view.setPaused(false)
view.destroy()         // 离开工作台，释放画布输入、计时器和尺寸监听
```

| 交接 | 职责 |
| --- | --- |
| 选料与图纸 | 宿主提供可用木坯的稳定批次 ID、显示名和毫米尺寸。传空数组代表没有可用料。进入工作台的距离、图纸知识和工具权限由宿主判定。练习宿主提供两种常规方料和一批短料 |
| 加工中 | `onDraftChange(draft)` 回传可序列化工件，宿主决定保存位置。下一次挂载传回 `draft`，保留墨线与切面。退出工作台继续保留草稿，暂停/重开不会补发五秒虚影 |
| 收件 | `onComplete(preview, stockId, draft)` 可异步返回稀有度名称和词条展示名。适配器从草稿重建实际几何并复查材料，单次提交扣料、足尺寸余料、成品和流水号。若结算失败可在原工件上重试 |
| 换料或弃料 | 第一刀以前可以换料。实际下锯后须确认放弃，`onDiscard(draft)` 扣除这根方料并保留可用截余，不发成品。关闭界面不会触发弃料 |
| 成品 | 成品记录实际端面、两侧榫颊和两肩的上下边界，从少量参数重建斜度与轮廓。宿主用原有图纸档次和种子决定稀有度，面漆单独保存。当前普通习作没有附加词条 |

营地侧可以直接调用以下入口。工件批次必须标有方截面 `wood.spec.section = 'square'` 和稳定 `blankLot`，并通过原有材料位置与库存校验。这样一根圆木不会在打开工作台时被当作已刨方的坯料。正式回接时需要接入工作台菜单、登记习作图纸与成品，并把已有方料供应和活动工单槽交给宿主。渲染、放样、试配和结算逻辑均在此目录。

```ts
import { mountCampHandwork } from './sandbox/woodworking/integration/mount-camp.ts'

const view = mountCampHandwork(panel, {
  read: () => gameState,
  checkpoint: saveWorkshopDraft,
  commit: commitInventorySerialAndClearDraft
}, savedDraft, availableTools)
```

## 几何与检验

[设计规划](../../docs/WOODWORKING_HANDWORK.md)规定图纸目标、玩家墨线和加工实物各自的用途。首期实现一个可调的贯通直榫族。截端露出新面后，可在端面上放两条榫颊线，再从两侧锯肩。锯缝与纵锯止点相交才脱料。过厚能薄削，过薄会留下侧隙。试配使用真实端长、接触间隙、错肩及有效咬合。纸图和工件使用同一毫米坐标。画布按输入、工序变化和尺寸变化重绘，显示短工具动作，组件不创建常驻渲染循环。

`npm test` 覆盖几何、返工、报废、库存事务、重复收件与保存恢复。可选浏览器验收使用真实鼠标及模拟触控，在构建之后执行。桌面和手机都从落笔走到返工收件。传入 `QA_EVIDENCE_DIR` 可将检查图写入指定的临时目录。

```sh
CHROME_PATH=/path/to/chromium PLAYWRIGHT_CORE=/path/to/playwright-core node test/browser.mjs
```

本阶段提供直榫试件和预制槽。自行凿槽、多零件家具、雕刻和拆解回收仍按后续工序开发。本沙盒使用原创程序几何和系统字体。
