'use client'

import { motion } from 'motion/react'
import { useEffect, useRef } from 'react'
import { useEditor, EditorContent, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Markdown } from '@tiptap/markdown'
import Link from '@tiptap/extension-link'
import { Placeholder } from '@tiptap/extensions'
import { useWriteStore } from '../stores/write-store'
import { INIT_DELAY } from '@/consts'
import { ResolvedImage } from '../extensions/resolved-image'
import { extractFirstH1, normalizeLeadingH1 } from '../lib/md-title'
import { handleWriteEditorPaste, imagesToMarkdown, insertImageMarkdownAt } from '../lib/editor-paste'

function setLink(editor: Editor) {
	const previous = editor.getAttributes('link').href as string | undefined
	const url = window.prompt('链接 URL', previous || 'https://')
	if (url === null) return

	if (url === '') {
		editor.chain().focus().extendMarkRange('link').unsetLink().run()
		return
	}

	editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
}

export function WriteEditor() {
	const { form, updateForm, addFiles } = useWriteStore()
	const addFilesRef = useRef(addFiles)
	const editorRef = useRef<Editor | null>(null)
	const lastEmittedMd = useRef(form.md)

	addFilesRef.current = addFiles

	const editor = useEditor({
		immediatelyRender: false,
		extensions: [
			StarterKit.configure({
				heading: { levels: [1, 2, 3, 4] },
				link: false
			}),
			Link.configure({
				openOnClick: false,
				autolink: true,
				HTMLAttributes: {
					class: 'text-blue-500 underline underline-offset-2'
				}
			}),
			ResolvedImage,
			Placeholder.configure({
				placeholder: '用 # 标题 开始写作…'
			}),
			Markdown.configure({
				indentation: { style: 'space', size: 2 }
			})
		],
		content: form.md,
		contentType: 'markdown',
		onCreate: ({ editor: e }) => {
			editorRef.current = e
			lastEmittedMd.current = e.getMarkdown()
		},
		onDestroy: () => {
			editorRef.current = null
		},
		onUpdate: ({ editor: e }) => {
			// TipTap keeps bold marks inside h1 as `# **title**` — normalize before storing
			const md = normalizeLeadingH1(e.getMarkdown())
			lastEmittedMd.current = md
			updateForm({ md, title: extractFirstH1(md) })
		},
		editorProps: {
			attributes: {
				class: 'prose tiptap-editor min-h-[600px] w-full outline-none'
			},
			handleKeyDown: (_view, event) => {
				if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
					event.preventDefault()
					const current = editorRef.current
					if (current) setLink(current)
					return true
				}
				return false
			},
			handlePaste: (_view, event) => {
				return handleWriteEditorPaste(editorRef.current, addFilesRef.current, event)
			},
			handleDrop: (view, event, _slice, moved) => {
				if (moved) return false

				const files = event.dataTransfer?.files
				if (files && files.length > 0) {
					const imageFiles = Array.from(files).filter(f => f.type.startsWith('image/'))
					if (imageFiles.length > 0) {
						event.preventDefault()
						const coords = view.posAtCoords({ left: event.clientX, top: event.clientY })
						addFilesRef.current(imageFiles).then(resultImages => {
							const current = editorRef.current
							if (!current || resultImages.length === 0) return
							insertImageMarkdownAt(current, imagesToMarkdown(resultImages), coords?.pos)
						})
						return true
					}
				}

				const md = event.dataTransfer?.getData('text/markdown') || event.dataTransfer?.getData('text/plain') || ''
				const trimmed = md.trim()
				if (trimmed && /^!\[[^\]]*\]\([^)]+\)/.test(trimmed)) {
					event.preventDefault()
					const coords = view.posAtCoords({ left: event.clientX, top: event.clientY })
					const current = editorRef.current
					if (current) {
						insertImageMarkdownAt(current, trimmed, coords?.pos)
					}
					return true
				}

				return false
			}
		}
	})

	// Sync external markdown changes (import MD / load blog)
	useEffect(() => {
		if (!editor) return
		if (form.md === lastEmittedMd.current) return
		lastEmittedMd.current = form.md
		editor.commands.setContent(form.md, { contentType: 'markdown', emitUpdate: false })
		updateForm({ title: extractFirstH1(form.md) })
	}, [form.md, editor, updateForm])

	return (
		<motion.div
			initial={{ opacity: 0, scale: 0.8 }}
			animate={{ opacity: 1, scale: 1 }}
			transition={{ delay: INIT_DELAY }}
			className='bg-card flex min-h-[800px] w-[800px] flex-col rounded-[40px] border p-6 shadow'>
			<div className='h-[650px] w-full flex-1 overflow-y-auto rounded-xl text-sm'>
				<EditorContent editor={editor} />
			</div>
		</motion.div>
	)
}
