import { motion } from 'motion/react'
import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { useWriteStore } from '../stores/write-store'
import { usePreviewStore } from '../stores/preview-store'
import { usePublish } from '../hooks/use-publish'
import { useAuthStore } from '@/hooks/use-auth'
import { AdminLoginModal } from '@/components/admin-login-modal'
import { DialogModal } from '@/components/dialog-modal'

export function WriteActions() {
	const { loading, mode, form, loadBlogForEdit, originalSlug, updateForm } = useWriteStore()
	const { openPreview } = usePreviewStore()
	const { isAuth, onPublish, onDelete } = usePublish()
	const logout = useAuthStore(s => s.logout)
	const [saving, setSaving] = useState(false)
	const [loginOpen, setLoginOpen] = useState(false)
	const [deleteOpen, setDeleteOpen] = useState(false)
	const [deleting, setDeleting] = useState(false)
	const mdInputRef = useRef<HTMLInputElement>(null)
	const router = useRouter()

	const handleImportOrPublish = () => {
		if (!isAuth) {
			setLoginOpen(true)
		} else {
			onPublish()
		}
	}

	const handleCancel = () => {
		if (!window.confirm('放弃本次修改吗？')) {
			return
		}
		if (mode === 'edit' && originalSlug) {
			router.push(`/blog/${originalSlug}`)
		} else {
			router.push('/')
		}
	}

	const buttonText = isAuth ? (mode === 'edit' ? '更新' : '发布') : '登录'

	// Delete used to ask window.confirm(). Native dialogs are unreliable
	// here (auto-dismissed by automated browsers, flaky in some mobile
	// webviews) — a click could produce no dialog, no toast and no
	// navigation at all. Use the in-app DialogModal instead, with its own
	// deleting state so the button is never silently disabled by the
	// shared loading flag.
	const handleDelete = () => {
		if (!isAuth) {
			toast.info('请先登录')
			setLoginOpen(true)
			return
		}
		setDeleteOpen(true)
	}

	const confirmDelete = async () => {
		setDeleting(true)
		try {
			await onDelete()
		} finally {
			setDeleting(false)
			setDeleteOpen(false)
		}
	}

	const handleImportMd = () => {
		mdInputRef.current?.click()
	}

	const handleMdFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0]
		if (!file) return

		try {
			const text = await file.text()
			updateForm({ md: text })
			toast.success('已导入 Markdown 文件')
		} catch (error) {
			toast.error('导入失败，请重试')
		} finally {
			if (e.currentTarget) e.currentTarget.value = ''
		}
	}

	return (
		<>
			<AdminLoginModal open={loginOpen} onClose={() => setLoginOpen(false)} />
			<DialogModal open={deleteOpen} onClose={() => !deleting && setDeleteOpen(false)}>
				<div className='bg-card w-[min(92vw,360px)] rounded-2xl border p-6 shadow-xl'>
					<h2 className='text-lg font-semibold'>删除文章</h2>
					<p className='text-muted-foreground mt-1 text-sm'>
						{form?.title ? `确定删除《${form.title}》吗？该操作不可恢复。` : '确定删除当前文章吗？该操作不可恢复。'}
					</p>
					<div className='mt-4 flex justify-end gap-2'>
						<button onClick={() => setDeleteOpen(false)} className='rounded-xl border px-4 py-2 text-sm' disabled={deleting}>
							取消
						</button>
						<button
							onClick={() => void confirmDelete()}
							className='rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-600'
							disabled={deleting}>
							{deleting ? '删除中…' : '确认删除'}
						</button>
					</div>
				</div>
			</DialogModal>
			<input ref={mdInputRef} type='file' accept='.md' className='hidden' onChange={handleMdFileChange} />

			<ul className='absolute top-4 right-6 flex items-center gap-2'>
				{mode === 'edit' && (
					<>
						<motion.div initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} className='flex items-center gap-2'>
							<div className='rounded-lg border bg-blue-50 px-4 py-2 text-sm text-blue-700'>编辑模式</div>
						</motion.div>

						<motion.button
							initial={{ opacity: 0, scale: 0.6 }}
							animate={{ opacity: 1, scale: 1 }}
							whileHover={{ scale: 1.05 }}
							whileTap={{ scale: 0.95 }}
							className='rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-600 transition-colors hover:bg-red-100'
							disabled={deleting}
							onClick={handleDelete}>
							{deleting ? '删除中…' : '删除'}
						</motion.button>

						<motion.button
							whileHover={{ scale: 1.05 }}
							whileTap={{ scale: 0.95 }}
							onClick={handleCancel}
							disabled={saving}
							className='bg-card rounded-xl border px-4 py-2 text-sm'>
							取消
						</motion.button>
					</>
				)}

				<motion.button
					initial={{ opacity: 0, scale: 0.6 }}
					animate={{ opacity: 1, scale: 1 }}
					whileHover={{ scale: 1.05 }}
					whileTap={{ scale: 0.95 }}
					className='bg-card rounded-xl border px-4 py-2 text-sm'
					disabled={loading}
					onClick={handleImportMd}>
					导入 MD
				</motion.button>
				<motion.button
					initial={{ opacity: 0, scale: 0.6 }}
					animate={{ opacity: 1, scale: 1 }}
					whileHover={{ scale: 1.05 }}
					whileTap={{ scale: 0.95 }}
					className='bg-card rounded-xl border px-4 py-2 text-sm'
					disabled={loading}
					onClick={openPreview}>
					预览
				</motion.button>
				{isAuth && (
					<motion.button
						initial={{ opacity: 0, scale: 0.6 }}
						animate={{ opacity: 1, scale: 1 }}
						whileHover={{ scale: 1.05 }}
						whileTap={{ scale: 0.95 }}
						className='bg-card rounded-xl border px-4 py-2 text-sm'
						onClick={() => {
							logout()
							toast.info('已退出登录')
						}}>
						退出
					</motion.button>
				)}
				<motion.button
					initial={{ opacity: 0, scale: 0.6 }}
					animate={{ opacity: 1, scale: 1 }}
					whileHover={{ scale: 1.05 }}
					whileTap={{ scale: 0.95 }}
					className='brand-btn px-6'
					disabled={loading}
					onClick={handleImportOrPublish}>
					{buttonText}
				</motion.button>
			</ul>
		</>
	)
}
