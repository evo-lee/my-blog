# Lee's Blog

[English](./README.md) · 简体中文

Evo Lee 的个人博客 —— 文章、作品集、管理后台。单个 Node 进程同时托管 React SPA 和 tRPC API，数据库用 SQLite。

- **前端：** React 19、Vite 7、react-router v7、Tailwind v3 + shadcn/ui、GSAP、Lenis
- **后端：** Hono + tRPC v11（superjson）、Drizzle ORM + better-sqlite3、JWT（jose）
- **构建：** 客户端用 Vite，API 用 esbuild 打包成 `dist/boot.js`
- **CLI：** `scripts/publish.ts`，通过 `X-API-Key` 投递 Markdown 文章

---

## 快速开始

```bash
# 1. Node.js 20.x 或更高（项目是 ESM-only）。
node -v

# 2. 安装依赖。锁文件是 npm 的，不要换成 pnpm/yarn。
npm install

# 3. 环境变量。开发模式下有兜底默认值，生产必须显式配置。
cp .env.example .env

# 4. 初始化 SQLite 表结构（默认在 ./blog.db）。
npm run db:push

# 5. 启动开发服务器 —— Vite + Hono 跑在 http://localhost:3000，
#    SPA 和 api/ 同时支持热更新。
npm run dev
```

首个管理员：服务器起来后访问 `/admin/setup` 创建初始用户。之后 `/admin/login` 与 `/admin` 仪表盘即可使用。

---

## 环境变量

`api/lib/env.ts` 负责校验环境变量。缺失值在开发模式下走兜底，`NODE_ENV=production` 下会抛错。

| 变量             | 生产必填 | 说明                                                |
| -------------- | ---- | ------------------------------------------------- |
| `APP_ID`       | 是    | 应用 ID，会写入 JWT 的 issuer 字段。                        |
| `APP_SECRET`   | 是    | HS256 JWT 签名密钥。开发有兜底，**生产必须**设置真实值。               |
| `DATABASE_URL` | 是    | SQLite 连接路径，例如 `sqlite:./blog.db`。默认 `./blog.db`。 |

注意：`.env.example` 里 `DATABASE_URL` 给的是 MySQL 示例，但实际运行用的是 `better-sqlite3`，应填 SQLite 路径（如 `sqlite:./blog.db`）。

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
| `api/`       | Hono 服务端。`boot.ts` 挂载 `/api/trpc/*` 与 `/api/publish`；`router.ts` 组合 `post`、`work`、`auth` 子路由；`middleware.ts` 定义 `publicQuery` / `authedQuery` / `adminQuery` 与 JWT 工具；`context.ts` 从 session cookie 或 `x-api-key` 解析用户。 |
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

SQLite，驱动是 `better-sqlite3`。表：`users`、`posts`、`works`、`work_details`、`work_tags`。`posts.content` 与 `work_details.content` 以「段落字符串数组」形式 JSON 序列化后存入。API 请求体上限 50 MB（见 `api/boot.ts`）。

### 鉴权

JWT（HS256），用 `APP_SECRET` 签名，7 天过期。会话写在 `session=<jwt>` cookie 里；CLI 走另一条路：`x-api-key` 请求头匹配 `users.api_key`。目前没有单独的管理员角色 —— 任何注册用户都被视为管理员（见 `CLAUDE.md` 中的 TODO）。

---

## 测试

`vitest` 已通过 `npm test` 与 `vitest.config.ts` 接好了，但目前仓库里**还没有任何 ****`*.test.ts`**** 文件**。新增的测试放到 `src/`、`api/` 或顶层 `__tests__/` 都会被 vitest 自动发现。

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

值得过一遍的页面：`/`、`/articles`、`/article/:slug`、`/works`、`/works/:slug`、`/about`、`/admin`、`/admin/setup`、`/admin/login`、`/admin/new`。

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
APP_ID=... APP_SECRET=... DATABASE_URL=sqlite:./blog.db npm start
# → http://localhost:3000
```

### Docker

```bash
docker build -t lee-blog .
docker run --rm -p 3000:3000 \
  -e APP_ID=... -e APP_SECRET=... -e DATABASE_URL=sqlite:/app/blog.db \
  -v $(pwd)/blog.db:/app/blog.db \
  lee-blog
```

`Dockerfile` 用了国内 npm 镜像（`npm.mirrors.msh.team`）—— 不在该网络环境下构建的话，请改掉或删掉那一行。

---

## 约定

- tRPC 过程统一用 `superjson` transformer，`Date`、`BigInt`、`Map` 可透传序列化。
- 客户端缓存用 React Query（`@tanstack/react-query` + `@trpc/react-query`），Provider 在 `src/providers/trpc.tsx`。
- Tailwind v3 + shadcn 主题。合并 className 用 `src/lib/utils.ts` 里的 `cn()`。
- `/api/publish` 会校验 `content` 是字符串段落数组，重复 slug 返回 409。

## 已知坑位

- `tsconfig.json.bak`、`vite.config.ts.bak`、`src/App.tsx.bak`、`src/main.tsx.bak` 是本地备份 —— 没有特别要求时忽略它们。
- `error.log` 是运行时日志文件，不属于源码。
- `api/middleware.ts` 与 `api/context.ts` 内置了开发用的 `APP_SECRET` 兜底（`lee-blog-jwt-secret-change-me`）。生产必须配置真实密钥。移除该兜底已与权限收紧 TODO 一并跟踪（见 `CLAUDE.md`）。

---

## 许可

个人项目，未授予任何许可。未经许可请勿再分发。
