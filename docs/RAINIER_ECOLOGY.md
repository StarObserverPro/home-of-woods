# Rainier 山麓营地：生态原型与视觉缩尺

实现记录：2026-11-23。地域预设已进入本轮实现；组合画面与 GPU 验证待 CI，合并及部署另行记录。

本轮场地定位为 **Mount Rainier 西南麓、Nisqually 河谷森林中的营地林窗**。550–750 m 的设定海拔属于美术场景定义；游戏地形、道路与河流继续由现有世界坐标决定。远山保留原创风格化地形，不宣称复刻真实营地、地形或树位。

实现入口：[`src/content/rainier-ecology.ts`](../src/content/rainier-ecology.ts)。本页维护地域与数据依据、可视原型及缩尺；镜头、大气、远树图集及统一验证状态见 [Rainier 渲染实现](RAINIER_RENDERING.md)，任务边界见 [本轮范围](scopes/rainier-forest-optics.md)。

## 本地依据与可用的样方参考

[NPS 植被分区][mora-plants]将 Rainier 约 500–800 m 的低海拔森林概括为西部铁杉、花旗松和西部红柏主导。[2021 年植被制图报告][mora-mapping]进一步指出，低地林主要沿 Nisqually、Carbon 与 Ohanapecosh/Cowlitz 河谷分布。该项目的制图建模使用 1,900 个样地，覆盖 124 个植被群落与 37 个制图类别。它支持地域与群落选择；本轮没有将这些原始样地坐标或 GIS 数据包导入游戏。

树木层次参考 Shaw 等 2004 年的 [Wind River 样方研究][wind-river]。这是南华盛顿 Cascade 西坡的 4 ha 老龄林样方，不在 Rainier。原论文 [Table 3，PDF 第 9 页][wind-river-pdf]统计的是 **胸径 DBH > 5 cm 的针叶树**，以下数值均为样方平均值：

| 树种 | 存活密度（株/ha） | 平均胸径（cm） | 平均高（m） |
| --- | ---: | ---: | ---: |
| 西部铁杉 / Tsuga heterophylla | 224.0 | 29.9 | 19.0 |
| 花旗松 / Pseudotsuga menziesii | 35.0 | 111.0 | 52.0 |
| 西部红柏 / Thuja plicata | 30.0 | 68.6 | 29.0 |
| 太平洋紫杉 / Taxus brevifolia | 85.8 | 13.8 | 6.2 |
| 太平洋银冷杉 / Abies amabilis | 47.0 | 12.2 | 8.5 |
| 全部 8 种针叶树 | **427.3** | 34.2 | 19.2 |

各物种的均值不能当作高度分布，也不能将全部 427.3 株画成同一高度的成熟大树。本轮提取的是结构关系：少量高大的花旗松高出主体铁杉林冠，小树和林下植物形成较低层次。`WIND_RIVER_REFERENCE` 只保存上述参考事实，生成器不以均值伪造实测分布。

另一项 [Wind River 25.6 ha 样方研究][wind-river-spatial]发现，研究中的较小胸径树在 9 m 以内有聚集，大树的分布更接近随机或仅有较弱聚集。这个结果支持在随机大树骨架间保留小树簇与林窗。本轮使用宽尺度林片和较小尺度簇的确定性场，具体噪声尺度及权重均为美术配置；没有将压缩景观的 24/82 单位噪声尺度声称为 9 m 实测聚集尺度。

## 五个已有 mesh kind 的视觉对应

`oak`、`poplar`、`pine`、`spruce`、`fir` 是外围景观的既有网格分桶。它们映射到本地视觉原型，不改经营树 `pine | broadleaf` 的持久种类、身份、材质库存、额度或资源数量。近景外观可以复用地域名称与配色，经营数据仍由原来的世界/domain 模块维护。

| 外围 kind | 本地视觉原型 | 轮廓与位置 | 高度倍率 | 宽度倍率 |
| --- | --- | --- | ---: | ---: |
| `pine` | 花旗松 | 高直干，上部略不规则开展冠；少数穿出林冠 | 1.80–2.80 | 1.05–1.75 |
| `spruce` | 西部铁杉 | 窄冠、分层、轻微垂梢；主体针叶林 | 1.05–2.05 | 0.90–1.55 |
| `fir` | 西部红柏 | 下部展开的垂挂冠、宽基干；湿润沟谷权重增加 | 1.15–2.10 | 1.10–1.90 |
| `oak` | 藤枫 | 低矮多干阔叶簇；林窗及河谷边缘 | 0.62–1.04 | 0.74–1.20 |
| `poplar` | 红桤木 | 中小型阔叶冠、浅灰干；溪流与湿润坡面 | 0.85–1.35 | 0.88–1.42 |

