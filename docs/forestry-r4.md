# R4 砍伐交互范围与接线

本模块由已审查R4候选回接到当前实现分支；PR待审查，尚未合并或部署。响应用户补充的“砍树和树倒下要做做”：实际选树、走近、明确开始、四次挥斧、提交一次原木/额度、倒树、保留树桩，并在原树位换代补生。巨木和远景林不能砍，新幼树尚未成材不能砍。

这是 M0 上增加的有限林业交互，不声称完整 M1 制作/修屋/日历/存档已完成。候选参数在 content/forestry.ts：首年基础 24 点，体量 ceil(scale²×1.6)，同一体量产生相同原木数；3.6 秒挥斧，1.7 秒倒下，150 秒后原位幼树，300 秒后成材。完整日历推进与平衡仍待后续阶段。

## 所有权

- GameState.time 是唯一模拟时间，app/runtime-loop 固定步长推进；暂停、隐藏、销毁时不偷偷推进。
- domain/forestry.ts 校验角色距离、身份、保护、当前动作及额度。开始只预留，完成在一个同步步骤中提交树木状态、原木、已用点数、释放预留与补生时间。重复点击、重复到期审计和视觉更新均不重复发奖。
- GameState.forestry 保留 slotId 与逐代 individualId。换代产生 :g1，树位不被删除。App 只持有会话引用供场景重入，仍由 app/runtime 唯一修改。
- 移动或取消会释放尚未提交的动作预留；2026-10-30 世界存档追加后，销毁保留进行中动作并停止循环，恢复后继续；明确取消仍释放未提交的预留。已经提交的倒树不会回滚成另一份奖励。
- scene/forestry-presentation.ts 消费状态，展示斧头、木屑、摇晃、完整模型倾倒和树桩；不写 state，不结算资源，不开 RAF 或定时器。
- domain 转为树桩后，源树按最终倒伏姿态躺地保留 1.8 秒再隐藏，始终排除拾取；树桩可正常选择。保留时间从 GameState.time / felledAt 推导，暂停不额外流逝。落地前 0.58 秒复用同一 18 片木屑池做低矮散屑，减少动态效果时省略；无新计时器、奖励或逐帧资源分配。

## Scene 组合根

创建 player/limbs 后调用 createForestryPresentation({resources:r,forestGroup:forest.group,trees,selections:forest.selections,player,limbs})。每帧先设普通步行动作，再调用 forestry.update(state,reducedMotion)，最后执行遮挡与 render。采伐姿态需要覆盖步行动作。

拾取目标使用 [...forestry.getPickTargets(), ...props.values()]。源树在树桩阶段不可继续被射线选中；树桩的根同样命名为稳定 slotId，位于 forest.group，沿用原拾取实体解析。

destroy 中在 r.dispose 之前 forestry.dispose()。适配器释放它自己的 InstancedMesh，移除斧头与树桩对象；共享几何、材质只由 Resources owner 释放。

## Runtime / HUD 合同

Runtime: approachSelected()、chopSelected()、cancelChop()、getState()。createRuntime 第三参可传上一次会话 GameState，避免重建刷新已伐树/木材/额度。Snapshot.forestry 提供 wood、points、active 和 selectedTree；具体字段由 TypeScript 类型约束。HUD 不复制或改写林业状态。

行为测试覆盖巨木/远景/距离/额度限制、预留与取消、完成复核、重复结算、原位换代和幼树禁伐。生产 GLB 表现测试检查斧头可见、树体倾转、树桩拾取、下一代缩尺、固定资源分配及视觉更新不改状态。最终实机视觉、输入、完整销毁循环和性能由父任务在组合根接线后验证。
