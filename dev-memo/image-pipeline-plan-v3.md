# 图片管线 + 防盗刷实现计划 v3（单服务器 / 无签名）

> v3 修订版：在 v2 基础上吸收 Codex 第二轮审计意见。
> v2 verdict: NEEDS REVISION（partial 项打补丁，新增 3 个 High 修复）。
> 决策不变：**v1 = 单服务器 + 无 HMAC 签名 + 仅 posts**。

## 与 v2 的差异概览

| 类别 | v3 新增/修订 |
|------|------------|
| dev 路由 | `vite.config.ts` exclude 改成 `/^\/(?!api\/\|uploads\/).*$/`，把 `/uploads/*` 也代理给 Hono |
| 防盗刷 | 新增 `Sec-Fetch-Site` 头判断（闭合 `Referrer-Policy: no-referrer` 绕过）；文档诚实降级"casual abuse reduction" |
| import 命名 | 改 `createRouter`（不是 `router`）、`env.isProduction`（不是裸 `isProduction`）、`post.bySlug`（不是 `getBySlug`） |
| sharp 校验 | `sharp(buf, { limitInputPixels: MAX_PIXELS })` 一次性传入（不再先调 metadata 再设） |
| GIF 处理 | v1 拒绝 GIF（避免动画语义歧义） |
| `assertNoRefs` | 扫 `posts.content` + `posts.cover_image` + ~~`work_details.content`~~（**v1 不支持 work 图**，避免承诺过载） |
| `.tmp` 残留 | boot 时清扫 `UPLOAD_DIR/*.tmp` |
| 删除一致性 | 先 DB delete（事务）→ 后 file unlink（best-effort）→ 失败留孤儿等 v3 cron |
| 任务排序 | spike 扩展到包含 `/uploads/img/*` 路由验证；tRPC shape 迁移挪到 spike 之后、schema 之前 |
| `post.list` | v1 **不动**，避免分页结构 + image map 二选一卡死；list 页面不展示 hash 图（理由：列表只用 cover_image） |
| ArticleMarkdown | 保留现有 first-paragraph drop-cap 的 `p` renderer，只**追加** `img` renderer |
| 类型 | guard 里 `c.env.incoming.socket.remoteAddress` 加 `NodeHttpEnv` 类型断言，避免 `as any` |
| 文档措辞 | "对象存储留作 v3 抽象层切换" 统一改 v3，跟末尾未来计划一致 |

## 决策摘要（最终锁定）

| 项 | v1 选型 |
|----|--------|
| 部署形态 | 单服务器、本地 FS |
| 防盗刷 | `Sec-Fetch-Site` + Referer 精确 host + 每 IP rate limit + hash 文件名 + 长缓存 |
| 存储 | `./uploads/img/`（绝对路径） |
| DB | SQLite，新增 `images` 表 |
| 内容范围 | **仅 posts** 内嵌图；works 不支持（避免 schema/路由分裂） |
| 安全级别 | "casual abuse reduction"——本质上是公开的 immutable assets |

## 目标（v1）

1. Admin 上传图片 → sharp 生成多尺寸 + 多格式（AVIF / WebP / JPEG）
2. Markdown 用 `![alt](hash:<16-hex>)` 引用，post fetch 返 `{ post, images }`
3. **Casual 防外链 + 防直接 scraping**：Sec-Fetch-Site + Referer + rate limit
4. CLS 友好：每张图 width/height attr 都带上
5. 删除安全：扫 `posts.content` + `posts.cover_image` 防 broken link
6. dev/prod 行为一致：dev 通过 Vite 把 `/uploads/*` 转给 Hono

## 安全表述（重要：诚实降级）

> 本项目的图片是**公开的 immutable assets**。`imageGuard` 的作用是：
>
> - 拦截通过浏览器从第三方页面热链（典型 hotlink） ✅
> - 减少对单一 IP 的批量爬取 ✅
> - **不**抵御 `curl` / 命令行 scraper（Sec-Fetch-Site 不发即放行）❌
> - **不**抵御加 `Referrer-Policy: no-referrer` 的第三方页面（空 referer 仍放行）❌
>
> 真要做强保护需要登录态 + 签名 URL + 短缓存，跟现在的公开博客模型矛盾。v1 不做。

## 架构总览