倍率乘在既有外围树网格上，属于景观压缩参数，不是以米为单位的生物量模型。较高地形最多再压低高度 12%，表现暴露坡面的较矮轮廓。NPS 的 [针叶树说明][mora-conifers]支持前三种的形态，[阔叶树说明][mora-deciduous]支持藤枫和红桤木的形态及生境。太平洋紫杉和银冷杉保留在研究参考中，本轮不为它们新增运行时资源。

大气模块另使用 `8 m/world unit` 压缩光学距离；该值只控制空气透视，不将树高、道路长度、角色尺度或上述噪声场换算为真实米制场景。

`rainierForestWeights(height, bankDistance)` 返回相对权重。`height` 是本地地形高度，`bankDistance` 是现有河道中心线距离，都使用当前场景单位。河谷增加红柏与红桤木比例，高坡保留铁杉并略增加花旗松。权重不是 Rainier 或 Wind River 的物种实测比例。

## 密度与预算

`RAINIER_CAMP.authoredStandDensityPerHectare` 的 150–220 株/ha、默认 180 株/ha，是供未来按实际面积构建样区时使用的成熟可视树设计目标。它不声称是某个真实森林的密度，也不驱动当前外围全景的实例数。

当前外围沿用原有最多 2,850 个树锚点和 57,000 个源几何三角形的上限。`rainierDensityAt` 提供每个候选位置的接受概率；规划器仍负责数量、三角形、道路、河流、地表和已存在树位的排除。远景林片可以继续将多个锚点合成可视体，锚点、渲染实例和现实树木数量分别记录，不互相替代。

远林默认继续使用 `mass` 实体林片；`farForest=impostor` 为同一装饰林规划提供图集 A/B。图集卡片不新增经营树、资源或持久身份，也不借此增加数万棵远树。烘焙规格和验证边界见 [Rainier 渲染实现](RAINIER_RENDERING.md#远林图集与-ab)。

确定性规则以空间坐标和固定 seed 求值，与 chunk 加载顺序、时间或 GPU 帧数无关：

```js
const probability = rainierDensityAt({x, z, height: y, bankDistance: bank, slope});
if (rng() > probability) continue;
const kind = chooseRainierTreeKind(y, bank, rng());
const {width, height} = rainierTreeScale(kind, x, z, y);
// The caller still applies existing count/triangle budgets and exclusions.
```

## 来源、访问范围与再利用

本轮只使用公开论文/官方说明中的汇总事实，形成原创参数和程序化资产；没有复制第三方网格、纹理或原始地理数据。源码保留论文引用与本页链接。

- Shaw, D. C., Franklin, J. F., Bible, K., Klopatek, J., Freeman, E., Greene, S., and Parker, G. G. (2004). *Ecological Setting of the Wind River Old-growth Forest*. Ecosystems 7: 427–439. [USFS 记录][wind-river]；[原论文 PDF][wind-river-pdf]。本轮使用 Table 3 的汇总统计，没有复制图版或整篇内容。
- Lutz, J. A., Larson, A. J., Freund, J. A., Swanson, M. E., and Bible, K. J. (2013). *The Importance of Large-Diameter Trees to Forest Structural Heterogeneity*. PLOS ONE 8(12): e82784. [DOI/全文][wind-river-spatial]。文章声明 Creative Commons Attribution；本轮引用聚集关系，未复制原始树位。
- Nielsen, E. M., Copass, C., Brunner, R. L., and Wise, L. K. (2021). *Mount Rainier National Park vegetation classification and mapping project report*. NPS/NCCN/NRR—2021/2253. [DataStore/DOI][mora-mapping]。
- NPS：[Rainier 植被分区][mora-plants]、[针叶树][mora-conifers]、[阔叶树][mora-deciduous]。西部红柏的湿地形偏好另见 [USFS Silvics][redcedar]。
- NPS [NCCN 植被制图入口][nccn-mapping]提供样方、群落说明及地图等数据下载。原始数据包本轮未逐项检查字段与附带条款，未作为已导入资产。
- ForestGEO 的 Wind River 原始逐树数据通过[数据门户][forestgeo-data]申请访问，不能从论文开放获取推导出整个原始坐标数据包已获公开再分发授权。

[mora-plants]: https://www.nps.gov/mora/learn/nature/plants.htm
[mora-mapping]: https://irma.nps.gov/DataStore/Reference/Profile/2286419
[mora-conifers]: https://www.nps.gov/mora/learn/nature/conifer-trees.htm
[mora-deciduous]: https://www.nps.gov/mora/learn/nature/deciduous-trees.htm
[wind-river]: https://research.fs.usda.gov/treesearch/24798
[wind-river-pdf]: https://research.fs.usda.gov/download/treesearch/24798.pdf
[wind-river-spatial]: https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0082784
[redcedar]: https://research.fs.usda.gov/silvics/western-redcedar
[nccn-mapping]: https://www.nps.gov/im/nccn/veg-mapping.htm
[forestgeo-data]: https://forestgeo.si.edu/explore-data
