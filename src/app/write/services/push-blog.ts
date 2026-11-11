// Publish one article to the server backend (replaces the GitHub-App flow).
// The backend stores the post as public/blogs/{slug}/config.json + index.md
// and updates public/blogs/index.json, so the article is live immediately
// with no rebuild and no GitHub round-trip. The editor UI is unchanged.
import { publishBlogApi } from '@/lib/server-api'
import type { ImageItem } from '../types'
import { extractFirstH1, normalizeLeadingH1, stripFirstH1, stripInlineMarkdown } from '../lib/md-title'

export type PushBlogParams = {
	form: {
		slug: string
		title: string
		md: string
		tags: string[]
		date?: string
		summary?: string
		hidden?: boolean
		category?: string
	}
	cover?: ImageItem | null
	images?: ImageItem[]
	mode?: 'create' | 'edit'
	originalSlug?: string | null
}

export async function pushBlog(params: PushBlogParams): Promise<void> {
	const { form, cover, images, mode = 'create', originalSlug } = params

	if (!form?.slug) throw new Error('需要 slug')

	if (mode === 'edit' && originalSlug && originalSlug !== form.slug) {
		throw new Error('编辑模式下不支持修改 slug，请保持原 slug 不变')
	}

	const slug = form.slug.trim()
	// Keep published markdown consistent with existing posts: title lives in config
	const mdToUpload = stripFirstH1(normalizeLeadingH1(form.md))
	const title = stripInlineMarkdown(form.title.trim() || extractFirstH1(mdToUpload) || slug)

	const fd = new FormData()
	fd.append('slug', slug)
	fd.append('title', title)
	fd.append('md', mdToUpload)
	fd.append('tags', JSON.stringify(form.tags ?? []))
	fd.append('date', form.date || '')
	fd.append('summary', form.summary ?? '')
	fd.append('hidden', String(!!form.hidden))
	fd.append('category', form.category ?? '')
	fd.append('mode', mode)
	if (originalSlug) {
		fd.append('originalSlug', originalSlug)
	}
	if (cover?.type === 'url') {
		fd.append('cover', JSON.stringify({ type: 'url', url: cover.url }))
	} else if (cover?.type === 'file') {
		fd.append('cover', JSON.stringify({ type: 'file', id: cover.id }))
	}

	// New image files (content images + cover file, if any). The backend
	// hashes them, stores them under blogs/{slug}/{sha256}.{ext} and rewrites
	// the (local-image:<id>) placeholders in the markdown.
	const seen = new Set<string>()
	const allFiles = [...(images || []), ...(cover?.type === 'file' ? [cover] : [])]
	for (const item of allFiles) {
		if (item.type !== 'file' || seen.has(item.id)) continue
		seen.add(item.id)
		fd.append(`file:${item.id}`, item.file, item.filename)
	}

	await publishBlogApi(fd)
}