```
[Admin Upload]
   │ POST /api/trpc/upload.image (base64)
   ▼
[Hono Node 进程]
   ├─ api/lib/images.ts        sharp pipeline (atomic write → rename)
   ├─ api/lib/imageRefs.ts     扫 post content + cover_image 找 hash 引用
   └─ DB.images                hash → variants JSON
   │
   │ 写入 ${UPLOAD_DIR}/<hash>-<w>.<fmt>
   ▼
[Disk]

────────────────────────────────────────────────

[Public read]
   │ GET /post/:slug
   ▼
[tRPC post.bySlug]
   │ 返回 { post, images: { <hash>: ImageRef } }
   ▼
[Client React]
   │ ArticleMarkdown 自定义 img renderer（保留现 p renderer drop cap）
   │   ![alt](hash:abc1) → 查 images map → <BlogImage img={ref} />
   ▼
[<picture> AVIF/WebP/JPEG srcSet]
   │ /uploads/img/<hash>-<w>.<fmt>
   ▼
[Hono imageGuard middleware] ← Vite dev server 通过 exclude 改写把这个路径代理给 Hono
   1. Sec-Fetch-Site 判断
   2. Referer 精确 host 比对（兜底）
   3. Per-IP rate limit（内存桶）
   4. hit → serveStatic + Cache-Control: immutable
```

## 关键代码片段

### `api/middleware/imageGuard.ts`

```ts
import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import type { Socket } from "node:net";
import { env } from "../lib/env";

const RATE_LIMIT_PER_MIN = 200;
const buckets = new Map<string, { count: number; resetAt: number }>();

// @hono/node-server stuffs the IncomingMessage into c.env.incoming
interface NodeHttpEnv {
  incoming?: { socket?: Socket };
}

function getClientIp(c: Context): string {
  if (process.env.TRUSTED_PROXY === "1") {
    const xff = c.req.header("x-forwarded-for");
    if (xff) return xff.split(",")[0]!.trim();
  }
  const node = c.env as NodeHttpEnv;
  return node.incoming?.socket?.remoteAddress ?? "anon";
}

function refererHostAllowed(ref: string | undefined, allowed: Set<string>): boolean {
  if (!ref) return true; // 空 referer 由 Sec-Fetch-Site 把关；这里只管"有 referer"的情况
  try {
    return allowed.has(new URL(ref).host);
  } catch {
    return false;
  }
}

// Sec-Fetch-Site values: "same-origin" | "same-site" | "none" | "cross-site"
// "none" = 直接访问（地址栏/书签/分享卡 fetch）→ 放行
// "same-origin" / "same-site" = 自己页面发起 → 放行
// "cross-site" = 第三方页面 → 拒
// 缺失（老浏览器、curl）→ 退到 Referer 判断
function sfsAllowed(sfs: string | undefined): "allow" | "deny" | "fallback" {
  if (!sfs) return "fallback";
  if (sfs === "cross-site") return "deny";
  return "allow";
}

export const imageGuard = createMiddleware(async (c, next) => {
  const allowed = new Set(
    (process.env.IMG_ALLOWED_HOSTS ?? (env.isProduction ? "" : "localhost:3000"))
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );

  const verdict = sfsAllowed(c.req.header("Sec-Fetch-Site"));
  if (verdict === "deny") return c.text("Forbidden", 403);
  if (verdict === "fallback") {
    if (!refererHostAllowed(c.req.header("Referer"), allowed)) {
      return c.text("Forbidden", 403);
    }
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

### `api/lib/images.ts`（核心校验顺序）

```ts
import sharp from "sharp";
import { fileTypeFromBuffer } from "file-type";  // ESM 命名导出
import { createHash } from "node:crypto";
import { mkdir, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

const MAX_PIXELS = Number(process.env.IMG_MAX_PIXELS ?? 40_000_000);
const MAX_BYTES = Number(process.env.UPLOAD_MAX_BYTES ?? 10_485_760);
const ALLOWED_MIMES = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);
// 注意：v1 不支持 GIF/SVG/HEIC/TIFF；GIF 拒因为动画语义不清。

