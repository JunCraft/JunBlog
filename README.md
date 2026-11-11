# JunBlog

殷俊的个人博客。基于 [YYsuni/2025-blog-public](https://github.com/YYsuni/2025-blog-public)（MIT 协议）改造：

- 前端：Next.js 静态站（`output: 'export'`），Nginx 托管，运行内存接近 0
- 后端：自研 Go 后端（`backend/`，标准库，无第三方依赖，内存约 9MB），文章和站点数据全部存在自己的服务器上
- 发文：打开博客直接写、直接发，不用经过 GitHub；新文章立刻可见，不用重新构建

## 目录结构

- `src/`、`public/`、`next.config.ts` 等：前端（Next.js 16）
- `backend/`：Go 后端（`main.go`、`go.mod`，说明见 `backend/README.md`）
- `data/`：站点数据种子（bloggers、projects、about 等 8 个 JSON），首次部署时复制到网站根目录
- `public/blogs/`：文章（`{slug}/config.json + index.md`），图片按 SHA-256 命名去重

## 本地运行

前端：

```bash
pnpm install
pnpm build   # 生成 out/
```

后端：

```bash
cd backend
go build -o blog-api
./blog-api -data ../public/blogs -site-dir .. -account-file admin.json -addr 127.0.0.1:8081
```

`admin.json` 是管理员账号文件（用户名 + 加盐密码哈希），不要提交到仓库，部署时在服务器上生成。

## 部署到服务器

Nginx（80 端口）托管静态站并反代 `/api/` 到后端；后端用 systemd 常驻。详细步骤见部署文档（不放在仓库里，含管理员密码）。

## 说明

- 原项目作者的 75 篇示例文章已清空；当前只有一篇迁移文章。
- `public/images/` 下的图片（png/jpg/webp）和文章封面图因格式原因未包含在本次提交中，后续补充。
- License：MIT（沿用原项目）
