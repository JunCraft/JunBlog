'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { changePasswordRequest } from '@/lib/server-api'
import { useAuthStore } from '@/hooks/use-auth'
import type { SiteContent } from '../stores/config-store'
import { BeianForm } from './site-settings/beian-form'

interface AdminSectionProps {
	formData: SiteContent
	setFormData: React.Dispatch<React.SetStateAction<SiteContent>>
}

export function AdminSection({ formData, setFormData }: AdminSectionProps) {
	const { isAuth, setLoginModalOpen } = useAuthStore()
	const [oldPassword, setOldPassword] = useState('')
	const [newPassword, setNewPassword] = useState('')
	const [confirmPassword, setConfirmPassword] = useState('')
	const [changing, setChanging] = useState(false)

	const handleChangePassword = async () => {
		if (!isAuth) {
			toast.info('请先登录后再修改密码')
			setLoginModalOpen(true)
			return
		}
		if (!oldPassword || !newPassword || !confirmPassword) {
			toast.error('请填写原密码和两次新密码')
			return
		}
		if (newPassword !== confirmPassword) {
			toast.error('两次输入的新密码不一致')
			return
		}
		if (newPassword.length < 6) {
			toast.error('新密码至少 6 位')
			return
		}
		if (newPassword === oldPassword) {
			toast.error('新密码不能和原密码相同')
			return
		}
		setChanging(true)
		try {
			await changePasswordRequest(oldPassword, newPassword)
			toast.success('密码修改成功')
			setOldPassword('')
			setNewPassword('')
			setConfirmPassword('')
		} catch (error: any) {
			toast.error(`修改失败: ${error?.message || '未知错误'}`)
		} finally {
			setChanging(false)
		}
	}

	return (
		<div className='space-y-6'>
			<div className='space-y-2'>
				<label className='mb-2 block text-sm font-medium'>修改密码</label>
				<div className='space-y-2'>
					<input
						type='password'
						value={oldPassword}
						onChange={e => setOldPassword(e.target.value)}
						placeholder='原密码'
						autoComplete='current-password'
						className='bg-secondary/10 w-full rounded-lg border px-4 py-2 text-sm'
					/>
					<input
						type='password'
						value={newPassword}
						onChange={e => setNewPassword(e.target.value)}
						placeholder='新密码（至少 6 位）'
						autoComplete='new-password'
						className='bg-secondary/10 w-full rounded-lg border px-4 py-2 text-sm'
					/>
					<input
						type='password'
						value={confirmPassword}
						onChange={e => setConfirmPassword(e.target.value)}
						placeholder='再次输入新密码'
						autoComplete='new-password'
						className='bg-secondary/10 w-full rounded-lg border px-4 py-2 text-sm'
					/>
				</div>
				<button onClick={handleChangePassword} disabled={changing} className='brand-btn px-6 py-2 text-sm'>
					{changing ? '修改中...' : '修改密码'}
				</button>
				<p className='text-xs text-gray-500'>修改后立即生效，下次登录请用新密码；当前登录状态不受影响。</p>
			</div>

			<BeianForm formData={formData} setFormData={setFormData} />
		</div>
	)
}
