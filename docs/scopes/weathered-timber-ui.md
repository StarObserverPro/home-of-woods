# 旧化薄木界面

## 范围

用户审阅 ImageGen 对照后，授权把灰褐旧木、浅边、苔绿工作面和叶片选择标记接进游戏。共享 Timber 层负责材质、视觉状态和回退，主游戏和活跃模块沿用同一入口。常驻 HUD 和主要动作使用灰褐木面，窗口内的标题和信息区使用苔绿，次要操作减少木质面积。界面文案、现有尺寸、布局和窗口输入行为继续由各模块管理。

## 可见验收

- 用实际桌面与手机视口检查 HUD、旧木屋、物品、暂停和其它共享窗口。木纹可辨，板边与阴影收薄，色彩和营地道具相容。
- 常驻工具、工作页和选中的物品有可辨状态。窗口已有选中物品时，叶片留给该物品，页签用木面标当前页。单选保留圆点，键盘焦点独立显示。
- 点按、切页、拖动入口和关闭返回焦点沿正常界面验证。材质缺失、强制颜色或减少动态时保留可读状态。

用户确认这套材质并授权回接主线。合并范围为共享 UI、三项位图、窄屏镜头布局及对应文档与验证。截图和生成母版留在临时预览目录。玩法业务由各自层维护。

## 窗口对齐与密度复核

从实际打开的玩家窗口检查标题、页签、工具行、内容和页脚如何沿用同一内容边线；并排内容分别使用所属列的边线。收紧重复的内外间距，将只承担布局的底色做透。说明、状态和可执行控件保有各自的可读面与完整命中区。以桌面、窄屏和短横屏的实际矩形、辅助线图和操作验收，范围包括主游戏与消费同一主题的活跃模块。回退可撤销本次 PR，恢复原共享主题及布局。

## 素材与接入

[素材登记](../ASSET_REGISTER.md#旧化薄木界面2026-11-28) 记录内置 ImageGen 出图及三项运行文件。横纹、竖纹取同一母版，叶片绘面按实机 13 CSS px 显示。小木件采用约 2px 的浅底，窗口用约 3px 的灰褐边。

共享主题接入主游戏和当前登记的模块。主游戏走实际 HUD、物品、路线和原生暂停入口，沙盒继续通过各自的共享主题根加载。桌面、触屏仿真和离线包的结果见 [验证记录](../../VERIFICATION.md#2026-11-28-旧化薄木-ui)。

<details>
<summary>ImageGen 素材提示词</summary>

木纹输入为已审阅旧化按钮试稿的顶栏局部。叶片独立生成并要求透明底。

#### 木纹

```text
Use case: precise-object-edit. Convert the wood material from this crop of a game interface into one reusable flat game UI texture. Output a single landscape texture canvas, target 1536 × 1024, maximum 1,600,000 pixels. Fill the entire image edge to edge with the uninterrupted flat face of homogeneous aged ash-brown timber. Straight-on orthographic scan, unlit diffuse color only. The grain runs smoothly and horizontally left to right, with fine irregular faded fibers and a few shallow elongated arcs. Use a low-chroma gray-brown close to #665e51, with little variation in average brightness; define grain through restrained differences, enough to perceive cropped into 44 to 64px buttons. Sample the wood color and narrow shallow texture in the provided buttons and make only that material. No labels, pictograms, button shapes, boundaries, plank seams, framing, bevels, nails, leaf, contrasty knots, highlighted patches, lighting gradient, bark, or transparency. The result is a cohesive flat diffuse texture that can be cropped into horizontal strips for both long and short UI surfaces.
```

#### 叶片

```text
Use case: game UI asset. Draw a single detached sage-green leaf for the selection indicator of a cozy low-poly forest camp game. Center on a transparent 1024 × 1024 canvas (maximum 1,600,000 pixels), leave clear padding around it. A single small narrow broadly ovate leaf with rounded base to the southwest, gently pointed tip to the northeast, one readable pale midrib, a simple fold into two matte color facets. Low-chroma moss and sage tones under soft daylight, roughly #9eb66a and #637b42, enough contrast to read on gray-brown timber and forest green. Graphic relief like a small pressed or carved leaf. It will be rendered at 13 × 13 CSS pixels with clear silhouette and no tiny veins, branch, logo, stroke, glitter, extra leaf, background paint, or cast shadow outside the leaf. Genuine transparency.
```

</details>
