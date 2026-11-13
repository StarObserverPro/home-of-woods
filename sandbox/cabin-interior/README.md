# 木屋内装展台

本模块用于审查完整木屋、家具和动作。默认初住 4 件；完整陈设 10 件由用户主动选择，也可从空屋逐件添加。展台样品不是正式游戏奖励。先读 [规划胶囊](../../docs/scopes/cabin-interior-audit.md) 与 [PR31 固定版本复盘](https://github.com/StarObserverPro/home-of-woods/blob/ded264175d62dd8c4b727ab93b191ef63ef473c4/docs/CABIN_WORKFLOW_LESSONS.md)。

## 运行与操作

```sh
npm ci
npm run dev:cabin
# 或 npm run build 后 npm run preview，打开 /sandbox/cabin-interior/
npm run test:cabin
npm run verify:cabin-assets
```

拖动旋转、滚轮缩放；点物品只选择，点空地行走，WASD/方向键按当前镜头行走。手机一指旋转、双指缩放/平移；取用、近看和重摆均有按钮。

| 入口 | 行为 |
| --- | --- |
| 初住 / 完整陈设 / 空屋 | 替换当前审计样板，保留每种样品的稳定身份；撤销可回到上一次状态 |
| 走进木屋 / 走到门前 | 同一场景中行走，地板与门前平台连续；相机不跳转 |
| 选择物件 → 走近使用 | 到登记点后休息、坐下、开箱、点灯或观察；起身回到同一接近点 |
| 挪动 | 点地面预览或用方向按钮微调，转 90°，确认/取消；入口、碰撞和使用点被阻塞时不能提交 |
| 收回 / 样品架＋ | 保留实例身份；收回桌或架会同时收回支撑的道具，重新摆出后逐件恢复 |
| 全景 / 背面 / 俯看 / 屋内 / 近看 | 同一相机控制器的明确观察位 |
| 随视角剖墙 / 舞台半墙 / 完整外壳 | 屋顶与墙上部显隐；下部、截面、碰撞和状态保留 |
| 空间与材质检查 | 查看占地、使用点、支撑槽、门扇扫掠，以及素模/线框和绘制量 |
| 导出布置 / 保存当前画面 | 下载独立 JSON 快照或当前画布 PNG |

本机保存仅用 `home-of-woods:cabin-audit:v1`。刷新恢复布置；不读写正式世界 IndexedDB。当前 UI 提供导出，外部快照可经 `initialState` 注入，未增加文件导入界面。

## 模块职责与扩展

| 文件 | 所有权 |
| --- | --- |
| `src/content.ts` | 房间尺度、物件定义、稳定实例 ID、初始位置、接近点、支撑槽及运动包络 |
| `src/domain.ts` | 无 Three.js 的纯函数：精确寻路终点、使用资格、放置校验、同实例取放、严格快照解析 |
| `src/scene/shell.ts` | 从围护方案生成厚墙实洞、门窗、连续平台、剖切分组及共享屋面剖面 |
| `src/scene/furniture.ts` | CC0 模型载入、材质统一、原创家具几何及受限局部动画；不创建业务物品 |
| `src/scene/character.ts` | 项目原角色及动作，原倍率；姿态接触与足底校正；由宿主 dt 推进 |
| `src/scene/view.ts` | 相机、灯光、拾取、材质/空间检查、资源生命周期；消费状态 |
| `src/app.ts` | 唯一状态提交、路径推进、RAF、UI 与展台保存 |

新增家具时先在 content 定义尺寸、类别、占地、使用位置与支撑关系，再在家具工厂注册几何。所有模型底面中心是局部原点，+Y 向上、+Z 朝前；使用位及子件位置随 yaw 旋转。修改形体后重新检查登记包络与实际模型，不靠增大交互距离绕过空间错误。

桌面灯和碗、架上盆栽各有独立身份，位置引用宿主与槽位。当前支持固定槽位；任意面内摆放、搬运到手、容器内物品以及 Rapier 刚体仍需扩展 domain 的 location/事务，不能直接在 scene 下挂一个副本。箱盖的 `motionEnvelope` 与普通导航占地分开，关闭时也保留未来打开所需空间。

`mountCabinAudit(container, {initialState, persist, onChange})` 返回 `pause/resume/dispose/getSnapshot`。正式接入时设置 `persist:false`，将合法拥有实例与宿主事务接到 domain/app，保存和时间回归原运行时。当前 `onChange(snapshot,event)` 是提交后的审计通知，不是生产命令审批接口；生产接线应将 `commit` 交给现有规则服务，而非另开并行库存或保存器。

`mountCabinAudit` 自带 RAF，作为整页模式时应先暂停宿主，退出销毁后恢复。若木屋与山谷共用原场景，应复用 content/domain 与 shell/furniture 工厂，由原 `Resources`、时钟和角色推进，不同时运行展台 mount。房间使用局部坐标，宿主提供 world transform 与入口锚点；相机在入口明确交接，不回到默认远景。

炉火仅示意点亮，不消耗燃料；休息不推进游戏日期；箱内有真实几何空腔但不提供第二份库存。固定炉位的烟管接口由房屋层连接屋顶，泛水件高度从同一屋面剖面取得。

## 资产与验证

5 件 KayKit Furniture Bits 1.0 资产使用 CC0，具体版本、源文件及 SHA-256 见 `public/assets/cabin-interior/manifest.json`；`node tools/prepare-cabin-assets.mjs` 从仓库采用的原件可复建。其余家具和围护为本项目几何。几何工具的 MIT 许可与来源保存在 `src/vendor/geometry-quality-kit/`。完整登记见 [ASSET_REGISTER](../../docs/ASSET_REGISTER.md)。

本次针对性检查为 `tests/cabin-interior.test.ts`。生产构建包括独立 HTML 入口；不替换正式游戏入口。`Cabin Interior Browser` 工作流通过构建后的页面进行真实按钮/触摸操作，输出昼夜、坐卧、开箱、屋顶、空间和手机截图，以及录制与 JSON 状态报告。也可在有 Chromium 支持的环境运行：

```sh
npx playwright install chromium
npm run build
node tools/verification/cabin-interior-browser.mjs
```

产物默认写系统临时目录，可用 `CABIN_EVIDENCE_DIR` 指定。浏览器自动通过仍需人工看图；SwiftShader 结果不代表实体手机 GPU 帧率。截图、录像不入源码仓库；最终实际结果统一记在规划胶囊。
