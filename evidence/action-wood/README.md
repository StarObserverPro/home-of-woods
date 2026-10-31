# 五动作与木料用途集成证据

基线：已合并 main 6135733；本次运行源码由 source-freeze.json 逐文件绑定（文本换行规范化）。2026-10-30，Windows / AMD Radeon / IAB，固定 seed 104729、hour 14，独立测试 origin 4230/4231。测试库存不与产品存档混用。

- check.log：资产许可/规格检查、88 项测试、TypeScript 和生产构建通过。build.log 是最后一次 UI 换行修正后的构建。现有大包提示仍存在。
- climb.png：实际走近后抱树抬腿；随后取消，prayer.json 中保留 cancelled 与零枝料状态。
- pickup.png、mushroom.png：实际采集动作停帧；拾柴完整结束后界面显示入库 3 份。此两张及 climb.png 在最终检视取消和祭坛按钮修整前拍摄，动作表现未改；不据此声称完整最终版本快照。
- fell.png、fell-close.png：两棵树按人物站位倒伏，后者对应 fell-close.json，累计原木 8、额度已扣、仍在 falling；树桩留在原位。近景断面几何另由 forestry-presentation 测试与已接受沙盒证据覆盖。
- prayer.png / prayer-mobile.png：真实走到祭坛前、合掌低头，1280×720 与 390×844；对应 JSON 为暂停的 performing 状态，不发物品。
- pickup-mobile.png / pickup-mobile.json：390×844 正式拾柴；pickup-cancelled.json 记录取消后库存不变、来源未消耗、循环恢复。

实际验看范围：桌面五种动作；手机视口祈祷、拾柴与按钮布局。手机拾柴详情卡仍遮住部分下半身，真机触控、全部五动作的真机性能和长时间游玩未验收。未以桌面模拟代替真机。

旧 R4、角色、库存、世界存档、R5 和交付证据保留原字节。R5 新增 verified-source.zip 从已合并提交和既有 reviewed-source.zip 重建，每项必须与旧 source-freeze.json 相符；旧校验读取归档，当前实现由新测试和本目录单独验证。
