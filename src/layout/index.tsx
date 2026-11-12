'use client'
import { PropsWithChildren, useEffect } from 'react'
import { useCenterInit } from '@/hooks/use-center'
import BlurredBubblesBackground from './backgrounds/blurred-bubbles'
import NavCard from '@/components/nav-card'
import { Toaster } from 'sonner'
import { CircleCheckIcon, InfoIcon, Loader2Icon, OctagonXIcon, TriangleAlertIcon } from 'lucide-react'
import { useSize, useSizeInit } from '@/hooks/use-size'
import { loadRuntimeConfig, useConfigStore } from '@/app/(home)/stores/config-store'
import { ScrollTopButton } from '@/components/scroll-top-button'
import MusicCard from '@/components/music-card'
import { AdminLoginModal } from '@/components/admin-login-modal'
import { useAuthStore } from '@/hooks/use-auth'
import { usePathname } from 'next/navigation'

export default function Layout({ children }: PropsWithChildren) {
	useCenterInit()
	useSizeInit()
	const pathname = usePathname()
	const { cardStyles, siteContent, regenerateKey } = useConfigStore()
	const { maxSM, init } = useSize()
	const loginModalOpen = useAuthStore(s => s.loginModalOpen)
	const setLoginModalOpen = useAuthStore(s => s.setLoginModalOpen)

	// Site config (title, avatar, social links, colors, ...) is saved on
	// the server now; load it once so the visible UI reflects saved values.
	useEffect(() => {
		void loadRuntimeConfig()
	}, [])

	// Favicon: the built <link rel='icon' href='/favicon.png'> is static.
	// A URL set in 网站设置 (siteContent.faviconUrl) overrides it at runtime.
	const faviconUrl = siteContent.faviconUrl
	useEffect(() => {
		const link = document.querySelector("link[rel='icon']") as HTMLLinkElement | null
		if (!link) return
		link.href = faviconUrl && faviconUrl.trim() ? faviconUrl.trim() : '/favicon.png'
	}, [faviconUrl])

	const backgroundImages = (siteContent.backgroundImages ?? []) as Array<{ id: string; url: string }>
	const currentBackgroundImageId = siteContent.currentBackgroundImageId
	const currentBackgroundImage =
		currentBackgroundImageId && currentBackgroundImageId.trim() ? backgroundImages.find(item => item.id === currentBackgroundImageId) : null

	return (
		<>
			<Toaster
				position='bottom-right'
				richColors
				icons={{
					success: <CircleCheckIcon className='size-4' />,
					info: <InfoIcon className='size-4' />,
					warning: <TriangleAlertIcon className='size-4' />,
					error: <OctagonXIcon className='size-4' />,
					loading: <Loader2Icon className='size-4 animate-spin' />
				}}
				style={
					{
						'--border-radius': '12px'
					} as React.CSSProperties
				}
			/>
			{currentBackgroundImage && (
				<div
					className='fixed inset-0 z-0 overflow-hidden'
					style={{
						backgroundImage: `url(${currentBackgroundImage.url})`,
						backgroundSize: 'cover',
						backgroundPosition: 'center',
						backgroundRepeat: 'no-repeat'
					}}
				/>
			)}
			<BlurredBubblesBackground colors={siteContent.backgroundColors} regenerateKey={regenerateKey} />

			{/* min-h-full (not h-full): on the mobile homepage the cards are in-flow
			    and taller than one viewport, so main must be allowed to grow. */}
			<main className='relative z-10 min-h-full'>
				{children}
				<NavCard />

				{cardStyles.musicCard?.enabled !== false && <MusicCard />}
			</main>

			{/* On the mobile homepage the music bar is fixed at the bottom, so the
			    scroll-top button sits above it instead of overlapping its play button. */}
			{maxSM && init && (
				<ScrollTopButton className={pathname === '/' ? 'bg-brand/20 fixed right-6 bottom-24 z-50 shadow-md' : 'bg-brand/20 fixed right-6 bottom-8 z-50 shadow-md'} />
			)}

			{/* Global admin login modal, opened by the edit pages and the
			    site-settings dialog when the user clicks 登录 while logged out. */}
			<AdminLoginModal open={loginModalOpen} onClose={() => setLoginModalOpen(false)} />
		</>
	)
}
