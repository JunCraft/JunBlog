// Bloggers list now lives on the server: GET /data/bloggers.json at runtime,
// PUT /api/data/bloggers on save; new avatars go through POST /api/upload
// (content-addressed under images/blogger). No GitHub flow anymore.
import { putDataRequest, uploadImageRequest } from '@/lib/server-api'
import type { Blogger } from '../grid-view'
import type { MediaItem } from '@/components/media-upload-dialog'
import { toast } from 'sonner'

export type PushBloggersParams = {
	bloggers: Blogger[]
	avatarItems?: Map<string, MediaItem>
}

export async function pushBloggers(params: PushBloggersParams): Promise<Blogger[]> {
	const { bloggers, avatarItems } = params
	const blobBloggers = bloggers.filter(b => b.avatar.startsWith('blob:'))
	if (blobBloggers.length > 0) {
		const missing = blobBloggers.filter(b => !avatarItems?.has(b.url))
		if (missing.length > 0) {
			throw new Error(`头像未上传完成：${missing.map(b => b.name).join('、')}`)
		}
	}

	let updatedBloggers = [...bloggers]

	if (avatarItems && avatarItems.size > 0) {
		toast.info('正在上传头像...')
		for (const [url, avatarItem] of avatarItems.entries()) {
			if (avatarItem.type !== 'file') continue

			const publicPath = await uploadImageRequest(avatarItem.file, { dir: 'images/blogger' })
			updatedBloggers = updatedBloggers.map(b => (b.url === url ? { ...b, avatar: publicPath } : b))
		}
	}

	await putDataRequest('bloggers', updatedBloggers)
	return updatedBloggers
}
