// Snippets list now lives on the server: GET /data/snippets.json at runtime,
// PUT /api/data/snippets on save. No GitHub flow anymore.
import { putDataRequest } from '@/lib/server-api'

export type PushSnippetsParams = {
	snippets: string[]
}

export async function pushSnippets(params: PushSnippetsParams): Promise<void> {
	await putDataRequest('snippets', params.snippets)
}
