'use client'

import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { uploadAudioRequest, deleteFilesRequest } from '@/lib/server-api'
import { useAuthStore } from '@/hooks/use-auth'
import type { SiteContent } from '../../stores/config-store'

type CustomSong = { source: 'none' | 'upload' | 'url'; url: string; name: string }

function getCustomSong(formData: SiteContent): CustomSong {
	const s: any = (formData as any).customSong
	if (s && typeof s.url === 'string' && s.url && (s.source === 'upload' || s.source === 'url')) {
		return { source: s.source, url: s.url, name: typeof s.name === 'string' ? s.name : '' }
	}
	return { source: 'none', url: '', name: '' }
}

function fileNameFromUrl(url: string): string {
	try {
		const u = new URL(url)
		const base = u.pathname.split('/').filter(Boolean).pop() || ''
		return base.replace(/\.mp3$/i, '')
	} catch {
		return ''
	}
}

function isMp3Url(url: string): boolean {
	try {
		const u = new URL(url)
		if (u.protocol !== 'http:' && u.protocol !== 'https:') return false
		return u.pathname.toLowerCase().endsWith('.mp3')
	} catch {
		return false
	}
}

interface CustomSongSectionProps {
	formData: SiteContent
	setFormData: React.Dispatch<React.SetStateAction<SiteContent>>
}

export function CustomSongSection({ formData, setFormData }: CustomSongSectionProps) {
	const { isAuth, setLoginModalOpen } = useAuthStore()
	const [linkInput, setLinkInput] = useState('')
	const [uploading, setUploading] = useState(false)
	const fileRef = useRef<HTMLInputElement | null>(null)

	const song = getCustomSong(formData)

	const setSong = (next: CustomSong) => {
		setFormData({ ...formData, customSong: next })
	}

	const requireLogin = () => {
		if (isAuth) return true
		toast.info('请先登录后再设置自定义歌曲')
		setLoginModalOpen(true)
		return false
	}

	const handleFile = async (file: File | undefined) => {
		if (!file) return
		if (!requireLogin()) return
		if (!/\.mp3$/i.test(file.name)) {
			toast.error('只支持 mp3 格式')
			return
		}
		setUploading(true)
		try {
			const path = await uploadAudioRequest(file)
			const name = song.name || file.name.replace(/\.mp3$/i, '')
			// Replacing an uploaded song: remove the old file.
			if (song.source === 'upload' && song.url && song.url !== path) {
				deleteFilesRequest([song.url]).catch(() => {})
			}
			setSong({ source: 'upload', url: path, name })
			toast.success('歌曲已上传，点「保存」后生效')
		} catch (error: any) {
			toast.error(`上传失败: ${error?.message || '未知错误'}`)
		} finally {
			setUploading(false)
			if (fileRef.current) fileRef.current.value = ''
		}
	}

	const handleUseLink = () => {
		const url = linkInput.trim()
		if (!url) {
			toast.error('请先填入 mp3 链接')
			return
		}
		if (!isMp3Url(url)) {
			toast.error('链接必须是 http(s) 的 mp3 地址（以 .mp3 结尾）')
			return
		}
		const name = song.name || fileNameFromUrl(url)
		setSong({ source: 'url', url, name })
		setLinkInput('')
		toast.success('已填入链接，点「保存」后生效')
	}

	const handleClear = () => {
		if (song.source === 'upload' && song.url) {
			deleteFilesRequest([song.url]).catch(() => {})
		}
		setSong({ source: 'none', url: '', name: '' })
	}

	return (
		<div className='space-y-2'>
			<label className='mb-2 block text-sm font-medium'>自定义歌曲</label>
			<p className='text-xs text-gray-500'>只支持单首 mp3。设置后，首页音乐卡片播放这首歌；留空则播放默认曲目。改动要点「保存」才生效。</p>

			{song.source !== 'none' && (
				<div className='bg-secondary/10 rounded-lg border px-4 py-2 text-sm'>
					<div>当前歌曲：{song.name || '未命名'}</div>
					<div className='text-xs break-all text-gray-500'>{song.url}</div>
					<div className='text-xs text-gray-500'>来源：{song.source === 'upload' ? '上传' : '链接'}</div>
					<button onClick={handleClear} className='mt-1 text-xs text-rose-500'>
						清除自定义歌曲
					</button>
				</div>
			)}

			<div>
				<label className='mb-1 block text-xs text-gray-600'>歌曲名称（显示在音乐卡片上）</label>
				<input
					type='text'
					value={song.name}
					onChange={e => setSong({ ...song, name: e.target.value })}
					placeholder='例如：Close To You'
					className='bg-secondary/10 w-full rounded-lg border px-4 py-2 text-sm'
				/>
			</div>

			<div>
				<label className='mb-1 block text-xs text-gray-600'>上传 mp3 文件</label>
				<input
					ref={fileRef}
					type='file'
					accept='audio/mpeg,.mp3'
					disabled={uploading}
					onChange={e => void handleFile(e.target.files?.[0])}
					className='bg-secondary/10 w-full rounded-lg border px-4 py-2 text-sm'
				/>
				{uploading && <div className='mt-1 text-xs text-gray-500'>正在上传...</div>}
			</div>

			<div>
				<label className='mb-1 block text-xs text-gray-600'>或填入 mp3 链接</label>
				<div className='flex gap-2'>
					<input
						type='url'
						value={linkInput}
						onChange={e => setLinkInput(e.target.value)}
						placeholder='https://example.com/song.mp3'
						className='bg-secondary/10 w-full rounded-lg border px-4 py-2 text-sm'
					/>
					<button onClick={handleUseLink} className='bg-card shrink-0 rounded-xl border px-4 py-2 text-sm'>
						使用链接
					</button>
				</div>
			</div>
		</div>
	)
}
