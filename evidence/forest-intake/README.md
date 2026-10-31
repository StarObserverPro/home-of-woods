# 森林形态主体接入证据

本批入口是游戏 `src/scene/create-scene.ts`，非独立沙盒。最终 `final.json` / `understory-final.png` 记录八树形、80 株蕨、320 草簇、40 灌木、45 碎石与 12 朽木，地被 86358 三角形、10 批。树形总计 580 个固定树位。shaderErrors 为 0。

- `climb.png/json`：新云杉上的攀爬采枝停帧，恢复后 3 份枝料一次结算。
- `fell.png/json`：新云杉四次挥斧后的倒伏停帧，原木 5、已用额度 5；`completed.json` 确认完成后没有重复发放。
- `reentry.json`：两轮卸载重入，旧资源 owner 的几何、材质、extras 均归零，世界库存保留。
- `mobile.png/json`：390×844 桌面浏览器视口，显示新树形与带状草；不是实际手机 GPU 性能结论。
- `understory-desktop.*`、`mobile.*` 和动作/重入记录摄于最后一次仅地被分布调整前（46 蕨、56816 面）；`final.json` / `understory-final.png` 为最终 80 蕨、86358 面，渲染/释放架构与动作代码未再改变。
- `check.txt`：90 项测试、资产检查、类型与生产构建；保留 Vite 包体提示。`historical-audits.txt` / `delivery-audit.txt`：之前交付的不可变证据审计。

源码及证据 SHA 见 `source-freeze.json`，由 `tools/audit-forest-intake.mjs` 校验。历史动作源码的归档从已合并 PR #5（6a4c963）提取，旧 hash 断言未移除。最终真实手机性能、长时间游玩仍未验证。未部署。
