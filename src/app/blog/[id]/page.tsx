import fs from 'node:fs'
import path from 'node:path'
import BlogClient from './blog-client'

export function generateStaticParams() {
	const indexPath = path.join(process.cwd(), 'public', 'blogs', 'index.json')
	const list = JSON.parse(fs.readFileSync(indexPath, 'utf8')) as { slug: string }[]
	return list.map(item => ({ id: item.slug }))
}

export default function Page() {
	return <BlogClient />
}
