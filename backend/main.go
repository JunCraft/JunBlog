// blog-api: tiny backend for the 2025-blog static frontend.
//
// The frontend is a Next.js static export served by Nginx. Posts are plain
// files under the blogs dir (the same layout the frontend already uses):
//
//	blogs/index.json                     article index (newest first)
//	blogs/categories.json                {"categories": [...]}
//
// /	blogs/{slug}/config.json             {title, tags, date, summary, cover, hidden, category}
//
//	blogs/{slug}/index.md                article body (title lives in config)
//	blogs/{slug}/{sha256}.{ext}          images, content-addressed
//
// The backend only runs on 127.0.0.1; Nginx proxies /api/ to it and serves
// the static files (including blogs/) directly, so a newly published post
// is readable immediately with no rebuild.
//
// Auth: one fixed admin account, JunCraft666. Its salted password hash
// and a random token live in the account file (default admin.json, 0600,
// never under the web root) that is provisioned at deploy time — there is
// no registration endpoint and no way to create another account through
// the API. Login checks username + password (salted SHA-256) and returns
// the stored token; write calls send it as `Authorization: Bearer
// <token>`. No sessions, no database.
//
// Site content lists (about / bloggers / pictures / projects / share /
// snippets / site-content / card-styles) are plain JSON files under
// <site-dir>/data/<name>.json, served statically by Nginx as
// /data/<name>.json and updated through PUT /api/data/{name}. Images for
// those pages go through POST /api/upload (content-addressed under
// <site-dir>/images/... or written to an exact path such as
// /images/avatar.png).
//
// Stdlib only. Build:
//
//	go build -o blog-api .
//	GOOS=linux GOARCH=arm64 go build -o blog-api-arm64 .
package main

import (
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"log"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync"
	"unicode"
)

type BlogItem struct {
	Slug     string   `json:"slug"`
	Title    string   `json:"title"`
	Tags     []string `json:"tags"`
	Date     string   `json:"date"`
	Summary  string   `json:"summary,omitempty"`
	Cover    string   `json:"cover,omitempty"`
	Hidden   bool     `json:"hidden"`
	Category string   `json:"category"`
}

type BlogConfig struct {
	Title    string   `json:"title"`
	Tags     []string `json:"tags"`
	Date     string   `json:"date"`
	Summary  string   `json:"summary,omitempty"`
	Cover    string   `json:"cover,omitempty"`
	Hidden   bool     `json:"hidden"`
	Category string   `json:"category"`
}

type Server struct {
	dataDir     string
	siteDir     string // web root Nginx serves (data/*.json and images/ live here)
	accountFile string
	acctMu      sync.Mutex // guards account file reads/writes
	mu          sync.Mutex // guards index.json / categories.json / post writes
	likesMu     sync.Mutex // guards likes.json reads/writes
}

// adminAccount is the single fixed admin account, stored as JSON in
// accountFile (provisioned at deploy time, never created via the API).
type adminAccount struct {
	Username     string `json:"username"`
	Salt         string `json:"salt"`
	PasswordHash string `json:"password_hash"`
	Token        string `json:"token"`
}

// dataNames are the only JSON docs the generic content endpoints serve.
// The names match the frontend's runtime fetch of /data/<name>.json.
var dataNames = map[string]bool{
	"about": true, "bloggers": true, "pictures": true, "projects": true,
	"share": true, "snippets": true, "site-content": true, "card-styles": true,
}

// uploadDirs are the only directories hashed image uploads may land in.
var uploadDirs = map[string]bool{
	"images/blogger": true, "images/share": true, "images/project": true,
	"images/pictures": true, "images/art": true, "images/background": true,
	"images/social-buttons": true,
}

// exactUploadPaths are the only fixed paths an upload may overwrite.
var exactUploadPaths = map[string]bool{
	"/favicon.png": true, "/images/avatar.png": true,
}

var imageExts = map[string]bool{
	".png": true, ".jpg": true, ".jpeg": true, ".webp": true,
	".gif": true, ".avif": true, ".svg": true, ".bmp": true, ".ico": true,
}

