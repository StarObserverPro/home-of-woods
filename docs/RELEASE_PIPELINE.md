# 森林之家 · 发布链路（HOW-RELEASE-1）

> 2026-11-02 确认：**ChatGPT Sites 是唯一主发布目标**；Vercel 现有部署保留作候选镜像/技术验证，不作为正式入口，不自动跟随主线发布。本文件定义发布规程，不代表已执行 Sites 发布。

## 角色与发布边界

- **GitHub `main`**：游戏源码、需求、测试与资产登记的唯一权威来源。普通改动先走 PR；合并、构建成功和正式发布是不同事件。
- **GitHub Actions `.github/workflows/verify.yml`**：在 PR 与 `main` 上运行既有类型、逻辑、资产、构建、场景沙盒及证据审计。验证材料留在仓库或 CI，不进入网站根目录。
- **ChatGPT Sites**：唯一正式游戏平台；使用固定 `main` commit 制作版本，**先 Save version，再经明确授权 Deploy**。不能把 Sites 编辑工作区当作另一个独立研发主线。
- **Vercel**：`home-of-woods-checks` 保持当前状态，暂不删、不断开；只可作显式批准的镜像或临时技术测试。不得把它的 URL、成功状态、自动部署当作 Sites 已发布。
- **用户授权**：开 PR、合并、发布分别遵照当次授权；`main` 更新不自动触发公众可见版本更新。

## 唯一允许发布的内容

游戏由 Vite/React/Three.js 构建；**线上对外提供的文件只允许来自本次经检查的 `dist/`**，而不是仓库根目录。

| 应当进入游戏发布包 | 不应随发布包进入网站 |
| --- | --- |
| `dist/index.html`、JS/CSS、按需加载模块 | `README.md`、`AGENTS.md`、`PARAMETERS.md`、`VERIFICATION.md` |
| 实际用到的模型、纹理、音频、字体、WebAssembly 等运行资源 | `docs/`、`evidence/`、`tests/`、`sandbox/`、`sources/`、`art-direction-r3/` |
| `public/` 中按 Vite 规则进入 `dist/` 的游戏资源 | `.github/`、`tools/`、开发截图、日志、录屏、CI 报告和历史原型 |
| 必需的第三方许可及署名，如现有 `public/licenses/`、`public/third-party-notices.txt` | `node_modules/`、`.git/`、私密配置、环境变量、原始 TypeScript 源码 |

第三方许可声明属于必须保留的分发材料，不是要清理的开发文档；`public/` 新增文件须按“会复制进 `dist/`”审查。构建使用的源码/工具与**面向访客托管的文件**是两个不同边界。

生产发布包须检查：有有效的 `index.html` 和全部引用资源；不存在上述开发目录/文档、`.env`、源码映射（除非特批），也不能把调试文件写入或开放成 HTTP 资源。现有 `?inspect=1` 检视入口可能仍包含在浏览器运行时代码中：**仅检查 `dist/` 文件名无法将其排除**；首发前须核验并关闭生产可达的诊断/录制入口，或取得明确保留许可。开发态 `/__evidence/`、`/__scene-capture` 中间件不得在生产可用。

## 单一发布管道

```text
功能分支 → PR / GitHub CI 通过 → 合并到 main
         → 锁定确切 commit → 生成与审计 dist/ → 记录文件哈希
         → Sites 导入同一版本 → Save version（私下预览）
         → 用户批准 → Deploy saved version（正式）
         → URL/资源/实机冒烟检查 → 登记 Git SHA + 构建哈希 + Sites 版本
                                  ↘ Vercel 镜像仅在另行批准时更新
```

