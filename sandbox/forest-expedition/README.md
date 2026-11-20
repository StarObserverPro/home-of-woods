# 三片林地 · 独立可玩样区

日期：2026-11-19。入口 `/sandbox/forest-expedition/`；三张地图为雾杉高林、斑荫横岭、白桦溪甸。完整实现、接口和边界见 [林地说明](../../docs/FOREST_EXPEDITIONS.md)，本次交付范围见 [scope](../../docs/scopes/forest-biome-expeditions.md)。

## 运行

在仓库根目录运行：

```sh
npm ci
npm run dev:forest
```

使用既有 Vite 本地端口，默认地址为 `http://127.0.0.1:5286/sandbox/forest-expedition/`。生产构建继续使用根目录的 `npm run build` 和 `npm run preview`，不另装依赖、不建立第二个应用包。

## 操作

- 点地面或使用 WASD / 方向键走动，Shift 小跑；手机提供方向键和走／跑切换。
- 点物产查看，远处先走近，到达后再采集；“物产”窗口按距离列出来源并提供地标入口。
- 拖动场景、Q / E 或镜头按钮转向；滚轮、双指或按钮缩放，复位按钮恢复镜头。
- B 打开行囊，整理随身、寄存与当前地图地面材料；可放下、拾起、打捆、存入与取回。
- “补给”在远处导航回架，在近处打开寄存与加工。加工消耗已寄存材料，开始后自动关闭窗口并继续计时。
- Esc 关闭窗口或暂停。暂停及打开窗口时不推进游戏时间；当前动作可取消。

三个样区共享库存、寄存架账本与三份有限长材额度。地面物品属于原地图；一块林地有长材待归架，不会因此阻止另一块回收。地图切换保留来源余量和各自位置，独立样区存档也会保留这些状态。

## 接入合同

`main.tsx` 是本入口的组合根：创建画布宿主、`createForestExpeditionRuntime` 与 React 根，独占 `mountTimberTheme` 的挂载和释放。`ForestExpeditionApp` 仅接收 `{runtime}`，不创建场景、第二个循环或主题所有者。界面继续遵循 [DESIGN](../../DESIGN.md)，网格检查入口为 `?uiGrid=1`。

开发时 `?inspect=1` 可读取运行时检查接口、切换固定镜头或材质诊断。运行时的可注入场景用于无 GPU 的业务/UI 检查，不能替代真正的 WebGL 场景。资源所有者沿用 `Resources`；地面绘制、落地与导航消费同一个三角网格。

本入口使用 `home-of-woods.forest-expedition.v1` 的独立 localStorage 记录。它不修改主营地存档；正式营地到林地的转场、开放条件和主存档接线留待下一阶段。树脂后续木作、种源定植、正式树液采收季与果实成熟也尚未接入。程序模型可直接使用，后续精修位置见 [Blender 备忘](../../docs/FOREST_BLENDER_NOTES.md)。

## 当前检查

根构建与 UI 合同通过。`npm run test:forest` 17 项及既有搬运测试 19 项，共 36 项通过。无 WebGL 的检查页发现并修正了 RAF 调度函数未绑定 window 的启动错误；浏览器复测被中止，实际操作与窄屏验收未完成。

当前云浏览器的 `GL_VENDOR` / `GL_RENDERER` 均为 `Disabled`，本地 Chromium 所需 `AF_UNIX` 也被执行环境拒绝，尚无真实 3D 画面验收结论。三图的最终森林观感、着色器、遮挡和实体手机 GPU 性能仍须在可用 WebGL 环境下检查；构建或无 GPU 操作通过不等于这些项目通过。
