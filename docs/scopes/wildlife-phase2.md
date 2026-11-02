# HOW-WILDLIFE-PHASE2 Scope

前置 `feat/wildlife-phase1`，本批为第二阶段远景偶遇，不覆盖主分支与其他施工支线。

**目标**：把大角雄鹿与白色山羊接入同一野生动物目录、总量调度和场景，允许短时出现；曾在镜头内出现后移开镜头即离场，回头不自动重刷。

**涉及**：`src/content/wildlife`、`src/world/wildlife-layout`、`src/domain/wildlife`、`src/scene/wildlife-presentation`、`src/app/runtime`、正式 glTF 资产、许可及 hash、检视视角、回归及证据、同步核心文档。

**可见验收**：两个只读检视点能看到实际 Stag 与 Goat 的大动作；随机正常出场不产生 HUD 提示；遗留小动物继续活动；视野移开约 1.5 游戏秒退出；全局哺乳动物≤3，远景≤1；卸载重入无骨骼/材质泄漏；普通游戏与存读档保持。

**不涉及**：鸟群、音效、养殖或宠物、喂食、捕食、建造收益、越过开放边界、无限随机漫游、山体/树皮/地被改造、物理手机 GPU 验收、主线合并或部署。

**回退**：回退本阶段增量模型、两处 landmark 定义、锚点与对应呈现接线即可；不改变现有磁盘存档 schema。第一阶段松鼠/兔子单独保留。
