# 业务画像、评估与词表（2026-10-21）

需求创建、PATCH、详情和列表使用相同字段。主业务分类 `categoryId` 仍单选；`industry` 仍为药品、医疗器械、医药服务、IVD（多项以 `、` 分隔）。行业与细分领域互相独立。

| 字段 | 结构 / 空值 | 说明 |
| --- | --- | --- |
| applicableEntities | 稳定 ID 数组，缺省 / 清空 `[]` | 适用主体 |
| circulationTypes | 稳定 ID 数组，缺省 / 清空 `[]` | 经销、配送可并选；`circulation-pending` 待确认和 `circulation-na` 不适用均独占，不与任何其他选项共存 |
| businessModes | 稳定 ID 数组，缺省 / 清空 `[]` | 业务模式，不根据流通类型推断 |
| subdomains | 稳定 ID 数组，缺省 / 清空 `[]` | 细分领域，不代替行业 |
| urgency | pending / low / medium / high，缺省 pending | 人工紧迫性；恢复待确认传 pending |
| urgencyReason | 文本或 null（最多 3000 字） | 紧迫性依据 |
| valueAssessment | 文本或 null（最多 6000 字） | 价值、条件、待验证依据，无强制评分 |
| difficulty | easy / medium / hard 或 null | 复用原字段，空显示待确认 |

PATCH 省略任意字段会保留原值；数组 `[]`、可空文本 `null` 明确清空。不从正文、参考作品、提交时间推断画像、难度、紧迫性或价值。只有作者明确同意才设置 `shareConsent: true`；新增字段不改变共享授权。修改正文按现有版本规则递增，修改画像/评估不改正文版本或 UUID/编号。

## Agent 接口

1. `GET /api/business-options` 返回可选的活跃词表（id、field、name、active、sortOrder）。`GET /api/business-options?scope=history` 包含停用项，供历史展示；不能为新需求选择停用项。
2. 先读取词表 ID，`POST /api/requirements` 或 `PATCH /api/requirements/{id}` 传入上述字段。非法 ID、重复 ID、字段不匹配、流通互斥均明确返回 400；不会静默丢弃。已有停用项允许原样保留或移除，不可新增。
3. `GET /api/requirements/{id}` 回读数组和评估。列表 `/api/requirements?page=1&pageSize=20&industry=医疗器械&subdomains=subdomain-orthopedics&urgency=pending` 分别筛选行业和细分领域。四组画像参数接受逗号分隔 ID（组内任一匹配，字段之间同时匹配），urgency 单选。管理列表使用会话认证和 scope=all；Agent 仍仅访问自己的需求。
4. `POST /api/business-options`：field（上述四字段之一）、name、active（缺省 true）、sortOrder。`PATCH /api/business-options/{id}`：name、active、sortOrder。字段归属和 ID 不可修改；停用不删除历史关联。初始保留 ID `circulation-pending`、`circulation-na` 的互斥语义不会因重命名改变。
5. 普通 Agent 的 taxonomy:read 可以读取词表；需求写权限不能写词表。写词表必须独立 taxonomy:write 且账号为 admin/super_admin，或管理员浏览器会话。`GET ?scope=all` 是管理接口，要求同一写授权；越权返回 403。现有只读 Key 不增加权限。
6. 标签继续复用 `/api/tags` 的创建、查询、PATCH 重命名/停用；稳定 ID 保留关联。管理端先查询同名或同义项。`tagIds: []` 清空，省略保留旧标签。

## 迁移和指定数据操作

迁移 0005 只追加表、列和初始词表选项；历史需求新增空数组、pending，不推断或批量补评估，不更改材料、版本、编号、正文和授权。沿用部署前数据库备份规则。

`scripts/associate-business-tags.mjs` 仅处理指定五条记录。先设置明确的 REQUIREMENTS_API_BASE，以及已授权管理员 PLATFORM_SESSION_COOKIE，或原提交人 REQUIREMENTS_API_KEY + 独立 TAXONOMY_API_KEY（不得增权只读密钥）。凭证只从进程环境读取，不在参数、日志、备份中记录。

先运行不带参数的只读预检：按编号 + 精确标题核对五条记录、保存权限 0600 的 before.json，并输出既有标签供核对同义项。确认后 `node scripts/associate-business-tags.mjs --apply` 幂等关联术前备货→0498、销售训练→0507、客户研究→0508、用印管理→0510；0509 只核对任务跟进、跨部门协同。每条回读验证旧标签、编号、正文、版本、分类、封面、图片、文件和授权未变，写入 progress.json / after.json。备份放在 git 忽略的 storage/，不提交真实 DB、上传文件或凭证。
