# 图片管线 + 防盗刷实现计划 v2（单服务器 / 无签名）

> v2 修正版：根据 Codex 审计意见（NEEDS REVISION）重写。
> 决策锁定：**v1 = 单服务器**；**不做 HMAC 签名 URL**。

## 决策摘要

| 项 | v1 选型 | 不选的原因 |
|----|--------|----------|
| 部署形态 | 单服务器，本地 FS | 多服务器需要 DB / 密钥 / 文件三方同步，复杂度爆炸 |
| 防盗刷主层 | Referer 精确校验 + 每 IP rate limit + hash 文件名 + 长缓存 | 签名 URL 跟 SPA 渲染 + immutable 缓存语义冲突 |
| 存储 | 本地 `./uploads/img/`，绝对路径解析 | 对象存储留作 v2 抽象层切换 |
| 数据库 | 现有 SQLite，新增 `images` 表 | — |

多服务器、对象存储、签名 URL **不属于本计划**；如未来需要，单独写 v3。

## 目标（v1）

1. Admin 上传图片，sharp 自动生成多尺寸 + 多格式（AVIF / WebP / JPEG 保底）
2. Markdown 中用 `![alt](hash:<prefix>)` 引用，公开 post fetch 时把 hash 解析成 variant URL
3. 防外链热链：精确 host 校验
4. 防带宽盗刷：每 IP rate limit + 长缓存 + hash 文件名
5. 删除安全：删图前扫文章引用，挡死 broken link

## 架构总览

```
[Admin Upload]
   │ POST /api/trpc/upload.image (base64)
   ▼
[Hono Node 进程]
   ├─ api/lib/images.ts        sharp pipeline (atomic write → rename)
   ├─ api/lib/imageRefs.ts     扫 post content 找 hash 引用
   └─ DB.images                hash → variants JSON
   │
   │ 写入 ${UPLOAD_DIR}/<hash>-<w>.<fmt>
   ▼
[Disk]

────────────────────────────────────────────────

[Public read]
   │ GET /post/:slug
   ▼
[tRPC post.getBySlug]
   │ 返回 { post, images: { <hash>: ImageRef } }     ← 关键：批量带出
   ▼
[Client React]
   │ ArticleMarkdown 自定义 image renderer
   │   ![alt](hash:abc1) → 查 images map → <BlogImage img={ref} />
   ▼
[<picture> AVIF/WebP/JPEG srcSet]
   │ /uploads/img/<hash>-<w>.<fmt>
   ▼
[Hono imageGuard middleware]
   1. Referer 精确 host 比对（new URL，不用 startsWith）
   2. Per-IP rate limit（内存桶）
   3. hit → serveStatic + Cache-Control: immutable
```

## 解决审计指出的关键问题

| 审计发现 | v2 应对 |
|---------|--------|
| 签名跟 immutable 缓存冲突 | 全删签名层，纯靠 Referer + rate limit |
| SPA 没 SSR 签名时机 | tRPC post fetch 返回 `images` map，客户端直接渲染裸 URL |
| 多服务器密钥/DB 同步缺 | v1 锁单机，多机问题不存在 |
| Referer `startsWith` 可绕过 | 用 `new URL(ref).host` 精确比对 |
| `x-forwarded-for` 可伪造 | 用 env `TRUSTED_PROXY=1` 切换；否则用 `c.env.incoming.socket.remoteAddress` |
| variants.path 含义模糊 | 列里只存**相对 storage key**；URL 在响应层拼 |
| hash 长度自相矛盾 | 统一 `sha256` 前 16 hex 字符；DB 列 `length: 16` |
| 小图测试期待 480 variant 冲突 | 小于 480 的图保留原宽（1 个 variant），不放大 |
| 上传持久性欠考虑 | 写临时文件 + atomic rename + 异常清理 + mkdir recursive |
| 删图破坏文章 | `delete` 先 grep `posts.content` / `work_details.content`；命中即 BAD_REQUEST |
| 输入校验不全 | magic-byte 嗅探 (`file-type`)、pixel 上限、decompression bomb 防护、MIME 白名单 |
| 静态 root 相对路径 | boot 时 `path.resolve()` 锁绝对路径 |
| markdown 语法没定 | 显式定义 `hash:<16-hex>`；缺失 hash 渲染降级灰块 + alt |
| 排序错（schema 先于 spike） | 第 1 步先做内容解析端到端 spike，再 lock schema |

