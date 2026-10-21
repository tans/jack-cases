# 医疗大健康及医药领域需求平台

面向医药流通、医院与健康服务、IVD 等领域。用户用 Markdown 记录已脱敏的需求，关联多份参考文件和 Agent 阅读材料；管理员审核后发布参考案例。

## 技术选型
- Web: React + Vite + TypeScript + shadcn/ui 风格的本地组件（Button/Input/Card/Textarea）+ Tailwind
- API: Koa + TypeScript + Drizzle ORM + SQLite
- Images: Sharp-generated WebP files stored outside the public web root; images linked to published cases are publicly readable, while unassociated and draft images require owner or administrator access
- Auth: signed HttpOnly session cookie and permanent account API key; authorization follows the current account role

## 启动
```bash
cp .env.example .env
npm install
npm run dev
```
打开 http://localhost:5173 。生产环境分别运行 `npm run build` 与 `npm start`；生产环境应通过 nginx 或其他反向代理统一提供前端静态文件、HTTPS 和 `/api` 反代。生产前必须设置 SESSION_SECRET、固定的数据库与文件目录，配置备份。API Key 明文保存在数据库中，因此数据库及其备份必须限制访问。密钥管理说明见 [认证与密钥运维](ops/AUTH-SECURITY.md)。

> 当前 schema 已建立 Drizzle 基线，启动与 `npm run db:migrate` 使用同一迁移 runner。支持存量自举库接纳及历史编号回填，保留正文、UUID、媒体和文件关联；升级前需备份。

API 与 Drizzle 显式加载根 `.env`，相对数据库和上传路径统一以仓库根目录为基准。启动与 `npm run db:migrate` 共用兼容旧库的迁移基线；检测到旧 workspace 数据位置时拒绝静默切换。配置、后续迁移、WAL 一致性备份和显式恢复见 [ops/DATABASE.md](ops/DATABASE.md)。

## 生产部署
生产环境由 GitHub Actions 处理 `main` 推送：先安装依赖并构建，再调用 `hook.minapp.xin` 的 `jack-cases` hook，由服务器排队部署并等待线上健康接口确认目标 SHA。仓库需要设置 `DEPLOY_HOOK_TOKEN` Actions secret。服务器部署脚本只接受 `main` 可达的完整 commit SHA；应用发布目录为 `/data/jack-cases/releases/`，`/data/jack-cases/current` 指向当前版本，SQLite 与上传文件保存在 `/data/jack-cases/shared/`。systemd 运行 API，OpenResty 在 `jack-cases.minapp.xin` 提供 HTTPS、静态页面和 `/api` 代理。首次安装与故障排查见 [`ops/DEPLOYMENT.md`](ops/DEPLOYMENT.md)。

## 首位管理员
为避免公开注册接口可获得管理员权限，默认注册者均为 student。先注册第一个账号，然后 **在受信任的服务器终端** 执行：
```bash
node -e "const Database=require('better-sqlite3');const db=new Database('./storage/jack-case.db');db.prepare(\"UPDATE users SET role='super_admin' WHERE email=?\").run(process.argv[1]);" admin@example.com
```
替换邮箱为自己的邮箱，并重新登录。此操作必须在有数据库访问权限的服务器执行。

## API
`POST /api/auth/register` `{email,password}` 创建账号和 HttpOnly cookie，并生成永久有效的账号 `apiKey`。

API Key 不设过期时间和独立权限范围，所有操作按所属账号的当前角色、状态及资源归属校验。角色变化立即生效，账号禁用或 key 撤销后失效。每次 key 认证成功记录 `lastUsedAt`，可在「Agent 技能」及「管理 Agent 技能」页查看最近使用时间。

`GET /api/keys` 读取本人密钥；`POST /api/keys/rotate` 无需参数，撤销本账号所有旧 key 后签发新 key；`DELETE /api/keys/:id` 按现有账号管理规则撤销密钥。Bearer 和浏览器会话遵循相同账号权限。原 `/api/keys/admin`、`/api/keys/taxonomy` 仅保留为管理员兼容签发入口，生成相同的永久账号 key。现有未撤销 key 自动适用新规则，无需重新生成。

`POST /api/requirements` 通过 cookie 或 `Authorization: Bearer wk_...` 认证。Body：
```json
{"title":"医院服务资料协作","content":"## 业务痛点\n资料分散，需要明确责任与跟进情况。","mediaIds":[]}
```
上传图片：`POST /api/media` 使用 multipart 的 `file` 字段，返回图片 `id`，再在需求提交时传 `mediaIds`。

用户端：`GET /api/cases`, `GET /api/cases/:id`, `GET /api/requirements`, `GET /api/keys`。

管理员端（同一套核心资源）：`GET /api/requirements?scope=all`, `GET /api/cases?scope=all`, `GET /api/media`, `GET /api/users`, `GET /api/stats`。

