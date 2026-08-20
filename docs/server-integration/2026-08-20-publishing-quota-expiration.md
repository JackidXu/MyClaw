# 分享与部署额度、过期联调说明

日期：2026-08-20

## 涉及项目

- 客户端：`LobsterAI`
- 服务端：`lobsterai-server`
- `lobsterai-portal`、`lobsterai-admin`：本期不改

## 数据库变更

上线前执行服务端迁移：

```text
lobsterai-server/sql/V77__publishing_quota_expiration.sql
```

迁移只给 `html_shares` 增加可空字段 `access_expires_at DATETIME NULL`，兼容 MySQL 5.7，不增加外键。`NULL` 表示按订阅/团队权益判断；非空表示固定公开访问截止时间。

## 服务端配置

| 配置 | 默认值 | 说明 |
| --- | ---: | --- |
| `html-share.free-total-shares-per-user` | 10 | 普通用户累计文件分享数 |
| `site.quota.free-total-limit` | 1 | 普通用户累计网站数 |
| `html-share.free-access-ttl-seconds` | 7200 | 普通用户新资源固定有效期 |
| `html-share.entitlement-loss-grace-days` | 7 | 订阅/团队身份失效后的访问宽限期 |
| `html-share.enterprise-active-share-limit` | 100 | 每企业、每成员的活跃文件数 |
| `site.quota.enterprise-default-limit` | 5 | 每企业、每成员的活跃网站数 |
| `html-share.plan-active-limits.*` | 100/200/500/1000 | 各个人订阅套餐活跃文件数 |
| `site.quota.plan-limits.*` | 5/15/40/100 | 各个人订阅套餐活跃网站数 |

配置启动时要求为正数。客户端不硬编码额度或 2 小时，只展示服务端返回值。

## API 变化

### 普通用户公共体验策略

```http
GET /api/publishing/trial-policy
```

该接口免登录，只返回服务端当前普通用户产品策略：

```json
{
  "identityType": "free",
  "file": {
    "resourceKind": "file",
    "countMode": "total",
    "limit": 10,
    "accessTtlSeconds": 7200,
    "canReleaseByClosing": false
  },
  "site": {
    "resourceKind": "site",
    "countMode": "total",
    "limit": 1,
    "accessTtlSeconds": 7200,
    "canReleaseByClosing": false
  }
}
```

未登录分享/部署弹窗每次打开时读取对应资源的 `limit`，主操作“去登录”。接口读取失败时显示不带固定数字的降级文案，客户端不得回退到硬编码 10/1/2 小时。

### 文件分享额度预检

```http
GET /api/html-shares/quota
Authorization: Bearer <token>
```

响应 `data`：

```json
{
  "allowed": false,
  "identityType": "free",
  "resourceKind": "file",
  "countMode": "total",
  "planName": "free",
  "planDisplayName": "普通用户",
  "used": 10,
  "limit": 10,
  "remaining": 0,
  "canReleaseByClosing": false
}
```

预检只用于减少无效上传；创建接口仍在同一用户额度锁下做最终校验。

### 网站额度

既有网站 quota 响应新增：

```text
identityType: free | subscription | enterprise
resourceKind: site
countMode: total | active
canReleaseByClosing: boolean
```

普通用户按累计量统计，关闭、过期、删除均不释放；订阅和团队按活跃量统计。

### 额度错误

文件沿用 `HTML_SHARE_ACTIVE_LIMIT_EXCEEDED`，网站沿用 `SITE_ACTIVE_QUOTA_EXCEEDED`。错误响应 `data` 提供结构化额度快照：

```json
{
  "identityType": "subscription",
  "resourceKind": "file",
  "countMode": "active",
  "used": 100,
  "limit": 100,
  "canReleaseByClosing": true
}
```

Electron 主进程会保留该结构，渲染进程不得解析中文错误文案。普通用户命中总量额度后，弹窗使用响应中的 `limit`，主操作“去订阅”；订阅/团队命中活跃额度后，主操作“去处理”进入“我的文件 > 云端”。两种情况都不会自动关闭资源。

### 资源过期时间