func main() {
	dataDir := flag.String("data", "blogs", "blogs data directory (same dir Nginx serves as /blogs)")
	addr := flag.String("addr", "127.0.0.1:8081", "listen address")
	accountFile := flag.String("account-file", "admin.json", "file holding the single admin account (salt, password hash, token)")
	siteDir := flag.String("site-dir", "", "web root Nginx serves (data/*.json and images/ live here); defaults to the parent of -data")
	flag.Parse()

	absData, err := filepath.Abs(*dataDir)
	if err != nil {
		log.Fatalf("data dir: %v", err)
	}
	site := *siteDir
	if site == "" {
		site = filepath.Dir(absData)
	}
	absSite, err := filepath.Abs(site)
	if err != nil {
		log.Fatalf("site dir: %v", err)
	}
	if err := os.MkdirAll(absData, 0o755); err != nil {
		log.Fatalf("data dir: %v", err)
	}
	if err := os.MkdirAll(filepath.Join(absSite, "data"), 0o755); err != nil {
		log.Fatalf("site data dir: %v", err)
	}

	s := &Server{dataDir: absData, siteDir: absSite, accountFile: *accountFile}

	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/health", s.handleHealth)
	mux.HandleFunc("POST /api/login", s.handleLogin)
	mux.HandleFunc("GET /api/blogs", s.handleListBlogs)
	mux.HandleFunc("POST /api/blogs", s.handlePublish)
	mux.HandleFunc("GET /api/blogs/{slug}", s.handleGetBlog)
	mux.HandleFunc("DELETE /api/blogs/{slug}", s.handleDeleteBlog)
	mux.HandleFunc("POST /api/blogs/batch-delete", s.handleBatchDelete)
	mux.HandleFunc("PUT /api/blogs/index", s.handlePutIndex)
	mux.HandleFunc("PUT /api/data/{name}", s.handlePutData)
	mux.HandleFunc("POST /api/upload", s.handleUpload)
	mux.HandleFunc("POST /api/files/delete", s.handleDeleteFiles)
	mux.HandleFunc("GET /api/like", s.handleGetLike)
	mux.HandleFunc("POST /api/like", s.handlePostLike)
	mux.HandleFunc("POST /api/change-password", s.handleChangePassword)
	mux.HandleFunc("POST /api/upload-audio", s.handleUploadAudio)

	log.Printf("blog-api listening on %s, data dir %s, site dir %s", *addr, absData, absSite)
	log.Fatal(http.ListenAndServe(*addr, mux))
}

// hashPassword is SHA-256(salt || password); salt is hex.
func hashPassword(saltHex, password string) string {
	salt, _ := hex.DecodeString(saltHex)
	h := sha256.New()
	h.Write(salt)
	h.Write([]byte(password))
	return hex.EncodeToString(h.Sum(nil))
}

// loadAccount reads the account file; nil, nil means no account
// configured (deploy the provisioned admin.json).
func (s *Server) loadAccount() (*adminAccount, error) {
	s.acctMu.Lock()
	defer s.acctMu.Unlock()
	b, err := os.ReadFile(s.accountFile)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, err
	}
	var acct adminAccount
	if err := json.Unmarshal(b, &acct); err != nil {
		return nil, err
	}
	if acct.Username == "" || acct.Token == "" || acct.PasswordHash == "" || acct.Salt == "" {
		return nil, nil
	}
	return &acct, nil
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeErr(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]any{"ok": false, "error": msg})
}

func (s *Server) authed(r *http.Request) bool {
	acct, err := s.loadAccount()
	if err != nil || acct == nil {
		return false
	}
	h := r.Header.Get("Authorization")
	if !strings.HasPrefix(h, "Bearer ") {
		return false
	}
	got := sha256.Sum256([]byte(strings.TrimSpace(h[len("Bearer "):])))
	want := sha256.Sum256([]byte(acct.Token))
	return subtle.ConstantTimeCompare(got[:], want[:]) == 1
}

func (s *Server) requireAuth(w http.ResponseWriter, r *http.Request) bool {
	acct, err := s.loadAccount()
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "读取账号失败")
		return false
	}
	if acct == nil {
		writeErr(w, http.StatusForbidden, "管理员账号未配置")
		return false
	}
	if !s.authed(r) {
		writeErr(w, http.StatusUnauthorized, "未登录")
		return false
	}
	return true
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (s *Server) handleLogin(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if err := readJSONLimit(r, &body, 1<<20); err != nil {
		writeErr(w, http.StatusBadRequest, "请求无效")
		return
	}
	acct, err := s.loadAccount()
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "读取账号失败")
		return
	}
	if acct == nil {
		writeErr(w, http.StatusForbidden, "管理员账号未配置")
		return
	}
	// One generic error for a wrong username and a wrong password alike.
	if body.Username != acct.Username || subtle.ConstantTimeCompare([]byte(hashPassword(acct.Salt, body.Password)), []byte(acct.PasswordHash)) != 1 {
		writeErr(w, http.StatusUnauthorized, "账号或密码错误")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "token": acct.Token})
}

