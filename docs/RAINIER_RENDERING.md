# Rainier 山麓：大气、全景镜头与远林

实现与验证更新：**2026-11-23（America/New_York）**。本轮 **35 项专项规则检查**、构建、独立焦外 WebGL probe 和完整图集烘焙已通过；桌面、手机完整流程与默认实体林片全景均通过，共保存 **49 帧主营地证据**。各项结果、对应提交及适用范围见 [验证状态](#验证状态)。当前未合并或部署，任务范围见 [scope](scopes/rainier-forest-optics.md)。

## 场地与尺度

营地采用 **Mount Rainier 西南 Nisqually 山麓、参考海拔 550–750 m 的森林林窗**。NPS 描述的约 500–800 m 低海拔森林以西部铁杉、花旗松和西部红柏为主；2021 年植被制图报告支持 Nisqually 河谷的低地林定位。[NPS 植被分区](https://www.nps.gov/mora/learn/nature/plants.htm)及[制图报告](https://irma.nps.gov/DataStore/Reference/Profile/2286419)是地域依据。

现有地形、道路、水岸与营地布局保持原创。550–750 m 是场地参考，不是游戏坐标的海拔标定。Wind River 样方位于华盛顿州南部，是树木层次和空间组织的参考，不能称为本营地实测。样方口径、五个外围树型、密度和比例参数见 [RAINIER_ECOLOGY](RAINIER_ECOLOGY.md)。经营树 ID、逐代个体、资源、年度额度和存档所有者保持现有合同。

## 轻量空气透视

实现是 **height-integrated extinction + sky-driven scatter approximation（高度积分消光与天空驱动散射近似）**。`src/scene/atmosphere-rules.ts` 和 `atmosphere-lite.ts` 计算视线沿途的指数高度密度，求 Rayleigh 与气溶胶的透射率，再使用当前天光、太阳方向与相位权重构造入射散射颜色。透射率的积分与散射颜色的近似分开，不将后者描述为完整辐射传输求解。

| 项目 | 当前实现 |
| --- | --- |
| 参数 | `src/content/atmosphere.ts` |
| 数据表 | 128×2、RGBA16F；两行分别保存 Rayleigh 与气溶胶透射率，2,048 字节，即 2 KiB |
| 更新 | 初始化生成一次；此后云量/雨量的量化键改变才重建。太阳和天光由共享光照样本更新，不按帧重烘 LUT |
| 距离 | `8 m/world unit` 仅为大气光学距离的美术压缩；不改变角色、树木、地形或经营距离的世界比例 |
| 表面成本 | 每个受影响片元两次 LUT 读取及有限算术；不增加场景绘制或几何深度 pass |
| 色彩 | LUT 为 `NoColorSpace` 数值数据；表面透射/散射在线性颜色阶段、tone mapping 之前合成 |
| 输入 | 共享 `createSkySample` 的太阳方向、颜色和强度，以及当前天气；不建立第二套太阳或天气时钟 |

本控制器在天气表面、阴影和局部遮蔽的材质处理之后绑定大气补丁；按材质去重，并用各绑定自己的启停状态管理克隆和后续包装。离开室外及销毁时撤销其影响，材质本体仍归原资源所有者。山体通过共享大气路径使用无预混雾的标准材质，避免旧远山着色与新空气透视重复叠加。具体资源纪律仍见 [RENDERING](RENDERING.md)及 [SHADOW_RULES](SHADOW_RULES.md)。

这不是完整 Hillaire 大气实现：本轮空气透视没有行星曲率、全方向天空辐亮度积分、多重散射 LUT 或体积阴影。Hillaire 的 [2020 年论文](https://doi.org/10.1111/cgf.14050)是轻量查表与天空/空气透视组织方式的参考，不是本轮已复现的算法清单。色彩阶段遵循 [Three.js 线性色彩工作流](https://threejs.org/manual/pages/color-management.html)。

## 高位广角与克制的焦外

普通近地导航保留原镜头；高位观察的常规端约为 **24 mm 等效广角**，完全缩远时按画幅采用 **12–16 mm 超广角**。16:10 使用 16 mm，16:9 约 15 mm，844×390 约 12.33 mm；画幅越宽，通过更短焦段维持全景的纵向取景，下限固定为 12 mm。竖屏旋转 36 mm 长边门幅，仍使用 16 mm 全景端，避免按宽高比无限放大纵向视角。

缩远同时将观察距离从 110 平滑增加至最多 220，由原 `anchored-overlook` 控制器的径向速度推进；固定观察点保持原所有权。默认俯角下的缩远用于营地与山脊同框，继续抬高可俯视营地布局。实际导航与区块预测共用镜头规则及地形净空，检视、室内等借用相机保留各自投影。镜头的观察点、回收与行走规则见 [固定观察点](RENDERING.md#固定观察点与受控回收)。

广角只决定视角，不能单凭焦段得到真实景深。本轮不设物理光圈或求解薄透镜弥散圈，而用相对观察点距离控制小幅艺术焦外：中景保持清晰，极近处略软，极远处更轻。桌面近/远模糊半径上限分别为 **3.4 px / 1.8 px**；紧凑视口为 2.8 px / 1.4 px，均按渲染缓冲区像素计。焦外强度随高位观察量渐入，返回普通导航后停止该后处理。

清晰带由相机到观察点的距离 `f` 定义：近侧在 `0.28f–0.68f` 渐变，远侧在 `2.6f–8.5f` 渐变；这些是构图参数，不是实测镜头景深。天空不主动产生远景弥散圈。近景轮廓有小范围覆盖扩张，远景采样及放大采用深度权重，以减少前景树干染上远山颜色。独立 probe 已确认近/远焦外掩膜及前景轮廓扩张；手机和默认实体林片的全景实景证据及适用范围见 [验证状态](#验证状态)。

### 渲染步骤与内存估算

主场景一次绘制到全尺寸 RGBA16F 颜色与深度目标，随后执行 **两次全屏 pass**：先在半宽、半高缓冲中收集模糊颜色及带符号的焦外量，再按深度放大与原图合成。深度来自同次场景绘制，**没有第二次几何深度 pass**。最终输出执行一次 tone mapping 与颜色转换，DOM HUD 和现有天气镜头层仍由各自所有者合成。

以 **1280×800 的实际 drawing buffer** 为例（不是不含 DPR 的 CSS 尺寸）：

| 资源 | 估算公式 | 大小 |
| --- | --- | ---: |
| 全尺寸 RGBA16F 颜色 | 1280×800×8 字节 | 7.8125 MiB |
| 深度，按 32 bit 存储预算 | 1280×800×4 字节 | 3.90625 MiB |
| 半宽半高 RGBA16F 模糊/焦外 | 640×400×8 字节 | 1.953125 MiB |
| 合计 | 无 MSAA、无 mipmap | **13.671875 MiB，约 13.67 MiB** |

此数值是新增目标的格式估算，不是浏览器或驱动实测显存，也不包括原场景、倒影、阴影和远树图集。目标在第一次需要时创建，后续复用，随尺寸调整并在控制器销毁时释放；恢复地面镜头后可继续保留已分配目标。缺少浮点颜色附件支持时直接使用原场景绘制。两次全屏合成存在额外成本，当前没有实体 GPU 的帧时对照，不能声称帧率提升。

## 远林图集与 A/B

远林默认仍为 `mass` 实体林片；`farForest=impostor` 提供装饰树簇的图集比较，`farForest=trees` 保留单树几何对照。图集只替换适合的远处针叶树簇，近处、独立轮廓和阔叶树继续使用几何。图集加载失败保留实体林片；经营树、交互、碰撞和资源身份不进入卡片。

导出器从项目自有 `distantTreeGeometry` 组合三棵针叶树，烘焙 **25 个视角**：8 个方位 × 0°/30°/60° 仰角，再加正顶视。每帧默认 128²，带四像素内部边距，分别生成 **1024×512 RGBA8 的未受光 albedo/alpha 和资产空间 normal**。两图不生成 mipmap，默认 GPU 纹理存储估算为 **4 MiB**；PNG 传输字节与此不同。

颜色图保存线性值而非已受光的晴天图；法线在运行时变换后进入标准材质，继续消费游戏天光与大气中的天气输入。相邻四视图按覆盖度加权插值，每个卡片两个三角形、最多八次纹理读取。透明区域填充、纹理读取和卡片深度都有代价，减少三角形并不自动等于提高帧率。卡片没有逐像素深度重建，不投射或接收阴影；这也是保留默认实体林片和 A/B 的原因。

可复用入口、输入限制、透明边缘处理、输出 manifest/hash、资源释放和导出命令见 [tools/impostors/README](../tools/impostors/README.md)。参考来源与原创边界见 [ASSET_REGISTER](ASSET_REGISTER.md#rainier-地域与远林图集2026-11-23)。CI 已实际导出图集并通过 PNG 数据回读、多视角 shader 与释放检查；正式产物已纳入当前分支 `public/assets/forest-impostors/`。本轮手机流程确认图集成功加载，独立回退流程确认缺失图集时仍可显示默认实体林片全景。

## 诊断与回退

| URL 参数 | 用途 |
| --- | --- |
| `atmosphere=final` / `off` | 默认空气透视与关闭后的 A/B |
| `atmosphere=transmittance` / `inscatter` | 分别查看透射率与散射颜色 |
| `optics=final` / `off` | 高位焦外与直接输出 A/B；广角投影仍由导航规则决定 |
| `optics=depth` / `coc` | 查看深度重建与有符号焦外量 |
| `farForest=mass` / `impostor` / `trees` | 默认实体林片、图集候选与单树几何对照 |

参数可与 `inspect=1` 组合。诊断统计报告大气 LUT 的尺寸/更新数、焦外目标/分辨率/格式/估算字节及远林实际使用模式；不能只凭请求参数判断图集已加载。所有模式继续使用主游戏循环，烘焙工具单独运行，不进入游戏 RAF。

## 验证状态

已核对第七轮 [CI run 45309801895](https://github.com/StarObserverPro/home-of-woods/actions/runs/45309801895)，对应提交 [`1cce64d63ecc13f50460a3094b951fa9f39a55ce`](https://github.com/StarObserverPro/home-of-woods/commit/1cce64d63ecc13f50460a3094b951fa9f39a55ce)。独立 `optics`、桌面、手机和 `mass-fallback` 四个 job **全部通过**。主营地证据共 **49 帧：桌面 23、手机 23、默认几何回退 3**，不含 probe 与 baker 图像；9 组冻结重复帧的 `changedPixels` 均为 0。

### 已通过的检查及证据

| 范围 | 实际结果 | 证据 |
| --- | --- | --- |
| 专项规则与构建 | **通过：35/35，0 失败**；`npm run build` 成功 | 同轮 `optics` job，含锚定镜头、四画幅真实山峰/营地构图、大气、图集、焦外和山谷/生态规则；不是全仓库测试数 |
| 独立焦外 probe | **通过**；零效果直通字节差为 0；5 个色块的最大通道差为 1/255；shader 错误与 GL error 均为 0 | `rainier-optics-probe` artifact，`overlook-optics-probe.json` 与 direct/final/depth/CoC PNG |
| probe 尺寸与生命周期 | **通过**；640×400 主目标、320×200 模糊目标；竖屏检查使用 780×1688 / 390×844；关闭与挂起停止额外 pass，销毁后目标为 0，资源计数恢复原基线 | 同份 probe 报告，最终与初始基线均为 8 geometries / 1 texture；不是宣称整个 renderer 资源归零 |
| 25 视图烘焙与 PNG | **通过**；重复烘焙一致、renderer 状态恢复、25 帧均有覆盖且边界 alpha 为 0；albedo/normal 各保留 35,557 个透明 RGB 扩边 texel，PNG RGBA 字节往返一致 | 本轮手机证据 artifact 中的 `baker/report.json`；正式图集来源与 hash 登记见 [ASSET_REGISTER](ASSET_REGISTER.md#rainier-地域与远林图集2026-11-23) |
| 图集运行时与释放 | **通过**；工具完成 21 次视角/模式渲染，无 shader 错误；源簇 74 三角形，卡片 2 三角形，纹理 4,194,304 字节；释放后恢复共享 Standard DFG 缓存预热基线 | `baker/report.json`；恢复基线为 0 geometries / 1 texture，剩余纹理为 renderer 共用 `DFG_LUT` |
| 手机完整流程 | **通过，23 帧**；ground、panorama、俯视与返回的 final/repeat/off，独立大气/焦外、depth、CoC、T/L 诊断，以及暂停时旋转、resize 和恢复均完成；尺寸为 390×844 → 844×390 → 390×844，四组冻结重复帧变化均为 0 | 手机 `game/rainier-optics-review.json` 及 PNG；图集请求均为 200，实际使用 146 张 impostor 卡片 |
| 桌面完整流程 | **通过，23 帧**；完整模式与操作组完成，暂停 resize 使用 1280×800 → 960×640 → 1280×800；四组冻结重复帧变化均为 0 | 桌面 `game/rainier-optics-review.json` 及 PNG；job `138162395119` 成功 |
| 默认几何全景与缺失图集回退 | **通过，3 帧**；预期 404 后使用默认实体林片，主峰与营地同框，final/repeat/off 完成，重复帧变化为 0 | `mass-fallback` 报告及 PNG；`effectiveMode=mass`、卡片为 0，回退成功不计作图集加载成功 |

独立 probe 证据为 [artifact 14883005874](https://github.com/StarObserverPro/home-of-woods/actions/runs/45309801895/artifacts/14883005874)；桌面 23 帧为 [artifact 14883277554](https://github.com/StarObserverPro/home-of-woods/actions/runs/45309801895/artifacts/14883277554)，手机 23 帧为 [artifact 14882428224](https://github.com/StarObserverPro/home-of-woods/actions/runs/45309801895/artifacts/14882428224)，默认几何回退 3 帧为 [artifact 14882582798](https://github.com/StarObserverPro/home-of-woods/actions/runs/45309801895/artifacts/14882582798)。各场景 artifact 同时保留 baker 报告；本轮导出图集为 [artifact 14883342388](https://github.com/StarObserverPro/home-of-woods/actions/runs/45309801895/artifacts/14883342388)。

手机原图已核看：竖屏主峰与营地同框，近景略软、中景可辨；横屏俯视图重新取景，无明显拉伸或空底。桌面和手机报告均确认返回普通近景后锚点释放、观察距离回到 110、`optics.active=false`、额外 pass 为 0。横屏 resize 图处于高俯角，不单独充当横屏低俯角峰营同框的证据。四画幅几何构图另由 `tests/panorama-framing.test.ts` 检查实际 `crown` 网格最高点、营地地标及扩大的地面覆盖，已计入本轮 35 项测试。

上述浏览器检查实际运行 WebGL shader，后端报告为 **Chromium / ANGLE / Vulkan SwiftShader**。它们提供数据、着色器、输出转换和资源生命周期的证据；软件渲染器的耗时不代表实体显卡或手机 GPU 帧率。截图、JSON 和详细日志保存在 CI artifact；本轮 artifact 保留期为 14 天，不将临时验收图提交为游戏资产。

### 此前发现并已修正的问题

- 24 mm 与固定 110 距离不足以形成所需全景：现由 12–16 mm 全景端、最多 220 的受控缩远和共享地形净空完成取景。
- 深度图曾被普通彩色图的粗颜色分桶门槛误判：现按实际灰度几何像素、灰阶与空间梯度验证，T/L 也使用各自适用的诊断判准。
- 河流延伸段可能先于中央反射面绘制：现由第一个可见河段统一更新共享反射纹理与矩阵，每次 update 最多准备一次，保持已有缓存节奏。
- 暂停验收曾忽略真实 UI 的面板点击契约：脚本现在先关闭镜头面板，再点击“暂停”，同时确认暂停对话框与 `manualPause`；返回使用实际“复位镜头并继续”操作。

### 尚待确认的范围

| 范围 | 当前状态 | 仍需确认 |
| --- | --- | --- |
| 全气候与场景往返 | **尚未覆盖完整实机矩阵** | 当前完成的主营地流程固定为晴天 12:00；其他天况/时段、室内往返及动态材质的场景级资源恢复仍需各自证据 |
| 实体 GPU 帧时/手机性能 | **未实测** | 相同状态下的 GPU/帧时与资源对照；软件 WebGL 或 CPU 耗时不替代该证据 |
| 合并与上线 | **未合并、未部署** | 后续以所属 PR 与部署记录为准 |

源码中的容量、格式与内存公式是预算依据，离线行为检查只覆盖其声明范围。本轮不以构建通过、三角形减少或工具生成一张对照图推导出视觉验收或性能收益。
