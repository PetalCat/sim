import type { SafeFingerprint } from './types';

export type StoredFingerprint = {
	thumbmark: string;
	source: 'thumbmarkjs' | 'fallback';
	collectedAt: string;
	traits: SafeFingerprint;
	note?: string;
};

export type RecognitionMeta = {
	seenBefore: boolean;
	visitCount: number;
	thumbmark: string;
	id: string;
	firstSeen: Date | string;
	lastSeen: Date | string;
	clientIp?: string | null;
	previousIp?: string | null;
	ipChanged?: boolean;
};

function arrayChanged(a: Array<unknown> = [], b: Array<unknown> = []) {
	if (a.length !== b.length) return true;
	for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return true;
	return false;
}

export function buildObservations(args: {
	current: StoredFingerprint;
	previous?: StoredFingerprint | null;
	recognition?: RecognitionMeta | null;
}) {
	const { current, previous, recognition } = args;
	const notes: string[] = [];

	if (!previous) {
		notes.push('Local storage had no prior fingerprint — this looks like a first visit or cleared storage.');
	} else if (previous.thumbmark === current.thumbmark) {
		notes.push('Local thumbmark matches the last saved one — fingerprint is stable across sessions.');
	} else {
		notes.push('Thumbmark shifted compared to the last saved copy — device looks new locally.');
	}

	if (recognition) {
		if (recognition.seenBefore) {
			notes.push(`Server recognized this thumbmark (visit #${recognition.visitCount}).`);
			if (!previous) {
				notes.push(
					'Server still linked this device even without a stored local fingerprint — recognition survived client resets.'
				);
			}
			if (recognition.previousIp && recognition.clientIp && recognition.previousIp !== recognition.clientIp) {
				notes.push(
					`IP changed since last visit (${recognition.previousIp} → ${recognition.clientIp}). Recognition persisted across network change or VPN.`
				);
			}
		} else {
			notes.push('Server treated this thumbmark as new.');
		}
	}

	if (previous) {
		if (previous.traits.userAgent !== current.traits.userAgent) {
			notes.push('Browser/OS signature changed — user agent differs from last visit.');
		}
		if (previous.traits.platform !== current.traits.platform) {
			notes.push('Platform string changed; the runtime or device family may differ.');
		}
		if (previous.traits.language !== current.traits.language || arrayChanged(previous.traits.languages, current.traits.languages)) {
			notes.push('Language preferences changed.');
		}
		if (
			previous.traits.screen.width !== current.traits.screen.width ||
			previous.traits.screen.height !== current.traits.screen.height
		) {
			notes.push('Screen resolution changed (resize, external display, or device change).');
		}
		if (previous.traits.viewport.innerWidth !== current.traits.viewport.innerWidth) {
			notes.push('Viewport dimensions shifted — window resized or different viewport scale.');
		}
		if (previous.traits.timezone !== current.traits.timezone) {
			notes.push('Timezone changed — likely a VPN, travel, or virtualized browser profile.');
		}
		if (previous.traits.connection !== current.traits.connection) {
			notes.push('Network connection quality/type changed.');
		}
		if (previous.traits.hardwareConcurrency !== current.traits.hardwareConcurrency) {
			notes.push('Reported CPU concurrency changed — container/VM profile may differ.');
		}
	}

	if (notes.length === 0) {
		notes.push('No notable deviations detected; fingerprint remained consistent.');
	}

	return notes;
}
