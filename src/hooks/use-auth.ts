import { create } from 'zustand'
import { clearAllAuthCache, getAuthToken as getToken, getPemFromCache, savePemToCache } from '@/lib/auth'
import { useConfigStore } from '@/app/(home)/stores/config-store'
import { getAdminToken, loginRequest, setAdminToken } from '@/lib/server-api'

// Auth is the server backend with one fixed admin account (JunCraft666):
// login checks username + password and returns a token, kept in
// localStorage and sent as a Bearer token on write calls. There is no
// registration: the account is provisioned on the server (admin.json).
// The old GitHub .pem flow is no longer surfaced in the UI; its helpers
// below are kept only so the GitHub client library still compiles.
interface AuthStore {
	// State
	isAuth: boolean
	privateKey: string | null
	token: string | null
	/** Global admin login modal, opened by the edit pages when
	 *  the user clicks 登录 while logged out. */
	loginModalOpen: boolean
	setLoginModalOpen: (open: boolean) => void

	// Server-backend auth
	login: (username: string, password: string) => Promise<void>
	logout: () => void

	// GitHub auth (legacy, no longer used by any page)
	setPrivateKey: (key: string) => void
	clearAuth: () => void
	refreshAuthState: () => void
	getAuthToken: () => Promise<string>
}

export const useAuthStore = create<AuthStore>((set, get) => ({
	isAuth: false,
	privateKey: null,
	token: getAdminToken(),
	loginModalOpen: false,
	setLoginModalOpen: (open: boolean) => {
		set({ loginModalOpen: open })
	},

	login: async (username: string, password: string) => {
		const token = await loginRequest(username, password)
		setAdminToken(token)
		set({ token, isAuth: true })
	},

	logout: () => {
		setAdminToken(null)
		set({ token: null })
		void get().refreshAuthState()
	},

	setPrivateKey: async (key: string) => {
		set({ isAuth: true, privateKey: key })
		const { siteContent } = useConfigStore.getState()
		if (siteContent?.isCachePem) {
			await savePemToCache(key)
		}
	},

	clearAuth: () => {
		clearAllAuthCache()
		setAdminToken(null)
		set({ isAuth: false, token: null })
	},

	refreshAuthState: async () => {
		set({ isAuth: !!getAdminToken() })
	},

	getAuthToken: async () => {
		const token = await getToken()
		get().refreshAuthState()
		return token
	}
}))

getPemFromCache().then((key) => {
	if (key) {
		useAuthStore.setState({ privateKey: key })
	}
})

if (getAdminToken()) {
	useAuthStore.setState({ isAuth: true })
}
