# 列表分页

适用于当前 main 的 `GET /api/cases`、`/requirements`、`/media`、`/users`、`/files`。

- 不传 `page`、`pageSize`：保持 Agent 的数组响应，最多返回 200 条；需要读取完整数据的 Agent 应切换显式分页。
- 传任一参数：返回 `{items,total,page,pageSize}`，默认第 1 页、每页 20 条。`page` 为 1–1,000,000 的十进制正整数，`pageSize` 为 1–100；重复、空值、小数、指数形式或超限值均返回 400。
- `sort=newest|oldest`（默认 newest）：按 `createdAt`、`id` 同向排序，时间相同时顺序稳定。超出最后页返回空 items 和真实 total。
- total、items 在同一读事务内产生；并发新增/删除后，后续请求可能改变 offset 分页的页边界，客户端可刷新列表。
- 非法筛选、重复标量参数、未知参数返回 400。值通过 SQL 参数绑定，搜索按字面包含匹配（`%`、`_` 不作为通配符）。

## 案例筛选

`scope=published|all`，默认 published；all 需管理权限。`q` 搜索标题、简介、行业。`categoryId` 包含所有层级子分类；`industry` 匹配行业中的一个分隔项（支持 `、,，/`）；`difficulty=easy|medium|hard`、`implementationStatus=pending|building|completed|verified`、`status=published|draft|archived`。

`tagIds=id1,id2` 最多 12 个不同 ID，保持 UI 多标签“任一命中”语义，与其他条件按 AND 组合。`GET /api/cases/facets?scope=published` 返回权限内全量行业选项、总数；管理端可传 scope=all。

## 需求筛选与权限

`scope=mine|all`，默认 mine；all 必须通过管理权限校验，count、分页、筛选和 facets 共用该权限范围。支持 `q`（标题、内容、预期效果、行业、部门和分类）、`categoryId`（含子分类）、`category`（列表中显示的分类名，兼容正文中的“业务分类：…”）、`industry`、`difficulty`、`implementationStatus`、`tagIds`、`status=submitted|published|rejected|draft`。需求是否同意公开是提交人字段，不作为“私有/公开案例”筛选项。

`GET /api/requirements/facets?scope=mine|all` 返回权限范围内全量行业/分类选项及 SQL 聚合概况，供需求管理页保留原有分类快捷筛选与概况交互。正文历史分类和多行业通过确定性 SQLite 标量函数匹配，记录仍由 SQL 筛选/聚合，不把全表读入应用层。

用户管理的 `GET /api/users/facets` 返回全量 `activeSupers` SQL count，仅管理权限可读。前端保留 #17 的角色限制/自我保护/最后超级管理员提示，避免只统计当前页造成误判。

## UI 与验证

案例商城、我的需求、需求管理、案例管理、媒体资源、用户管理均使用显式分页，提供首页/上页/下页/末页、每页条数与排序。筛选、排序或页大小改变时回到第一页；记录减少时自动回退到可用的最后页。需求图片和需求/案例标签只按本页 ID 批量读取。

`npm test` 使用临时目录、临时 SQLite 和动态端口验证 205 条案例/媒体/同一用户需求、208 用户、200 条之外筛选、稳定排序、总数、权限隔离和非法参数，不依赖正在运行的服务。

## 资料库筛选与权限

`GET /api/files` 复用相同分页工具，`scope=mine|all`（默认 mine），all 需要管理权限；SQL count 与页查询共用权限条件。`q` 字面搜索文件名，`purpose=reference|agent|data|other` 筛选用途。原默认数组保持兼容；资料选择器使用显式分页，支持搜索、用途、排序、每页条数和翻页，选择项仍保留最多 10 份与私有文件权限规则。

## 与 #10 的集成

执行期间 #10 已由上游合并，本 PR 已更新至 `3af07ff`（同时包含 #14 CI、#17 角色保护、#16 重提闭环、#32 依赖升级和 #23 迁移配置），仅在最新 main 上提供分页差量，未将 #10 业务提交作为本 PR 新增提交。

已解决 `server.ts`、`pages.tsx` 的实际冲突，保留医疗品牌、Markdown/编号/版本、受控下载、资料关联与审核流程。新增 files 已接入相同分页工具与资料选择器；需求列表附件采用本页批量查询，保留原返回字段与操作。

同步后重新运行 typecheck/build/test（62 tests，包含医疗上传下载、重提、原生数据库 13、Sharp、Drizzle CLI、迁移/备份恢复及 205 份文件分页/检索/scope 验证），复验医疗界面桌面/390px 列表及资料库。未来若 main 同行继续变化，仍须复验这些关键路径。offset 分页的并发页边界限制见上文。

需求列表的审核记录和重新提交记录同样按本页 ID 批量读取，保留 #16 的退回原因与历史。测试密钥符合 #23 至少 32 字符要求，所有测试继续使用隔离的绝对路径。

上游 3af07ff 已手工合入旧版 #20 功能并保留审核历史的批量查询。本 PR 的当前差量仅补齐新配置要求下的三行测试密钥兼容、历史字段回归与验收记录；不重复修改已经合入的生产分页实现。

三行测试密钥兼容与 #35 完全一致，待 #35 合入后去重；本轮保留 main 的医疗夹具实现与 #32 原生驱动回归。
