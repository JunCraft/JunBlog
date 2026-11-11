'use client'

import { useEffect, useMemo } from 'react'
import Card from '@/components/card'
import { useCenterStore } from '@/hooks/use-center'
import { useConfigStore } from '../app/(home)/stores/config-store'
import { CARD_SPACING } from '@/consts'
import MusicSVG from '@/svgs/music.svg'
import PlaySVG from '@/svgs/play.svg'
import { HomeDraggableLayer } from '../app/(home)/home-draggable-layer'
import { Pause } from 'lucide-react'
import { usePathname } from 'next/navigation'
import clsx from 'clsx'
import { setMusicTrack, toggleMusic, useMusicPlayer } from '@/lib/music-player'

const DEFAULT_TRACK_URL = '/music/close-to-you.mp3'
const DEFAULT_TRACK_NAME = 'Close To You'

export default function MusicCard() {
	const pathname = usePathname()
	const center = useCenterStore()
	const { cardStyles, siteContent } = useConfigStore()
	const styles = cardStyles.musicCard
	const hiCardStyles = cardStyles.hiCard
	const clockCardStyles = cardStyles.clockCard
	const calendarCardStyles = cardStyles.calendarCard

	// A custom song (set in 网站设置 → 自定义歌曲) replaces the default
	// track. Only one song is supported; the list below always has one item.
	const customSong: any = (siteContent as any).customSong
	const trackUrl =
		customSong && typeof customSong.url === 'string' && customSong.url && (customSong.source === 'upload' || customSong.source === 'url')
			? (customSong.url as string)
			: DEFAULT_TRACK_URL
	const trackName =
		customSong && typeof customSong.name === 'string' && customSong.name ? (customSong.name as string) : DEFAULT_TRACK_NAME

	// Playback state lives in the module singleton (lib/music-player), not
	// in this component: navigating between pages can remount the card,
	// but the singleton keeps the same <audio> element playing, so the
	// music never stops or restarts when entering /pictures (or any
	// other page). This card is only a view onto that player.
	const { isPlaying, progress } = useMusicPlayer()

	// Keep the singleton on the right track. setMusicTrack is a no-op
	// when the URL is unchanged, so a remount never restarts the song.
	useEffect(() => {
		setMusicTrack(trackUrl, trackName)
	}, [trackUrl, trackName])

	const isHomePage = pathname === '/'

	const position = useMemo(() => {
		// If not on home page, always position at bottom-right corner when playing
		if (!isHomePage) {
			return {
				x: center.width - styles.width - 16,
				y: center.height - styles.height - 16
			}
		}

		// Default position on home page
		return {
			x: styles.offsetX !== null ? center.x + styles.offsetX : center.x + CARD_SPACING + hiCardStyles.width / 2 - styles.offset,
			y: styles.offsetY !== null ? center.y + styles.offsetY : center.y - clockCardStyles.offset + CARD_SPACING + calendarCardStyles.height + CARD_SPACING
		}
	}, [isHomePage, center, styles, hiCardStyles, clockCardStyles, calendarCardStyles])

	const { x, y } = position

	// Hide component if not on home page and not playing
	if (!isHomePage && !isPlaying) {
		return null
	}

	return (
		<HomeDraggableLayer cardKey='musicCard' x={x} y={y} width={styles.width} height={styles.height}>
			<Card order={styles.order} width={styles.width} height={styles.height} x={x} y={y} className={clsx('flex items-center gap-3', !isHomePage && 'fixed')}>
				{siteContent.enableChristmas && (
					<>
						<img
							src='/images/christmas/snow-10.webp'
							alt='Christmas decoration'
							className='pointer-events-none absolute'
							style={{ width: 120, left: -8, top: -12, opacity: 0.8 }}
						/>
						<img
							src='/images/christmas/snow-11.webp'
							alt='Christmas decoration'
							className='pointer-events-none absolute'
							style={{ width: 80, right: -10, top: -12, opacity: 0.8 }}
						/>
					</>
				)}

				<MusicSVG className='h-8 w-8' />

				<div className='flex-1'>
					<div className='text-secondary text-sm'>{trackName}</div>

					<div className='mt-1 h-2 rounded-full bg-white/60'>
						<div className='bg-linear h-full rounded-full transition-all duration-300' style={{ width: `${progress}%` }} />
					</div>
				</div>

				<button onClick={toggleMusic} className='flex h-10 w-10 items-center justify-center rounded-full bg-white transition-opacity hover:opacity-80'>
					{isPlaying ? <Pause className='text-brand h-4 w-4' /> : <PlaySVG className='text-brand ml-1 h-4 w-4' />}
				</button>
			</Card>
		</HomeDraggableLayer>
	)
}
