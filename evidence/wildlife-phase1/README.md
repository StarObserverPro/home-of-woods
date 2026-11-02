# 动物第一阶段证据

本批为 `feat/wildlife-phase1` 的松鼠/野兔接入，不代表鹿、鸟群、音效、互动或完整 M1/M2 已完成。未合并、未部署。

## 实际执行结果

最终浏览器取证源码为 `0a2c979182d183a66fa49330bcd2c2bfdaecaf61`；完整结果见 [report.json](browser/report.json)。[GitHub Actions 实际运行](https://github.com/StarObserverPro/home-of-woods/actions/runs/41384312584) 全部通过。收尾提交只整理文档和只读 CI，不改变该源码的运行时实现。

| 检查 | 本批实际结果 |
| --- | --- |
| 资产来源/许可/hash/规格 | 两份原件及运行时 GLB 通过；各 16 骨骼，仅 idle/walk；松鼠 584、野兔 596 三角形 |
| 规则、资源、存档回归 | 102 项通过，0 失败；含全局额度、同种限制、避障退避、暂停、窗口重建、五轮模型回收及加载降级 |
| TypeScript / 生产构建 | 通过；保留既有大包警告，未提高阈值 |
| 历史证据与交付审计 | 通过；PR #6 回执绑定旧不可变源码，不冒充当前动物截图 |
| 实际游戏浏览器 | Chromium / SwiftShader；1365×900 桌面及 390×844 手机视口通过，page error 与 shader error 为 0 |
| 双动物构图 / 夜景 | 桌面与手机均有两只动物中心在画面内；夜景检视隐藏日行动物；单体近景已检查 |
| 暂停与五轮卸载重入 | 状态冻结、身份不重抽；每轮旧场景动物为 0，资源计数归零，主循环销毁 |
| 动物文件加载失败 | 中断动物 GLB 请求后已有游戏仍可运行，无虚假占位动物 |

首轮手机同框截图曾裁切动物；最终已按竖屏宽高比修正检视镜头，并加入投影坐标断言。当前 browser 目录是修正后的截图。此检查不替代遮挡和美术观感的人工看图。

## 证据文件与浏览入口

- [修整记录](asset-normalization.json)：原/新 SHA、实际包围盒、尺寸、面数、骨骼与片段。
- [规则与构建日志](check.log)、[历史审计](historical-audits.txt)、[浏览器报告](browser/report.json)。
- [桌面同框](browser/desktop-pair.png)、[松鼠近景](browser/desktop-squirrel.png)、[野兔近景](browser/desktop-hare.png)、[夜景](browser/desktop-night.png)。
- [手机同框](browser/mobile-pair.png)、[手机松鼠](browser/mobile-squirrel.png)、[手机野兔](browser/mobile-hare.png)、[正常场景](browser/desktop-normal.png)。

手机仅模拟视口和触控，不是物理手机 GPU 或多指长时游玩验收；软件渲染帧时间不等于用户设备性能。当前可调候选参数及未实施范围见 [第一阶段说明](../../docs/WILDLIFE_PHASE1.md)。后续只读 CI 将新回执放进本次运行的 artifact，不自动覆盖本提交冻结证据，不在普通构建联网获取素材。