1. **冻结输入。** 核对 GitHub `main` 的完整 SHA 以及同一 SHA 的 `Verify` 成功状态，不拿其他分支、过期 CI、旧截图当发行证明。依赖以已提交的 lockfile 和约定 Node 版本安装；当前 CI 使用 Node 22.14.0。
2. **在受控构建环境制作唯一候选。** `npm ci`、`npm run check`；既有 `verify.yml` 继续负责 `npm run verify:evidence`、交付审计及场景沙盒检查。构建结果为 `dist/`；对目录做允许清单、禁止路径和体积检查，再生成逐文件 SHA-256 清单及整体归档哈希。
3. **分离传输包与发布包。** 传给发布工具的目标内容是完整 `dist/`，而非整仓；清单、CI 报告、源文件哈希和构建日志只放在私有/CI 交付记录，不能误放进网站根目录。若 Sites 的当前入口必须从源码重建，应先在**隔离的最小发布工作区**导入所需游戏源码、lockfile 与构建配置，并将托管根目录严格设为 `dist/`；不得把完整开发仓库当静态站点根目录。此时需要核验重建产物与候选的一致性，未验证前不能宣称二进制完全相同。
4. **Sites 版本。** 在 ChatGPT Web/Desktop 的 Sites/Work 中关联既定项目，核对来源 Git SHA 与所用项目；先保存版本并在私有预览中验证。**Save version 不是 Deploy**，不要为“方便测试”直接覆盖线上版本。首发时先建立独立的森林之家 Site，不沿用水晶花园的 `.openai/hosting.json` 或项目绑定；当前游戏无远端数据库依赖，不应凭旧项目配置附加 DB。
5. **正式部署。** 用户明确要求发布后，再部署**刚才验收的保存版本**，确认部署完成、站点地址、访问范围和最终版本号。若执行接口不可用，记为“待发布”，不得转用 Vercel 冒充完成。Sites 发布工具未接入的会话可在具备 Sites 能力的 Work 环境继续。
6. **上线后冒烟验收。** 实际打开公开 URL：加载页面与 JS/CSS、GLB/纹理及 Rapier/WASM，检查无 404/控制台致命错误；角色移动与镜头、采集/库存、局部物理、存档刷新后恢复，至少各跑一次桌面与移动视口。另确认 `/docs/`、`/evidence/`、`/tests/`、内部检测入口不可访问；确认访问权限是预期的公开或私有范围。**构建通过、HTTP 200 均不能替代游戏实机验收。**
7. **留下一条可追溯的发布记录。** 至少记录日期、`main` SHA、打包清单 SHA-256、Sites project/version/deployment、URL、验收结果及可回退版本。发布记录留在 GitHub 发布说明或统一记录文件，不复制进 `dist/`。只有实际发布时才更新记录，不随每次开发提交追加流水账。

### 轮询与失败处理

- 尽量依赖任务完成回执或版本状态读取；必须轮询时只检查**这一次明确的版本/部署 ID**，使用有上限的间隔/次数，失败后停止并报告阶段和错误。不要反复重新构建、创建版本或触发 Deploy 来替代状态查询。
- 不允许同时存在两个未分辨的正式发布候选；失败保留原线上版本，定位是构建、Save、Deploy、权限还是浏览器运行错误。
- 回退到以前已保存并验证的 Sites 版本前，检查 IndexedDB 存档 schema 兼容性。现在的存档在**浏览器本地、按站点 origin 隔离**：从 Vercel 访问转到 Sites 并不会自动继承存档；镜像也不构成存档备份，可用游戏已有导出/导入功能迁移。

## Vercel 镜像纪律与平台成本

- 目前已存在 `home-of-woods-checks` Vercel 部署，保留但不作为主域名，也不要求随 `main` 自动更新；需要镜像时从**同一已批准 SHA/候选**构建，独立做冒烟检查，注明镜像版本和访问限制。
- 两边测试成本主要取决于游戏本身：CI 的类型/资产/业务/构建验证可以完全共用，浏览器 WebGL、WASM、存档与手机操作仍需分别在最终域名验收。
- **自动化部署/状态 API：Vercel 更省事**（Git 集成可将推送、构建、发布连成一条流水线，便于查询日志）。**受控人工发布：Sites 更合适**（预览、Save version、显式 Deploy），但多一次版本/部署的状态确认；不应声称 Sites 比 Vercel 更少轮询或更容易无人值守。
- Vercel 现有项目设置曾显示 Node 26.x，与仓库 CI 的 Node 22.14.0 不一致；如未来启用镜像，先固定兼容版本，防止因环境漂移造成差异。

## 当前实施状态（2026-11-02）

- **本次只确定规范，不修改发布代码或 CI、不执行 Sites 发布、不触碰 Vercel 配置。**
- `verify.yml` 已有的验证链路可复用；**生产包审计/打包 CI、Sites 的首次建站与导入、生产 `?inspect=1` 限制尚待实际实施与验证**。文档中的步骤是目标管道，不是已全部接通的自动化系统。
- Vercel 上已能查询到来自 `b6709111958c28e9a353ba45e6f377f6cf46fa73` 的 READY 部署，但不能据此声称正式 Sites 已发布。

平台依据：[ChatGPT Sites — 保存版本与发布](https://learn.chatgpt.com/docs/sites/managing-a-site)、[Sites 发布与分享](https://learn.chatgpt.com/docs/sites/publishing-and-sharing)、[Vercel Git 部署](https://vercel.com/docs/git)。