export async function processUpload(input: Buffer, opts: { origName: string; userId: number }) {
  if (input.byteLength === 0) throw new Error("BAD_REQUEST: empty buffer");
  if (input.byteLength > MAX_BYTES) throw new Error("PAYLOAD_TOO_LARGE");

  const sniffed = await fileTypeFromBuffer(input);
  if (!sniffed || !ALLOWED_MIMES.has(sniffed.mime)) {
    throw new Error(`BAD_REQUEST: unsupported mime ${sniffed?.mime ?? "unknown"}`);
  }

  const hash = createHash("sha256").update(input).digest("hex").slice(0, 16);

  const hit = await findImageByHash(hash);
  if (hit) return hit; // 幂等

  // limitInputPixels 在构造时设置，覆盖 metadata + 所有 transform
  const base = sharp(input, { limitInputPixels: MAX_PIXELS }).rotate();
  const meta = await base.metadata();
  if (!meta.width || !meta.height) throw new Error("BAD_REQUEST: unreadable image");

  // ... 走 SIZES × FORMATS 笛卡尔，原子写：写 .tmp → rename → 失败 unlink all
}
```

### `api/lib/imageRefs.ts`（引用扫描）

```ts
const HASH_RE = /!\[[^\]]*\]\(hash:([0-9a-f]{16})\)/g;

export function scanRefs(content: string[]): string[] {
  const set = new Set<string>();
  for (const para of content) {
    for (const m of para.matchAll(HASH_RE)) set.add(m[1]!);
  }
  return [...set];
}

// 单独识别 cover_image 字段里的 hash ref（cover 也用 hash:xxx 语法）
const COVER_HASH_RE = /^hash:([0-9a-f]{16})$/;

