'use client'

import { useEffect, useState } from 'react'
import GridView from './grid-view'
import CreateDialog from './components/create-dialog'
import { pushShares } from './services/push-shares'
import initialList from './list.json'
import type { Share } from './components/share-card'
import type { LogoItem } from './components/logo-upload-dialog'
import { useEditPage } from '@/hooks/use-edit-page'
import { fetchDataJson } from '@/lib/server-api'
import { EditToolbar, EditToolbarAddButton } from '@/components/edit-toolbar'

export default function Page() {
	const [shares, setShares] = useState<Share[]>(initialList as Share[])
	const [originalShares, setOriginalShares] = useState<Share[]>(initialList as Share[])
	const [editingShare, setEditingShare] = useState<Share | null>(null)
	const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
	const [logoItems, setLogoItems] = useState<Map<string, LogoItem>>(new Map())

	// Data lives on the server (/data/share.json); the bundled list.json is
	// only the first-load fallback.
	useEffect(() => {
		let cancelled = false
		fetchDataJson<Share[]>('share').then(d => {
			if (!cancelled && d) {
				setShares(d)
				setOriginalShares(d)
			}
		})
		return () => {
			cancelled = true
		}
	}, [])

	const { isEditMode, setIsEditMode, enterEditMode, isSaving, hideEditButton, buttonText, handleSaveClick } =
		useEditPage()

	const handleUpdate = (updatedShare: Share, oldShare: Share, logoItem?: LogoItem) => {
		setShares(prev => prev.map(s => (s.url === oldShare.url ? updatedShare : s)))
		if (logoItem) {
			setLogoItems(prev => {
				const newMap = new Map(prev)
				newMap.set(updatedShare.url, logoItem)
				return newMap
			})
		}
	}

	const handleAdd = () => {
		setEditingShare(null)
		setIsCreateDialogOpen(true)
	}

	const handleSaveShare = (updatedShare: Share, logoItem?: LogoItem) => {
		if (editingShare) {
			setShares(shares.map(s => (s.url === editingShare.url ? updatedShare : s)))
		} else {
			setShares([...shares, updatedShare])
		}
		if (logoItem) {
			setLogoItems(prev => {
				const newMap = new Map(prev)
				newMap.set(updatedShare.url, logoItem)
				return newMap
			})
		}
	}

	const handleDelete = (share: Share) => {
		if (confirm(`确定要删除 ${share.name} 吗？`)) {
			setShares(shares.filter(s => s.url !== share.url))
		}
	}

	const persist = async () => {
		const updatedShares = await pushShares({ shares, logoItems })
		setShares(updatedShares)
		setOriginalShares(updatedShares)
		setLogoItems(new Map())
	}

	const handleCancel = () => {
		setShares(originalShares)
		setLogoItems(new Map())
		setIsEditMode(false)
	}

	return (
		<>

			<GridView shares={shares} isEditMode={isEditMode} onUpdate={handleUpdate} onDelete={handleDelete} />

			<EditToolbar
				isEditMode={isEditMode}
				isSaving={isSaving}
				hideEditButton={hideEditButton}
				buttonText={buttonText}
				onEdit={enterEditMode}
				onCancel={handleCancel}
				onSave={() => handleSaveClick(persist)}
				extraEditActions={<EditToolbarAddButton onClick={handleAdd} />}
			/>

			{isCreateDialogOpen && <CreateDialog share={editingShare} onClose={() => setIsCreateDialogOpen(false)} onSave={handleSaveShare} />}
		</>
	)
}