// saveAccount rewrites the account file atomically (0600). Callers load
// the account first (loadAccount releases its lock on return), then save.
func (s *Server) saveAccount(acct *adminAccount) error {
	s.acctMu.Lock()
	defer s.acctMu.Unlock()
	b, err := json.MarshalIndent(acct, "", "  ")
	if err != nil {
		return err
	}
	return writeFileAtomic(s.accountFile, b, 0o600)
}

// handleChangePassword changes the admin password. Authenticated (Bearer
// token) and requires the current password. The new password is stored
// the same way as the provisioned one: a fresh random salt +
// SHA-256(salt || password). The login token is unchanged, so the current
// session stays valid after the change.
func (s *Server) handleChangePassword(w http.ResponseWriter, r *http.Request) {
	if !s.requireAuth(w, r) {
		return
	}
	var body struct {
		OldPassword string `json:"oldPassword"`
		NewPassword string `json:"newPassword"`
	}
	if err := readJSONLimit(r, &body, 1<<20); err != nil {
		writeErr(w, http.StatusBadRequest, "请求无效")
		return
	}
	if strings.TrimSpace(body.OldPassword) == "" || strings.TrimSpace(body.NewPassword) == "" {
		writeErr(w, http.StatusBadRequest, "请输入原密码和新密码")
		return
	}
	if len([]rune(body.NewPassword)) < 6 {
		writeErr(w, http.StatusBadRequest, "新密码至少 6 位")
		return
	}
	if body.NewPassword == body.OldPassword {
		writeErr(w, http.StatusBadRequest, "新密码不能和原密码相同")
		return
	}
	acct, err := s.loadAccount()
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "读取账号失败")
		return
	}
	if acct == nil {
		writeErr(w, http.StatusForbidden, "管理员账号未配置")
		return
	}
	if subtle.ConstantTimeCompare([]byte(hashPassword(acct.Salt, body.OldPassword)), []byte(acct.PasswordHash)) != 1 {
		writeErr(w, http.StatusUnauthorized, "原密码错误")
		return
	}
	// Fresh random salt (32 bytes, hex), same format as the provisioned one.
	saltBytes := make([]byte, 32)
	if _, err := rand.Read(saltBytes); err != nil {
		writeErr(w, http.StatusInternalServerError, "生成盐值失败")
		return
	}
	acct.Salt = hex.EncodeToString(saltBytes)
	acct.PasswordHash = hashPassword(acct.Salt, body.NewPassword)
	if err := s.saveAccount(acct); err != nil {
		writeErr(w, http.StatusInternalServerError, "保存账号失败")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// defaultLikeCount is the starting count for a slug that has never been
// liked. The homepage like button starts at 100 and counts up from there.
const defaultLikeCount = 100

func (s *Server) likesPath() string {
	return filepath.Join(s.siteDir, "data", "likes.json")
}

func (s *Server) readLikes() (map[string]int, error) {
	b, err := os.ReadFile(s.likesPath())
	if err != nil {
		if os.IsNotExist(err) {
			return map[string]int{}, nil
		}
		return nil, err
	}
	var m map[string]int
	if err := json.Unmarshal(b, &m); err != nil {
		return nil, err
	}
	if m == nil {
		m = map[string]int{}
	}
	return m, nil
}

func (s *Server) writeLikes(m map[string]int) error {
	b, err := json.MarshalIndent(m, "", "  ")
	if err != nil {
		return err
	}
	return writeFileAtomic(s.likesPath(), b, 0o644)
}

// handleGetLike returns the like count for a slug. Unknown slugs start
// at defaultLikeCount (100); the count is only stored once someone likes.
func (s *Server) handleGetLike(w http.ResponseWriter, r *http.Request) {
	slug := strings.TrimSpace(r.URL.Query().Get("slug"))
	if slug == "" {
		writeErr(w, http.StatusBadRequest, "缺少 slug")
		return
	}
	s.likesMu.Lock()
	defer s.likesMu.Unlock()
	m, err := s.readLikes()
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "读取点赞数失败")
		return
	}
	count, ok := m[slug]
	if !ok {
		count = defaultLikeCount
	}
	writeJSON(w, http.StatusOK, map[string]any{"count": count})
}