审核发布：`POST /api/requirements/:id/review`，例如：
```json
{"decision":"approve","approvedFileIds":[]}
```
审核通过后会公开同一份标题、正文和关联图片。需求内容按默认脱敏信息编写，图片随案例公开，文件仍需单独审核。

## 三分钟验收演示
1. 注册学员，保存自动创建的永久账号 API Key；上传一张图片，提交已脱敏需求。
2. 重新登录后“我的需求”仍可查看。使用 Bearer Key 通过 API 提交第二条需求。
3. 使用终端提升可信任管理员账号；管理员进入需求管理，审核脱敏文字，选择安全图片并发布。
4. 普通学员在需求案例库打开已发布案例，复制需求与搭建提示词。
5. 更换 API Key 后确认旧 Bearer Key 访问失败、新 Key 可用；重启服务器确认数据持续存在。

## 已知限制 / 第二阶段
- 当前只做人工脱敏和审核，尚未集成 AI 模型；不能将生成草稿视作安全脱敏。
- 图片审核目前是选定已处理的图片，尚无区域打码图像编辑器。原图可能有敏感信息，**不可直接勾选公开原图**。
- 管理端分类、用户操作提供基础能力；批量管理、完善的删除/修改审计和编辑图片尚未实现。
- 当前上传文件按用户拥有权保管，未实现定期清理未关联附件。
- 首版只面向单体部署；已加入进程内登录/注册限流和可信代理边界，多实例需在入口部署共享限流。仍需评估 CSRF 防护和文件恶意内容扫描；数据库备份脚本已提供，生产调度、加密异地存储与保留策略仍需配置。
- 界面复用了 shadcn 风格的可维护本地组件，但尚未通过 shadcn CLI 安装完整组件库。


## Markdown、业务编号与版本

- `content` 原样保存 UTF-8 Markdown；历史纯文本也可继续使用，不批量改写正文。提交、我的需求详情和管理端支持编辑与安全预览（跳过 HTML）。
- 需求创建后自动获得唯一 `requirementCode`，例如 `MED-REQ-0004`，创建时也可显式提供 `MED-REQ-` 加 4–10 位数字的编号；创建后不可改。`contentVersion` 默认 `v1.0`，显式导入可用 `v3.0`；修改正文而未显式指定版本时递增最后一段数字。
- 版本记录当前内容版本，不是完整的历史修订库。新需求通过审核后，公开案例使用提交人已脱敏的需求标题和正文；旧案例保留已有公开内容与编号/版本快照。
- `GET /api/requirements/:id/download` 原样下载 Markdown 正文；`?format=ai` 包含中文标题、编号、版本、正文以及明确分开的事实核实、假设、待确认与候选方案提示。详细 Agent 文件单独下载，不拼进短正文。
- `GET /api/cases/:id/download` 从案例的公开内容导出 AI 需求文档。需求案例直接使用提交时的标题和正文，不另存一份管理员编写的公开正文。

## 文件资料 API 与审核

`POST /api/files` 使用 multipart `file`（每次一个文件，界面逐个上传多选文件）和 `purpose`：`reference` 案例参考资料、`agent` Agent 需求文档、`data` 数据样例、`other` 其他材料。返回 `{id,name,purpose,mimeType,size,url}`。

- 支持 `.md .txt .pdf .docx .xlsx .csv .json .zip .png .jpg .jpeg .webp`，每个 1 byte–20 MB，每个需求/案例最多 10 个文件；旧图片另外最多 10 张。旧 `POST /api/media`、`mediaIds` 及图片鉴权接口继续保留，原 `MAX_IMAGE_MB` 配置仍生效（默认 10 MB）。
- 扩展名白名单、PDF/ZIP/Office 基础签名、UTF-8/JSON 格式及图片解码/像素限制；拒绝可执行扩展名、PE/ELF 头、HTML/SVG 文件。图片重新编码；服务端使用随机存储名，去除原文件名路径和控制字符。处理后的图片仍受 20 MB 限制。
- 文件均强制附件下载，设置 `nosniff`、私有无缓存与 sandbox 响应头。服务器不解压 ZIP，也不内联 HTML/PDF/Office，不公开上传目录。这些校验不是完整文档解析或恶意内容扫描；含宏/脚本的容器内容需人工检查。
- 请求结束（包括失败、超量与格式拒绝）清理临时上传目录。已上传但尚未关联的文件会保留在私有资料库，方便重选；本 PR 不自动删除持久文件。
- `GET /api/files` 返回自己的资料库；管理员可用 `?scope=all` 查看全部文件元数据。需求创建和修改传 `fileIds` 完成关联；作者仅能关联自己的文件，管理人员可保留需求已有文件及关联自己上传的补充文件。
- `GET /api/files/:id/download` 每次服务端鉴权：上传者、所关联需求的作者、管理角色（admin/super_admin/reviewer），或明确审核批准且仍在已发布案例中关联的资料。其他学员无法访问私有文件，未登录一律拒绝。
- 需求处于待审核状态时，仅提交人和管理角色可查看；管理员审核通过后会公开需求和关联图片，案例使用提交的标题和正文。文件仍需单独审核。重复审核已发布需求返回 409。
- 案例维护用 `PUT /api/cases/:id/files`，载荷 `{"files":[{"id":"文件ID","approved":true}]}`；批准仅对该案例生效。关联文件需来自当前案例、原需求或当前管理员自己的上传。案例详情只向普通用户返回已批准文件；下架/未发布案例不能作为公开下载授权来源。
- 上传、文件下载、需求/案例 Markdown 下载和资料审核均写入原有审计表。

