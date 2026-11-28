# 林工试衣间

本地入口 [林工试衣间](http://127.0.0.1:5296/)。三套样衣使用同一位林工 J01，分别为林场工装、镇上便服和林地巡游。选择整套可直接比较轮廓，选择部位可混搭、换色、切换做工及装卸挂件。预览支持拖转、方向键、四个固定机位、局部查看、站走跑、抬臂和屈膝。「体型对照」在同一姿势切换原始与修整后的底衣。

[词条试穿](http://127.0.0.1:5296/?affix=1) 可在当前穿搭回放 PR #19 的十三个例子。「素材检视」提供单色、配对双色、粒形、排布、触发和四个可变色部位。「默认游玩」和「拉近游玩」使用同一套游戏镜头参数模拟角色的屏幕尺寸。各触发在本地场景回放，月光、日光和精简动效均可单独检查。

## 打开与修改

从项目根目录启动独立本地服务。它只监听回环地址，使用本机的 `.cache/j01-player/j01.glb` 和本目录的 `.cache/wearables.glb`。存在 `.cache/j01-gait-review/j01-gait-candidate.glb` 时采用同一绑定上的站走跑候选。若缺少候选，仍可用原有 J01 站姿与步行检查样衣。

仓库提供制版脚本、试衣入口和验证工具。实际试穿需已有本地 J01，再通过下文命令生成样衣。NP120 模型与由其派生的样衣 GLB、Blender 文件均留在本机缓存。

```powershell
node node_modules/vite/bin/vite.js --config sandbox/j01-wardrobe/vite.config.mts --configLoader runner
```

可在 Blender 中打开 `.cache/J01-wardrobe.blend`，按衣柜集合的槽位与款式切换对象。`Dye.` 材质是可染色布面或皮面，精制与挂件在各自的对象层。用下列命令按源文件重建和读回，或将 `blender` 替换为本机可执行文件路径。

```powershell
blender --background --factory-startup --python-exit-code 1 --python sandbox/j01-wardrobe/authoring/build.py -- .cache/j01-player/j01.glb sandbox/j01-wardrobe/.cache
blender --background --factory-startup --python-exit-code 1 --python sandbox/j01-wardrobe/authoring/readback.py -- .cache/j01-player/j01.glb sandbox/j01-wardrobe/.cache
node sandbox/j01-wardrobe/review.mjs
node sandbox/j01-wardrobe/review-affixes.mjs
node sandbox/j01-wardrobe/review-body.mjs
```

独立验证可用 Vite 的 `--port` 选择空闲端口，并把 `J01_WARDROBE_REVIEW_URL` 设为对应的试衣间地址。体型前后对照还需已有的修整前样衣和步态候选。

## 装配

- 每件样衣保留 `kitSlot`、`kitStyle` 与 `kitLayer`。基础版型、精制部位和挂件可以独立显示，挂件层带 `kitAnchor`。升级和染色沿用原蒙皮与版型。
- 帽口由 `authoring/headwear.py` 从 J01 额头和两侧截面定尺。三款帽子各配相应的 `hair` 层，帽子与发型同绑 `head`。同机位修订图保存在 `.cache/hat-fit/comparison.png`。
- 背带、腰带和领巾读取 `kitFit`，根据当前上衣选择对应的缝合形状。其余衣件取同一 J01 站姿坐标，使用原本的 50 骨；试穿时按名称映射到角色本身的骨架和原步态。
- 上胸和外肩的修形由 `authoring/torso.py` 作用于底衣、上衣、相关配件和领口内层。`kitLayer=fit-body` 取自原底衣，样衣与修形后参考仍沿用原权重。前后对照重跑使用 `.cache/affix-fitting/original-wearables.glb` 的修整前样衣。
- 灯光采用游戏共享 `interior` 配置，角色以游戏尺寸的 1.55 倍 J01 模型单位站在独立试衣台上。脚下使用共享 `character` 接触阴影，根据实际鞋靴和骨骼采样。`?uiGrid=1` 可显示共享对齐辅助线。
- 检查结果在本地 `.cache/readback.json`、`.cache/review/` 和 `.cache/affix-fitting/`。模型、纹理及截图留在本机忽略目录。沙盒可独立审阅，后续接线按 [样衣范围](../../docs/scopes/j01-wardrobe-samples.md) 和 [词条与体型范围](../../docs/scopes/j01-affix-visual-review.md) 执行。