// handlePostLike adds one like for a slug and returns the new count.
// A slug with no stored count starts from defaultLikeCount, so the
// first like makes it 101.
func (s *Server) handlePostLike(w http.ResponseWriter, r *http.Request) {
	slug := strings.TrimSpace(r.URL.Query().Get("slug"))
	if slug == "" {
		writeErr(w, http.StatusBadRequest, "缺少 slug")
		return
	}
	s.likesMu.Lock()
	defer s.likesMu.Unlock()
	m, err := s.readLikes()
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "读取点赞数失败")
		return
	}
	count, ok := m[slug]
	if !ok {
		count = defaultLikeCount
	}
	count++
	m[slug] = count
	if err := s.writeLikes(m); err != nil {
		writeErr(w, http.StatusInternalServerError, "保存点赞数失败")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"count": count})
}

// handleUploadAudio stores one mp3 file under <siteDir>/music/,
// content-addressed (<sha256>.mp3), deduplicated. Only one song is
// configured at a time (the custom-song setting holds a single URL);
// the file itself is just stored here and referenced by that setting.
func (s *Server) handleUploadAudio(w http.ResponseWriter, r *http.Request) {
	if !s.requireAuth(w, r) {
		return
	}
	if err := r.ParseMultipartForm(32 << 20); err != nil {
		writeErr(w, http.StatusBadRequest, "请求无效")
		return
	}
	f, hdr, err := r.FormFile("file")
	if err != nil {
		writeErr(w, http.StatusBadRequest, "缺少文件")
		return
	}
	defer f.Close()
	ext := strings.ToLower(filepath.Ext(hdr.Filename))
	if ext != ".mp3" {
		writeErr(w, http.StatusBadRequest, "只支持 mp3 格式")
		return
	}
	data, err := io.ReadAll(io.LimitReader(f, 20<<20))
	if err != nil {
		writeErr(w, http.StatusBadRequest, "读取文件失败")
		return
	}
	if len(data) == 0 {
		writeErr(w, http.StatusBadRequest, "文件为空")
		return
	}
	// Best-effort content check: real mp3 data sniffs as audio/mpeg;
	// headerless mp3 frames can sniff as application/octet-stream.
	ct := http.DetectContentType(data)
	if ct != "audio/mpeg" && ct != "application/octet-stream" {
		writeErr(w, http.StatusBadRequest, "文件不是 mp3 音频")
		return
	}
	sum := sha256.Sum256(data)
	name := hex.EncodeToString(sum[:]) + ".mp3"
	rel := "music/" + name
	target := filepath.Join(s.siteDir, filepath.FromSlash(rel))
	if _, err := os.Stat(target); os.IsNotExist(err) {
		if err := writeFileAtomic(target, data, 0o644); err != nil {
			writeErr(w, http.StatusInternalServerError, "保存文件失败")
			return
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "path": "/" + rel})
}

// ---- site content lists (about / bloggers / ...) ----

func (s *Server) dataPath(name string) string {
	return filepath.Join(s.siteDir, "data", name+".json")
}

// writeFileAtomic writes data to path via a temp file + rename.
func writeFileAtomic(path string, data []byte, perm os.FileMode) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, data, perm); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}

