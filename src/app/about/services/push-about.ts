// About page data now lives on the server: GET /data/about.json at runtime,
// PUT /api/data/about on save. No GitHub flow anymore.
import { putDataRequest } from '@/lib/server-api'

export type AboutData = {
	title: string
	description: string
	content: string
}

export async function pushAbout(data: AboutData): Promise<void> {
	await putDataRequest('about', data)
}
