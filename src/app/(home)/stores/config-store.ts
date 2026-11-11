import { create } from 'zustand'
import siteContent from '@/config/site-content.json'
import cardStyles from '@/config/card-styles.json'
import { fetchDataJson } from '@/lib/server-api'

export type SiteContent = typeof siteContent
export type CardStyles = typeof cardStyles

interface ConfigStore {
	siteContent: SiteContent
	cardStyles: CardStyles
	regenerateKey: number
	configDialogOpen: boolean
	setSiteContent: (content: SiteContent) => void
	setCardStyles: (styles: CardStyles) => void
	resetSiteContent: () => void
	resetCardStyles: () => void
	regenerateBubbles: () => void
	setConfigDialogOpen: (open: boolean) => void
}

export const useConfigStore = create<ConfigStore>((set, get) => ({
	siteContent: { ...siteContent },
	cardStyles: { ...cardStyles },
	regenerateKey: 0,
	configDialogOpen: false,
	setSiteContent: (content: SiteContent) => {
		set({ siteContent: content })
	},
	setCardStyles: (styles: CardStyles) => {
		set({ cardStyles: styles })
	},
	resetSiteContent: () => {
		set({ siteContent: { ...siteContent } })
	},
	resetCardStyles: () => {
		set({ cardStyles: { ...cardStyles } })
	},
	regenerateBubbles: () => {
		set(state => ({ regenerateKey: state.regenerateKey + 1 }))
	},
	setConfigDialogOpen: (open: boolean) => {
		set({ configDialogOpen: open })
	}
}))

let runtimeConfigLoaded = false

/** Load the server-saved site config once (the bundled JSON is only the
 *  first-load fallback). Called from the root layout on the client; the
 *  layout's metadata still uses the build-time values. */
export async function loadRuntimeConfig(): Promise<void> {
	if (runtimeConfigLoaded) return
	runtimeConfigLoaded = true
	const [siteContentData, cardStylesData] = await Promise.all([
		fetchDataJson<SiteContent>('site-content'),
		fetchDataJson<CardStyles>('card-styles')
	])
	if (siteContentData) {
		useConfigStore.setState({ siteContent: siteContentData })
	}
	if (cardStylesData) {
		useConfigStore.setState({ cardStyles: cardStylesData })
	}
}

