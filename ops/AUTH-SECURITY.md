# 认证与 API Key 运维

## API Key 存储与部署

API Key 明文保存在 `api_keys.secret_value`，鉴权仍通过 SHA-256 hash 查询。创建和轮换不需要额外环境变量；登录会话可读取本人有效密钥并复制给 Agent。`SESSION_SECRET` 仍用于签署登录 Cookie，与 API Key 存储无关。

数据库文件、SQLite WAL 文件、快照和备份都包含可直接使用的 API Key。必须限制服务器文件权限、备份访问和下载权限；不要把数据库或备份放到公开目录，也不要在日志、聊天或工单中粘贴 Key。用户离开或怀疑泄露时，立即撤销或轮换密钥。此设计简化了密钥恢复，同时意味着数据库读取权限等同于读取其中的 API Key。

迁移保持现有数据库结构兼容，不删除历史 `secret_encrypted` 列。旧版只保存 hash 的 Key 无法还原明文，但在原有权限规则下仍可鉴权，登录后轮换即可取得新明文。旧版遗留加密 Key 在缺少旧主密钥时也无法恢复明文；轮换后即可重新使用。新 Key 保存到 `secret_value`，以后登录可随时查看。

升级后不能直接回退到本次权限检查之前的旧二进制：旧代码会忽略新 Key 的 scope 和到期列。需要回滚时使用保留本次认证边界的修复版本，或在维护窗口先撤销所有 scoped Key，再恢复匹配版本，避免把受限 Key 解释成全账号权限。

## 数据库恢复

数据库备份现在直接包含 API Key 明文。恢复数据库后检查数据库文件和备份权限，再启动服务；不需要单独恢复 API Key 加密主密钥。若只有 hash 的历史 Key 无法重新显示，用户登录后轮换即可。

## 新 Key 授权语义

新 Key `scopes` 是显式非空数组，`expiresAt` 为 UTC 秒，1–90 天（默认 30 天）。路由 deny by default，scope 之外返回 403；过期、撤销或未知 Key 返回 401。账号禁用也失去访问权。即使账号是管理员，新普通 Agent Key 的需求仅限本人，案例仅限已发布，附件继续按所有权/公开审核状态校验。

| scope | 用途 |
|---|---|
| requirements:read | 列表/读取本人需求 |
| requirements:write | 提交/修改本人需求，仍受原状态规则限制 |
| cases:read | 读取公开案例及记录复制事件 |
| taxonomy:read | 读取分类和启用的标签 |
| taxonomy:write | 维护分类标签、读取全部标签；同时要求账号是 admin/super_admin |
| media:read | 读取本人或已获访问权的附件内容 |
| media:write | 上传附件 |

普通配置包含除 `taxonomy:write` 外的上述权限；只读配置去掉 `requirements:write/media:write`。`POST /api/keys/rotate` 可选择更小权限集合，必须浏览器登录；会撤销全部现有 Key，包括分类标签 Key。`POST /api/keys/taxonomy` 固定只有 `taxonomy:read/write`，要求管理员 cookie，会替换既有同类管理 Key，不影响普通 Key。两者都可选择期限。所有 scoped Key 都不能管理用户、审核需求、发布案例、读审计/统计、管理密钥。不会提供 `users:*` scope。Key 不替代角色和资源归属校验；账号撤去管理员角色后 taxonomy 写 Key 也不可用。

已对接上游医疗平台的 `/api/files`：本人文件列表和下载使用 `media:read`，上传使用 `media:write`；`scope=all` 与案例附件审核不允许 scoped Key。需求 Markdown/AI 下载使用 `requirements:read`，案例 AI 下载使用 `cases:read`，所有下载继续执行归属/发布审批检查。新增任何路由默认拒绝 scoped Key，需显式评估权限映射。详情见 `apps/api/src/key-security.ts`。

## 登录注册与反向代理

bcrypt 使用异步 API，固定 cost-12 dummy hash 使未知邮箱也经过密码比对。错误密码、未知邮箱、禁用账号统一返回 401 `Invalid credentials`；注册重复邮箱仍返回既有 409 语义，但先执行同成本哈希，避免无哈希快速返回。密码限制 72 UTF-8 字节以避免 bcrypt 截断。

每 15 分钟登录：每 IP 200 次、每标准化邮箱 10 次；注册：每 IP 50 次、每邮箱 5 次。通过 `AUTH_LOGIN_IP_LIMIT` / `AUTH_REGISTER_IP_LIMIT` 可调整每 IP 的 15 分钟额度（1–100000），空值采用默认；账号额度保持登录 10、注册 5，成功与失败都计数，成功不会重置。默认 IP 额度为多人共享出口留出余量，需按实际并发和入口容量调整，不能视为无限制抗攻击承诺。超出返回中文 429 与秒数 `Retry-After`。无状态解析错误也消耗 IP 次数。桶内邮箱只存哈希、最多 10,000 个活动桶，容量不足也返回 429，过期桶会清除。进程重启会清空限流，当前单实例适用；多实例和有意反复重启需在可信入口提供共享限制，应用内不宣称分布式防护。

应用层 `TRUSTED_PROXY_IPS` 默认空，完全忽略外部 X-Forwarded-For/Proto/Host。仓库的生产 systemd 单元显式设为 `127.0.0.1`，对应 OpenResty `proxy_pass http://127.0.0.1:3001/api/` 的实际 socket peer，且 API 仅监听 loopback。`EnvironmentFile` 可按实际拓扑覆写。现有机器升级前必须同步安装新单元并 `systemctl daemon-reload`，或在受保护的运行时 `.env` 显式设置此值；否则 production HTTP loopback 不识别 HTTPS 转发，认证明确返回 400 而不是尝试签发不安全 cookie。不要把 `.env.example` 的空值直接覆盖生产配置。仅配置精确代理 IP（IPv4/IPv6，支持 IPv4 mapped 地址归一化），不支持宽泛子网或 `*`。socket peer 在清单内时从 X-Forwarded-For **右侧**逐跳剥离可信代理，遇到第一个非可信 IP 即停止；无效或超过 20 跳退回 socket IP。清单内代理必须覆盖或正确追加实际客户端地址和协议，网络层阻止非代理直达 API。不要把客户端共享出口 IP 加为可信代理。可信 HTTPS 转发允许 secure cookie；Host 始终不受转发头覆盖。参照 [Koa 代理说明](https://koajs.com/#settings)。
