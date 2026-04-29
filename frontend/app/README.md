# CAPE SPA

CAPEv2 web 前端独立工程。基于 [`docs/prd/web-spa-refactor.md`](../../docs/prd/web-spa-refactor.md) §8
阶段 1 W1 落地的脚手架。

## 技术栈

| 层 | 选型 |
|---|---|
| 框架 | React 18 + TypeScript（严格模式） |
| 构建 | Vite 6 + `@vitejs/plugin-react` |
| 样式 | Tailwind v4（`@tailwindcss/vite` + `@theme`）+ shadcn/ui 渐进引入 |
| 路由 | React Router 7（`createBrowserRouter`） |
| 数据 | TanStack Query v5（服务端） + Zustand（本地 UI） |
| 表单 | react-hook-form + zod |
| HTTP | axios + CSRF interceptor |
| 表格 | TanStack Table v8 |
| 可视化 | React Flow + Recharts + D3 兜底 |
| 测试 | Vitest（单元） + Playwright（E2E） |

完整决策依据见 PRD 附录 A Decision Log。

## 目录

```
src/
├── main.tsx                     # 入口：React + QueryClient + Router
├── router.tsx                   # createBrowserRouter，懒加载所有路由
├── components/
│   ├── shell/                   # Topbar / Sidebar / Statusbar / Shell
│   └── shared/                  # PageHead / StubPage 等通用组件
├── lib/
│   ├── api/                     # axios client + CSRF + auth
│   ├── query-client.ts          # TanStack Query 默认配置
│   ├── query-keys.ts            # 全局 query key 注册表
│   └── utils.ts                 # cn() 等工具
├── routes/                      # 12 个 P0 页面（当前为 stub）
├── styles/
│   ├── index.css                # Tailwind + base
│   └── theme.css                # @theme tokens（迁自 web-design/styles.css）
└── types/api.ts                 # 与 v3 端点对齐的 TS 类型
```

## 开发

```bash
# 安装依赖
npm install

# 启动 dev server（5173 端口；自动代理 /api、/accounts、/admin、/static 到 8000）
npm run dev

# 类型检查
npm run typecheck

# 单元测试
npm run test

# 生产构建
npm run build

# 容器构建（cape-spa 镜像）
docker build -t cape-spa:dev .
docker run --rm -p 8080:80 cape-spa:dev
```

## 与 cape-web 联调

dev 模式下 Vite 会把 `/api`、`/accounts`、`/admin`、`/static` 代理到本地
`127.0.0.1:8000`（`vite.config.ts` 的 `server.proxy`）。要端到端跑通，需要：

1. 在 host 上跑 `cape-web`：`cd web && poetry run python manage.py runserver 8000`
2. 在 `conf/api.conf` 设 `[api] token_auth_enabled = yes`（PRD D-11）
3. 在 `conf/web.conf` 设 `[web_auth] enabled = yes`（PRD §4.4 鉴权流前提）
4. `python manage.py createsuperuser` 创建一个用户
5. 浏览器访问 `http://localhost:5173/` → 自动跳 `/accounts/login/` → 登录后回 SPA

## 当前状态（脚手架阶段）

- ✅ 项目初始化（package.json / tsconfig / vite / Tailwind v4）
- ✅ Shell 布局（Topbar + Sidebar + Statusbar），导航匹配设计稿
- ✅ 12 个 P0 路由 stub（懒加载）
- ✅ TanStack Query 客户端 + query keys 注册表
- ✅ axios + CSRF interceptor 雏形
- ✅ 设计 tokens 迁移（severity / bg / fg / accent）
- ✅ Dockerfile + nginx.conf（cape-spa 镜像）
- ⬜ ESLint flat config（配置文件被 config-protection hook 拦截，临时禁用 hook 后由用户添加）
- ⬜ shadcn/ui 组件初始化（待引入第一个组件，如 Button） 
- ⬜ 各 stub 页的真实实现（每页一个里程碑，详见 PRD §8）
- ⬜ Backend：`/api/v3/auth/csrf/` 与 `/api/v3/me/` 端点（下一阶段）
