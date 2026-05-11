# Lee's Blog

[English](./README.md) · 简体中文

Evo Lee 的个人博客 —— 文章、作品集、管理后台。单个 Node 进程同时托管 React SPA 和 tRPC API，数据库用 SQLite。

- **前端：** React 19、Vite 7、react-router v7、Tailwind v3 + shadcn/ui、GSAP、Lenis
- **后端：** Hono + tRPC v11（superjson）、Drizzle ORM + better-sqlite3、DB session（无 JWT、无共享密钥）
- **构建：** 客户端用 Vite，API 用 esbuild 打包成 `dist/boot.js`
- **CLI：** `scripts/publish.ts`，通过 `X-API-Key` 投递 Markdown 文章（服务端只保存哈希）

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

| 变量             | 必填 | 说明                                                       |
| -------------- | -- | -------------------------------------------------------- |
| `DATABASE_URL` | 否  | 覆盖 SQLite 路径。默认 `./blog.db`。持久化卷场景可用 `/data/blog.db` 之类。 |
| `PORT`         | 否  | 生产监听端口。默认 `3000`。                                        |

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

| 路径         | 用途                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/`     | React SPA。`App.tsx` 是路由表，页面在 `pages/`，区块在 `sections/`，shadcn 组件在 `components/ui/`，Provider 在 `providers/`，Hook 在 `hooks/`，i18n 在 `i18n/`。                                                                                                                                                                                                                                                                                               |
| `api/`     | Hono 服务端。`boot.ts` 挂载 `/api/trpc/*` 与 `/api/publish`，启动时清理旧版明文 API key，并启动时 + 每小时跑一次 `cleanupExpired()`；`router.ts` 组合 `post`、`work`、`auth`、`settings`、`comment` 子路由；`middleware.ts` 定义 `publicQuery` / `authedQuery` / `adminQuery`；`sessions.ts` 负责签发／验证／撤销 DB session 与 2FA 登录挑战；`cookies.ts` 是共享的 session cookie 工具（HttpOnly、SameSite=Lax、生产环境自动加 Secure）；`context.ts` 从 session cookie 或哈希后的 `x-api-key` 解析 `user` + `authMethod`。 |
| `db/`      | Drizzle schema（`schema.ts`）、共享站点默认值（`site-defaults.ts`）、`relations.ts`、`seed.ts`、生成的 `migrations/`。通过 `@db/*` 或 `db/*` 导入。                                                                                                                                                                                                                                                                                                              |
| `scripts/` | `publish.ts` —— 用 `X-API-Key` 发布 Markdown 文章的 Node CLI。                                                                                                                                                                                                                                                                                                                                                                                 |
| `public/`  | 静态资源，根路径直接对外。                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `dist/`    | 构建产物。`dist/public/` 是客户端，`dist/boot.js` 是打包后的服务端。                                                                                                                                                                                                                                                                                                                                                                                       |

### 路径别名

`vite.config.ts` 与 `tsconfig.json` 一致：

- `@/*` → `src/*`
- `@db/*` 与 `db/*` → `db/*`

### 数据

SQLite，驱动是 `better-sqlite3`。表：`users`、`sessions`、`login_challenges`、`posts`、`comments`、`site_settings`、`works`、`work_details`、`work_tags`。`users` 同时持有 `totp_secret`（已验证）和 `pending_totp_secret`（`setup2FA` 写入，`verify2FA` 成功后才晋升）。`users.api_key` 只保存明文 API key 的 SHA-256 hex 摘要。`posts.content` 与 `work_details.content` 以「段落字符串数组」形式 JSON 序列化后存入 —— `api/routers/post.ts` 里的 `parseContent` 在行损坏时返回 `[]`，避免单条坏数据搞挂整个请求。API 请求体上限 50 MB（见 `api/boot.ts`）。

`site_settings` 是单行表（`id=1`），默认值来自 `db/site-defaults.ts`。它驱动页头 / 页脚站点标题、双语 Hero 文案、ICP备案号、公安备案号、双语版权文字。`comments` 存文章评论；公开提交默认待审核，管理员通过后才展示。

新部署会保留生成的默认文章：服务启动时，`api/boot.ts` 只在 `posts` 表为空时写入 `db/seed.ts` 里的 `seedData.posts`。只要库里已有任意文章，启动时就会跳过默认内容，后续真实写作可以慢慢替代。

### 鉴权

DB session，无 JWT。Cookie 持有 32 字节随机 token，DB 里只存 token 的 SHA-256 哈希（`sessions` 表，7 天 TTL，`HttpOnly`、`SameSite=Lax`，生产环境自动加 `Secure`）。登出会真正 `DELETE` 该行，撤销立即生效。2FA 登录流程用独立的 `login_challenges` 表（5 分钟 TTL，单次消费）衔接 step 1 → step 2。CLI 用 `x-api-key` 请求头，服务端先哈希明文 key，再匹配 `users.api_key` 里的摘要。生成 API key 时只展示一次明文，数据库只保存 SHA-256。启动时会把不是 64 字符摘要的旧版明文 API key 置空，受影响账号需要在 `/admin` 重新生成。

`authedQuery` 接受 session cookie 或 API key 两种鉴权方式。**`adminQuery`**** 只接受 session cookie，对 API-key 鉴权直接 403**——CLI 发布密钥泄露也无法删除文章、审核评论、修改站点设置、轮换密钥或修改 2FA。鉴权方式通过 `ctx.authMethod`（`"session"` 或 `"apikey"`）暴露。

2FA 启用走 pending → active：`setup2FA` 把秘钥写入 `users.pending_totp_secret`；`verify2FA` 验证 authenticator 里的 6 位验证码后才晋升到 `users.totp_secret`；`cancel2FASetup` 清空 pending。中途关掉 QR 页不会再把账号锁死。已启用的 2FA 可通过 `disable2FA` 移除，然后重新设置。

目前没有单独的管理员角色 —— 任何注册用户都被视为管理员（单管理员博客够用，多用户场景见 `CLAUDE.md` 里的 TODO）。

### 后台

`/admin` 拆成几个面板：

- `SecurityPanel` 管 2FA 与 API key 生成 / 撤销。
- `PostsPanel` 列文章，并用共享确认按钮删除。
- `CommentsPanel` 审核待处理 / 已通过评论，可通过、取消通过或删除。
- `SiteSettingsPanel` 编辑单行 `site_settings`，查询刷新不会覆盖本地未保存输入。

### 文章渲染

文章正文通过 `src/components/ArticleMarkdown.tsx` 渲染，使用 `react-markdown` + `remark-gfm`。首段仍保留 drop cap，后续段落按普通 Markdown 渲染。`src/components/Comments.tsx` 挂在文章下方，提交评论时带隐藏 honeypot 字段，评论默认进入待审核状态。

### 首次启动流程

`App.tsx` 在所有路由外面套了一层 `SetupGuard`。只要还没创建管理员，**任意 URL** 都会被替换成一次性 setup 页面。创建完毕后 guard 自动放行并跳转 `/`。没有公开的 `/admin/setup` URL。

---

## 测试

`vitest` 已通过 `npm test` 与 `vitest.config.ts` 接好。当前测试发现范围包含 `api/**/*.test.ts` 与 `api/**/*.spec.ts`，`api/auth-2fa.test.ts` 覆盖 2FA 设置/登录以及 CLI 发布冒烟路径。

跑单个文件：

```bash
npx vitest run api/path/to/file.test.ts
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

