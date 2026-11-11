'use client'

import Image from '@tiptap/extension-image'
import { InputRule, type NodeType } from '@tiptap/core'
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react'
import { cn } from '@/lib/utils'
import { useWriteStore } from '../stores/write-store'

function ResolvedImageView({ node, selected }: NodeViewProps) {
	const images = useWriteStore(s => s.images)
	const rawSrc = (node.attrs.src as string) || ''

	let src = rawSrc
	if (rawSrc.startsWith('local-image:')) {
		const id = rawSrc.slice('local-image:'.length)
		const found = images.find(img => img.id === id)
		if (found?.type === 'file') {
			src = found.previewUrl
		}
	}

	return (
		<NodeViewWrapper as='div' className={cn('my-4 flex justify-center', selected && 'rounded-xl ring-2 ring-blue-400 ring-offset-2')}>
			<img
				src={src}
				alt={(node.attrs.alt as string) || ''}
				title={(node.attrs.title as string) || undefined}
				className='max-w-[40%] rounded-xl border max-sm:max-w-full'
				draggable={false}
			/>
		</NodeViewWrapper>
	)
}

export const ResolvedImage = Image.extend({
	addNodeView() {
		return ReactNodeViewRenderer(ResolvedImageView)
	},

	// Same pattern as the stock tiptap image input rule, but the stock
	// nodeInputRule handler re-inserts the last character of the match —
	// for this rule that last character is the closing ')', so typing
	// `![alt](url)` left a stray ')' after the image. This handler
	// replaces the matched syntax with the image node and consumes
	// the ')' too.
	addInputRules() {
		return [createImageInputRule(this.type)]
	}
}).configure({
	allowBase64: false
})

// Same regex as the stock @tiptap/extension-image input rule.
const imageInputRegex = /(?:^|\s)(!\[(.+|:?)]\((\S+)(?:(?:\s+)["'](\S+)["'])?\))$/

export function createImageInputRule(nodeType: NodeType) {
	return new InputRule({
		find: imageInputRegex,
		handler: ({ state, range, match }) => {
			const [, , alt, src, title] = match
			const { tr } = state
			const start = range.from
			// match[1] is the image syntax without a leading space.
			const matchStart = start + match[0].lastIndexOf(match[1])
			const end = matchStart + match[1].length
			tr.replaceWith(matchStart, end, nodeType.create({ src, alt, title }))
		}
	})
}
