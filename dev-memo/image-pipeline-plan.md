# 图片管线 + 防盗刷实现计划（多服务器兼容）

## 目标

1. 上传图片时自动生成多尺寸 + 多格式（AVIF / WebP / JPEG 保底）
2. 文章渲染时浏览器自动按支持度与屏宽挑最优
3. 防外链热链（hotlink）
4. 防带宽盗刷（rate limit + 长缓存 + 签名 URL）
5. **零供应商锁定**：所有逻辑在应用层，GitHub Action 推到任意服务器都能跑；CDN（含 Cloudflare）只是可选叠加 buff，没有也不影响功能

## 架构总览

```
[Admin Upload]
   │  POST /api/trpc/upload.image  (base64)
   ▼
[Hono] ──> sharp pipeline ──> uploads/img/<hash>-<w>.<fmt>
   │                              │
   │                              └─> images 表 (hash, variants JSON)
   │
[Public GET]
   │  GET /uploads/img/<hash>-<w>.<fmt>?sig=...&exp=...
   ▼
[Hono middleware]
   1. Referer 白名单检查
   2. Rate limit (per IP)
   3. HMAC 签名校验（可选层）
   4. 命中 → 流式回文件 + Cache-Control: immutable
```

应用层完成全部工作。Cloudflare/Nginx/任何反向代理放前面只为加速，**不参与策略判断**。

## DB 变更

新增表 `images`：

```ts
// db/schema.ts
export const images = sqliteTable("images", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  hash: text("hash", { length: 64 }).notNull().unique(), // sha256[0:16]
  origName: text("orig_name", { length: 255 }).notNull(),
  mime: text("mime", { length: 50 }).notNull(),
  origBytes: integer("orig_bytes", { mode: "number" }).notNull(),
  width: integer("width", { mode: "number" }).notNull(),
  height: integer("height", { mode: "number" }).notNull(),
  variants: text("variants").notNull(), // JSON: ImageVariant[]
  uploadedBy: integer("uploaded_by").references(() => users.id),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});
```

生成新 migration `db/migrations/0002_images.sql`，使用 `CREATE TABLE IF NOT EXISTS` 模式（与 baseline 一致，便于从 db:push 数据库平滑过渡）。

## 模块拆分

### 1. `api/lib/images.ts` — sharp 转换 pipeline

职责：
- 接收 `Buffer`，校验大小 / mime / 解码失败
- 用 `sharp(input).rotate()` 自动 EXIF 矫正
- 对 `[480, 960, 1920]` × `[avif, webp, jpeg]` 笛卡尔生成（共 9 变体，但跳过比原图大的尺寸）
- 文件名：`<sha256[0:16]>-<width>.<fmt>`
- 写入 `UPLOAD_DIR`（默认 `./uploads/img`，可由 `UPLOAD_DIR` env 覆盖）
- 返回 `{ hash, width, height, variants[] }`

参数：

| 格式 | quality | extra |
|------|---------|-------|
| WebP | 80 | 默认 |
| AVIF | 60 | 默认（视觉等价 WebP 80） |
| JPEG | 82 | `mozjpeg: true` |

幂等：相同 hash 已存在则跳过转换，直接返 DB 记录。

### 2. `api/lib/imgSign.ts` — HMAC 签名

签名 URL 格式：`/uploads/img/<file>?exp=<unix>&sig=<base64url>`

- HMAC-SHA256，密钥从 env `IMAGE_SIGNING_KEY`（首次 boot 自动生成存到 `users` 或独立 `app_secrets` 表，避免多服务器手动配置）
- 客户端不直接签 —— 文章 SSR / tRPC 返回时由服务器签好
- 签名只覆盖 `path + exp`，TTL 默认 24h，可配
- 关闭签名：env `IMAGE_SIGN=off`（开发态默认关）

签名 URL 是**第二道墙**：Referer 漏过的爬虫，没有有效 sig 也下载不到。

### 3. `api/middleware/imageGuard.ts` — Referer + rate limit

挂在 `/uploads/img/*` 路由之前：