## DB 变更

新增表 `images`：

```ts
// db/schema.ts
export const images = sqliteTable("images", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),

  // sha256(input)[0:16] —— 16 hex chars, 1 字符 = 4 bit, 64 bit 碰撞概率够小
  hash: text("hash", { length: 16 }).notNull().unique(),

  origName: text("orig_name", { length: 255 }).notNull(),
  origMime: text("orig_mime", { length: 50 }).notNull(),
  origBytes: integer("orig_bytes", { mode: "number" }).notNull(),
  width: integer("width", { mode: "number" }).notNull(),
  height: integer("height", { mode: "number" }).notNull(),

  // JSON-stringified ImageVariant[]
  // ImageVariant = { width: number; format: "avif" | "webp" | "jpeg"; storageKey: string; bytes: number }
  // storageKey 是相对 UPLOAD_DIR 的路径，如 "abc1234567890def-960.webp"
  // 公开 URL 在响应边界拼 "/uploads/img/" + storageKey
  variants: text("variants").notNull(),

  uploadedBy: integer("uploaded_by").references(() => users.id),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});
```

Migration 文件 `db/migrations/0002_images.sql`，用 `CREATE TABLE IF NOT EXISTS` 模式（与 baseline 一致）。

## Markdown 语法（v1 锁定）

**Image ref 语法**：

```markdown
![alt 文本](hash:abc1234567890def)
```

- 用标准 markdown image 语法的 src 位置写 `hash:<16-hex>`
- 16 hex 字符长度严格校验，正则 `^hash:[0-9a-f]{16}$`
- 非 `hash:` 前缀的 src 走原生 `<img>`（外链图、表情）

**渲染规则**：

| 情况 | 渲染 |
|------|-----|
| hash 在 `images` map 内 | `<BlogImage>` + `<picture>` |
| hash 在 map 内但 variants 为空 / 损坏 | 灰色占位框 + alt 文本 |
| hash 不在 map 内（图被删了 / 引用了别 post 的图） | 灰色 broken-image 图标 + alt |
| src 是 `http(s)://` / 相对路径 | 原生 `<img>` 直出（保留外链能力） |

**editor 预览**：v1 不做预览侧 hash 解析。Admin 写 markdown 时可在 `ImageUploadPanel` 复制 ref 字符串后切到文章页预览。

## 模块拆分

### 1. `api/lib/images.ts` — sharp pipeline

职责：

- 接 `Buffer + origName`，返回 `{ hash, width, height, variants }`
- **校验顺序**：
  1. `Buffer.byteLength` 检查 → 超限 throw `PAYLOAD_TOO_LARGE`
  2. magic-byte 嗅探（用 `file-type` 包）→ MIME 不在白名单 throw `BAD_REQUEST`
  3. `sharp(buf).metadata()` → 像素积 > `MAX_PIXELS`（默认 `40_000_000`，约 6324×6324） throw `BAD_REQUEST`（防 decompression bomb）
  4. sharp 内置 `limitInputPixels`（设为同值）兜底
- 计算 `hash = sha256(input).slice(0, 16)`；查 DB 命中即返回（幂等）
- `sharp(buf).rotate()` EXIF 自动矫正
- 对 `[480, 960, 1920]` × `[avif, webp, jpeg]` 笛卡尔生成
  - **小于 480 的图**：跳过尺寸维度，只按原宽生成 3 种格式（共 3 variants）
  - **介于 480-960 之间**：跳过 1920 维度
  - 任何情况下不向上放大（`withoutEnlargement: true`）
- 文件名 `<hash>-<width>.<fmt>`
- **原子写入**：先写 `<hash>-<width>.<fmt>.tmp` → `fs.rename` → 失败时 unlink 已写入的全部产物
- 整体失败：清理目录里所有 `<hash>-*` 文件

参数：

| 格式 | quality | extra |
|------|---------|-------|
| WebP | 80 | — |
| AVIF | 60 | — |
| JPEG | 82 | `mozjpeg: true` |

MIME 白名单：`image/jpeg`, `image/png`, `image/webp`, `image/avif`, `image/gif`。

明确不支持：SVG（XSS 风险）、HEIC（许可证 + 解码不稳）、TIFF。

### 2. `api/lib/imageRefs.ts` — 引用扫描 + 解析

#### `scanRefs(content: string[]): string[]`

