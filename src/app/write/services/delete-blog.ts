// Delete one article on the server backend (replaces the GitHub-App flow).
import { deleteBlogApi } from '@/lib/server-api'

export async function deleteBlog(slug: string): Promise<void> {
	if (!slug) throw new Error('需要 slug')
	await deleteBlogApi(slug)
}
