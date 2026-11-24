# 多视角远树烘焙

`node tools/impostors/export.mjs` 从游戏当前 `distantTreeGeometry` 构建一小簇三棵针叶树，并导出到 `public/assets/forest-impostors/`。需要已安装依赖以及可运行的 Chromium；可用 `CHROMIUM_EXECUTABLE` 指定可执行文件。使用系统 Chromium 时不下载浏览器。

```sh
CHROMIUM_EXECUTABLE=/usr/bin/chromium node tools/impostors/export.mjs
IMPOSTOR_FRAME_SIZE=256 node tools/impostors/export.mjs
```

工具在自己的 Vite 端口 5194 运行并自行退出，不进入游戏 RAF。脚本名后的第一个位置参数可改输出目录。运行验证的图片和报告写入系统临时目录 `how-impostor-review`；`IMPOSTOR_EVIDENCE_DIR`（或 `EVIDENCE_DIR`）可更改该位置，图片不得输出到源码树。

每个资产有 25 个视图：8 方位 × 0°/30°/60° 仰角，再加正顶视。每帧默认 128²，四像素内部边距，图集为 1024×512。分别导出**未受光的线性 RGB + 覆盖 alpha**和**资产坐标空间法线**。MSAA 边缘先还原 straight RGB，再逐图块扩张透明像素的 RGB；alpha 轮廓不膨胀。Node 使用内置 zlib 直接编码 RGBA，并解码最终 PNG 逐字节核对，保留 Canvas 预乘转换会清除的全透明 RGB；浏览器另外读取实际上传的 GPU 纹理，检查扩张色仍然存在。PNG 中的数值为线性数据，运行时不要套 sRGB 解码。两个 RGBA8 图集占约 4 MiB GPU 纹理，不生成会串格的 mipmap。

JSON 保留实际包围盒、构图中心、正交视野宽度、相机方向、源三角形数、图集 hash 和源码 hash。修改源树形后重新运行导出。`bakeImpostor` 也可用于单株：提供普通静态、不透明、单材质且仅用顶点色的 Mesh/Group；不接受蒙皮、morph、贴图或透明材质，防止悄悄烘错资产。

## 运行时

```ts
const atlas = await loadImpostorAtlas('/assets/forest-impostors/rainier-conifer-cluster.json');
const batch = createImpostorBatch(atlas, [
  {position: [300, 70, 400], scale: [1.6, 1.4, 1.6], yaw: .5, tone: .95},
]);
scene.add(batch.mesh);
// 后续由资源所有者依次 batch.dispose(); atlas.dispose();
```

每个实例在 shader 内根据**当前绘制相机**选择四个相邻视图并做 alpha 加权插值，倒影相机使用同一机制，无逐帧 CPU 换贴图。正顶视图按实例方位旋转。物体空间法线经实例尺度和旋转变换回视空间，标准材质继续读取游戏的灯光、环境和大气材质补丁，不固定白昼颜色。`debug('albedo'|'normal'|'final')` 可检查数据。

此卡片用于远处装饰树簇，不拥有交互身份、碰撞或阴影；深度仍是卡片平面。一次绘制只用两个三角形，但最多八次纹理读取和透明区填充并不免费，因此保留实体林片 A/B。近景、贴地轮廓和重要山脊上的独立树继续使用几何。加载失败时由宿主保留当前几何，成功且确认场景尚存活后再替换。

导出器检查重复烘焙像素一致、25 帧覆盖、透明边距、renderer 状态恢复、多角度 shader 编译和资源释放，并生成一张源几何/图集卡片的未受光数据对照。该对照只验编码和 shader，实际森林构图、天气、阴影及机身性能由主游戏验收。

## 来源

网格和程序布局来自本项目既有自有程序几何；本批不引入外部模型、图片或生态原始坐标。算法实现为本项目代码，参考概念：[Shaderbits 的多视角 impostor 介绍](https://shaderbits.com/blog/octahedral-impostors)、[Three.js 实例网格](https://threejs.org/docs/pages/InstancedMesh.html) 与 [Material alphaTest/alphaToCoverage](https://threejs.org/docs/pages/Material.html)。本实现采用规则方位/仰角采样，不是完整八面体重投影，也没有逐像素深度修正。
