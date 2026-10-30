# R4 雪山、天空与河流表现

状态：2026-10-30获准回接，当前实现分支已接入；PR待审查，尚未合并或部署。

## 范围与权属

表现代码是 `src/scene/environment.ts`，静态规格是 `src/content/environment.ts`；生成物检查是 `tests/environment.test.ts`。本模块只消费现有运行时的 elapsed、相机位置与地表工厂产出的河流 Mesh。相机、渲染器、RAF、灯光对象、地形、水岸、交互与持久状态继续由原有所有者管理。

雪山由六个独立创作的虚构山体构成，采用 PNW 的宽阔冰川火山与锯齿山脊轮廓；不是任何具名山峰的测绘复原。主峰含偏心峰肩、宽山麓、放射状冰蚀凹谷，群山采用不等距脊线节点与横向冰斗。每面法线与雪、岩、冰表面分类可从实际几何读取。沿用低多边形面与柔和色彩，不将山体注册为可达游戏地表。

## 接口与接线

```ts
const environment = createEnvironment(resources, { renderer });
scene.add(environment.group);
scene.environment = environment.environmentMap;
scene.environmentIntensity = environment.lighting.environmentIntensity;
renderer.toneMappingExposure = environment.lighting.recommendedExposure;
const river = createRiverAppearance(resources, water);

// 原有单一应用循环中调用。模块不写主相机。
environment.update(elapsed, dt, camera.position, reducedMotion);
river.update(elapsed, dt, reducedMotion);

// 原有场景销毁流程。Resources 是 GPU 资源唯一释放者。
scene.environment = null;
river.dispose();
environment.dispose();
resources.dispose();
```

`environment.lighting` 提供太阳方向/颜色/强度、半球光上下颜色/强度和雾色，供组合根同步现有灯光。天空盒跟随相机位置，山体保持世界坐标。相机 far 需覆盖最远 z=-915 的山体；组合根当前采用 1100 并独立调整构图。

水材质只替换既有河流 Mesh 的 material，保留原 geometry、UV、水位与边界。UV 横向分量表达岸边，世界 z 与唯一 elapsed 表达向 +z 的水流；采用深浅青绿、细流纹、克制的岸边泡沫和小法线波动。没有新水面、位移、反射相机或新增水岸事实。`river.dispose()` 恢复调用者原材质；材质实际释放交给 Resources。

## 测量与预算

预先声明的整个山天对象图上限：18,000 三角形、7 个 Mesh、2 种材质。实测为 **10,260 三角形、7 个 Mesh、7 份几何、2 种材质**；水表现另外只增加 **1 份材质、0 份几何、0 张纹理**。

| 山体 | 实际三角形 | 世界最高点 y | 雪面三角形（含冰） |
| --- | ---: | ---: | ---: |
| glacier-volcano | 2,992 | 154.40 | 646 |
| western-cirques | 1,496 | 99.67 | 72 |
| eastern-aretes | 1,824 | 107.89 | 141 |
| distant-ice-divide | 1,440 | 114.45 | 213 |
| western-sentinels | 1,248 | 81.94 | 34 |
| eastern-shoulders | 1,248 | 86.54 | 71 |

天空盒另含 12 个三角形；主峰雪面中 156 个三角形属于冰川分类。山体实际总范围约 x=-675…695、z=-915…305。CPU 对象图统计不等同于相机当前可见三角形、阴影 pass 或 GPU 帧耗时。

传入 renderer 时生成一次 size=128 的 PMREM；使用 Three 0.186.1 的 CubeUV 布局，输出 384×512 的 HalfFloat RGBA 纹理（颜色缓冲约 1.5 MiB，未计驱动与深度附件）。临时 PMREMGenerator 立即释放，保留 RenderTarget 注册到 Resources；不在帧循环重新生成环境贴图。天空仅在主视图逐帧更新云的时间。

## 实际验证

