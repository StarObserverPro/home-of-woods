# R4 回接与原候选验收记录

当前另追加 **HOW-SCENE-R5D-1** 场景回接，见 [本轮实现和证据](evidence/scene-r5/README.md)。下文角色、仓库、采集与 R4 记录保持历史归属；主体组合根的改动通过 scene-r5/capture-bridge 连接旧角色指纹与当前源和检查，不把旧截图作为新组合的实机证据。未开新 PR、合并或部署。

当前组合版为 **HOW-CHARACTERS-1**，在本地仓库/树种物产版本上追加 KayKit 玩家、访客与双手持斧止点。本轮已测源、构建、真实 UI 操作、手机视口和重复卸载记录见 [角色回接证据](evidence/characters/README.md)。下文 R4 与仓库版本均为历史记录；原仓库 `verified-source.zip` 的只读审计仍运行，角色 source-freeze 绑定完整归档并复核工作区角色入口；随后并行的库存兼容改动不在本轮 41 项/生产截图结论中。`freeze:runtime` 只写 `evidence/characters/source-freeze.json`，不会覆盖旧回执。当前版本未开新 PR、合并或部署。

当前另有本地采集支线 HOW-GATHERING-1：落枝堆、蘑菇簇、最小库存和动作/恢复契约，完整状态与本轮证据以 [evidence/gathering/README](evidence/gathering/README.md) 为准。下文为 PR #3 的历史 R4/回接记录；旧截图、录像和回执保持原字节，校验源码时绑定 `4ed0c0f`，不再将工作区新增功能冒称为旧冻结版本。`verify:evidence` 同时运行历史与当前采集审计；`freeze:runtime` 只写当前采集冻结，不覆盖旧回执。

对应 HOW-BASELINE-1.0。原候选 HOW-M0-SANDBOX-20261030-r4 的完整清单在 evidence/r4/source-freeze.json，指纹为 `00cd10ce44cbc567ad24b854c52867ec1ba27c5215e92d01401e65a4ba50dd42`。回接源码另以 evidence/integration/source-freeze.json 冻结，capture-bridge.json 逐文件列出差异；两者不冒称为同一次录制。

PR #2 已合并为 d22ac56b641ceaf3deb0d220084af63a5e600b0d。2026-10-30 已获准将选定 R4 接入主体并准备实现 PR，当前代码和资产位于实现分支；实现 PR 合并和发布另行记录。早期 R3 和 R4 首检材料保留为历史，不代替最终材料。

## 检查与实际操作

`npm.cmd run check` 包含五个生产 GLB/地表来源及 hash 检查、行为/几何/资源测试、TypeScript 和 Vite 生产构建；当前执行结果单独保存于 evidence/integration/check.log。`npm.cmd run verify:evidence` 只读校验当前冻结源、回接差异及原 R4 的13类实机证据，不改写任何旧回执。原 R4 的19项测试、解码结果及性能样本保留在 evidence/r4/check.log、evidence-audit.json、media.json。

