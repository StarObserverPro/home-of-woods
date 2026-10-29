# 第一段可玩森林：验证记录

日期：2026-10-29。执行基线：`56e099a`；实现与截图由本 PR 的源文件和锁文件确定。

## 已实现与已执行

| 检查 | 结果与边界 |
| --- | --- |
| TypeScript 与生产构建 | 本地通过，Node.js 24.22.1；生产 JavaScript 约 854 kB，gzip 约 236 kB |
| 生产入口 | `vite preview` 实机通过：WebGL2 正常、键盘工具和移动有效、开发调试入口不存在、运行时与网络错误为 0 |
| 玩法、寻路、循环与存档 | 24 项命名测试通过：10 项 domain、4 项寻路、4 项主循环、6 项存档控制器 |
| 完整浏览器门禁 | 最终运行退出码 0，13/13 项通过；包括桌面采木、补种、收获、播种、浇水、建造预览/旋转/取消/确认、暂停、刷新读档，以及两种手机视口的实际触控 |
| WebGL 上下文 | 实际触发 context loss，停止游戏时间，再恢复场景与循环 |
| 手机布局与输入 | 390 × 844 与 844 × 390；实际触控摇杆、释放停止、工具选择与暂停返回通过。横屏提示遮挡角色的问题已修正并补拍 |
| 资源与退出 | 2 次预热后再运行 6 次预览/状态重载，资源计数收敛；重复销毁后循环停止，canvas、HUD 和注册项移除 |
| 异常存档 | 损坏/未来版本存档保持原始字节，不被自动保存覆盖；读写拒绝与额度不足有明确状态 |

主浏览器流程通过 HUD 执行真实采集与建造。测试使用独立浏览器上下文；角色走到检查位置时可调用受碰撞约束的开发命令，材料与交互仍通过正式 domain 规则验证，截图中的小屋由实际采集的 12 木材建成。

浏览器输入检查以真实位移和主循环步数推进为同步依据，保留 15 秒超时和原有位移断言；摇杆释放后还须经过至少 5 个模拟步而位置不变。这样，软件渲染器启动或截图恢复较慢时，不会把固定毫秒延迟误当成游戏已处理输入。暂停与图形上下文恢复同样检查实际停止及继续推进的状态。

## 实机证据

浏览器：Chromium 153.0.8010.0，WebGL 2，ANGLE / SwiftShader。浏览器 CDP 9333 为本轮唯一验证会话。运行时控制台与网络错误在报告中单独记录。

世界 seed 为 `20261029`。正式截图冻结状态并固定相机：目标为 `(player.x, 0.3, player.z − 1.6)`，偏移为 `(18, 24, 24)`，缩放为 1；完整状态、游戏时间、视口和 DPR 随报告记录。复现入口仅存在于开发构建，生产构建已检查不包含 `__HOW__` 或 `__VISUAL_READY__` 调试入口。

最终门禁对 `src/` 与 `package-lock.json` 的 SHA-256 为 `0d1e01638aff5b82a91d4f97871680d7ca893ebaba8ce9e13d0868a07dd1ef04`。报告中运行时/控制台错误及失败网络请求均为 0。

截图与 JSON 记录在本 PR 的 `docs/screenshots/` 和 `docs/evidence/`。运行脚本的原始输出位于 `.cache/evidence/` 与 `.cache/evidence-lifecycle/`，由 CI 作为 artifact 保存。

| 实机图 | 状态与记录 |
| --- | --- |
| [建成小屋的全景](screenshots/home-overview.png) | 使用完整流程实际获得的材料与建筑；通过受碰撞限制的移动命令将人物移到屋前。[状态](evidence/home-overview.state.json) / [相机记录](evidence/home-overview.json) |
| [开场](screenshots/desktop-start.png) / [建造预览](screenshots/desktop-build-preview.png) | 固定相机、完整状态记录见 [浏览器报告](evidence/browser.json) |
| [手机竖屏](screenshots/mobile.png) / [手机横屏](screenshots/mobile-landscape.png) | 390 × 844 / 844 × 390，键鼠与真实触控使用同一套操作状态 |
| [竖屏建造](screenshots/mobile-build.png) / [横屏建造](screenshots/mobile-landscape-build.png) | 补充布局检查图；最终横屏说明见 [横屏报告](evidence/landscape-build.json)，不作为固定相机回归图 |

[生命周期记录](evidence/lifecycle.json) · [生产入口记录](evidence/production.json)。生命周期报告保留了修正前的横屏布局截图作为检查记录；上表和 README 链接均指向最终布局。

## 资源记录

首次桌面全景的观测值为 648 draw calls、67,748 三角形、8 项 renderer 几何记录与 5 项纹理记录。此值包含阴影等绘制通道，只是本原型的测量基线。

预热后 6 次反复预览/载入的前后记录一致：renderer 几何 8、纹理 5；共享缓存几何 8、材质 58；交互项 37。销毁后共享缓存与交互/更新注册项清零，renderer 几何计数为 0；其内部纹理统计残留 1，实际图形上下文已显式销毁，不将这个统计值报告为零。

## 实际限制

- SwiftShader 验证了画面与操作结果。桌面 60 fps、目标手机 30 fps 尚未做真实设备测量；当前 draw calls 仍有进一步实例化优化空间。
- 无头浏览器在切换页签后仍报告 `document.hidden=false`，因此本轮没有把它计作真实后台页签验证。暂停/恢复与不补算离开时段的循环测试通过，visibility 处理入口已检查。
- 生产构建包含 Three.js 与 React，构建器提示单 chunk 超过 500 kB；未调整警告阈值来消除提示。后续可在内容扩大时拆分加载。
- 本轮是一张地图、一种作物与两种建筑的基础循环。没有房屋室内、村民、季节、交易和战斗。

## 复现命令

```bash
npm ci
npm run check
npx playwright install chromium
npm run dev
# 另一个终端；默认连接或建立唯一的 CDP 9333 会话
npm run check:webgl
npm run check:browser
npm run check:lifecycle
```

若环境已提供 Chromium，可用 `HOW_CHROME` 指定可执行文件；`HOW_QA_URL` 指定待测开发地址。检查结束执行 `node scripts/webgl-session.mjs stop`。

## 文档与回退

README、玩法、美术/HUD、渲染所有者与施工 scope 已与当前代码同步。本 PR 的新增实现可整体回退至文档初始化基线；既有存档键独立于其他项目，不迁移或修改水晶花园的数据。
