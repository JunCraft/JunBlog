// Site config now lives on the server: GET /data/site-content.json and
// /data/card-styles.json at runtime, PUT /api/data/site-content and
// /api/data/card-styles on save; images go through POST /api/upload
// (exact paths: /favicon.png, /images/avatar.png, /images/art/...,
// /images/background/..., /images/social-buttons/...); removed images are
// deleted via POST /api/files/delete. No GitHub flow anymore.
import { deleteFilesRequest, putDataRequest, uploadImageRequest } from '@/lib/server-api'
import { toast } from 'sonner'
import type { SiteContent, CardStyles } from '../stores/config-store'
import type { FileItem, ArtImageUploads, SocialButtonImageUploads, BackgroundImageUploads } from '../config-dialog/site-settings'

type ArtImageConfig = SiteContent['artImages'][number]
type BackgroundImageConfig = SiteContent['backgroundImages'][number]

export async function pushSiteContent(
	siteContent: SiteContent,
	cardStyles: CardStyles,
	faviconItem?: FileItem | null,
	avatarItem?: FileItem | null,
	artImageUploads?: ArtImageUploads,
	removedArtImages?: ArtImageConfig[],
	backgroundImageUploads?: BackgroundImageUploads,
	removedBackgroundImages?: BackgroundImageConfig[],
	socialButtonImageUploads?: SocialButtonImageUploads
): Promise<void> {
	if (faviconItem?.type === 'file') {
		toast.info('正在上传 Favicon...')
		await uploadImageRequest(faviconItem.file, { path: '/favicon.png' })
	}

	if (avatarItem?.type === 'file') {
		toast.info('正在上传 Avatar...')
		await uploadImageRequest(avatarItem.file, { path: '/images/avatar.png' })
	}

	if (artImageUploads) {
		for (const [id, item] of Object.entries(artImageUploads)) {
			if (item.type !== 'file') continue
			const artConfig = siteContent.artImages?.find(art => art.id === id)
			if (!artConfig) continue

			toast.info(`正在上传 Art 图片 ${id}...`)
			await uploadImageRequest(item.file, { path: artConfig.url })
		}
	}

	if (backgroundImageUploads) {
		for (const [id, item] of Object.entries(backgroundImageUploads)) {
			if (item.type !== 'file') continue
			const bgConfig = siteContent.backgroundImages?.find(bg => bg.id === id)
			if (!bgConfig?.url.startsWith('/images/background/')) continue

			toast.info(`正在上传背景图片 ${id}...`)
			await uploadImageRequest(item.file, { path: bgConfig.url })
		}
	}

	if (socialButtonImageUploads) {
		for (const [buttonId, item] of Object.entries(socialButtonImageUploads)) {
			if (item.type !== 'file') continue
			const button = siteContent.socialButtons?.find(btn => btn.id === buttonId)
			if (!button?.value.startsWith('/images/social-buttons/')) continue

			toast.info(`正在上传社交按钮图片 ${buttonId}...`)
			await uploadImageRequest(item.file, { path: button.value })
		}
	}

	const removedPaths: string[] = []
	if (removedArtImages?.length) {
		for (const art of removedArtImages) {
			removedPaths.push(art.url)
		}
	}
	if (removedBackgroundImages?.length) {
		for (const bg of removedBackgroundImages) {
			if (!bg.url.startsWith('/images/background/')) continue
			removedPaths.push(bg.url)
		}
	}
	if (removedPaths.length > 0) {
		await deleteFilesRequest(removedPaths)
	}

	await putDataRequest('site-content', siteContent)
	await putDataRequest('card-styles', cardStyles)
	toast.success('保存成功！')
}
