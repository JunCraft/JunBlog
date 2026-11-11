'use client'

import { useRef } from 'react'
import { toast } from 'sonner'
import { hashFileSHA256 } from '@/lib/file-utils'
import type { SiteContent } from '../../stores/config-store'
import type { FileItem } from './types'

interface FaviconAvatarUploadProps {
	formData: SiteContent
	setFormData: React.Dispatch<React.SetStateAction<SiteContent>>
	faviconItem: FileItem | null
	setFaviconItem: React.Dispatch<React.SetStateAction<FileItem | null>>
	avatarItem: FileItem | null
	setAvatarItem: React.Dispatch<React.SetStateAction<FileItem | null>>
}

// Favicon / Avatar: file upload or an image URL (either one works, same as
// 首页图片 / 背景图片). Selecting a file clears the URL (the upload wins);
// typing a URL clears the pending file (the URL wins). An empty URL means
// "use the uploaded file" (/favicon.png, /images/avatar.png).
export function FaviconAvatarUpload({ formData, setFormData, faviconItem, setFaviconItem, avatarItem, setAvatarItem }: FaviconAvatarUploadProps) {
	const faviconInputRef = useRef<HTMLInputElement>(null)
	const avatarInputRef = useRef<HTMLInputElement>(null)

	const handleFaviconFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0]
		if (!file) return

		if (!file.type.startsWith('image/')) {
			toast.error('请选择图片文件')
			return
		}

		const hash = await hashFileSHA256(file)
		const previewUrl = URL.createObjectURL(file)
		setFaviconItem({ type: 'file', file, previewUrl, hash })
		setFormData(prev => ({ ...prev, faviconUrl: '' }))
		if (e.currentTarget) e.currentTarget.value = ''
	}

	const handleAvatarFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0]
		if (!file) return

		if (!file.type.startsWith('image/')) {
			toast.error('请选择图片文件')
			return
		}

		const hash = await hashFileSHA256(file)
		const previewUrl = URL.createObjectURL(file)
		setAvatarItem({ type: 'file', file, previewUrl, hash })
		setFormData(prev => ({ ...prev, avatarUrl: '' }))
		if (e.currentTarget) e.currentTarget.value = ''
	}

	const handleFaviconUrlChange = (url: string) => {
		setFormData(prev => ({ ...prev, faviconUrl: url }))
		if (url.trim()) setFaviconItem(null)
	}

	const handleAvatarUrlChange = (url: string) => {
		setFormData(prev => ({ ...prev, avatarUrl: url }))
		if (url.trim()) setAvatarItem(null)
	}

	const faviconSrc = faviconItem?.type === 'file' ? faviconItem.previewUrl : formData.faviconUrl?.trim() ? formData.faviconUrl.trim() : '/favicon.png'
	const avatarSrc = avatarItem?.type === 'file' ? avatarItem.previewUrl : formData.avatarUrl?.trim() ? formData.avatarUrl.trim() : '/images/avatar.png'

	return (
		<div className='grid grid-cols-2 gap-4'>
			<div>
				<label className='mb-2 block text-sm font-medium'>Favicon</label>
				<input ref={faviconInputRef} type='file' accept='image/*' className='hidden' onChange={handleFaviconFileSelect} />
				<div className='group relative h-20 w-20 cursor-pointer overflow-hidden rounded-lg border bg-white/60'>
					<img src={faviconSrc} alt='favicon preview' className='h-full w-full object-cover' />
					<div className='pointer-events-none absolute inset-0 flex items-center justify-center rounded-lg bg-black/40 opacity-0 transition-opacity group-hover:opacity-100'>
						<span className='text-xs text-white'>{faviconItem || formData.faviconUrl?.trim() ? '更换' : '上传'}</span>
					</div>

					<div className='absolute inset-0' onClick={() => faviconInputRef.current?.click()} />
				</div>
				<input
					type='url'
					value={formData.faviconUrl ?? ''}
					onChange={e => handleFaviconUrlChange(e.target.value)}
					placeholder='或输入图片 URL'
					className='bg-secondary/10 mt-2 w-full rounded-lg border px-3 py-1.5 text-xs'
				/>
			</div>

			<div>
				<label className='mb-2 block text-sm font-medium'>Avatar</label>
				<input ref={avatarInputRef} type='file' accept='image/*' className='hidden' onChange={handleAvatarFileSelect} />
				<div className='group relative h-20 w-20 cursor-pointer overflow-hidden rounded-full border bg-white/60'>
					<img src={avatarSrc} alt='avatar preview' className='h-full w-full object-cover' />
					<div className='pointer-events-none absolute inset-0 flex items-center justify-center rounded-full bg-black/40 opacity-0 transition-opacity group-hover:opacity-100'>
						<span className='text-xs text-white'>{avatarItem || formData.avatarUrl?.trim() ? '更换' : '上传'}</span>
					</div>
					<div className='absolute inset-0' onClick={() => avatarInputRef.current?.click()} />
				</div>
				<input
					type='url'
					value={formData.avatarUrl ?? ''}
					onChange={e => handleAvatarUrlChange(e.target.value)}
					placeholder='或输入图片 URL'
					className='bg-secondary/10 mt-2 w-full rounded-lg border px-3 py-1.5 text-xs'
				/>
			</div>
		</div>
	)
}