正文需要用空行分段 —— 服务端按空行切分后存为 JSON 数组。这些段落字符串可以包含 Markdown/GFM 语法，文章页会按 Markdown 渲染。slug 重复会返回 HTTP 409。

---

## 生产部署

### 直接 Node

```bash
npm run build
npm run db:push          # 仅首次或 schema 变更时
npm start                # → http://localhost:3000
```

生产 bundle 是 ESM，但 `better-sqlite3` 运行时要加载原生 `.node` 绑定。esbuild 命令里必须保留 `--external:better-sqlite3`，并通过 banner 注入 `require`、`__filename`、`__dirname`。否则生产日志可能出现 `__filename is not defined` 或 `Could not locate the bindings file`，即使 HTTP 服务表面上已经启动。

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
- 搜索输入会 trim、限制长度，并在查询已发布文章前转义 SQLite LIKE 通配符。

## 已知坑位

- Setup 浮层是**先到先得**的设计（不走终端 token，是为了适配 Cloudflare 之类的部署）。部署完立即打开域名抢占管理员账号。
- Schema 改了之后，要对线上 SQLite 跑一次 `npm run db:push`。
- 空数据库启动时会自动写入生成的默认文章；只要已有任意文章，就不会重复写入。
- 哈希 API key 改动前生成的旧 key 会在服务启动时失效，需要到 `/admin` 重新生成。
- 不要把 `better-sqlite3` 打进 `dist/boot.js`；它必须从 `node_modules` 加载，原生绑定路径才正确。
- `Dockerfile` 默认走国内 npm 镜像 —— 不在该网络环境下构建请改掉。

---

## 许可

个人项目，未授予任何许可。未经许可请勿再分发。
