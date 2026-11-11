// Helpers for markdown images pasted/typed into the tiptap editor.

/**
 * True when the pasted text is only markdown image syntax, e.g.
 * `![alt](/images/x.png)` — possibly several, separated by whitespace.
 * Mixed text (prose plus an image) is not treated as image-only, so a
 * normal text paste keeps its literal wording.
 */
const IMAGE_MARKDOWN_ONLY = /^\s*(?:!\[[^\]]*\]\([^)\s]+\)\s*)+$/

export function isImageMarkdownOnly(text: string): boolean {
	return IMAGE_MARKDOWN_ONLY.test(text)
}

export type ParsedImageMarkdown = { alt: string; src: string; title?: string }

/** Extract every `![alt](src ["title"])` occurrence from the text. */
const IMAGE_MARKDOWN_RE = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+["']([^"')]+)["'])?\)/g

export function parseImageMarkdown(text: string): ParsedImageMarkdown[] {
	const out: ParsedImageMarkdown[] = []
	IMAGE_MARKDOWN_RE.lastIndex = 0
	let m: RegExpExecArray | null
	while ((m = IMAGE_MARKDOWN_RE.exec(text)) !== null) {
		out.push({ alt: m[1] ?? '', src: m[2], title: m[3] || undefined })
	}
	return out
}