- 分享创建、详情、状态与访问模式响应新增可选 `accessExpiresAt`。
- Library 云端列表的文件、网站条目新增可选 `accessExpiresAt`（Unix epoch 毫秒）。
- Library 云端列表条目新增只读有效状态投影：
  - `effectiveAvailable: boolean`；
  - `effectiveExpiresAt?: number`（Unix epoch 毫秒）；
  - `effectiveUnavailableReason?: share_not_live | site_not_online | free_access_expired | entitlement_grace_expired`。
- Library 云端列表顶层新增 `serverNow`（Unix epoch 毫秒）。
- 旧服务端不返回这些字段时，新客户端保持原展示且不猜测截止时间。

示例：订阅身份失效超过宽限期、但尚未发生公开访问关闭时，数据库原始 `status` 仍可能为 `live`，列表会返回：

```json
{
  "status": "live",
  "accessExpiresAt": null,
  "effectiveAvailable": false,
  "effectiveExpiresAt": 1787211120000,
  "effectiveUnavailableReason": "entitlement_grace_expired"
}
```

客户端状态、可访问筛选、打开链接按钮及云端详情操作必须使用 `effective*` 投影和 `serverNow`，不能仅使用数据库原始 `status`。`effectiveExpiresAt` 允许页面停留期间在宽限期边界自动切换为不可访问，无需轮询服务端。

普通用户分享与部署详情弹窗根据服务端返回的 `accessExpiresAt/expiresAt` 显示“限时体验”和实际剩余时间。到期后客户端立即显示“链接已过期”并禁用权限更新、文件更新和重新部署；复制链接仍可保留，最终访问结果由服务端判断。

客户端基于 `serverNow` 加单调时钟流逝量计算剩余时间，整个页面共用一个低频计时器；不轮询服务端、不逐行创建定时器。到期后立即在本地显示不可访问并禁用打开，最终权限仍由服务端校验。

## 服务端规则

### 普通登录用户

- 文件累计最多 10 个、网站累计最多 1 个（均可配置）。
- 创建时写入 `access_expires_at = created_at + TTL`；更新不延长。
- 截止时间到达后，公开访问和普通用户更新/重新开启失败。
- 过期仅在真实公开访问时条件关闭数据库状态；列表读取不写库。

### 订阅和团队用户

- 按活跃量统计，创建/重新开启时做并发安全的最终校验。
- 每次写操作和公开访问都只读查询当前订阅或团队身份，不把订阅有效期快照写进分享记录。
- 身份失效后，拥有者写操作立即拒绝；公开访问在失效时间起 7 天内仍可访问。
- 第 7 天后首次访问该具体链接时条件关闭该链接。只关闭本次访问的资源，不批量关闭该用户的其他资源。
- Library 云端列表是只读状态触发点：本页存在 live 权益型资源时，每个 HTTP 请求只解析一次当前账号权益并计算每条资源的 `effective*` 字段，不逐条查询、不关闭分享、不写数据库。
- 如果失效期间无人访问且用户已经恢复订阅/团队身份，旧链接继续有效。
- 一旦链接已因宽限期结束而关闭，恢复身份不会自动开启，必须由用户手动开启或重新部署。
- 网站公开访问被关闭后，异步停止对应运行资源；访问请求本身不等待清理任务。

## 上线顺序

1. 备份并执行 V77 数据库迁移。
2. 发布包含新配置、额度校验和访问守卫的服务端。
3. 验证额度接口与 Library 新字段。
4. 发布客户端。

回滚服务端时可保留可空字段。不要先发布依赖新字段的服务端代码再执行迁移。

## 验证重点

- 普通用户第 10/1 个资源可创建，第 11/2 个并发创建也必须失败。
- 关闭、过期、删除普通资源后累计额度不恢复。
- 普通资源更新不改变原截止时间，边界 `now == accessExpiresAt` 即失效。
- 订阅退款/取消、自然到期、企业停用、成员移除的失效时间分别正确。
- 身份失效超过 7 天后只在访问目标链接时关闭该链接；恢复身份后不自动恢复已关闭链接。
- 身份失效超过 7 天但尚未触发关闭时，Library 原始状态可以仍为 `live`，但 `effectiveAvailable=false`，客户端必须显示不可访问；恢复身份后刷新会恢复有效投影。
- 客户端云端列表的文件和网站共用服务端时间基准，过期后无需网络轮询即可更新状态。
