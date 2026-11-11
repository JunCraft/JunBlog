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
