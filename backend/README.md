# blog-api

Tiny backend for the 2025-blog static frontend. Stdlib only, no dependencies.

Posts live as files in the blogs dir (the same dir Nginx serves as `/blogs`):

```
blogs/index.json                  article index, newest first
blogs/categories.json             {"categories": [...]}
blogs/{slug}/config.json          {title, tags, date, summary, cover, hidden, category}
blogs/{slug}/index.md             article body (title lives in config)
blogs/{slug}/{sha256}.{ext}       images, content-addressed
```

Site-content lists (about / bloggers / pictures / projects / share /
snippets / site-content / card-styles) live as plain JSON under the web
root's `data/` dir, served statically by Nginx as `/data/<name>.json`:

```
data/about.json        data/bloggers.json     data/pictures.json
data/projects.json     data/share.json        data/snippets.json
data/site-content.json data/card-styles.json
```

## Auth

One fixed admin account, `JunCraft666`. Its salted password hash (SHA-256
of salt || password) and a random token live in the account file
(`admin.json`, 0600, never under the web root), provisioned at deploy
time. There is no registration endpoint. Login checks username + password
and returns the token; write calls send it as `Authorization: Bearer
<token>`. No plaintext password is stored on the server.

## Build

```bash
go build -o blog-api .                              # amd64 (local test)
GOOS=linux GOARCH=arm64 go build -o blog-api-arm64 .  # the 256MB server
```

## Run

```bash
./blog-api -data /path/to/blogs -site-dir /path/to/blog -account-file /opt/blog-api/admin.json -addr 127.0.0.1:8081
```

Flags: `-data` (default `blogs`), `-site-dir` (default: parent of `-data`),
`-account-file` (default `admin.json`), `-addr` (default
`127.0.0.1:8081`). Only binds 127.0.0.1 — put Nginx in front.

Memory: ~9 MB RSS. Binary: ~8 MB (arm64, statically linked).

## Endpoints (all under /api, proxied by Nginx)

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | /api/health | – | `{"ok":true}` |
| POST | /api/login | – | body `{username, password}` → `{ok, token}` or 401 |
| GET | /api/blogs | – | index array |
| POST | /api/blogs | Bearer | create/edit one post (multipart) |
| GET | /api/blogs/{slug} | – | `{slug, config, markdown}` |
| DELETE | /api/blogs/{slug} | Bearer | delete one post + index entry |
| POST | /api/blogs/batch-delete | Bearer | body `{slugs:[]}` |
| PUT | /api/blogs/index | Bearer | replace whole index + categories (removes dropped slugs) |
| PUT | /api/data/{name} | Bearer | replace one site-content JSON doc (name allow-listed) |
| POST | /api/upload | Bearer | one image (multipart `file` + `dir` for a hashed name, or `path` for an exact overwrite) → `{ok, path}` |
| POST | /api/files/delete | Bearer | body `{paths:[]}` — delete files under /images/ |

Publish multipart fields: `slug`, `title`, `md`, `tags` (JSON array),
`date`, `summary`, `hidden`, `category`, `cover` (JSON `{type:'url',url}` or
`{type:'file',id}`), `mode` (`create`|`edit`), `originalSlug`.
New images arrive as files named `file:<id>`; the server hashes them,
stores them under `blogs/{slug}/{sha256}.{ext}` and rewrites
`(local-image:<id>)` placeholders in the markdown to the public path.
