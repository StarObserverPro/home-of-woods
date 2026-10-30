# R5b：用户审看后修正

历史记录：当前迭代见 [R5c](VERIFICATION-R5C.md)。本轮源码指纹已归档为 [r5b-source-freeze](evidence/r5b-source-freeze.json)，下文面数、截图和测试结论均属于 R5b。

2026-10-30，继续独立沙盒；未回接、开 PR、合并或发布。用户已接受溪流，本次只修正火焰、祭坛承托、崖顶接缝。R5a 的截图、指纹与日志保留。

## 本次实现

崖顶从平滑肩部改为末端线性剖面，沿岩沿和窄石帽的实际位置切开三角形；草地和崖壁不再平均法线。world 的落地/碰撞查询使用相同的切分三角面，新增切点也进入地形封边。地形实际 19,564 三角形、10,365 顶点；远处继续减点，测试上限未提高。

篝火使用 8 条外焰、5 条独立亮芯。外焰保留透光，亮芯发光，局部屏幕朝向辉光不引入全屏后处理；2,808 火焰三角形、3 次绘制。只改变表现，不消费库存或发奖。

祭坛保持位置，石基顶面高于完整占地的最高地表，底部每个边点埋入坡面 0.25m。石块分层交错，实心核心封闭缝隙，碰撞范围覆盖石块；台面水平，四种状态继续可切换。

## 检查与证据

- 当前行为与实际几何检查共 50 项，包含新剖面折角、材质法线分离、地形封闭且绕向一致、石基顶面/埋地/碰撞，以及透明火焰几何预算与暂停相位。实际本轮结果见 [测试日志](evidence/r5b-check-tests.log)。
- 类型与构建见 [构建日志](evidence/r5b-check-build.log)。保留原有 JS 包体积提示，不提高阈值。
- 本轮图片以前缀 `r5b-` 放在 [captures](evidence/captures/)，旁边同名 JSON 记录 seed、视口、相机、灯光、石基、火焰、绘制及着色器信息；旧 R5a 图片不覆盖。
- 所有几何、材质、局部灯和图形资源继续由原所有者释放；既有角色、林业、采集、库存与生命周期回归同时执行。本轮完整源码、实际资产及离线包校验见 [r5b-source-freeze](evidence/r5b-source-freeze.json)。

桌面 1440×900 与手机 390×844 均已看图；新场景着色器错误计数为 0，控制台本轮无 error。手机是同机视口仿真。最初最小化 Edge 页面的后台帧时不作为性能结论；最终审看使用应用内浏览器，JSON 保留实际 AMD/ANGLE 后端和视口，不扩展为真实手机帧率保证。

| 审看对象 | 当前图 | R5a 对照 |
| --- | --- | --- |
| 崖顶与草地交界 | [整段崖面](evidence/captures/r5b-desktop-cliffs-14-ready-wood0-4.png)、[接缝近景](evidence/captures/r5b-desktop-rim-14-ready-wood0-5.png) | [原圆肩](evidence/captures/desktop-cliffs-14-ready-wood0-3.png) |
| 火焰 | [白昼](evidence/captures/r5b-desktop-fire-14-ready-wood0-2.png)、[夜间](evidence/captures/r5b-desktop-fire-23-ready-wood0-3.png) | [原篝火](evidence/captures/desktop-camp-23-ready-wood18-7.png) |
| 祭坛石基 | [桌面](evidence/captures/r5b-desktop-altar-14-ready-wood0-6.png)、[手机](evidence/captures/r5b-mobile-altar-14-ready-wood0-7.png) | [原祭坛](evidence/captures/desktop-altar-14-ready-wood18-10.png) |
| 手机崖面与火焰 | [崖面](evidence/captures/r5b-mobile-cliffs-14-ready-wood0-8.png)、[火焰](evidence/captures/r5b-mobile-fire-23-ready-wood0-9.png) | 视口 390×844 |

离线页仍为 [review.html](review.html)。保留先前自动浏览器 file 协议限制：不把打包/语法检查称为自动双击运行验证。真实手机设备、多指操作和持续帧时尚未验证。昼夜与祭坛仍为表现预览，正式燃料、供奉奖励和完整存档不在本轮。