// handlePutData replaces one site-content JSON doc (about, bloggers, ...).
// The file is served statically by Nginx as /data/<name>.json, so the
// frontend sees the new content immediately, no rebuild needed.
func (s *Server) handlePutData(w http.ResponseWriter, r *http.Request) {
	if !s.requireAuth(w, r) {
		return
	}
	name := r.PathValue("name")
	if !dataNames[name] {
		writeErr(w, http.StatusBadRequest, "未知的数据名")
		return
	}
	body, err := io.ReadAll(io.LimitReader(r.Body, 10<<20))
	if err != nil {
		writeErr(w, http.StatusBadRequest, "请求无效")
		return
	}
	if !json.Valid(body) {
		writeErr(w, http.StatusBadRequest, "不是有效的 JSON")
		return
	}
	if err := writeFileAtomic(s.dataPath(name), body, 0o644); err != nil {
		writeErr(w, http.StatusInternalServerError, "保存失败")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// handleUpload stores one image file. Two modes:
//   - file + dir=<whitelisted images/... dir>: content-addressed name
//     <sha256>.<ext>, deduplicated (returns the existing path if present).
//   - file + path=/favicon.png or /images/...: exact overwrite.
// Returns {"ok":true,"path":"/..."}.
func (s *Server) handleUpload(w http.ResponseWriter, r *http.Request) {
	if !s.requireAuth(w, r) {
		return
	}
	if err := r.ParseMultipartForm(32 << 20); err != nil {
		writeErr(w, http.StatusBadRequest, "请求无效")
		return
	}
	f, hdr, err := r.FormFile("file")
	if err != nil {
		writeErr(w, http.StatusBadRequest, "缺少文件")
		return
	}
	defer f.Close()
	ext := strings.ToLower(filepath.Ext(hdr.Filename))
	if !imageExts[ext] {
		writeErr(w, http.StatusBadRequest, "不支持的图片格式")
		return
	}
	data, err := io.ReadAll(io.LimitReader(f, 20<<20))
	if err != nil {
		writeErr(w, http.StatusBadRequest, "读取文件失败")
		return
	}
	sum := sha256.Sum256(data)
	name := hex.EncodeToString(sum[:]) + ext

	var rel string
	if dir := strings.TrimSpace(r.FormValue("dir")); dir != "" {
		dir = strings.Trim(dir, "/")
		if !uploadDirs[dir] {
			writeErr(w, http.StatusBadRequest, "不允许的上传目录")
			return
		}
		rel = dir + "/" + name
	} else if p := strings.TrimSpace(r.FormValue("path")); p != "" {
		if !validExactUploadPath(p, ext) {
			writeErr(w, http.StatusBadRequest, "不允许的上传路径")
			return
		}
		rel = strings.TrimPrefix(p, "/")
	} else {
		writeErr(w, http.StatusBadRequest, "缺少 dir 或 path")
		return
	}
	target := filepath.Join(s.siteDir, filepath.FromSlash(rel))
	if _, err := os.Stat(target); os.IsNotExist(err) {
		if err := writeFileAtomic(target, data, 0o644); err != nil {
			writeErr(w, http.StatusInternalServerError, "保存文件失败")
			return
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "path": "/" + rel})
}

// validExactUploadPath allows only /favicon.png or a file under /images/
// with a whitelisted image extension, no traversal.
func validExactUploadPath(p, ext string) bool {
	if !imageExts[ext] {
		return false
	}
	if p == "/favicon.png" {
		return true
	}
	if !strings.HasPrefix(p, "/images/") {
		return false
	}
	if strings.Contains(p, "..") || strings.Contains(p, "\\") {
		return false
	}
	return filepath.Ext(p) == ext
}

// handleDeleteFiles removes files under the web root (images only), used
// when a list item or a site image is removed in the admin pages.
func (s *Server) handleDeleteFiles(w http.ResponseWriter, r *http.Request) {
	if !s.requireAuth(w, r) {
		return
	}
	var body struct {
		Paths []string `json:"paths"`
	}
	if err := readJSONLimit(r, &body, 1<<20); err != nil {
		writeErr(w, http.StatusBadRequest, "请求无效")
		return
	}
	deleted := 0
	for _, p := range body.Paths {
		if !strings.HasPrefix(p, "/images/") && !strings.HasPrefix(p, "/music/") && p != "/favicon.png" {
			continue
		}
		if strings.Contains(p, "..") || strings.Contains(p, "\\") {
			continue
		}
		target := filepath.Join(s.siteDir, filepath.FromSlash(strings.TrimPrefix(p, "/")))
		if err := os.Remove(target); err == nil {
			deleted++
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "deleted": deleted})
}

func readJSONLimit(r *http.Request, v any, limit int64) error {
	defer r.Body.Close()
	dec := json.NewDecoder(io.LimitReader(r.Body, limit))
	return dec.Decode(v)
}

// validSlug rejects path traversal and odd names. Unicode letters are
// allowed (the frontend can produce pinyin or Chinese slugs).
func validSlug(slug string) bool {
	if slug == "" || len([]rune(slug)) > 120 {
		return false
	}
	if slug == "." || slug == ".." || strings.HasPrefix(slug, ".") {
		return false
	}
	for _, c := range slug {
		if c == '/' || c == '\\' {
			return false
		}
		if !(unicode.IsLetter(c) || unicode.IsDigit(c) || c == '-' || c == '_') {
			return false
		}
	}
	return true
}

func (s *Server) indexPath() string { return filepath.Join(s.dataDir, "index.json") }

func (s *Server) readIndex() ([]BlogItem, error) {
	b, err := os.ReadFile(s.indexPath())
	if err != nil {
		if os.IsNotExist(err) {
			return []BlogItem{}, nil
		}
		return nil, err
	}
	var list []BlogItem
	if err := json.Unmarshal(b, &list); err != nil {
		return nil, err
	}
	if list == nil {
		list = []BlogItem{}
	}
	return list, nil
}

func sortIndex(list []BlogItem) {
	sort.SliceStable(list, func(i, j int) bool { return list[i].Date > list[j].Date })
}

func (s *Server) writeIndex(list []BlogItem) error {
	sortIndex(list)
	b, err := json.MarshalIndent(list, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(s.indexPath(), b, 0o644)
}

func (s *Server) handleListBlogs(w http.ResponseWriter, r *http.Request) {
	list, err := s.readIndex()
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "读取索引失败")
		return
	}
	writeJSON(w, http.StatusOK, list)
}

func (s *Server) handleGetBlog(w http.ResponseWriter, r *http.Request) {
	slug := r.PathValue("slug")
	if !validSlug(slug) {
		writeErr(w, http.StatusBadRequest, "slug 无效")
		return
	}
	cfgBytes, err := os.ReadFile(filepath.Join(s.dataDir, slug, "config.json"))
	if err != nil {
		writeErr(w, http.StatusNotFound, "文章不存在")
		return
	}
	mdBytes, err := os.ReadFile(filepath.Join(s.dataDir, slug, "index.md"))
	if err != nil {
		writeErr(w, http.StatusNotFound, "文章不存在")
		return
	}
	var cfg BlogConfig
	if err := json.Unmarshal(cfgBytes, &cfg); err != nil {
		writeErr(w, http.StatusInternalServerError, "文章配置损坏")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"slug": slug, "config": cfg, "markdown": string(mdBytes),
	})
}