输入 post 的 paragraph 数组，返回里面出现的所有 `hash:<16-hex>`（去重）。
正则 `/!\[[^\]]*\]\(hash:([0-9a-f]{16})\)/g`。

#### `loadImageMap(hashes: string[]): Promise<Record<string, ImageRef>>`

批量查 `images` 表，组成 `{ <hash>: ImageRef }` map。

#### `assertNoRefs(hash: string): Promise<void>`

删图前调用：

- `SELECT id, slug, content FROM posts` 全表扫
- `SELECT id, post_id, content FROM work_details` 全表扫
- 任一命中 `hash:<target>` 即 throw `BAD_REQUEST: "Image is referenced by post(s): <list>"`
- 个人博客规模数据小，全表扫够用；后续可加 `image_refs` join 表

### 3. `api/middleware/imageGuard.ts` — Referer + rate limit

```ts
import { createMiddleware } from "hono/factory";
import { isProduction } from "../lib/env";

const RATE_LIMIT_PER_MIN = 200;
const buckets = new Map<string, { count: number; resetAt: number }>();

function getClientIp(c: Context): string {
  if (process.env.TRUSTED_PROXY === "1") {
    const xff = c.req.header("x-forwarded-for");
    if (xff) return xff.split(",")[0].trim();
  }
  // Hono on @hono/node-server: c.env.incoming.socket.remoteAddress
  return (c.env as any)?.incoming?.socket?.remoteAddress ?? "anon";
}

function checkRefererAllowed(ref: string | undefined, allowed: Set<string>): boolean {
  if (!ref) return true; // 空 referer 放行：直接访问 / 社交分享卡 / 浏览器同源策略剥离
  try {
    const u = new URL(ref);
    return allowed.has(u.host); // 精确 host:port 比对
  } catch {
    return false; // 解析失败一律拒
  }
}

export const imageGuard = createMiddleware(async (c, next) => {
  const allowed = new Set(
    (process.env.IMG_ALLOWED_HOSTS ?? (isProduction ? "" : "localhost:3000"))
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );

  if (!checkRefererAllowed(c.req.header("Referer"), allowed)) {
    return c.text("Forbidden", 403);
  }

  const ip = getClientIp(c);
  const now = Date.now();
  const bucket = buckets.get(ip);
  if (!bucket || bucket.resetAt < now) {
    buckets.set(ip, { count: 1, resetAt: now + 60_000 });
  } else if (bucket.count >= RATE_LIMIT_PER_MIN) {
    return c.text("Too Many Requests", 429);
  } else {
    bucket.count++;
  }

  await next();

  c.header("Cache-Control", "public, max-age=31536000, immutable");
  c.header("X-Content-Type-Options", "nosniff");
});
```

注意：

- 生产必须设 `IMG_ALLOWED_HOSTS=blog.example.com`；不设的话 prod 默认空集合 → 任何带 referer 的请求都 403（强迫显式配置）
- 空 referer 放行是有意决策：手机分享、Telegram 预览、`<link rel="image_src">` 都不带 referer
- 内存桶简单粗暴：进程重启即重置；过期 bucket 在下次访问该 IP 时自然替换；不主动 GC

### 4. `api/routers/upload.ts` — tRPC mutation

```ts
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { router, adminQuery } from "../middleware";
import { processUpload, deleteImage, listImages } from "../lib/images";

export const uploadRouter = router({
  image: adminQuery
    .input(z.object({
      dataBase64: z.string(),
      origName: z.string().min(1).max(255),
    }))
    .mutation(async ({ ctx, input }) => {
      const buf = Buffer.from(input.dataBase64, "base64");
      if (buf.length > MAX_UPLOAD_BYTES) {
        throw new TRPCError({ code: "PAYLOAD_TOO_LARGE" });
      }
      return processUpload(buf, {
        origName: input.origName,
        userId: ctx.user.id,
      });
    }),

  list: adminQuery.query(() => listImages()),

  delete: adminQuery
    .input(z.object({ hash: z.string().regex(/^[0-9a-f]{16}$/) }))
    .mutation(async ({ input }) => {
      await deleteImage(input.hash); // 内部调 assertNoRefs，命中即抛 BAD_REQUEST
      return { ok: true };
    }),
});
```

挂到 `api/router.ts` root：`upload: uploadRouter`。

### 5. `api/routers/post.ts` —— 图片解析注入

修改现有 `getBySlug` / `list`：

