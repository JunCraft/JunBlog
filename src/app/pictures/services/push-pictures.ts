// Pictures list now lives on the server: GET /data/pictures.json at runtime,
// PUT /api/data/pictures on save; new images go through POST /api/upload
// (content-addressed under images/pictures); images removed from the list
// are deleted via POST /api/files/delete. No GitHub flow anymore.
import { deleteFilesRequest, fetchDataJson, putDataRequest, uploadImageRequest } from '@/lib/server-api'
import type { MediaItem } from '@/components/media-upload-dialog'
import { toast } from 'sonner'
import { Picture } from '../page'

export type PushPicturesParams = {
	pictures: Picture[]
	imageItems?: Map<string, MediaItem>
}

function collectImageUrls(pictures: Picture[]): Set<string> {
	const urls = new Set<string>()
	for (const picture of pictures) {
		if (picture.image) urls.add(picture.image)
		picture.images?.forEach(url => urls.add(url))
	}
	return urls
}

export async function pushPictures(params: PushPicturesParams): Promise<void> {
	const { pictures, imageItems } = params

	let updatedPictures = [...pictures]

	if (imageItems && imageItems.size > 0) {
		toast.info('正在上传图片...')
		for (const [key, imageItem] of imageItems.entries()) {
			if (imageItem.type !== 'file') continue

			const publicPath = await uploadImageRequest(imageItem.file, { dir: 'images/pictures' })

			const [groupId, indexStr] = key.split('::')
			const imageIndex = Number(indexStr) || 0

			updatedPictures = updatedPictures.map(p => {
				if (p.id !== groupId) return p

				const currentImages = p.images && p.images.length > 0 ? p.images : p.image ? [p.image] : []
				const nextImages = currentImages.map((img, idx) => (idx === imageIndex ? publicPath : img))

				return { ...p, image: undefined, images: nextImages }
			})
		}
	}

	const currentImageUrls = collectImageUrls(updatedPictures)

	// Delete image files that were in the previously saved list but are no
	// longer referenced (the server's current copy is the "previous" list).
	toast.info('正在检查需要删除的文件...')
	const previousPictures = await fetchDataJson<Picture[]>('pictures')
	if (previousPictures) {
		const previousImageUrls = collectImageUrls(previousPictures)
		const removed: string[] = []
		for (const url of previousImageUrls) {
			if (!currentImageUrls.has(url) && url.startsWith('/images/pictures/')) {
				removed.push(url)
			}
		}
		if (removed.length > 0) {
			await deleteFilesRequest(removed)
		}
	}

	await putDataRequest('pictures', updatedPictures)
}
