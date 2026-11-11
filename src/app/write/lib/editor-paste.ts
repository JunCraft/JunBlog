// Paste/drop handling for the write editor.
//
// Kept free of React so the paste path can be exercised in a plain node
// test with a real Tiptap editor + a real ClipboardEvent (see
// blog-eval/paste-test/). The editor component (editor.tsx) only delegates
// its editorProps.handlePaste/handleDrop here.

import type { Editor } from '@tiptap/core'
import { isImageMarkdownOnly, parseImageMarkdown } from './md-image'
import type { ImageItem } from '../types'

export type AddFilesFn = (files: File[]) => Promise<ImageItem[]>

export function imagesToMarkdown(items: ImageItem[]) {
	return items.map(item => (item.type === 'url' ? `![](${item.url})` : `![](local-image:${item.id})`)).join('\n')
}

/**
 * Insert markdown image syntax (`![alt](src)` lines) as real image nodes.
 *
 * NOTE: `insertContentAt` has no `contentType: 'markdown'` option — a
 * string is parsed as HTML by `createNodeFromContent`, so the old code
 * passed `{ contentType: 'markdown' }` (silently ignored) and the image
 * syntax landed as literal text on paste/drop. Image nodes are inserted
 * as JSON instead, which `insertContentAt` does understand. This is the
 * same node the typed-input rule creates (`ResolvedImage` input rule),
 * so pasted and typed images behave identically.
 */
export function insertImageMarkdownAt(editor: Editor, markdown: string, pos?: number) {
	const target = pos ?? editor.state.selection.from
	const images = parseImageMarkdown(markdown)
	if (images.length === 0) {
		// Not image markdown — fall back to inserting the text as-is.
		editor.chain().focus().insertContentAt(target, markdown).run()
		return
	}
	const content = images.map(img => ({
		type: 'image',
		attrs: { src: img.src, alt: img.alt, ...(img.title ? { title: img.title } : {}) }
	}))
	editor.chain().focus().insertContentAt(target, content).run()
}

/**
 * `handlePaste` for the write editor. Returns true when the paste was
 * handled (image files, or image-only markdown text), false to let
 * ProseMirror do the default paste.
 */
export function handleWriteEditorPaste(editor: Editor | null, addFiles: AddFilesFn, event: ClipboardEvent): boolean {
	const items = event.clipboardData?.items
	if (items) {
		const imageFiles: File[] = []
		for (let i = 0; i < items.length; i++) {
			const item = items[i]
			if (item.type.startsWith('image/')) {
				const file = item.getAsFile()
				if (file) imageFiles.push(file)
			}
		}

		if (imageFiles.length > 0) {
			event.preventDefault()
			addFiles(imageFiles).then(resultImages => {
				if (!editor || resultImages.length === 0) return
				insertImageMarkdownAt(editor, imagesToMarkdown(resultImages))
			})
			return true
		}
	}

	// Pasted markdown image syntax (e.g. `![alt](/images/x.png)`) is
	// otherwise inserted as literal text — parse it into real image nodes
	// instead. Only pure image pastes are converted; mixed text keeps its
	// literal wording (known limitation).
	const text = event.clipboardData?.getData('text/plain') || ''
	if (isImageMarkdownOnly(text)) {
		event.preventDefault()
		if (editor) insertImageMarkdownAt(editor, text.trim())
		return true
	}

	return false
}