| 条件 | 当前实现与证据 |
| --- | --- |
| M0-01 山间家园、谷底、后山边界 | 家园高程 21.5，河岸约 1.6；宅后小路升到约 38 的望台，Z=-75.8 木栏与路牌提示未开放深山。desktop-home.png、desktop-valley.png、desktop-lookout.png 与两处 arrival.json。 |
| M0-02 连续行走、落地与碰撞 | 同一地表三角形插值驱动渲染、坡度、角色与树木落地。建筑/两类树干实际 GLB 占地、水岸与边界检查通过；四处路径可达且不斜穿碰撞。walk-and-camera.webm 展示实际行走，非预制镜头动画。 |
| M0-03 镜头、选择与输入隔离 | 真实画布拾取巨木显示保护卡；拖动、按钮缩放和复位改变镜头而不改变玩家坐标或建立路线。手机摇杆、镜头按钮、帮助与 Esc 暂停/恢复另有 DOM 量测。production-pick.txt、desktop-selection.png、input-and-camera.json、mobile-*-input.json、keyboard-pause.json。 |
| M0-04 身份和可复现性 | seed 104729，580 个树实体：151 经营树、1 受保护巨木、428 远景树。槽位、代次与个体 ID 分开，固定布局已导出到 resolved-layout.json。重入保留同一会话，不刷新已用额度或重复发木材。 |
| M0-05 资产、比例与材质 | 五个定制 GLB 统一低多边形玩具比例和非金属材质；R3 MJ 局部编辑及 Atlas RGBD 的来源、清理边界、失败分支和 Blender 源均有登记。R4 增加林下/草甸数字色块、亮白雪峰/浅蓝冰沟、Sky Porch 启发的白昼天光与原河面流纹。最终审美方向交用户审查；不沿用旧图的认可作为整版实机认可。 |
| M0-06 唯一循环与生命周期 | 五次实际卸载重入，旧 RAF 终止、旧缓存清零、上下文释放，新实例资源计数收敛；木材 5、已用 5、可用 19 全程一致。lifecycle-cycles.json 保留每轮完整快照，资源与性能分开判断。 |
| M0-07 当前实机材料 | 家园、溪谷、望台、角色近景、普通场景选择、390×844 竖屏、844×390 横屏；另有约20秒漫步/镜头与约20秒采伐录像。全部是本游戏实际运行画面，录像只捕捉 canvas，React HUD 由截图单独展示。 |

## 本轮追加的真实采伐

用户要求把砍树和倒树做出来，因此在 M0 候选上增加一条有限林业链路：选择成熟经营树→走近斜侧安全站位→明确开始→四次挥斧→一次同步结算→1.7秒倾倒→成桩。倒伏树体再躺地保留1.8模拟秒，落地散屑复用固定池；源树不继续参与拾取，树桩可选。

实际取消检查：挥斧中暂停，木材仍为0、预留5点；恢复后取消，额度回到24、预留清零。实际完成检查：原树保留原槽位，变成树桩，木材5、已用5、可用19。巨木始终无砍伐入口。证据为 chop-paused.json、chop-cancelled.json、forestry-result.json、protected-landmark.json 和 forestry.webm。

生产 GLB 测试另覆盖动作不写业务状态、倒伏/停留/隐藏边界、共享资源不随帧增长、重复到期不重复结算、原位幼树换代与未成材禁伐。150秒补生、300秒成材是候选模拟参数；完整等待后的成熟行为由确定性测试验证，未把本轮短录像声称为完整生长周期实录。完整年度经济、制作、修屋和持久存档仍属后续阶段。

## 看图修整与性能边界

首检交叉审查指出：雪峰偏蓝灰，倒树沿视线不清楚。最终轮按实际表面分类提供亮白雪面/浅蓝冰沟的漫反射底限，下移主峰雪线；采伐首选站位偏向相机前侧45°并增加短暂倒地停留。几何和地面天光预算保持不变。新图与新录像重新绑定最终冻结版本；evidence/r4-first-pass/ 不进入审查包。

山天模块实际10,260三角、7个Mesh、2材质；河水只替换原有河面的材质，新增几何/贴图为0。完整场景的 draw calls/三角形含阴影及实例化，随视角变化；采样原值在各 JSON，不用模块三角数冒充整场景成本。

设备样本为 Windows、Ryzen 7 7730U / AMD Radeon 集显，ANGLE D3D11。最终复查使用独立浏览器页1528×686，其他游戏预览暂停。记录原始 RAF 间隔，逻辑 dt 的100ms限制不作为性能成绩；加载与初始着色器编译的抖动保留在快照中。当前材料不宣称锁定60fps，真实移动设备性能、双指手势和强制上下文恢复没有本轮设备证据。桌面视口仿真证明布局和相应输入可用，不能替代实机手机验收。

最终五轮样本的原始 RAF p50 为16.70ms，p95 为32.95–33.40ms；每次新实例为48个 GPU 几何、8个纹理，缓存33几何/9材质/169附属资源。旧实例缓存和 GPU 几何归零、循环终止；驱动统计保留1个内部纹理计数且不增长，不把它写成纹理数为0。完整值及采样帧数随 lifecycle-cycles.json 交付。