```ts
// 旧返回: post
// 新返回: { post, images: Record<string, ImageRef> }

const post = await ...;
const hashes = scanRefs(post.content);
const images = hashes.length > 0 ? await loadImageMap(hashes) : {};
return { post, images };
```

同样的注入加到 `work` router（如果 work 也用图）。

### 6. `api/boot.ts` —— 静态服务挂载

```ts
import { serveStatic } from "@hono/node-server/serve-static";
import { imageGuard } from "./middleware/imageGuard";
import path from "node:path";

const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR ?? "./uploads/img");
// 启动时 mkdir + 校验可写
await ensureUploadDir(UPLOAD_DIR);

app.use("/uploads/img/*", imageGuard);
app.use(
  "/uploads/img/*",
  serveStatic({
    root: path.dirname(UPLOAD_DIR),
    rewriteRequestPath: (p) => p.replace(/^\/uploads\/img/, "/" + path.basename(UPLOAD_DIR)),
  }),
);
```

body limit 提到 **15 MB**（base64 比 binary 大 ~33%，给 10MB 二进制留缓冲）。

### 7. 前端

#### `src/lib/imageUrl.ts`

```ts
export interface ImageVariant {
  width: number;
  format: "avif" | "webp" | "jpeg";
  storageKey: string;
}
export interface ImageRef {
  hash: string;
  width: number;
  height: number;
  variants: ImageVariant[];
}

const PUBLIC_BASE = "/uploads/img";

export function variantUrl(v: ImageVariant): string {
  return `${PUBLIC_BASE}/${v.storageKey}`;
}

export function srcSet(img: ImageRef, fmt: ImageVariant["format"]): string {
  return img.variants
    .filter((v) => v.format === fmt)
    .map((v) => `${variantUrl(v)} ${v.width}w`)
    .join(", ");
}

export function fallbackJpeg(img: ImageRef): string | undefined {
  // 优先 960，没有就拿最大宽的 jpeg
  const jpegs = img.variants.filter((v) => v.format === "jpeg");
  return (
    jpegs.find((v) => v.width === 960)?.storageKey
      ?? jpegs.reduce<ImageVariant | undefined>(
        (a, b) => (!a || b.width > a.width ? b : a),
        undefined,
      )?.storageKey
  ) ? variantUrl(...) : undefined;
}
```

#### `src/components/BlogImage.tsx`

```tsx
export function BlogImage({ img, alt, sizes }: {
  img: ImageRef;
  alt: string;
  sizes?: string;
}) {
  const jpeg = fallbackJpeg(img);
  return (
    <picture>
      <source
        type="image/avif"
        srcSet={srcSet(img, "avif")}
        sizes={sizes ?? "(max-width:768px) 100vw, 960px"}
      />
      <source
        type="image/webp"
        srcSet={srcSet(img, "webp")}
        sizes={sizes ?? "(max-width:768px) 100vw, 960px"}
      />
      <img
        src={jpeg}
        alt={alt}
        loading="lazy"
        decoding="async"
        width={img.width}
        height={img.height}  // 关键：占位防 CLS
      />
    </picture>
  );
}

export function BrokenImage({ alt }: { alt: string }) {
  return (
    <span className="inline-flex items-center justify-center w-full aspect-video bg-muted text-muted-foreground font-mono text-xs">
      [missing image: {alt || "untitled"}]
    </span>
  );
}
```

#### `src/components/ArticleMarkdown.tsx`

注入自定义 `img` renderer：

```tsx
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface Props {
  paragraphs: string[];
  images: Record<string, ImageRef>;
}

const HASH_RE = /^hash:([0-9a-f]{16})$/;

export function ArticleMarkdown({ paragraphs, images }: Props) {
  const markdown = paragraphs.join("\n\n");
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        img({ src, alt }) {
          const m = (src ?? "").match(HASH_RE);
          if (!m) {
            // 外链 / 相对路径 / 非 hash: 直出原生 img
            return <img src={src} alt={alt ?? ""} loading="lazy" />;
          }
          const ref = images[m[1]];
          if (!ref) return <BrokenImage alt={alt ?? ""} />;
          return <BlogImage img={ref} alt={alt ?? ""} />;
        },
      }}
    >
      {markdown}
    </ReactMarkdown>
  );
}
```

修改 `ArticleDetail.tsx`：从 tRPC 拿到的 `{ post, images }` 拆开传入。

