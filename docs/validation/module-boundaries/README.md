# 首轮模块边界拆分验收

关联：tans/jack-cases#31。基线：d2b0e3f（已含 #10 医疗平台、#17 角色保护、#16 重提、#32 依赖修复、#23 迁移配置、#20 分页、#22 封面、#27 URL 状态、#24 密钥安全、#33 无障碍、#39 反馈与缓存隔离、#40 草稿及发布预览）。

## 搬迁映射与约束

| 原位置 | 新位置 | 保留的行为 |
| --- | --- | --- |
| API server.ts 的 PATCH /users/:id | apps/api/src/routes/users.ts 的 registerUserRoutes | 原注册顺序、响应字段、错误状态、Zod 输入、角色限制、事务内重读、immediate 写锁、审计与回滚 |
| Web pages.tsx 的 AdminUsers | apps/web/src/pages/admin-users.tsx | 原 DOM、样式、文案、角色限制、请求路径、查询 key、刷新、pending 与确认交互 |
| Web pages.tsx 的 Panel | apps/web/src/components/panel.tsx | 原 DOM、className、children/action 插槽 |
| Web pages.tsx 的 useData | apps/web/src/hooks/use-data.ts | 原 queryKey [key,url]、signal、retry:false 和分类/标签 publicClient 选择 |
| Web 内联 User 与 usePage<any> 用户列表 | apps/web/src/types.ts | 纯类型；ManagedUser 补全现有响应 status/createdAt，无运行时导入 |

server 仍是组合入口，在原位置注册用户路由；显式注入原认证/错误/ID/时钟函数，未复制权限实现，也不反向导入 server。新模块不注册中间件，不改数据库 schema。配置和数据库初始化导入顺序保持。Web 只做静态导入的模块拆分，不引入懒加载时序变化、不引入服务端依赖。

只整理新迁出文件格式；未整体格式化 server/pages，未改其他领域业务。现有 structure 测试补读用户路由模块，真实 HTTP 测试负责行为回归。

分页 GET /users 与 GET /users/facets 已由 #20 搬到 lists.ts，本项保持该模块原样；AdminUsers 保留 usePage、分页后刷新和全局 activeSupers 统计。

## 验证

- npm run typecheck、npm run build、npm test（85/85）通过。
- 复用完整权限矩阵、并发管理员互禁、最后超级管理员保护、审计失败回滚、医疗资料、重提闭环、配置迁移、原生 SQLite/Sharp/Drizzle 测试。
- 与当前 upstream/main 对照，TypeScript 编译后比较用户更新 API handler、AdminUsers、Panel、useData 的运行时 AST；只归一化无副作用括号与字面量引号，所有函数体一致。校验脚本在临时目录运行，不作为镜像实现测试写入仓库。
- 单独从临时目录启动 API，以 JACK_CASE_ENV_FILE 指向隔离 .env；确认配置数据库路径生效，无默认数据库误建。
- CUA 浏览器：module-boundaries.localhost:5195，API 3025，临时 SQLite/上传目录位于 /tmp/module-boundaries-acceptance；无真实用户数据。
- 桌面用户列表、超级管理员角色修改与刷新持久化、禁用后的状态与“启用”按钮、最后超级管理员不可操作。
- 26 个隔离测试用户验证首页/末页，末页显示 6 行、2/2 页，角色修改与最后管理员保护正常；排序可切换。
- 390×844：页面不溢出；表格在自身容器横向滚动，右侧操作可见；角色修改保持；普通管理员不显示角色选择，自己/超级管理员受保护，低角色操作可用。
- 共享 Panel/useData 在需求管理页与用户页均正常显示，登录/退出正常；最终浏览器控制台无错误。
- 原生确认框曾使 CUA 操作超时，恢复后已在桌面和窄屏确认禁用结果；启用/禁用的完整权限矩阵由真实 HTTP 回归覆盖。
- impeccable 机械检查输出 []；保持原有视觉，不加入视觉改造。

#23 合并后的旧测试密钥兼容问题已由 main 覆盖，本分支直接复用主线测试，未保留重复夹具修改。

追加集成回归：保留最新 main 的 URL 筛选、详情 returnTo 安全校验、页码恢复与密钥/认证模块。除迁出函数与所需 import 外，server.ts 和 pages.tsx 剩余内容与 main 逐字节一致；迁出函数运行时 AST 等价。桌面和390px均以25条隔离案例验证 `q=模块回归&view=list&page=2` → 详情 → 返回案例，URL/筛选词/视图/第2页全部恢复；控制台无错误。75项回归含 URL 状态与密钥安全测试。

## 截图

- url-return-desktop.png / url-return-mobile.png：详情返回后保持 URL 筛选、列表视图与第2页。
- users-desktop.png：超级管理员、角色选择与最后管理员保护。
- users-mobile.png：390px 用户表格左侧。
- users-mobile-actions.png：横向滚动后的状态/操作列。
- admin-restrictions-mobile.png：普通管理员无角色选择。

## 集成说明

不依赖任何未合并 PR。与 #10 无待解决冲突，已包含其 main 合并结果；同步 #16/#20/#22/#27/#24/#33/#39/#40 时 server/pages 的冲突已以最新 main 重新应用仅本项搬迁解决。#23 配置/迁移与 #32 依赖及原生测试完整保留。其他并行 PR 若只修改需求/案例/密钥，继续改原函数位置；若以后改用户管理、Panel、useData，请改映射后的新文件。此轮不继续拆其他领域。


## 最终合并顺序集成（d2b0e3f）

- useData 从最新 main 重新迁出，保留 `queryFn: ({signal}) => api(url,{signal})`、`retry:false`，只有 `/categories` 与 `/tags` 使用共享 publicClient，私有数据继续使用当前 AccountQueries 客户端。
- AdminUsers 保留 QueryFeedback、errorMessage、中文 statusLabel、全局 facets、分页失效刷新。未迁出 AccountQueries 或 App，不改其登录切换、cancelQueries/disposePrivateClient、DataRouter/DraftUser 结构。
- 迁移前后 PATCH handler、AdminUsers、Panel、useData 的编译后 AST 等价；server/pages 剩余代码除必要 import 外逐字节等同 main。既有结构断言只补读新 API 模块，未删弱断言。
- typecheck/build/test **85/85** 通过，包含 HTTP 权限/事务、反馈错误与重试、私有请求取消/清缓存、无障碍页签、草稿白名单/隔离、公开负载安全、URL 状态与原生依赖回归。
- 浏览器：普通管理员末页和超级管理员角色修改、切换账号后的私有页面正常；中文状态、最后管理员保护；390px 横向操作列可访问。
- 提交表单通过 ArrowRight 切换无障碍页签，按 Enter 上传真实隔离 Markdown 附件成功；编辑后路由离开弹出草稿保护，保留草稿后到达我的需求，再进入表单出现恢复入口。
- 审核页面填写独立公开标题/摘要/正文，预览区域仅含公开内容，未出现私有原文标记；没有执行发布。桌面和390px截图已保存。
- 目录详情返回仍恢复 q/list/page=2；窄屏导航 Enter 展开、Escape 关闭，焦点回到“平台导航”；最终控制台无错误。
- 最新截图位于 `final-integration/`：users-admin-desktop、users-super-mobile、draft-leave-mobile、public-preview-desktop/mobile、catalog-mobile。
- 所有测试数据/上传仍在隔离 /tmp 目录；自己的3025/5195和临时浏览器页已停止。
