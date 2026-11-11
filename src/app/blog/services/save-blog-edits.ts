// Save blog-list edits (index + categories) to the server backend
// (replaces the GitHub-App flow). Slugs missing from the new list have
// their directories removed server-side.
import { saveBlogIndexApi } from '@/lib/server-api'
import type { BlogIndexItem } from '@/lib/blog-index'

export async function saveBlogEdits(originalItems: BlogIndexItem[], nextItems: BlogIndexItem[], categories: string[]): Promise<void> {
	const uniqueCategories = Array.from(new Set(categories.map(c => c.trim()).filter(Boolean)))
	await saveBlogIndexApi(nextItems, uniqueCategories)
}
