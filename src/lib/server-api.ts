// Client for the server-side blog API (Go backend, proxied by Nginx at /api).
// Replaces the GitHub-App flow for publishing/managing articles: posts are
// stored as files on the server (public/blogs/{slug}/config.json + index.md)
// and the index is updated server-side, so a new post is live immediately.

export const ADMIN_TOKEN_KEY = 'blog_admin_token'

export function getAdminToken(): string | null {
	if (typeof window === 'undefined') return null
	return localStorage.getItem(ADMIN_TOKEN_KEY)
}

export function setAdminToken(token: string | null) {
	if (typeof window === 'undefined') return
	if (token) localStorage.setItem(ADMIN_TOKEN_KEY, token)
	else localStorage.removeItem(ADMIN_TOKEN_KEY)
}

/** Login as the fixed admin account. Returns the admin token. */
export async function loginRequest(username: string, password: string): Promise<string> {
	const res = await fetch('/api/login', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ username, password }),
	})
	const data = await res.json().catch(() => ({}))
	if (!res.ok) {
		throw new Error(data?.error || '登录失败')
	}
	if (!data?.token) {
		throw new Error('登录失败：服务器未返回 token')
	}
	return data.token as string
}

/** Change the admin password. Requires login (Bearer token) and the
 *  current password; the backend verifies the old password first. */
export async function changePasswordRequest(oldPassword: string, newPassword: string): Promise<void> {
	await apiFetch('/api/change-password', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ oldPassword, newPassword }),
	})
}

async function apiFetch(path: string, init: RequestInit = {}): Promise<any> {
	const token = getAdminToken()
	const headers: Record<string, string> = {
		...(init.headers as Record<string, string>),
	}
	if (token) headers['Authorization'] = `Bearer ${token}`
	const res = await fetch(path, { ...init, headers })
	const data = await res.json().catch(() => ({}))
	if (!res.ok) {
		throw new Error(data?.error || `请求失败 (${res.status})`)
	}
	return data
}

/** Publish (create or edit) one article. formData must carry the same fields
 *  the old GitHub push used: slug, title, md, tags (JSON), date, summary,
 *  hidden, category, cover (JSON), mode, originalSlug, plus files named
 *  "file:<id>". */
export async function publishBlogApi(formData: FormData): Promise<{ slug: string; cover?: string }> {
	return apiFetch('/api/blogs', { method: 'POST', body: formData })
}

export async function deleteBlogApi(slug: string): Promise<void> {
	await apiFetch(`/api/blogs/${encodeURIComponent(slug)}`, { method: 'DELETE' })
}

export async function batchDeleteBlogsApi(slugs: string[]): Promise<void> {
	await apiFetch('/api/blogs/batch-delete', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ slugs }),
	})
}

export type BlogIndexItem = {
	slug: string
	title: string
	tags: string[]
	date: string
	summary?: string
	cover?: string
	hidden?: boolean
	category?: string
}

export async function saveBlogIndexApi(items: BlogIndexItem[], categories: string[]): Promise<void> {
	await apiFetch('/api/blogs/index', {
		method: 'PUT',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ items, categories }),
	})
}

// ---- site content lists (about / bloggers / pictures / projects / share /
// snippets / site-content / card-styles) ----
// The backend stores each doc as <site>/data/<name>.json and Nginx serves
// it statically as /data/<name>.json, so a save is visible immediately
// with no rebuild. Reads go straight to the static file (no auth needed);
// writes go through the API with the admin token.

export type SiteDataName = 'about' | 'bloggers' | 'pictures' | 'projects' | 'share' | 'snippets' | 'site-content' | 'card-styles'

/** Fetch one site-content doc at runtime. Returns null when the file is
 *  missing or unparsable (callers fall back to the copy bundled at build
 *  time). The parse guard matters: Nginx's 404 fallback serves the
 *  generic article shell as HTML with status 200 for a missing file. */
export async function fetchDataJson<T>(name: SiteDataName): Promise<T | null> {
	try {
		const res = await fetch(`/data/${name}.json`, { cache: 'no-store' })
		if (!res.ok) return null
		const text = await res.text()
		return JSON.parse(text) as T
	} catch {
		return null
	}
}

/** Replace one site-content doc on the server (admin only). */
export async function putDataRequest(name: SiteDataName, data: unknown): Promise<void> {
	await apiFetch(`/api/data/${name}`, {
		method: 'PUT',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(data),
	})
}

/** Upload one image to the server. Either a content-addressed upload
 *  (`dir`: images/blogger, images/share, images/project, images/pictures,
 *  images/art, images/background, images/social-buttons — the file is
 *  stored as <sha256>.<ext>) or an exact overwrite (`path`: /favicon.png
 *  or /images/...). Returns the public path to store in the doc. */
export async function uploadImageRequest(file: File, opts: { dir?: string; path?: string }): Promise<string> {
	const form = new FormData()
	form.append('file', file)
	if (opts.dir) form.append('dir', opts.dir)
	if (opts.path) form.append('path', opts.path)
	const data = await apiFetch('/api/upload', { method: 'POST', body: form })
	if (!data?.path) {
		throw new Error('上传失败：服务器未返回路径')
	}
	return data.path as string
}

/** Upload one mp3 file to the server (custom song). The file is stored
 *  content-addressed under /music/<sha256>.mp3. Returns the public path
 *  to store in the site-content custom-song setting. */
export async function uploadAudioRequest(file: File): Promise<string> {
	const form = new FormData()
	form.append('file', file)
	const data = await apiFetch('/api/upload-audio', { method: 'POST', body: form })
	if (!data?.path) {
		throw new Error('上传失败：服务器未返回路径')
	}
	return data.path as string
}

/** Delete files under the web root (images only). Missing files are ignored. */
export async function deleteFilesRequest(paths: string[]): Promise<void> {
	if (paths.length === 0) return
	await apiFetch('/api/files/delete', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ paths }),
	})
}