func extForFile(fh *multipart.FileHeader, sniff []byte) (string, error) {
	ext := strings.ToLower(filepath.Ext(fh.Filename))
	if imageExts[ext] {
		return ext, nil
	}
	// Fall back to sniffed content type.
	ct := http.DetectContentType(sniff)
	switch ct {
	case "image/png":
		return ".png", nil
	case "image/jpeg":
		return ".jpg", nil
	case "image/webp":
		return ".webp", nil
	case "image/gif":
		return ".gif", nil
	case "image/avif":
		return ".avif", nil
	case "image/svg+xml":
		return ".svg", nil
	case "image/bmp":
		return ".bmp", nil
	case "image/x-icon", "image/vnd.microsoft.icon":
		return ".ico", nil
	}
	return "", fmt.Errorf("不支持的图片格式: %s", fh.Filename)
}

type coverSpec struct {
	Type string `json:"type"`
	URL  string `json:"url"`
	ID   string `json:"id"`
}

// handlePublish creates or updates one post. Multipart fields:
// slug, title, md, tags (JSON array), date, summary, hidden, category,
// cover (JSON {type:'url',url} or {type:'file',id}), mode (create|edit),
// originalSlug. Files arrive as fields named "file:<id>".
func (s *Server) handlePublish(w http.ResponseWriter, r *http.Request) {
	if !s.requireAuth(w, r) {
		return
	}
	if err := r.ParseMultipartForm(32 << 20); err != nil {
		writeErr(w, http.StatusBadRequest, "请求过大或格式错误")
		return
	}
	slug := strings.TrimSpace(r.FormValue("slug"))
	if !validSlug(slug) {
		writeErr(w, http.StatusBadRequest, "slug 无效")
		return
	}
	mode := r.FormValue("mode")
	if mode == "" {
		mode = "create"
	}
	originalSlug := strings.TrimSpace(r.FormValue("originalSlug"))
	if mode == "edit" && originalSlug != "" && originalSlug != slug {
		writeErr(w, http.StatusBadRequest, "编辑模式下不支持修改 slug")
		return
	}
	title := strings.TrimSpace(r.FormValue("title"))
	if title == "" {
		writeErr(w, http.StatusBadRequest, "需要标题")
		return
	}
	md := r.FormValue("md")
	var tags []string
	if v := strings.TrimSpace(r.FormValue("tags")); v != "" {
		if err := json.Unmarshal([]byte(v), &tags); err != nil {
			writeErr(w, http.StatusBadRequest, "tags 格式错误")
			return
		}
	}
	if tags == nil {
		tags = []string{}
	}
	hidden, _ := strconv.ParseBool(r.FormValue("hidden"))

	// Store uploaded images (content-addressed, dedup by hash).
	s.mu.Lock()
	defer s.mu.Unlock()

	dir := filepath.Join(s.dataDir, slug)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		writeErr(w, http.StatusInternalServerError, "创建文章目录失败")
		return
	}
	publicByID := map[string]string{}
	if r.MultipartForm != nil {
		for key, fhs := range r.MultipartForm.File {
			if !strings.HasPrefix(key, "file:") || len(fhs) == 0 {
				continue
			}
			id := strings.TrimPrefix(key, "file:")
			fh := fhs[0]
			f, err := fh.Open()
			if err != nil {
				writeErr(w, http.StatusBadRequest, "读取图片失败")
				return
			}
			content, err := io.ReadAll(io.LimitReader(f, 10<<20))
			f.Close()
			if err != nil {
				writeErr(w, http.StatusBadRequest, "读取图片失败")
				return
			}
			if len(content) >= 10<<20 {
				writeErr(w, http.StatusBadRequest, "图片超过 10MB")
				return
			}
			ext, err := extForFile(fh, content)
			if err != nil {
				writeErr(w, http.StatusBadRequest, err.Error())
				return
			}
			sum := sha256.Sum256(content)
			name := hex.EncodeToString(sum[:]) + ext
			if err := os.WriteFile(filepath.Join(dir, name), content, 0o644); err != nil {
				writeErr(w, http.StatusInternalServerError, "保存图片失败")
				return
			}
			publicByID[id] = "/blogs/" + slug + "/" + name
		}
	}

	// Resolve local-image placeholders in the markdown.
	for id, pub := range publicByID {
		md = strings.ReplaceAll(md, "(local-image:"+id+")", "("+pub+")")
	}

	// Resolve cover.
	var coverPath string
	if v := strings.TrimSpace(r.FormValue("cover")); v != "" && v != "null" {
		var cov coverSpec
		if err := json.Unmarshal([]byte(v), &cov); err != nil {
			writeErr(w, http.StatusBadRequest, "cover 格式错误")
			return
		}
		switch cov.Type {
		case "url":
			coverPath = cov.URL
		case "file":
			pub, ok := publicByID[cov.ID]
			if !ok {
				writeErr(w, http.StatusBadRequest, "封面图片未上传")
				return
			}
			coverPath = pub
		}
	}

	cfg := BlogConfig{
		Title:    title,
		Tags:     tags,
		Date:     r.FormValue("date"),
		Summary:  r.FormValue("summary"),
		Cover:    coverPath,
		Hidden:   hidden,
		Category: r.FormValue("category"),
	}
	if err := writeJSONFile(filepath.Join(dir, "config.json"), cfg); err != nil {
		writeErr(w, http.StatusInternalServerError, "写入文章配置失败")
		return
	}
	if err := os.WriteFile(filepath.Join(dir, "index.md"), []byte(md), 0o644); err != nil {
		writeErr(w, http.StatusInternalServerError, "写入文章内容失败")
		return
	}

	list, err := s.readIndex()
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "读取索引失败")
		return
	}
	entry := BlogItem{
		Slug: slug, Title: title, Tags: tags, Date: cfg.Date,
		Summary: cfg.Summary, Cover: coverPath, Hidden: hidden, Category: cfg.Category,
	}
	found := false
	for i := range list {
		if list[i].Slug == slug {
			list[i] = entry
			found = true
		}
	}
	if !found {
		list = append(list, entry)
	}
	if err := s.writeIndex(list); err != nil {
		writeErr(w, http.StatusInternalServerError, "更新索引失败")
		return
	}
	log.Printf("published %s (mode=%s)", slug, mode)
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "slug": slug, "cover": coverPath})
}

