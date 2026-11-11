'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { DialogModal } from '@/components/dialog-modal'
import { useAuthStore } from '@/hooks/use-auth'

// Password login for the server backend. The site has exactly one admin
// account, JunCraft666 (provisioned on the server, no registration). The
// account name is shown fixed; only the password is entered. The token is
// stored in localStorage by the auth store and sent as a Bearer token on
// write calls.
export const ADMIN_USERNAME = 'JunCraft666'

export function AdminLoginModal({ open, onClose }: { open: boolean; onClose: () => void }) {
	const login = useAuthStore(s => s.login)
	const [password, setPassword] = useState('')
	const [loading, setLoading] = useState(false)

	useEffect(() => {
		if (open) {
			setPassword('')
		}
	}, [open])

	const submit = async () => {
		if (!password) {
			toast.error('请输入管理密码')
			return
		}
		setLoading(true)
		try {
			await login(ADMIN_USERNAME, password)
			toast.success('登录成功')
			setPassword('')
			onClose()
		} catch (error: any) {
			toast.error(error?.message || '登录失败')
		} finally {
			setLoading(false)
		}
	}

	return (
		<DialogModal open={open} onClose={onClose}>
			<div className='bg-card w-[min(92vw,360px)] rounded-2xl border p-6 shadow-xl'>
				<h2 className='text-lg font-semibold'>管理登录</h2>
				<p className='text-muted-foreground mt-1 text-sm'>输入管理密码后即可发布、编辑和删除文章，以及保存各管理页的内容。</p>
				<label className='mt-4 block text-xs text-muted-foreground'>账号</label>
				<input type='text' value={ADMIN_USERNAME} disabled className='mt-1 w-full rounded-xl border bg-background/60 px-3 py-2 text-sm outline-none' />
				<label className='mt-3 block text-xs text-muted-foreground'>密码</label>
				<input
					type='password'
					value={password}
					onChange={e => setPassword(e.target.value)}
					onKeyDown={e => {
						if (e.key === 'Enter') void submit()
					}}
					placeholder='管理密码'
					autoFocus
					className='mt-1 w-full rounded-xl border bg-background px-3 py-2 text-sm outline-none'
				/>
				<div className='mt-4 flex justify-end gap-2'>
					<button onClick={onClose} className='rounded-xl border px-4 py-2 text-sm' disabled={loading}>
						取消
					</button>
					<button onClick={() => void submit()} className='brand-btn px-5' disabled={loading}>
						{loading ? '登录中…' : '登录'}
					</button>
				</div>
			</div>
		</DialogModal>
	)
}
