# Lee's Blog

[English](./README.md) · 简体中文

Evo Lee 的个人博客 —— 文章、作品集、管理后台。单个 Node 进程同时托管 React SPA 和 tRPC API，数据库用 SQLite。

- **前端：** React 19、Vite 7、react-router v7、Tailwind v3 + shadcn/ui、GSAP、Lenis
- **后端：** Hono + tRPC v11（superjson）、Drizzle ORM + better-sqlite3、DB session（无 JWT、无共享密钥）
- **构建：** 客户端用 Vite，API 用 esbuild 打包成 `dist/boot.js`
- **CLI：** `scripts/publish.ts`，通过 `X-API-Key` 投递 Markdown 文章

---

## 快速开始

```bash
# 1. Node.js 20.x 或更高（项目是 ESM-only）。
node -v

# 2. 安装依赖。锁文件是 npm 的，不要换成 pnpm/yarn。
npm install

# 3. 初始化 SQLite 表结构（默认在 ./blog.db）。
npm run db:push

# 4. 启动开发服务器 —— Vite + Hono 跑在 http://localhost:3000，
#    SPA 和 api/ 同时支持热更新。
npm run dev
```

首个管理员：浏览器访问 `http://localhost:3000`（任意路径都行）。应用检测到没有
管理员，会强制弹出一次性 setup 页面 —— 填用户名、密码、提交，立即跳转首页。
之后通过 `/admin/login` 即可回到后台。

---

## 环境变量

所有变量都是**可选**的。默认 SQLite 路径在本地开发和大多数部署环境下都能用。会话存在数据库里（DB-backed），没有 JWT 密钥需要管理。

| 变量             | 必填 | 说明                                                            |
| -------------- | -- | ------------------------------------------------------------- |
| `DATABASE_URL` | 否  | 覆盖 SQLite 路径。默认 `./blog.db`。持久化卷场景可用 `/data/blog.db` 之类。      |
| `PORT`         | 否  | 生产监听端口。默认 `3000`。                                             |

---

## 命令

```bash
npm run dev          # Vite + Hono 开发服务器（端口 3000，客户端与 api/ 双向 HMR）
npm run build        # vite build → dist/public + esbuild api/boot.ts → dist/boot.js
npm start            # NODE_ENV=production node dist/boot.js
npm test             # vitest run
npm run check        # tsc -b — 全量 TS 工程类型检查
npm run lint         # eslint .
npm run format       # prettier --write .
npm run db:generate  # drizzle-kit generate（schema → 迁移 SQL）
npm run db:migrate   # drizzle-kit migrate（应用迁移）
npm run db:push      # drizzle-kit push（直接同步 schema，仅开发）
```

---

## 架构

开发模式下，单个 Vite 进程通过 `@hono/vite-dev-server`（`entry: "api/boot.ts"`）同时托管 SPA 和 Hono API。生产模式下 `npm start` 运行打包后的 `dist/boot.js`，从 `dist/public` 提供 SPA，并把 API 挂在 `/api/*`。

### 目录布局

