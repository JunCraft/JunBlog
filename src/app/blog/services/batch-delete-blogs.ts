// Batch-delete articles on the server backend (replaces the GitHub-App flow).
import { batchDeleteBlogsApi } from '@/lib/server-api'

export async function batchDeleteBlogs(slugs: string[]): Promise<void> {
	const uniqueSlugs = Array.from(new Set(slugs.filter(Boolean)))
	if (uniqueSlugs.length === 0) {
		throw new Error('需要至少选择一篇文章')
	}
	await batchDeleteBlogsApi(uniqueSlugs)
}