## 独立本地演示与参考导入

为避免影响其他服务，可在两个终端从仓库根运行（路径均用绝对路径）：

```bash
PORT=3011 APP_ORIGIN=http://127.0.0.1:5181 DATABASE_URL="$PWD/storage/medical-demo.db" STORAGE_DIR="$PWD/storage/medical-files" SESSION_SECRET=local-demo-only-stable-secret-32chars npm run dev -w @jack-case/api
WEB_PORT=5181 API_ORIGIN=http://127.0.0.1:3011 npm run dev -w @jack-case/web
```

打开 `http://127.0.0.1:5181`，创建本地账号；管理员设置沿用上文方式，仅操作自己的演示数据库。`SESSION_SECRET` 示例仅限本地演示。

用户提供的 MED-REQ-0004 样稿及完整 ZIP **不提交到 Git**。已有样稿时显式执行：

```bash
MEDICAL_DEMO_API_KEY='<本地账号自己的 Key>' npm run demo:medical -- '<已解压样稿目录>'
```

脚本接受原始中文 JSON 文件名或安全解压后的 `03.json`/`04.json`，仅允许 localhost API。它转换对应 Markdown 正文与独立 Agent 文档，导入 `MED-REQ-0004` / `v3.0`，难度未评估，不使用旧平台 UUID、分类/标签/图片 ID。已存在同业务编号时不覆盖正文或附件；若原记录没有图片，仅补齐样稿的封面与需求卡，已有图片则跳过；Markdown 副本保存在被 Git 忽略的 `storage/demo-materials/`。它不由启动或迁移自动调用，不会产生公开示例业务数据。

## 本 PR 验证

`npm run typecheck`、`npm run build`、`npm test`。集成测试启动独立临时 SQLite、上传目录与 HTTP 服务，验证旧库迁移/图片兼容、多文件关联、中文 Markdown 与元数据、权限越界、逐案例批准、下架撤销、私有授权防绕过、体积/数量与临时文件清理。测试结束关闭服务并删除临时数据，不接触运行中的开发/生产库。

浏览器用 cua_repl 验证桌面 1280 px 与窄屏 390 px：手动提交、Markdown 预览/编辑、多个文件上传、需求关联、管理员审核、案例资料独立维护、普通账号下载 AI 文档与单独 Agent 文件。


## 封面卡片与图文详情

- 每条需求/公开案例均有封面卡片；无图片时，用标题与编号生成默认封面。上传的封面完整展示，避免裁掉文字。待审核需求有独立详情路径 `/requirements/:id`，仅提交人和管理角色可查看。
- 提交、作者编辑、需求管理可上传/移除/排序最多 10 张图片，并选择封面。`POST/PATCH /api/requirements` 接受有序 `mediaIds` 和可选 `coverMediaId`；封面必须是该需求关联的图片，不能关联其他用户的未知图片。
- 通过 `0002_requirement_covers` 迁移幂等新增 `cover_media_id`，兼容已存在封面列的旧预览数据库并保留迁移账本，不改旧图片关系。历史记录默认用第一张图片，或默认封面。
- 电商式详情采用主图与缩略图、图片放大/原尺寸阅读、信息与下载区、章节导航，以及下方图文详情/整图/附件材料。无图片、无附件和未评估信息均有明确空状态。
- 案例列表和详情向所有用户返回明确关联的图片。审核通过需求时自动关联其全部图片；发布时封面优先使用需求封面，没有封面时回退到第一张图片。
- `PUT /api/cases/:id/images` 管理员提交 `{mediaIds,coverMediaId}` 保存有序审核图集；图片须来自原需求、当前案例或当前管理员的上传。保存代表管理员确认图片归属。案例发布期间图片无需登录即可访问；案例下架后其他用户不能继续通过图片 URL 访问。
- 本地参考导入会上传附件中的封面 PNG 与需求卡 PNG 到图片存储，不把这些图片提交到 Git；
