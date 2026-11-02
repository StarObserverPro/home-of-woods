# Woodcraft 本轮证据

本轮在 PR #7（7bfc749）的实际运行代码上新增局部物理；不是独立网页演示。测试环境为 Linux / Node.js 22，浏览器为 Chromium 156.0.8078.4 + ANGLE SwiftShader。

`browser.log` 保存成功一轮的控制台记录。测试使用隔离存档的 8 根原木和 4 份枝杈；先验证 11 根搬入、一根留库，再实际点击投放最后一根，随后检查暂停、保存、刷新和手机视口。没有改写用户已有浏览器站点数据。

`tests/woodcraft.test.ts` 中 18 项新增测试与旧测试合计 118 项通过；完整命令为 npm run check。详细已测与未测边界见 ../../docs/WOODCRAFT_VERIFICATION.md。历史审计只核验各自冻结源码和原证据，不替代本轮运行验证。真实手机性能和完整视觉验收尚未完成。