func writeJSONFile(path string, v any) error {
	b, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, b, 0o644)
}

func (s *Server) handleDeleteBlog(w http.ResponseWriter, r *http.Request) {
	if !s.requireAuth(w, r) {
		return
	}
	slug := r.PathValue("slug")
	if !validSlug(slug) {
		writeErr(w, http.StatusBadRequest, "slug 无效")
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()

	_, statErr := os.Stat(filepath.Join(s.dataDir, slug))
	list, err := s.readIndex()
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "读取索引失败")
		return
	}
	inIndex := false
	for _, it := range list {
		if it.Slug == slug {
			inIndex = true
		}
	}
	if os.IsNotExist(statErr) && !inIndex {
		writeErr(w, http.StatusNotFound, "文章不存在")
		return
	}
	_ = os.RemoveAll(filepath.Join(s.dataDir, slug))
	next := list[:0]
	for _, it := range list {
		if it.Slug != slug {
			next = append(next, it)
		}
	}
	if err := s.writeIndex(next); err != nil {
		writeErr(w, http.StatusInternalServerError, "更新索引失败")
		return
	}
	log.Printf("deleted %s", slug)
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (s *Server) handleBatchDelete(w http.ResponseWriter, r *http.Request) {
	if !s.requireAuth(w, r) {
		return
	}
	var body struct {
		Slugs []string `json:"slugs"`
	}
	if err := readJSONLimit(r, &body, 1<<20); err != nil || len(body.Slugs) == 0 {
		writeErr(w, http.StatusBadRequest, "需要至少选择一篇文章")
		return
	}
	seen := map[string]bool{}
	slugs := make([]string, 0, len(body.Slugs))
	for _, sg := range body.Slugs {
		if validSlug(sg) && !seen[sg] {
			seen[sg] = true
			slugs = append(slugs, sg)
		}
	}
	if len(slugs) == 0 {
		writeErr(w, http.StatusBadRequest, "slug 无效")
		return
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	for _, sg := range slugs {
		_ = os.RemoveAll(filepath.Join(s.dataDir, sg))
	}
	list, err := s.readIndex()
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "读取索引失败")
		return
	}
	next := list[:0]
	for _, it := range list {
		if !seen[it.Slug] {
			next = append(next, it)
		}
	}
	if err := s.writeIndex(next); err != nil {
		writeErr(w, http.StatusInternalServerError, "更新索引失败")
		return
	}
	log.Printf("batch deleted %v", slugs)
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "deleted": slugs})
}