#### `src/components/admin/ImageUploadPanel.tsx`

新增 Admin tab "Images"。功能：

- Drop zone（或 file picker），读 file → `FileReader.readAsDataURL` → 切掉 `data:*;base64,` 前缀 → 调 `trpc.upload.image.useMutation`
- 上传中显示 spinner；完成后显示：
  - 缩略图（最小 variant 的 JPEG）
  - 复制按钮：把 `![](hash:abc1234567890def)` 写到剪贴板
  - origName / 像素 / 总字节
- 列表区：`trpc.upload.list` 渲染历史图，每张支持复制 ref + 删除
- 删除报 `BAD_REQUEST: Image is referenced by post(s): ...` 时弹 toast 列出引用文章

挂到 `src/pages/Admin.tsx` 现有 tab 容器，作为第三个 tab。

## env

| key | default | 说明 |
|-----|---------|-----|
| `UPLOAD_DIR` | `./uploads/img` | 物理存储路径，boot 时 resolve 成绝对路径 |
| `UPLOAD_MAX_BYTES` | `10485760` | 上传二进制大小上限（base64 解码后） |
| `IMG_MAX_PIXELS` | `40000000` | 像素积上限，防 decompression bomb |
| `IMG_ALLOWED_HOSTS` | dev `localhost:3000`；prod **必填** | Referer 白名单 host:port，逗号分隔；prod 不设默认空集合 → 全 403 |
| `TRUSTED_PROXY` | `0` | 设为 `1` 才信任 `X-Forwarded-For` 第一段 |

## 任务清单（v2 顺序）

> **关键调整**：先 spike 内容解析端到端，再锁 schema。

1. **Spike**：手动在 `db.json` / 内存里塞 `images: { abc1234567890def: {...} }`，改 `post.getBySlug` 返回 `{ post, images }`，前端 `BlogImage` + `ArticleMarkdown` 渲染通。**这步先不动 DB schema、不装 sharp，只验证内容解析路径**
2. spike 通过 → `npm i sharp file-type`；esbuild 加 `--external:sharp`
3. 写 `db/schema.ts` 的 `images` 表 + relations
4. 生成 `db/migrations/0002_images.sql`，改 `CREATE TABLE IF NOT EXISTS`
5. `npm run db:push` 验证
6. 写 `api/lib/images.ts`：sharp pipeline + atomic write + 校验三件套（size / mime / pixels）
   - 单测：空 buf、超大 buf、非图、SVG 拒绝、巨像素拒绝、小图只生成原宽、EXIF 旋转、幂等命中
7. 写 `api/lib/imageRefs.ts`：scanRefs / loadImageMap / assertNoRefs
   - 单测：正则边界、跨 post 引用扫描、无引用通过
8. 写 `api/middleware/imageGuard.ts`：Referer + rate limit
   - 单测：精确 host / 空 referer / 第三方 / 突发 201 req / TRUSTED_PROXY 切换
9. 写 `api/routers/upload.ts`：tRPC mutation
   - 单测：admin auth、超限、删图引用挡死
10. 改 `api/routers/post.ts`：注入 `images` map（getBySlug + list）
11. `api/boot.ts`：mkdir + resolve 绝对路径 + 挂 imageGuard + serveStatic；body limit 提到 15MB
12. `api/router.ts`：加 `upload: uploadRouter`
13. 写 `src/lib/imageUrl.ts` + `src/components/BlogImage.tsx` + `BrokenImage`
14. 改 `src/components/ArticleMarkdown.tsx`：自定义 img renderer
15. 改 `src/pages/ArticleDetail.tsx`：传 `images` 给 ArticleMarkdown
16. 写 `src/components/admin/ImageUploadPanel.tsx`，挂到 `/admin`
17. `.gitignore` 加 `uploads/`
18. `CLAUDE.md` 更新：Images 章节、env 表、esbuild external 注释、markdown 语法定义

## 测试矩阵

### `api/lib/images.test.ts`

| 输入 | 期望 |
|------|-----|
| 空 Buffer | throw `BAD_REQUEST` |
| 11MB JPEG | throw `PAYLOAD_TOO_LARGE` |
| 文本伪装 .jpg | magic-byte 嗅探拒绝 |
| SVG 内容 | MIME 不在白名单 |
| 50000×50000 PNG（解压炸弹） | 像素积超限拒绝 |
| 300×200 真 JPEG | 生成 3 variants（仅原宽 × 3 format） |
| 800×600 真 JPEG | 6 variants（480 + 800 × 3 fmt）|
| 4000×3000 真 JPEG | 9 variants |
| EXIF 旋转 JPEG | 输出像素方向已矫正（`metadata.orientation === 1`） |
| 相同 buffer 二次调用 | DB 命中、跳过磁盘写、返回相同 variants |
| 写中途 throw（mock fs.rename 失败） | `<hash>-*` 临时文件全清干净 |

