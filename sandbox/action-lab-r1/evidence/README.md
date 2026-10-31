# R1 实际验证

2026-10-30，Windows / Node 22.14.0 / Three.js 0.186.1 / Vite 8.3.5。只验证此独立沙盒，不代表主体 M0–M2 完成。

- `tests.txt`：5 组 CPU 几何/骨架行为检查通过。
- `build.txt`：独立构建通过；单文件包同时生成。保留 >500kB 提示。
- `source-snapshot.json`：当前 runtime 与单文件包指纹。
- `intake.json`：6 个选定来源副本的字节与 SHA-256。运行时只载入其中 5 个；axe.glb 为审查候选，未载入。

## 实际操作

在应用内 Chromium 浏览器载入常规 dist 和内嵌单文件 review.html。四个动作按钮、暂停、重播、时间条拖动、近景/全景/断口、树种和缓坡实际操作；关闭循环后从 6.95s 播放，停于 7.00s。所有帧由同一表现时钟重采样。

首轮检查发现并修正：断口镜头被人物遮挡、角色背对采菇/祈祷审看镜头、抱树时突兀隐藏、树冠硬支撑导致倒不平、斧头接触高度/握持位置不一致。最终采用叶团软压缩与木质接地，保持实际角色由枝叶遮挡。

浏览器曾提示旧 PCFSoftShadowMap 已移除，已改为实际生效的 PCFShadowMap；最终渲染与此前自动回退一致。未发现运行时异常。手机为 390×844 视口模拟：scrollWidth 375 ≤ innerWidth 390；动作按钮 50.4px，其余操作按钮 44px。没有真实手机性能和多指实机结果。

## 固定帧

| 文件 | 状态 |
| --- | --- |
| fell-last-hit.jpg | 阔叶/平地，1.49s，近景，最后一斧 |
| fell-cut-detail.jpg | 阔叶/平地，5s，断口特写 |
| fell-broadleaf-landed.jpg | 阔叶/平地，5s，倒伏全景 |
| fell-pine-slope.jpg | 松树/缓坡 .12，5s，倒伏全景 |
| climb-step.jpg | 阔叶/平地，1.8s，抱树蹬步 |
| climb-canopy.jpg | 阔叶/平地，4s，拉远/树冠遮挡 |
| gather-left.jpg / gather-right.jpg | 平地，1.5s / 2.6s，左右采摘 |
| prayer.jpg | 平地，2.5s，合掌回应 |
| mobile-climb.jpg / mobile-fall.jpg | 手机竖屏，4s 抱树 / 3.1s 倾倒 |

截图属于本轮实际运行帧；最后的阴影枚举显式化和按钮 aria-label 修补不改变动作几何。最终交付页另保存 final-review.jpg。

资源卸载通过 CPU dispose 事件检查：替代网格释放，源树共享几何没有被释放；未宣称实际 GPU 强制上下文丢失或长时手机测试通过。自动浏览器仅支持 HTTP(S)，file:// 自动打开被协议策略阻止；没有改用其他入口绕过，单文件在本地 HTTP 下完整载入，直接双击由用户审看。
