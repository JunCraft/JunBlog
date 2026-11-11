// Singleton audio player for the site-wide music card.
//
// The <audio> element and its play state live OUTSIDE React on purpose:
// the MusicCard sits in the root layout, but navigating between pages can
// remount it (and the card's old unmount cleanup paused the audio and
// cleared src). A remount must never stop the music or restart the track,
// so the card is only a view onto this module-level player.
//
// v5: fixes the music being interrupted when entering /pictures (the
// player now keeps playing and, like other non-home pages, the card sits
// at the bottom-right corner).
import { useEffect, useState } from 'react'

export type MusicSnapshot = {
	isPlaying: boolean
	progress: number
	trackUrl: string | null
	trackName: string
}

let audio: HTMLAudioElement | null = null
let currentUrl: string | null = null
let currentName = ''
let playing = false
let progress = 0
const listeners = new Set<() => void>()

function emit() {
	listeners.forEach(l => l())
}

function ensureAudio(): HTMLAudioElement | null {
	if (typeof window === 'undefined') return null
	if (!audio) {
		audio = new Audio()
		audio.addEventListener('timeupdate', () => {
			if (audio && audio.duration) {
				progress = (audio.currentTime / audio.duration) * 100
				emit()
			}
		})
		audio.addEventListener('loadedmetadata', () => {
			if (audio && audio.duration) {
				progress = (audio.currentTime / audio.duration) * 100
				emit()
			}
		})
		audio.addEventListener('play', () => {
			playing = true
			emit()
		})
		audio.addEventListener('pause', () => {
			playing = false
			emit()
		})
		audio.addEventListener('ended', () => {
			// Single track: loop it instead of stopping.
			if (audio) {
				audio.currentTime = 0
				progress = 0
				if (playing) audio.play().catch(() => {})
				emit()
			}
		})
	}
	return audio
}

/**
 * Switch to a track. No-op when the URL is unchanged, so a card remount
 * or a runtime-config reload never restarts the song from the beginning.
 * When the URL really changes, the new track keeps the previous play
 * state (playing stays playing, paused stays paused).
 */
export function setMusicTrack(url: string, name: string): void {
	const a = ensureAudio()
	if (!a) return
	if (currentUrl === url) {
		if (currentName !== name) {
			currentName = name
			emit()
		}
		return
	}
	const wasPlaying = playing
	currentUrl = url
	currentName = name
	a.pause()
	a.src = url
	a.loop = true
	progress = 0
	emit()
	if (wasPlaying) {
		a.play().catch(() => {})
	}
}

export function toggleMusic(): void {
	const a = ensureAudio()
	if (!a) return
	if (a.paused) {
		a.play().catch(() => {})
	} else {
		a.pause()
	}
}

export function subscribeMusic(listener: () => void): () => void {
	listeners.add(listener)
	return () => {
		listeners.delete(listener)
	}
}

export function getMusicSnapshot(): MusicSnapshot {
	return { isPlaying: playing, progress, trackUrl: currentUrl, trackName: currentName }
}

/** React hook: subscribe to the singleton player and re-render on change. */
export function useMusicPlayer(): MusicSnapshot {
	const [snapshot, setSnapshot] = useState<MusicSnapshot>(() => getMusicSnapshot())
	useEffect(() => {
		const update = () => setSnapshot(getMusicSnapshot())
		update()
		return subscribeMusic(update)
	}, [])
	return snapshot
}
