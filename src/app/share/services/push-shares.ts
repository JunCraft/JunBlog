// Share list now lives on the server: GET /data/share.json at runtime,
// PUT /api/data/share on save; new logos go through POST /api/upload
// (content-addressed under images/share). No GitHub flow anymore.
import { putDataRequest, uploadImageRequest } from '@/lib/server-api'
import type { Share } from '../components/share-card'
import type { MediaItem } from '@/components/media-upload-dialog'
import { toast } from 'sonner'

export type PushSharesParams = {
	shares: Share[]
	logoItems?: Map<string, MediaItem>
}

export async function pushShares(params: PushSharesParams): Promise<Share[]> {
	const { shares, logoItems } = params

	const blobShares = shares.filter(s => s.logo.startsWith('blob:'))
	if (blobShares.length > 0) {
		const missing = blobShares.filter(s => !logoItems?.has(s.url))
		if (missing.length > 0) {
			throw new Error(`图标未上传完成：${missing.map(s => s.name).join('、')}`)
		}
	}

	let updatedShares = [...shares]

	if (logoItems && logoItems.size > 0) {
		toast.info('正在上传图标...')
		for (const [url, logoItem] of logoItems.entries()) {
			if (logoItem.type !== 'file') continue

			const publicPath = await uploadImageRequest(logoItem.file, { dir: 'images/share' })
			updatedShares = updatedShares.map(s => (s.url === url ? { ...s, logo: publicPath } : s))
		}
	}

	await putDataRequest('share', updatedShares)
	return updatedShares
}
