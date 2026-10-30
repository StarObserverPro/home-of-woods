# R5c：浅碎面与超自然祭坛

2026-10-30。用户接受 R5b 的崖顶交界、篝火和祭坛下半部；本轮只在独立沙盒修整崖面与祭坛上部。未回接主体、开 PR、合并或发布。

## 实现与实际预算

崖面内部新增 166 处稀疏小折面，每处插入一个起伏点，原三角边保持。坡面高程查询与可见地形共用相同切分，不叠加装饰假面。地形总三角形从 19,564 变为 19,896（增加 332，约 1.7%），原 23,000 上限未提高；崖顶轮廓、石帽和草/石法线域继续保留。

祭坛原有台阶与顺坡石基保留，上方改为七块悬浮环石、种核、细光轨和回应粒子。供品位在前沿有支撑的石台上，三个独立供盘依次摆放蘑菇、枝条和小原木；空盘/林产/林产＋木料可切换。神谕在种核右上方，纸页与供品错开，独立正反面和点选面片；点击后 UI 显示完整文案。

上部实际 37 个网格对象、2,910 三角形，一张 512×640 CanvasTexture，沿用一盏无阴影局部灯。纹理只在祭坛/供品状态改变时重画，不逐帧上传。沉寂收起纸页与光轨，待供奉保持浅光，回应增强种核/光轨并出现粒子，休眠保留暗光与神谕。动画只消费既有应用时钟，减少动态冻结相位。

## 检查

- [51 项测试](evidence/r5c-check-tests.log)通过，包含地形封闭、绕向、高程一致、崖顶折角、供品锚点、四祭坛状态×三供品布局、点选身份、纹理更新和一次释放；同时保留角色/采集/库存/火焰回归。
- [类型与构建](evidence/r5c-check-build.log)通过；保留既有单包体积提示，没有提高阈值。
- 桌面 1440×900、手机 390×844 实际看图，浏览器点选神谕后读到“取木有度　留荫待生”；空盘、林产、混合供品及四种祭坛状态均操作检查。手机为同机视口仿真。
- 最终场景着色器错误 0，最终重新加载后的验收页与打包页控制台无 error。开发中多次热更新/刷新附近曾有被中断的纹理加载、fetch 错误，未沿用那些页面作为最终证据；最终场景重新加载和卸载重入均正常。没有将本机帧时外推为真实手机性能。
- 导出的 `review.html` 另经 HTTP 打开，实际切换到“祭品与神谕”，文字纹理、空置的第三供盘与悬浮上部正常显示，控制台无 error；留有 [打包页画面](evidence/captures/r5c-desktop-ritual-14-ready-forest-1.png)。临时 HTTP 页与本轮服务器已关闭。
- 一次实际卸载重入后，旧 owner 的 geometry/material/extra 均为 0，旧 camp/river 已释放，旧主循环不再执行或调度；旧 renderer 报告 GPU geometry 0、texture 1。神谕纹理的 dispose 一次性另由测试直接验证。重入后新场景正常，供品布局保留。审计在 [手机重入记录](evidence/captures/r5c-mobile-ritual-14-ready-mixed-3.json) 及其后截图 JSON 的 `audits` 中。
- 溪流与河道规格对比 R5a、火焰/石基/崖顶切边模块对比 R5b 的字节指纹保持；当前离线包与源码冻结由 [校验脚本](verify-review.mjs) 生成 [source-freeze](evidence/source-freeze.json)。

## 实机截图

每张 PNG 的同名 JSON 保留 seed 104729、相机、视口、状态、预算和图形信息。R5a/R5b 原证据保留；本轮早期 `r5c-desktop-ritual-14-ready-mixed-1` 是初次上部审看，当前结果以下表为准。

| 对象 | 证据 |
| --- | --- |
| 新崖面 | [桌面](evidence/captures/r5c-desktop-cliffs-14-ready-mixed-6.png)、[手机](evidence/captures/r5c-mobile-cliffs-14-ready-mixed-1.png) |
| 已接受的崖顶与石基 | [崖顶](evidence/captures/r5c-desktop-rim-14-ready-mixed-5.png)、[祭坛整体](evidence/captures/r5c-desktop-altar-14-ready-mixed-6.png) |
| 供品与神谕 | [白昼桌面](evidence/captures/r5c-desktop-ritual-14-ready-mixed-4.png)、[夜间回应](evidence/captures/r5c-desktop-ritual-23-answering-mixed-5.png)、[空盘](evidence/captures/r5c-desktop-ritual-14-ready-empty-2.png) |
| 手机祭坛 | [白昼](evidence/captures/r5c-mobile-ritual-14-ready-mixed-2.png)、[回应](evidence/captures/r5c-mobile-ritual-23-answering-mixed-8.png)、[休眠](evidence/captures/r5c-mobile-ritual-23-resting-forest-9.png)、[沉寂](evidence/captures/r5c-mobile-ritual-14-dormant-forest-10.png) |

离线包为 [review.html](review.html)。浏览器工具仍限制 file 协议；本轮通过 HTTP 检查真实场景，并校验离线脚本语法、内嵌 GLB 字节和许可，没有把静态检查写成自动双击验证。真实移动设备、多指操作未测。供品/神谕是布局与状态预览，尚未实现正式供奉扣款、奖励或主体存档；示例文案也不是正式神谕规则。

用户审看通过后，再按明确指示逐模块回接；当前主体不导入本沙盒。