| 路径           | 用途                                                                                                                                                                                                                      |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/`       | React SPA。`App.tsx` 是路由表，页面在 `pages/`，区块在 `sections/`，shadcn 组件在 `components/ui/`，Provider 在 `providers/`，Hook 在 `hooks/`，i18n 在 `i18n/`。                                                                               |
| `api/`       | Hono 服务端。`boot.ts` 挂载 `/api/trpc/*` 与 `/api/publish`；`router.ts` 组合 `post`、`work`、`auth` 子路由；`middleware.ts` 定义 `publicQuery` / `authedQuery` / `adminQuery`；`sessions.ts` 负责签发／验证／撤销 DB session 与 2FA 登录挑战；`context.ts` 从 session cookie 或 `x-api-key` 解析用户。 |
| `contracts/` | 客户端与服务端共享的类型与错误码。通过 `@contracts/*` 导入。                                                                                                                                                                                  |
| `db/`        | Drizzle schema（`schema.ts`）、`relations.ts`、`seed.ts`、生成的 `migrations/`。通过 `@db/*` 或 `db/*` 导入。                                                                                                                          |
| `scripts/`   | `publish.ts` —— 用 `X-API-Key` 发布 Markdown 文章的 Node CLI。                                                                                                                                                                 |
| `public/`    | 静态资源，根路径直接对外。                                                                                                                                                                                                           |
| `dist/`      | 构建产物。`dist/public/` 是客户端，`dist/boot.js` 是打包后的服务端。                                                                                                                                                                       |

### 路径别名

`vite.config.ts` 与 `tsconfig.json` 一致：

- `@/*` → `src/*`
- `@contracts/*` → `contracts/*`
- `@db/*` 与 `db/*` → `db/*`

### 数据

SQLite，驱动是 `better-sqlite3`。表：`users`、`sessions`、`login_challenges`、`posts`、`works`、`work_details`、`work_tags`。`posts.content` 与 `work_details.content` 以「段落字符串数组」形式 JSON 序列化后存入。API 请求体上限 50 MB（见 `api/boot.ts`）。

### 鉴权

DB session，无 JWT。Cookie 持有 32 字节随机 token，DB 里只存 token 的 SHA-256 哈希（`sessions` 表，7 天 TTL）。登出会真正 `DELETE` 该行，撤销立即生效。2FA 流程用独立的 `login_challenges` 表（5 分钟 TTL，单次消费）衔接 step 1 → step 2。CLI 走另一条路：`x-api-key` 请求头匹配 `users.api_key`。目前没有单独的管理员角色 —— 任何注册用户都被视为管理员（见 `CLAUDE.md` 中的 TODO）。

### 首次启动流程

`App.tsx` 在所有路由外面套了一层 `SetupGuard`。只要还没创建管理员，**任意 URL** 都会被替换成一次性 setup 页面。创建完毕后 guard 自动放行并跳转 `/`。没有公开的 `/admin/setup` URL。

---

## 测试

`vitest` 已通过 `npm test` 与 `vitest.config.ts` 接好了，但目前仓库里**还没有任何 ************`*.test.ts`************ 文件**。新增的测试放到 `src/`、`api/` 或顶层 `__tests__/` 都会被 vitest 自动发现。

跑单个文件：

```bash
npx vitest run path/to/file.test.ts
```

在测试补齐之前，把 `npm run check`（TypeScript）和 `npm run lint`（ESLint）当作主要的正确性闸门，再配合开发服务器做端到端验证。

### 手工冒烟测试

```bash
npm run dev
# 另开一个终端：
curl -s http://localhost:3000/api/trpc/post.list?batch=1\&input=%7B%220%22%3A%7B%22json%22%3A%7B%22page%22%3A1%2C%22perPage%22%3A10%7D%7D%7D
```

值得过一遍的页面：`/`、`/articles`、`/article/:slug`、`/works`、`/works/:slug`、`/about`、`/admin`、`/admin/login`、`/admin/new`。（Setup 页面是没有管理员时的全局浮层，没有独立 URL。）

---

## 通过 CLI 发布文章

`scripts/publish.ts` 接收带 frontmatter 的 Markdown，用 API key POST 到 `/api/publish`。

1. 在 `/admin` → **API Key** → **Generate Key** 生成 API key（**只展示一次**，记得保存）。

2. 在 shell 里设置 `LEEBLOG_API_KEY`，或者写到 `~/.leeblog.json`：

   ```json
   { "server": "https://your-blog.example", "apiKey": "lb_..." }
   ```

3. 发布：

   ```bash
   npx tsx scripts/publish.ts ./article.md
   # 或显式覆盖：
   npx tsx scripts/publish.ts ./article.md --server=https://your-blog.example --api-key=lb_...
   ```

正文需要用空行分段 —— 服务端按空行切分后存为 JSON 数组。slug 重复会返回 HTTP 409。

---

## 生产部署

### 直接 Node

```bash
npm run build
npm run db:push          # 仅首次或 schema 变更时
npm start                # → http://localhost:3000
```

部署上线后第一次访问会强制弹 setup 浮层 —— 立即创建管理员账号，避免给陌生人留窗口。

### Docker

```bash
docker build -t lee-blog .
docker run --rm -p 3000:3000 \
  -v $(pwd)/blog.db:/app/blog.db \
  lee-blog
```

要改 DB 路径，挂卷到别的位置并加 `-e DATABASE_URL=/data/blog.db`（同时挂对应 volume）。

`Dockerfile` 用了国内 npm 镜像（`npm.mirrors.msh.team`）—— 不在该网络环境下构建的话，请改掉或删掉那一行。

### Cloudflare Pages / Render / fly.io

只要平台支持持久化卷即可：把 `DATABASE_URL` 指向挂载路径（如 `/data/blog.db`）。第一次构建完成后立刻打开域名抢占管理员账号，别给别人机会。

---

## 约定

- tRPC 过程统一用 `superjson` transformer，`Date`、`BigInt`、`Map` 可透传序列化。
- 客户端缓存用 React Query（`@tanstack/react-query` + `@trpc/react-query`），Provider 在 `src/providers/trpc.tsx`。
- Tailwind v3 + shadcn 主题。合并 className 用 `src/lib/utils.ts` 里的 `cn()`。
- `/api/publish` 会校验 `content` 是字符串段落数组，重复 slug 返回 409。

## 已知坑位

- Setup 浮层是**先到先得**的设计（不走终端 token，是为了适配 Cloudflare 之类的部署）。部署完立即打开域名抢占管理员账号。
- Schema 改了之后，要对线上 SQLite 跑一次 `npm run db:push`。
- `Dockerfile` 默认走国内 npm 镜像 —— 不在该网络环境下构建请改掉。

---

## 许可

个人项目，未授予任何许可。未经许可请勿再分发。
