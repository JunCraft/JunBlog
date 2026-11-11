'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { useAuthStore } from '@/hooks/use-auth'
import { useConfigStore } from '@/app/(home)/stores/config-store'

type UseEditPageOptions = {
	/** Ctrl/Cmd+, enters edit mode (default true) */
	enableShortcut?: boolean
	onEnterEdit?: () => void
}

/**
 * Shared edit-mode + save for list CMS pages. Saving goes to the server
 * backend and requires the admin login: while logged out the save button
 * reads 登录 and opens the login/register modal; after a successful login
 * the pending save runs automatically.
 */
export function useEditPage(options: UseEditPageOptions = {}) {
	const { enableShortcut = true, onEnterEdit } = options
	const [isEditMode, setIsEditMode] = useState(false)
	const [isSaving, setIsSaving] = useState(false)
	const pendingSaveRef = useRef<(() => Promise<void>) | null>(null)

	const { isAuth, loginModalOpen, setLoginModalOpen } = useAuthStore()
	const hideEditButton = useConfigStore(s => s.siteContent.hideEditButton ?? false)

	const enterEditMode = useCallback(() => {
		setIsEditMode(true)
		onEnterEdit?.()
	}, [onEnterEdit])

	useEffect(() => {
		if (!enableShortcut) return

		const handleKeyDown = (e: KeyboardEvent) => {
			if (!isEditMode && (e.ctrlKey || e.metaKey) && e.key === ',') {
				e.preventDefault()
				enterEditMode()
			}
		}

		window.addEventListener('keydown', handleKeyDown)
		return () => window.removeEventListener('keydown', handleKeyDown)
	}, [isEditMode, enableShortcut, enterEditMode])

	const runSave = useCallback(async (save: () => Promise<void>) => {
		setIsSaving(true)
		try {
			await save()
			setIsEditMode(false)
		} catch (error: any) {
			console.error('Failed to save:', error)
			toast.error(`保存失败: ${error?.message || '未知错误'}`)
		} finally {
			setIsSaving(false)
		}
	}, [])

	const handleSaveClick = useCallback(
		(save: () => Promise<void>) => {
			if (!isAuth) {
				// Remember the save; it runs automatically once the
				// login/register modal closes with a successful login.
				pendingSaveRef.current = save
				setLoginModalOpen(true)
			} else {
				void runSave(save)
			}
		},
		[isAuth, runSave, setLoginModalOpen]
	)

	// When the login modal closes, either run the pending save (logged in)
	// or drop it (cancelled without logging in).
	useEffect(() => {
		if (loginModalOpen) return
		const save = pendingSaveRef.current
		if (!save) return
		pendingSaveRef.current = null
		if (isAuth) {
			void runSave(save)
		}
	}, [loginModalOpen, isAuth, runSave])

	return {
		isEditMode,
		setIsEditMode,
		enterEditMode,
		isSaving,
		isAuth,
		hideEditButton,
		buttonText: isAuth ? '保存' : '登录',
		handleSaveClick,
		runSave
	}
}