```ts
// 伪代码
app.use("/uploads/img/*", async (c, next) => {
  // 1. Referer 白名单
  const ref = c.req.header("Referer") ?? "";
  const allow = ALLOWED_HOSTS; // env IMG_ALLOWED_HOSTS, comma-separated
  const empty = ref === "";    // 空 Referer 放行（直接打开图片、社交分享卡）
  const ok = empty || allow.some((h) => ref.startsWith(`https://${h}`) || ref.startsWith(`http://${h}`));
  if (!ok) return c.text("Forbidden", 403);

  // 2. Rate limit (memory store; per-IP, 200 req / 60s)
  if (!rateLimit(c.req.header("x-forwarded-for") ?? c.req.header("x-real-ip") ?? "anon")) {
    return c.text("Too Many Requests", 429);
  }

  // 3. Signature (skip if IMAGE_SIGN=off)
  if (process.env.IMAGE_SIGN !== "off") {
    if (!verifySig(c.req.url)) return c.text("Forbidden", 403);
  }

  await next();
  c.header("Cache-Control", "public, max-age=31536000, immutable");
  c.header("X-Content-Type-Options", "nosniff");
});
```

Rate limit 用最小内存桶（无 Redis 依赖，单机够）。多服务器各自计数 —— 攻击者要 DDoS 多机都翻墙，门槛更高，反而不是坏事。

### 4. `api/routers/upload.ts` — tRPC mutation

```ts
export const uploadRouter = router({
  image: adminQuery
    .input(z.object({
      dataBase64: z.string(),
      origName: z.string().max(255),
    }))
    .mutation(async ({ ctx, input }) => {
      const buf = Buffer.from(input.dataBase64, "base64");
      if (buf.length > 10 * 1024 * 1024) throw new TRPCError({ code: "PAYLOAD_TOO_LARGE" });
      const result = await processUpload(buf, { origName: input.origName, userId: ctx.user.id });
      // result.urls 已经带签名 expires 远远的（如 +10 年），admin 自己用
      return result;
    }),
  list: adminQuery.query(...),
  delete: adminQuery.input(z.object({ hash: z.string() })).mutation(...),
});
```

挂到 `api/router.ts` 的 root router。

### 5. `api/boot.ts` — 静态目录挂载

```ts
import { serveStatic } from "@hono/node-server/serve-static";

app.use("/uploads/img/*", imageGuard);
app.use("/uploads/img/*", serveStatic({ root: "./" }));
```

注意：`uploads/` 目录与代码独立部署，**不进 git**（`.gitignore` 加 `uploads/`），由 GitHub Action 单独同步。

### 6. 前端

#### `src/lib/imageUrl.ts` — URL helper

```ts
export interface ImageRef {
  hash: string;
  variants: { width: number; format: "avif" | "webp" | "jpeg"; path: string }[];
}