// PUT /api/blogs/index replaces the whole index (and categories) at once.
// Used by the blog-list management page. Slugs missing from the new list
// have their directories removed.
func (s *Server) handlePutIndex(w http.ResponseWriter, r *http.Request) {
	if !s.requireAuth(w, r) {
		return
	}
	var body struct {
		Items      []BlogItem `json:"items"`
		Categories []string   `json:"categories"`
	}
	if err := readJSONLimit(r, &body, 1<<20); err != nil {
		writeErr(w, http.StatusBadRequest, "请求无效")
		return
	}
	keep := map[string]bool{}
	items := make([]BlogItem, 0, len(body.Items))
	for _, it := range body.Items {
		if !validSlug(it.Slug) {
			writeErr(w, http.StatusBadRequest, "slug 无效: "+it.Slug)
			return
		}
		if keep[it.Slug] {
			continue
		}
		keep[it.Slug] = true
		if it.Tags == nil {
			it.Tags = []string{}
		}
		items = append(items, it)
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	cur, err := s.readIndex()
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "读取索引失败")
		return
	}
	var removed []string
	for _, it := range cur {
		if !keep[it.Slug] {
			removed = append(removed, it.Slug)
			_ = os.RemoveAll(filepath.Join(s.dataDir, it.Slug))
		}
	}
	if err := s.writeIndex(items); err != nil {
		writeErr(w, http.StatusInternalServerError, "更新索引失败")
		return
	}
	cats := body.Categories
	if cats == nil {
		cats = []string{}
	}
	uniq := map[string]bool{}
	out := make([]string, 0, len(cats))
	for _, c := range cats {
		c = strings.TrimSpace(c)
		if c != "" && !uniq[c] {
			uniq[c] = true
			out = append(out, c)
		}
	}
	if err := writeJSONFile(filepath.Join(s.dataDir, "categories.json"), map[string]any{"categories": out}); err != nil {
		writeErr(w, http.StatusInternalServerError, "更新分类失败")
		return
	}
	log.Printf("index replaced, removed %v", removed)
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "removed": removed})
}
