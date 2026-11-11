'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import BlogClient from '@/app/blog/[id]/blog-client'
import EditBlogPage from '@/app/write/[slug]/edit-client'

// Fallback shell for URLs that were not pre-rendered at build time.
// The static export pre-renders only the slugs known at build time; a
// newly published article has no .html file, so Nginx serves this page
// (404.html) and the article is loaded client-side from
// /blogs/{slug}/config.json + index.md, which the backend writes directly.
export default function NotFound() {
	const [view, setView] = useState<{ kind: 'blog' | 'write'; slug: string } | null>(null)
	const [ready, setReady] = useState(false)

	useEffect(() => {
		const path = window.location.pathname.replace(/\/+$/, '')
		const blog = path.match(/^\/blog\/([^/]+)$/)
		const write = path.match(/^\/write\/([^/]+)$/)
		if (blog) {
			setView({ kind: 'blog', slug: decodeURIComponent(blog[1]) })
		} else if (write) {
			setView({ kind: 'write', slug: decodeURIComponent(write[1]) })
		}
		setReady(true)
	}, [])

	if (!ready) {
		return <div className='text-secondary flex h-screen items-center justify-center text-sm'>加载中...</div>
	}

	if (view?.kind === 'blog') {
		return <BlogClient slug={view.slug} />
	}

	if (view?.kind === 'write') {
		return <EditBlogPage slug={view.slug} />
	}

	return (
		<div className='flex h-screen flex-col items-center justify-center gap-4 text-sm'>
			<div className='text-2xl font-semibold'>页面不存在</div>
			<div className='text-secondary'>这个链接可能已经失效，或者文章已被删除。</div>
			<Link href='/' className='brand-btn px-6'>
				回首页
			</Link>
		</div>
	)
}
