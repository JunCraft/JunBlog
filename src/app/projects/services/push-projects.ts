// Projects list now lives on the server: GET /data/projects.json at runtime,
// PUT /api/data/projects on save; new images go through POST /api/upload
// (content-addressed under images/project). No GitHub flow anymore.
import { putDataRequest, uploadImageRequest } from '@/lib/server-api'
import type { Project } from '../components/project-card'
import type { MediaItem } from '@/components/media-upload-dialog'
import { toast } from 'sonner'

export type PushProjectsParams = {
	projects: Project[]
	imageItems?: Map<string, MediaItem>
}

export async function pushProjects(params: PushProjectsParams): Promise<void> {
	const { projects, imageItems } = params

	let updatedProjects = [...projects]

	if (imageItems && imageItems.size > 0) {
		toast.info('正在上传图片...')
		for (const [url, imageItem] of imageItems.entries()) {
			if (imageItem.type !== 'file') continue

			const publicPath = await uploadImageRequest(imageItem.file, { dir: 'images/project' })
			updatedProjects = updatedProjects.map(p => (p.url === url ? { ...p, image: publicPath } : p))
		}
	}

	await putDataRequest('projects', updatedProjects)
}