export async function assertNoRefs(hash: string): Promise<void> {
  const target = `hash:${hash}`;

  // 1. posts.content（JSON-stringified paragraph array）
  const postsHit = await db
    .select({ id: posts.id, slug: posts.slug })
    .from(posts)
    .where(like(posts.content, `%${target}%`));

  // 2. posts.cover_image（如果整字段是 hash:xxx 就命中）
  const coverHit = await db
    .select({ id: posts.id, slug: posts.slug })
    .from(posts)
    .where(eq(posts.coverImage, target));

  const all = [...postsHit, ...coverHit];
  if (all.length > 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Image is referenced by post(s): ${all.map((p) => p.slug).join(", ")}`,
    });
  }
}
```

### `api/routers/upload.ts`

```ts
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createRouter, adminQuery } from "../middleware";  // ← createRouter, 不是 router
import { processUpload, deleteImage, listImages } from "../lib/images";

export const uploadRouter = createRouter({
  image: adminQuery
    .input(z.object({
      dataBase64: z.string(),
      origName: z.string().min(1).max(255),
    }))
    .mutation(async ({ ctx, input }) => {
      const buf = Buffer.from(input.dataBase64, "base64");
      // 校验在 processUpload 内部统一抛
      return processUpload(buf, { origName: input.origName, userId: ctx.user.id });
    }),
  list: adminQuery.query(() => listImages()),
  delete: adminQuery
    .input(z.object({ hash: z.string().regex(/^[0-9a-f]{16}$/) }))
    .mutation(async ({ input }) => {
      await deleteImage(input.hash);  // 内部 assertNoRefs → DB delete → file unlink
      return { ok: true };
    }),
});
```

### `api/routers/post.ts` 修改（最小侵入）

```ts
// ── bySlug only —— list 保持不变 ──
bySlug: publicQuery
  .input(z.object({ slug: z.string() }))
  .query(async ({ input }) => {
    const post = await db.query.posts.findFirst({ where: eq(posts.slug, input.slug) });
    if (!post) throw new TRPCError({ code: "NOT_FOUND" });

    const parsed = { ...post, content: parseContent(post.content) };
    const hashes = scanRefs(parsed.content);
    // cover_image 也可能是 hash 引用
    const coverMatch = post.coverImage?.match(COVER_HASH_RE);
    if (coverMatch) hashes.push(coverMatch[1]!);

    const images = hashes.length > 0 ? await loadImageMap([...new Set(hashes)]) : {};
    return { post: parsed, images };
  }),
```

`post.list`、`post.search` 等其它方法**v1 不动**——列表页只展示 cover_image（如果它是 hash，前端单独拉一次轻量接口或在 cover_image 改造时再处理）。

### `api/lib/imageDelete.ts`（删除一致性）

```ts
export async function deleteImage(hash: string): Promise<void> {
  await assertNoRefs(hash);

  // 先 DB delete（同一事务保证 atomicity）
  const deleted = await db.transaction(async (tx) => {
    const row = await tx.select().from(images).where(eq(images.hash, hash)).get();
    if (!row) throw new TRPCError({ code: "NOT_FOUND" });
    await tx.delete(images).where(eq(images.hash, hash));
    return row;
  });

  // 后文件 unlink（best-effort，失败留孤儿）
  const variants = JSON.parse(deleted.variants) as ImageVariant[];
  await Promise.allSettled(
    variants.map((v) => unlink(path.join(UPLOAD_DIR, v.storageKey))),
  );
  // 失败的孤儿文件等未来 cron 清扫；DB 是 source of truth
}
```

### `api/boot.ts`（启动时 tmp 清理 + 静态挂载）

```ts
import { serveStatic } from "@hono/node-server/serve-static";
import { imageGuard } from "./middleware/imageGuard";
import { readdir, unlink } from "node:fs/promises";
import path from "node:path";

const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR ?? "./uploads/img");

async function bootCleanup() {
  await mkdir(UPLOAD_DIR, { recursive: true });
  const entries = await readdir(UPLOAD_DIR);
  await Promise.all(
    entries
      .filter((n) => n.endsWith(".tmp"))
      .map((n) => unlink(path.join(UPLOAD_DIR, n)).catch(() => undefined)),
  );
}
await bootCleanup();

app.use("/uploads/img/*", imageGuard);
app.use(
  "/uploads/img/*",
  serveStatic({
    root: path.dirname(UPLOAD_DIR),
    rewriteRequestPath: (p) =>
      p.replace(/^\/uploads\/img/, "/" + path.basename(UPLOAD_DIR)),
  }),
);
```

### `vite.config.ts` 修改

```ts
// 旧：exclude: [/^\/(?!api\/).*$/]
// 新：把 /uploads/* 也交给 Hono dev server
devServer({
  entry: "api/boot.ts",
  exclude: [/^\/(?!api\/|uploads\/).*$/],
})
```

### `src/lib/imageUrl.ts`（fix v2 的 `variantUrl(...)` 占位符）

```ts
export function fallbackJpeg(img: ImageRef): string | undefined {
  const jpegs = img.variants.filter((v) => v.format === "jpeg");
  const pick =
    jpegs.find((v) => v.width === 960) ??
    jpegs.reduce<ImageVariant | undefined>(
      (a, b) => (!a || b.width > a.width ? b : a),
      undefined,
    );
  return pick ? variantUrl(pick) : undefined;
}
```

### `src/components/ArticleMarkdown.tsx`（保留 drop cap）

```tsx
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ImageRef } from "@/lib/imageUrl";
import { BlogImage, BrokenImage } from "./BlogImage";

interface Props {
  paragraphs: string[];
  images: Record<string, ImageRef>;
}

const HASH_RE = /^hash:([0-9a-f]{16})$/;

export function ArticleMarkdown({ paragraphs, images }: Props) {
  const [first, ...rest] = paragraphs;
  return (
    <>
      {/* 保留 v2 plan 之前的 drop-cap 行为：仅首段加 first-letter 样式 */}
      {first && (
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            p: ({ children }) => <p className="first-letter:drop-cap">{children}</p>,
            img: imgRenderer(images),
          }}
        >
          {first}
        </ReactMarkdown>
      )}
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{ img: imgRenderer(images) }}
      >
        {rest.join("\n\n")}
      </ReactMarkdown>
    </>
  );
}

function imgRenderer(images: Record<string, ImageRef>) {
  return function ImgComp({ src, alt }: { src?: string; alt?: string }) {
    const m = (src ?? "").match(HASH_RE);
    if (!m) return <img src={src} alt={alt ?? ""} loading="lazy" />;
    const ref = images[m[1]!];
    if (!ref) return <BrokenImage alt={alt ?? ""} />;
    return <BlogImage img={ref} alt={alt ?? ""} />;
  };
}
```

## tRPC 响应 shape 迁移 — 消费者清单（必改）

| 文件 | 改动 |
|------|------|
| `src/hooks/useBackend.ts` | `usePostBySlug` 返回类型从 `Post` 改 `{ post: Post; images: Record<string, ImageRef> }` |
| `src/pages/ArticleDetail.tsx` | 解构 `{ post, images }`；把 `images` 传给 `ArticleMarkdown` |
| `src/components/Comments.tsx` | 接收 `postId` 不变（注意 props 链不要改成 `post.post.id`） |
| `src/components/SEO/*`（JSON-LD） | 用 `post` 不是整个返回对象；title/cover 路径不变 |
| `tests/*.test.tsx` | 所有 mock `usePostBySlug` 的返回值改成 `{ post, images: {} }` |

## DB 变更

`db/schema.ts` 加 `images` 表（同 v2）。

Migration `db/migrations/0002_images.sql`：`CREATE TABLE IF NOT EXISTS` 模式。

## env

| key | default | 说明 |
|-----|---------|-----|
| `UPLOAD_DIR` | `./uploads/img` | resolve 成绝对 |
| `UPLOAD_MAX_BYTES` | `10485760` | 二进制大小上限 |
| `IMG_MAX_PIXELS` | `40000000` | 像素积上限 |
| `IMG_ALLOWED_HOSTS` | dev `localhost:3000`；prod **必填** | Referer 白名单（Sec-Fetch-Site 不传时的兜底） |
| `TRUSTED_PROXY` | `0` | 设 `1` 才信 X-Forwarded-For |

## 任务清单（v3 顺序 — spike-first，shape 迁移先于实现）

> 关键调整：spike 现在涵盖 dev 静态路由 + tRPC shape，避免实现完才发现 dev 跑不通。

### Phase 0 — spike（最大风险前置）

1. **Vite dev 路由 spike**：修 `vite.config.ts` exclude，扔一个静态 fixture 文件到 `./uploads/img/test.jpg`，dev mode 访问 `http://localhost:3000/uploads/img/test.jpg` 验证经过 `imageGuard`（先空实现挂个日志中间件即可）
2. **tRPC shape 迁移 spike**：手写 `post.bySlug` 返回 `{ post, images: {} }`（images 暂空 map），改 `useBackend.ts` + `ArticleDetail.tsx` + 现有 mock，跑现有测试通过
3. **ArticleMarkdown img renderer spike**：内存里塞一条假 `ImageRef`，markdown 写 `![](hash:0000000000000000)`，前端渲染 `<picture>` 成功

### Phase 1 — 实现

4. `npm i sharp file-type` + `--external:sharp` 加进 esbuild；**立即** `npm run build && npm start` 烟测
5. 写 `db/schema.ts` 的 `images` 表 + relations
6. 生成 + 手改 `db/migrations/0002_images.sql`（`CREATE TABLE IF NOT EXISTS`）
7. `npm run db:push` 验证
8. 写 `api/lib/images.ts`：校验三件套（size / magic-byte / 像素积）+ atomic write + 幂等
   - 单测：空 / 超大 / 文本伪装 / SVG 拒 / GIF 拒 / 解压炸弹 / 小图原宽 / EXIF 旋转 / 幂等 / rename 失败清理
9. 写 `api/lib/imageRefs.ts`：scanRefs / loadImageMap / assertNoRefs（含 cover_image）
   - 单测：正则边界 / 跨 post / cover 引用 / 无引用通过
10. 写 `api/middleware/imageGuard.ts`：Sec-Fetch-Site + Referer + rate limit
    - 单测：SFS `none` / `same-origin` / `cross-site` / 缺失退 Referer / 精确 host / 第三方 / 突发 201 req / TRUSTED_PROXY 切换
11. 写 `api/lib/imageDelete.ts` + tRPC `upload.delete`
    - 单测：admin auth / 引用挡死 / DB delete 先于 unlink / unlink 失败留孤儿不影响 DB
12. `api/routers/upload.ts` 三个端点 + 挂 `api/router.ts`
13. `api/routers/post.ts`：`bySlug` 注入 images map（include cover_image hash）
14. `api/boot.ts`：bootCleanup（tmp 清扫）+ resolve 绝对路径 + 挂 imageGuard + serveStatic；body limit 15MB
15. 写 `src/lib/imageUrl.ts`（修 `fallbackJpeg`）+ `src/components/BlogImage.tsx` + `BrokenImage`
16. 改 `src/components/ArticleMarkdown.tsx`：追加 `img` renderer，**保留** 首段 drop cap
17. 写 `src/components/admin/ImageUploadPanel.tsx`，挂 `/admin` Images tab
18. `.gitignore` 加 `uploads/`
19. `CLAUDE.md` 更新：Images 章节、env 表、esbuild external、markdown 语法、安全降级表述

## 测试矩阵（增量）

新增/修改 v2 之外的 case：

### `api/middleware/imageGuard.test.ts`

| 场景 | 期望 |
|------|-----|
| `Sec-Fetch-Site: cross-site` | 403（即使 Referer 同源也拒）|
| `Sec-Fetch-Site: same-origin` | 通过 |
| `Sec-Fetch-Site: none` | 通过（地址栏直接访问） |
| `Sec-Fetch-Site` 缺失 + Referer 同源 | 通过（fallback） |
| `Sec-Fetch-Site` 缺失 + Referer 第三方 | 403 |

### `api/lib/imageDelete.test.ts`

| 场景 | 期望 |
|------|-----|
| 删图后立即查 DB | 行已消失 |
| 删图过程中 unlink 失败 | DB 已 delete，文件残留（孤儿） |
| 删图前 assertNoRefs 命中 cover_image | throw BAD_REQUEST 含 slug |

### `api/boot.test.ts`

| 场景 | 期望 |
|------|-----|
| 启动前 `UPLOAD_DIR/abc-960.webp.tmp` 存在 | 启动后被删 |
| 启动前 `UPLOAD_DIR/abc-960.webp` 存在 | 启动后保留 |

### `vite-dev-routing.manual.md`（手动验收）

- [ ] dev 模式：`curl http://localhost:3000/uploads/img/test.jpg -H "Sec-Fetch-Site: cross-site"` → 403
- [ ] dev 模式：`curl http://localhost:3000/uploads/img/test.jpg` → 200（缺 SFS + 缺 Referer → 经 SFS=undefined → fallback；空 Referer 放行）
- [ ] prod build：同上 2 条
- [ ] 不传 `Sec-Fetch-Site` 但 Referer 是 `https://blog.example.com/x` + 白名单含 `blog.example.com` → 200

## 验收清单（部署前）

- [ ] dev `npm run dev`：`/uploads/img/*` 经过 `imageGuard`（log 验证）
- [ ] prod `npm run build && npm start`：同上
- [ ] Admin 上传 5MB JPEG → 拿到 `![](hash:...)` 复制串，3s 内完成
- [ ] 文章页 `<picture>` 加载 `.avif`（Chrome devtools Network）
- [ ] 第三方域 `<img>` 引用 → SFS `cross-site` → 403
- [ ] 浏览器直接打开图片 URL → SFS `none` → 200
- [ ] curl 不带 SFS/Referer → fallback 路径 → 200（公开图属性）
- [ ] curl 不带 SFS + 第三方 Referer → 403
- [ ] 同 IP 201 req → 第 201 起 429
- [ ] 删除已引用图（cover_image 或 markdown）→ BAD_REQUEST 含 slug
- [ ] 删除无引用图 → DB 行消失，文件 unlink
- [ ] unlink 中途 kill → 重启后看到 `.tmp` 已清，正式文件保留
- [ ] 上传 SVG/GIF/TIFF/文本伪装 → admin UI 显示拒绝原因
- [ ] 上传 50000×50000 PNG → 拒绝（`limitInputPixels`）
- [ ] prod 不设 `IMG_ALLOWED_HOSTS` + 带第三方 Referer + 无 SFS → 403

## 不属于 v1（v3 候选）

- 多服务器 / 对象存储抽象层
- HMAC 签名 URL
- 孤儿文件 cron 清扫（删除 best-effort 漏掉的）
- `post.list` / `post.search` 批量返 image map（如果未来列表页要内嵌图）
- works 嵌图支持
- editor markdown 预览解析 hash ref
- Cloudflare/CDN 套前面

---

**v3 总结**：v2 的核心架构正确，v3 只做精确补丁：

- 3 个 High 修复：Vite dev 路由（dev/prod 分裂）、`Sec-Fetch-Site`（防 referer 绕过）、import 命名（编译失败）
- 4 个 Partial → Resolved：tmp 清理、删除一致性、GIF 拒绝、cover_image 扫描
- 任务排序进一步前置 spike（含 dev 路由 + tRPC shape 迁移），让最大风险在 Phase 0 暴露
- 安全表述诚实降级——这是公开博客的 immutable assets，guard 是 casual abuse 防护