## 回接修复与当前验证

主体已完成 `npm.cmd ci`（0个依赖审计问题）和 `npm.cmd run check`：23项测试全部通过，TypeScript与Vite生产构建成功。当前运行时指纹为 `e956ca630f5bf91078f7f8147643dbceb844374cbb0eec24a4cdab14032b0e78`；`npm.cmd run verify:evidence` 通过，并保持旧回执不变。回接后的生产操作与释放快照保存在 [integration证据](evidence/integration/)。

当前主体生产包已实测：走近、挥斧、暂停恢复、倾倒与成桩，木材0→5、可用额度24→19；普通运行无控制台错误，开发录像POST接口在生产中返回404且没有保存按钮。五次重入均保持缓存33几何/9材质/169附属资源，当前有树桩的场景GPU为50几何/8纹理；旧owner清零、旧循环停止、上下文释放，余额不刷新。390×844视口的实际摇杆、镜头按钮、布局溢出和44px触控框检查见 mobile-input.json；当前截图为 [主体全景](evidence/integration/desktop-home.png)、[采伐后树桩](evidence/integration/desktop-stump.png)、[手机视口](evidence/integration/mobile.png)。完整JSON见 production-smoke.json 和 lifecycle-cycles.json。

回接审查补齐两项实际失败场景：幼树成长时扩大碰撞，可能将旁边的人物包进树干；现在只允许从既有圆形重叠中单调退离，不移动树位、缩小碰撞或绕过水岸/建筑/坡度。另一个场景是单个GLB先失败，其他请求迟到后向已销毁owner登记资源；现在终端owner立即且仅一次释放迟到资源，失败加载不能重新填入模型模板。对应生产GLB/实际成长状态回归测试随源码提交。

其余回接差异是诊断标签、资产登记状态、独立MIT通知、开发录像写入目录与跨平台LF规范化。R4录像、截图和解码回执保持原字节；当前生产构建、碰撞与生命周期复核另存 evidence/integration，不把旧录像当作新增修复的证明。

## 交付与复核

回接采用已审查包的白名单，原始清单保留在 evidence/r4/REVIEW_MANIFEST.json，实际接入清单在 evidence/integration/intake.json。未复制账号回执、签名下载地址、原始 Sky Porch JS、整景 SPZ、旧草稿、node_modules 或其他项目资料。第三方MIT通知随 public/third-party-notices.txt 分发。

主体根目录按 README 安装和运行。此次回接授权已经取得，无需再次询问；当前目标是完成可审查实现PR，合并该实现PR和部署分别遵守后续授权。GitHub Verify 在PR与main提交上执行依赖安装、工程检查和证据校验。

## 当前仓库与树木物产版本

当前实现已进一步修改仓库、宿主和实例绘制；[gathering v1](evidence/gathering/README.md)保持历史回执。当前源码冻结与实际验证移至 [warehouse-tree-resources](evidence/warehouse-tree-resources/README.md)。旧采集源码当时未提交或另存完整归档，其指纹只作为历史标识；当前源文件校验绑定本轮新冻结，旧回执不充当当前版本证明。

## 物品身份与品质兼容追加

完整世界存档现已进一步接入，参见 [world-save](evidence/world-save/README.md)。其校验覆盖库存、额度、树木、资源池和动作；实机中断挥斧读档、重复刷新、真实 IndexedDB 并发/回滚和损坏保护分别记录。本节后面的物品阶段描述及归档仍绑定当时版本。

本轮将原木、枝杈和蘑菇统一到按物品/品质堆叠的库存，实现库存切片 JSON 兼容加载、未知目录保留和旧会话整笔适配。实际检查、桌面/手机截图及本轮源码指纹见 [物品兼容证据](evidence/item-stack-compatibility/README.md)。前述 R4、采集、仓库与角色冻结回执仍绑定各自源码，不替代本轮验证。完整世界持久化和加工执行尚未实现。