- `node --experimental-strip-types --test tests/environment.test.ts`：3/3 通过。实例化真正的山天与既有地形 builder，检查有限坐标、实际几何/材质数量、岩雪冰分类、确定性、天空跟随、reduced motion、河面几何/水位不变、三轮销毁和唯一释放。
- `npm.cmd run build`：类型与 Vite 构建通过。现有 bundle 大于 500 kB 的提示保留；它没有被当作帧率验证。
- 组合根已接入本模块。父任务的实际 WebGL 检查已确认水材质可编译并呈现流纹；山材质首轮编译暴露 GLSL 拼接缺少换行，已补换行。修复后山材质实际编译、全景/宅后视角、窄屏、PMREM 与总场景 GPU 释放由父任务继续验收；CPU 测试不替代这些视觉证据。
- 默认俯角 .32 在 1528×684 截到火山顶；父任务正在调整默认俯角与天空留边。此记录不宣称默认构图已通过。
- 首检 `evidence/r4/environment-first-check.png` 显示天际近白、PMREM 让地面偏粉浅。已保留散射/柔云而对进入 PMREM 前的天空辐亮度作日间校准（scale .11、线性 tint [.68,.84,1]），曝光回 .65、半球光 .86、雾色略偏蓝；实际再检由父任务提供。冰沟几何与冰川着色改为共用同一组冰蚀槽定义，增强层次且未增加三角形。

最终组合参数在实机复查后为默认俯角 .24、最小俯角 .12、缩放 .76、ACES 曝光 .85、半球光 1.05；保留辐亮度 .11 和冷蓝校正。以上 .32/.65/.86 是首检过程值，最终事实与当前证据以 PARAMETERS.md 和 VERIFICATION.md 为准。

最终交叉看图后，主峰雪线阈值改为 .44，实际分类为490面白雪、156面冰沟（合计646）。材质消费 surfaceType，给高反照率雪面和冰沟分别设置中性亮白/浅蓝的漫反射底限，并按面法线保留层次，裸岩不加此补光。此轮只修山体表现，不改变地面光照、几何数量或太阳方向；最终全景和录像已重新采集。

## 来源与许可边界

- 天空使用项目已安装 `three@0.186.1` 的 `three/addons/objects/Sky.js`，随 Three 的 MIT 许可；使用其大气散射与程序云实现，没有外部图片或 HDR 下载。
- 天光调性参考用户自有 [Sky Porch](https://sky-porch.starobserverpro.chatgpt.site)，父任务核验为用户所有的 v35。只读参考提取位于 `art/reference/sky-porch/{atmosphere.js,evening-sky.js,app.js}`。本模块借鉴固定日光参数与浅层指数雾的表达，按游戏单位调整高度；没有复制天文定位、实时时地、UI 或业务模块。未搬用 evening-sky 的第三方暮光 GLSL。
- 山形创作时参考 [NPS 冰川说明](https://www.nps.gov/mora/learn/nature/mount-rainier-glaciers.htm)、[NPS 地质说明](https://www.nps.gov/mora/learn/nature/geologicformations.htm) 与 [USGS 冰川地形说明](https://www.usgs.gov/volcanoes/mount-rainier/science/glaciers-help-shape-mount-rainier)。没有下载或分发网页图像，没有将示意形态作为真实地点事实。

## 回退与剩余验收

组合根移除本模块调用即可回退；先 `river.dispose()` 恢复原水材质，场景销毁仍由 Resources 释放本轮 GPU 对象。旧圆球远山与静态 ripples 的删改由组合根负责人处理，本模块没有修改地形文件。

视觉质量下限是可辨的宽火山主峰、锯齿群峰、岩雪冰层级、远近空气透视，以及保留暖木屋和橄榄绿草甸的统一天光。最终截图、实际 GPU 预算与最终调色应绑定父任务验收后的版本；本记录不把预算通过等同于视觉通过。