### `api/lib/imageRefs.test.ts`

| 输入 | 期望 |
|------|-----|
| `["No image here"]` | `[]` |
| `["![cat](hash:abc1234567890def)"]` | `["abc1234567890def"]` |
| 同 hash 多次出现 | 去重后 1 个 |
| `![](hash:bad)` 长度不足 | 不命中（正则严格 16 hex） |
| `![](https://x.com/a.jpg)` 外链 | 不命中 |
| assertNoRefs 命中文章 | throw `BAD_REQUEST` 含 slug 列表 |

### `api/middleware/imageGuard.test.ts`

| 场景 | 期望 |
|------|-----|
| `Referer: https://blog.example.com/post/x` + 白名单含 `blog.example.com` | 通过 |
| `Referer:` 不传 | 通过 |
| `Referer: https://evil.com.blog.example.com/` | 403（精确 host 不匹配） |
| `Referer: 乱码` | 403（URL parse 失败） |
| 同 IP 连续 201 请求 | 第 201 起 429 |
| `TRUSTED_PROXY=0` + 伪造 XFF | 用真实 socket IP 限流 |
| `TRUSTED_PROXY=1` + XFF `1.2.3.4, 5.6.7.8` | 用 `1.2.3.4` 限流 |

### `src/components/ArticleMarkdown.test.tsx`

| 输入 | 期望 |
|------|-----|
| `![alt](hash:abc1234567890def)` + map 有 ref | 渲染 `<picture>` 三个 source |
| `![alt](hash:abc1234567890def)` + map 无 ref | 渲染 `<BrokenImage>` |
| `![alt](https://cdn.x/a.jpg)` | 渲染原生 `<img>` |
| `![alt](hash:short)` 长度不对 | 走原生 `<img>`（正则不命中） |

### 集成测（手动验收）

详见下节"验收清单"。

## 验收清单（部署前）

- [ ] Admin 上传 5MB JPEG → 拿到 `![](hash:...)` 复制串，3s 内完成
- [ ] 粘贴 ref 到文章 markdown，发布后页面看到 `<picture>`，DevTools Network 显示加载 `.avif`
- [ ] 在另一个域 (`https://example.com`) 用 `<img>` 引用该图 → 403
- [ ] 浏览器直接打开图片 URL（空 referer）→ 正常显示
- [ ] curl 同图 URL 201 次同 IP → 第 201 起 429
- [ ] `Cache-Control: public, max-age=31536000, immutable` 在响应头
- [ ] 删除已被文章引用的图 → tRPC error 列出引用 slug
- [ ] 删除无引用的图 → 文件 + DB 行都消失
- [ ] 上传 SVG / TIFF / 文本伪装 → admin UI 显示拒绝原因
- [ ] 上传 50000×50000 PNG（人造解压炸弹）→ 拒绝
- [ ] Server 重启后 `./uploads/img` 仍在、DB 行仍在、页面图片仍 OK
- [ ] `IMG_ALLOWED_HOSTS` 不设（prod）→ 所有带 referer 的请求 403（强迫显式配置）

## 不属于 v1 范围（未来 v3 候选）

- 多服务器 / 对象存储（R2、OSS） → 改 `images.ts` 加 storage 抽象层
- HMAC 签名 URL（如果未来真有付费/私密内容）
- 自动孤儿清理 cron（30 天无引用 + 上传时间 > 30 天 → 删）
- 编辑器内 markdown 预览解析 hash ref
- Cloudflare 套前面（Page Rule 长缓存 + Rate Limit 兜底）

---

**总结**：v2 把签名层、多机同步、对象存储抽象全砍掉，换来更小的实现面 + 更清晰的安全边界。Referer 改精确 host，rate limit 显式区分可信代理，删图前先扫引用，sharp pipeline 走 atomic write + 三层输入校验。任务排序从"先 schema"改为"先内容解析 spike"，避免 schema 锁死后才发现 SPA 路径走不通。
