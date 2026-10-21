# 认证与 API Key 运维

## API Key 存储与部署

API Key 明文保存在 `api_keys.secret_value`，鉴权仍通过 SHA-256 hash 查询。创建和轮换不需要额外环境变量；已认证账号可读取本人有效密钥并复制给 Agent。`SESSION_SECRET` 仍用于签署登录 Cookie，与 API Key 存储无关。

数据库文件、SQLite WAL 文件、快照和备份都包含可直接使用的 API Key。必须限制服务器文件权限、备份访问和下载权限；不要把数据库或备份放到公开目录，也不要在日志、聊天或工单中粘贴 Key。用户离开或怀疑泄露时，立即撤销或轮换密钥。此设计简化了密钥恢复，同时意味着数据库读取权限等同于读取其中的 API Key。

迁移保持现有数据库结构兼容，不删除历史 `secret_encrypted` 列。旧版只保存 hash 的 Key 无法还原明文，但仍可按所属账号的当前角色鉴权，登录后轮换即可取得新明文。旧版遗留加密 Key 在缺少旧主密钥时也无法恢复明文；轮换后即可重新使用。新 Key 保存到 `secret_value`，以后登录可随时查看。

## 数据库恢复

数据库备份现在直接包含 API Key 明文。恢复数据库后检查数据库文件和备份权限，再启动服务；不需要单独恢复 API Key 加密主密钥。若只有 hash 的历史 Key 无法重新显示，用户登录后轮换即可。

## API Key 与账号权限

API Key 永久有效，不设置独立权限范围。每次请求通过 hash 查询未撤销的 key，再读取所属账号的当前角色和状态，按现有业务角色及资源归属规则判定访问权。管理员 key 可审核和发布，普通账号 key 仍仅能访问该账号有权访问的资源；角色调整即时生效。未知/已撤销 key 或被禁用账号返回 401，账号无权执行的操作返回 403。

认证成功后更新 `lastUsedAt`（UTC 秒）；尚未使用时为 null。`GET /api/keys` 返回本人 key 的 id、name、prefix、createdAt、revokedAt、lastUsedAt，以及未撤销 key 可读取的 secretValue，不返回 scopes、expiresAt 或历史类型状态。该接口设置 Cache-Control: no-store。普通与管理技能页使用相同账号 key，并展示最近使用时间。

注册时自动签发永久 key。`POST /api/keys/rotate` 不需要权限或有效期参数，会在事务中撤销本账号所有旧 key 并创建一把新 key。`DELETE /api/keys/:id` 保留原有账号角色和归属规则。Bearer key 与浏览器会话都使用这些账号规则，不再因 key 类型或认证方式分配不同权限。旧版 `POST /api/keys/admin` 和 `/api/keys/taxonomy` 保留为管理员兼容签发入口，生成相同的永久账号 key；不会额外撤销已有 key。旧请求中的 scopes、expiresInDays、permanent 不再影响结果。

迁移 `0005_account_api_keys` 清空所有旧 key 的 scopes/expires_at，并统一内置 key 名称；保留原 key 值、hash、创建/使用时间和撤销状态。已到期但未撤销的 key 从此永久有效，已撤销的 key 不会恢复。数据库中的历史 scope/到期列保留以兼容既有结构，应用不读取也不再写入限制值。

账号 key 可以读取账号有权访问的需求、案例和附件，资源归属仍由业务处理器校验。需求处于待审核状态时仅提交人和管理角色可见；提交人可选择同意公开，管理员审核通过后公开需求与关联图片。提交人未同意时，只有管理员填写原因才能强制公开，原因记录在审核历史和审计日志。公开案例直接使用需求标题和正文，不另存公开副本；文件仍按案例关联和审批规则控制。

## 登录注册与反向代理

bcrypt 使用异步 API，固定 cost-12 dummy hash 使未知邮箱也经过密码比对。错误密码、未知邮箱、禁用账号统一返回 401 `Invalid credentials`；注册重复邮箱仍返回既有 409 语义，但先执行同成本哈希，避免无哈希快速返回。密码限制 72 UTF-8 字节以避免 bcrypt 截断。

每 15 分钟登录：每 IP 200 次、每标准化邮箱 10 次；注册：每 IP 50 次、每邮箱 5 次。通过 `AUTH_LOGIN_IP_LIMIT` / `AUTH_REGISTER_IP_LIMIT` 可调整每 IP 的 15 分钟额度（1–100000），空值采用默认；账号额度保持登录 10、注册 5，成功与失败都计数，成功不会重置。默认 IP 额度为多人共享出口留出余量，需按实际并发和入口容量调整，不能视为无限制抗攻击承诺。超出返回中文 429 与秒数 `Retry-After`。无状态解析错误也消耗 IP 次数。桶内邮箱只存哈希、最多 10,000 个活动桶，容量不足也返回 429，过期桶会清除。进程重启会清空限流，当前单实例适用；多实例和有意反复重启需在可信入口提供共享限制，应用内不宣称分布式防护。

应用层 `TRUSTED_PROXY_IPS` 默认空，完全忽略外部 X-Forwarded-For/Proto/Host。仓库的生产 systemd 单元显式设为 `127.0.0.1`，对应 OpenResty `proxy_pass http://127.0.0.1:3001/api/` 的实际 socket peer，且 API 仅监听 loopback。`EnvironmentFile` 可按实际拓扑覆写。现有机器升级前必须同步安装新单元并 `systemctl daemon-reload`，或在受保护的运行时 `.env` 显式设置此值；否则 production HTTP loopback 不识别 HTTPS 转发，认证明确返回 400 而不是尝试签发不安全 cookie。不要把 `.env.example` 的空值直接覆盖生产配置。仅配置精确代理 IP（IPv4/IPv6，支持 IPv4 mapped 地址归一化），不支持宽泛子网或 `*`。socket peer 在清单内时从 X-Forwarded-For **右侧**逐跳剥离可信代理，遇到第一个非可信 IP 即停止；无效或超过 20 跳退回 socket IP。清单内代理必须覆盖或正确追加实际客户端地址和协议，网络层阻止非代理直达 API。不要把客户端共享出口 IP 加为可信代理。可信 HTTPS 转发允许 secure cookie；Host 始终不受转发头覆盖。参照 [Koa 代理说明](https://koajs.com/#settings)。
