# 角色资产检查

美术标准由 [CHARACTER_STANDARD](../../docs/CHARACTER_STANDARD.md) 维护，机器预算读取 [character-quality.ts](../../src/content/character-quality.ts)。修改标准时同步这两处和相应测试；这里不再复制一套预算数字。

```sh
# 检查真实文件，不写模型、不抓取外部贴图。
node --experimental-strip-types tools/characters/audit.mjs inspect public/assets/characters/player.glb

# 日常检查：已接入资产的技术错误会失败，未制作的源模型仍可留在清单中。
node --experimental-strip-types tools/characters/audit.mjs validate --config tools/characters/intake.json --strict --json .cache/character-audit/intake.json

# 检查整批是否完成准备：所有 pending 都阻塞，包括已有源文件的 pending。
node --experimental-strip-types tools/characters/audit.mjs validate --config tools/characters/intake.json --strict --require-all
```

所有相对文件路径都以仓库根目录为基准。`inspect` 也接受本地绝对路径。默认向标准输出写 JSON；`--json` 写完整报告并打印摘要。报告包含源文件 hash、场景实例的三角面/顶点/材质/骨骼、每个 primitive、贴图尺寸、未蒙皮包围盒、morph 和眼部控制候选。draw call 是 Three.js 默认颜色通道估算，计入双面透明的两次绘制，不包含阴影/深度通道；纹理内存是各独立图像按 RGBA8 全 mip 推算，不是 GPU 实测。头身比、轮廓、服装风格和动作质量仍须与实际 J01 同机位审查。

## 清单的三个状态

| `status` | 检查行为 | `--strict` |
| --- | --- | --- |
| `pending` | 文件缺失时明确未测；文件存在时完整报告问题，作为制作前状态，绝不算 ready | 日常不阻塞；加 `--require-all` 后无论有无文件都阻塞 |
| `legacy` | 测量现有回退资产；新预算和贴图规格差异记 warning | 坏索引、越界数据、丢失引用、损坏文件及文件缺失仍失败 |
| `ready` | 按当前标准检查真实导出文件与登记的来源权限 | 缺失文件和任何技术错误均失败 |

退出码 `0` 表示所选检查范围没有阻塞项；`1` 表示 `--strict` 发现阻塞；`2` 表示命令或配置无法读取。日常 `--strict` 为 `0` 不表示 pending 角色制作完毕；以报告中的 `declaredStatus`、`status`、`inspection` 和 `summary.passedTechnical` 为准。`passed-technical` 也不表示游戏已接线或已看过实机。

## 清单字段

```json
{
  "contractVersion": "HOW-CHARACTER-1",
  "assets": [{
    "id": "frontier-trader-f",
    "tier": "trader",
    "file": ".cache/character-intake/frontier-trader-f/character.glb",
    "status": "pending",
    "visibility": "local-only",
    "source": {
      "modification": false,
      "gameUse": false,
      "redistribution": false,
      "evidence": "填写实际来源和许可依据；false 表示尚未核实"
    },
    "expected": {"bones": 50, "blink": "morph", "animations": ["idle", "walk"]},
    "variants": [{"id": "moss-canvas", "baseColorFile": ".cache/character-intake/frontier-trader-f/moss-canvas.png"}],
    "review": {"proportions": "pending", "wardrobe": "pending", "deformation": "pending"}
  }]
}
```

`expected`、`variants`、`review` 可省略，示例中的骨数和动作名只用于说明字段，不是 F 已有这些能力的声明。`expected` 仅填写已经确定需要保留的实际能力，不能用猜测的骨数冒充源模型统计。无文件时 `file` 可以是 `null`。来源权限依据是登记声明，检查器不代替核验原许可；`public` 接入额外要求公开再分发权，`local-only` 不能放在 `public/` 或 `sources/`。工具不会复制或发布任何模型。

模型导出时可以在 mesh extras 中写 `howCharacterPart: "body"` 或 `"accessory"`，报告会按标签汇总。不带标签时只报告真实总数和 `unclassified`，不猜身体/背包各有多少面。目标面数不是最低配额，低于目标的优良轮廓不会因为面数少而失败。Draco/meshopt 压缩几何必须先导出未压缩审查文件；检查器不会在没有解码的情况下给出形体通过结论。

## 可选的 Blender 工具回归

修改 `normalize.py` 的简化或保护逻辑后，可在已安装 Blender 的本机运行：

```sh
blender --background --factory-startup --python-exit-code 1 --python tools/characters/test_normalize.py
```

测试临时创建原创网格，验证只减选中的共享网格实例、受保护顶点的坐标/UV/权重保持，以及带 morph 的网格不减面。不依赖私有角色文件，不下载或安装依赖，也不作为新增 CI 门禁。
