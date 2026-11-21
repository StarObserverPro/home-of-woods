# OpenAI API 接入草稿

本次沿现有行商接入一个可调用的叙事切片：走近已停稳的货车，在原行商窗口点击“讲个路上见闻”。等待期间按钮禁用，成功后在原窗口分页阅读；没有密钥、静态部署没有接口、断网、超时、拒绝或格式不符时，改读现有离线故事。没有自动重试，不影响买卖、游戏时钟或库存。

## 当前调用链

`MerchantShop → VisitorStory → app/visitor-story → 同源 POST /api/ai/visitor-story → 服务端 Responses API`

- 浏览器只发送 `{day, visitIndex}`，不发送任意提示词、密钥、原始存档或完整对话。
- `server/vite-visitor-ai.mjs` 只由 Vite 配置加载，在开发和本地 preview 挂入中间件。`server/openai-visitor.mjs` 使用 Node 原生 fetch 调用固定的 `https://api.openai.com/v1/responses`，没有新增 SDK 依赖。
- 默认 `gpt-5-mini`、低推理强度、`max_output_tokens: 2000`；`store: false`，不创建云端对话或使用 `previous_response_id`。
- 严格 JSON Schema 约束标题与段落；本地再次验证，拒绝额外字段。标题最多24字符，正文2–3段、每段最多120字符、合计最多300字符。拒绝、未完成与无效 JSON 都不会作为成功故事显示。
- 生成内容经 React 文本节点显示，不渲染 HTML。模型没有工具和玩法命令接口，不能发物、扣款、发布任务或建立承诺。

## 复用已有 key

沿用用户已选择的现有 `OPENAI_API_KEY`。可从启动进程环境或被 git 忽略的根 `.env.local` 读取；空白模板见 [`.env.example`](../.env.example)。本 PR 不创建、复制或提交真实密钥。

| 服务端变量 | 用途 |
| --- | --- |
| `OPENAI_API_KEY` | 既有 OpenAI 密钥；缺失时接口503，客户端使用离线故事 |
| `HOW_OPENAI_MODEL` | 默认 `gpt-5-mini`；替换模型必须支持 Responses、严格结构化输出和 `reasoning.effort: low` |

修改环境后重启服务。运行 `npm run dev`，访问 `http://127.0.0.1:5286/`；或 `npm run build` 后 `npm run preview`，使用其本机地址。不能使用 `VITE_` 前缀承载密钥，也不把 key 放进浏览器存储、URL 或客户端配置。

## 费用与失败边界

入口只接受精确本机 Host 与匹配的 HTTP Origin，不开放 CORS；只接受 JSON POST，正文上限512字节。每个进程最多2个并发请求，每小时最多20次上游尝试，20秒服务端超时、25秒客户端超时。失败也计入尝试数。关闭窗口或离开行商会取消请求；客户端不会在关闭后发布成功或回退内容。

每进程缓存最多64个游戏日/来访序号组合；已有结果直接返回。缓存、计数随进程重启清空，且不是多进程共享额度或长期记忆。同一组合在两个并发请求中仍可能各生成一次。关闭客户端请求不能保证已经发生的供应商计算不计费；这里没有账户级美元预算承诺。

API 错误只返回固定错误码，不把供应商原始错误、账号细节或密钥传回浏览器。没有记录提示词或响应的服务端日志。

## 人物记忆与发布边界

这是 API 和行商短叙事的接入，尚无人物长期记忆写入。游戏日和来访序号不是记忆；生成的外地见闻不作为当前玩家经历。后续人物独立的结构化记忆、关键互动/承诺、定期模糊或遗忘，以及记忆如何影响对话，仍需沿访客规划接线，不由本次故事缓存替代。

当前 GPT Sites / Vercel 静态 `dist/` 上传不会运行这些服务端文件，远端游戏仍使用离线回退。本 PR 没有修改发布平台、合并或部署；联网发布还需独立受保护的服务端和对应托管适配，复用部署侧既有密钥。不要把 `vite preview` 当作公开生产服务器，也不要为静态站把密钥塞进前端。

接口依据：[Responses API](https://developers.openai.com/api/reference/resources/responses/methods/create)、[Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs)、[GPT-5 mini](https://developers.openai.com/api/docs/models/gpt-5-mini)。核对日期：2026-11-19。

## 检查与回退

`npm run test:ai` 覆盖请求/响应契约、成功解析、拒绝/未完成、来源与正文限制、无密钥、上游错误脱敏、缓存/限额/并发/超时和客户端回退/取消；不需要真实密钥，不产生 API 费用。构建与共享 UI 检查分别运行 `npm run build`、`npm run verify:ui`。本轮真实结果见 [验证记录](../VERIFICATION.md#openai-api-接入草稿2026-11-19)。

回退整个 PR，或移除 Vite 中 `visitorAiPlugin` 与行商中的 `VisitorStory` 入口即可关闭接入；没有存档格式变化或资源迁移。