export function srcSet(img: ImageRef, fmt: "avif" | "webp" | "jpeg"): string {
  return img.variants
    .filter((v) => v.format === fmt)
    .map((v) => `${v.path} ${v.width}w`)
    .join(", ");
}
```

#### `src/components/BlogImage.tsx`

```tsx
export function BlogImage({ img, alt, sizes }: { img: ImageRef; alt: string; sizes?: string }) {
  const jpegFallback = img.variants.find((v) => v.format === "jpeg" && v.width === 960)?.path;
  return (
    <picture>
      <source type="image/avif" srcSet={srcSet(img, "avif")} sizes={sizes ?? "(max-width:768px) 100vw, 960px"} />
      <source type="image/webp" srcSet={srcSet(img, "webp")} sizes={sizes ?? "(max-width:768px) 100vw, 960px"} />
      <img src={jpegFallback} alt={alt} loading="lazy" decoding="async" />
    </picture>
  );
}
```

#### `src/components/ArticleMarkdown.tsx`

注入自定义 image renderer，把 `![alt](hash:abc123)` 的 markdown 语法路由到 `BlogImage`，普通外链照旧渲染原生 `<img>`。

#### `src/components/admin/ImageUploadPanel.tsx`

Admin 上传 UI：drop zone → base64 → `trpc.upload.image.useMutation` → 显示成功后的 markdown 引用 `![](hash:abc123)` 供复制。

## 多服务器部署适配

### 上传文件同步策略

`uploads/img/` 目录是**运行时产物**，三种策略：

| 策略 | 适用场景 | 操作 |
|------|---------|------|
| A. 单一上传节点 + rsync 分发 | 多服务器中 1 台是主写入 | GitHub Action 推代码 → 主节点；主节点 cron rsync 给从节点 |
| B. 对象存储（S3 / R2 / 阿里 OSS）| 服务器无状态、可水平扩展 | sharp 转完后写入对象存储 SDK；`UPLOAD_BACKEND=s3` env 切换 |
| C. 共享 NFS / 共享卷 | 同机房多节点 | mount 同一卷到 `./uploads` |

**推荐 A**：成本最低，符合个人博客规模。`scripts/sync-uploads.sh` 加入 GitHub Action。

后续如果上 B，只需在 `api/lib/images.ts` 加一层 storage abstraction（local FS / S3 client 二选一），其余代码不动。

### esbuild

`sharp` 含 `.node` 原生绑定，必须 external：

```
npm script "build" 加 --external:sharp
```

同 `better-sqlite3` 同列。

### env

新增（全部可选）：

| key | default | 说明 |
|-----|---------|-----|
| `UPLOAD_DIR` | `./uploads/img` | 物理存储路径 |
| `IMG_ALLOWED_HOSTS` | `localhost:3000` | Referer 白名单，逗号分隔 |
| `IMAGE_SIGN` | prod `on`, dev `off` | 是否启用 HMAC 签名 |
| `IMAGE_SIGN_TTL` | `86400` | 签名 TTL 秒 |
| `IMAGE_SIGNING_KEY` | 自动生成 | HMAC 密钥；首启写入 DB |
| `UPLOAD_MAX_BYTES` | `10485760` | 上传大小上限 |

## 任务清单（顺序执行）

1. `npm i sharp` + esbuild external 配置
2. 写 `db/schema.ts` 的 `images` 表 + relations
3. 生成 migration `0002_images.sql`，手改成 `CREATE TABLE IF NOT EXISTS`
4. `npm run db:push`（dev） / `npm run db:migrate`（prod）验证
5. 写 `api/lib/images.ts` 转换 pipeline + 单测（vitest，用 fixture buffer）
6. 写 `api/lib/imgSign.ts` HMAC 签名 + 单测
7. 写 `api/middleware/imageGuard.ts` Referer + rate limit + sig 校验 + 单测
8. 写 `api/routers/upload.ts` tRPC 端点，挂 `adminQuery`
9. `api/boot.ts` 注册 `serveStatic` + middleware；body limit 提到 15MB（base64 比原文件大 ~33%）
10. `api/router.ts` 加 `upload: uploadRouter`
11. 写 `src/lib/imageUrl.ts` + `src/components/BlogImage.tsx`
12. `src/components/ArticleMarkdown.tsx` 接入自定义 image renderer
13. 写 `src/components/admin/ImageUploadPanel.tsx` 并挂到 `/admin` 第三个 tab
14. `.gitignore` 加 `uploads/`；写 `scripts/sync-uploads.sh`（rsync 占位脚本）
15. GitHub Action 加 `sync-uploads` step（条件触发：仅 main 分支）
16. `CLAUDE.md` 更新：新增 Images 章节、env 表、esbuild external 注释

## 测试矩阵

- `api/lib/images.test.ts`
  - 输入空 Buffer → 抛错
  - 输入超过 10MB → 抛错
  - 输入小图（300×200）→ 仅生成 480px 一档（其他被 `withoutEnlargement` 过滤）
  - 输入大图（4000×3000）→ 完整 3×3 = 9 变体
  - 同 buffer 二次上传 → hash 相同、跳过重转
  - EXIF 旋转的 JPEG → 输出像素方向已矫正
- `api/lib/imgSign.test.ts`
  - 签 → 立即验：通过
  - 篡改 path → 验失败
  - 过期 → 验失败
- `api/middleware/imageGuard.test.ts`
  - 同源 Referer → 通过
  - 空 Referer → 通过（默认放行直接访问）
  - 第三方 Referer → 403
  - 突发 500 req → 第 201 起 429
  - 无 sig + `IMAGE_SIGN=on` → 403
- `src/components/BlogImage.test.tsx`
  - `<picture>` 三个 `<source>` 顺序 = avif > webp > fallback
  - `srcset` 包含所有变体宽度

## 验收清单（部署前）

- [ ] 上传 5MB JPEG → admin 拿到 markdown 引用，< 3s 内完成
- [ ] 文章页面看到 `<picture>`，Chrome devtools Network 显示加载 `.avif`
- [ ] 复制 `<img>` 链接到 `https://example.com` 测试外链 → 403
- [ ] 直接浏览器打开图片 URL（空 Referer）→ 正常显示
- [ ] curl 200 次同一图片 URL 不带 sig → 第 201 起 429
- [ ] curl 同一图 URL 带过期 exp → 403
- [ ] `Cache-Control` 响应头含 `immutable`
- [ ] 关掉 server 重启 → uploads/ 目录文件还在，DB 记录还在

## 后续可选叠加（不属本计划）

- 上 Cloudflare：Page Rule 进一步缓存 + Polish（可关，因为我们已 AVIF/WebP 完毕）+ Rate Limiting Rule（兜底）
- 切对象存储（R2/OSS）：local FS 抽象层切换
- 自动清理孤儿图（无 post 引用且 > 30 天）：cron + 全文 scan

---

**摘要**：用 sharp 做应用层多尺寸/多格式转换，HMAC 签名 + Referer + 内存 rate limit 三层防护，文件名带 hash 走 `immutable` 长缓存。不依赖任何 CDN 或对象存储。GitHub Action 推到 N 台服务器都自给自足。
