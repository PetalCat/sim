// Simple deterministic thumbmark generator (cross-platform, no deps)
// It flattens the object and produces a short hex fingerprint.
import { flatten } from './flatten';

function djb2(str: string) {
	let hash = 5381;
	for (let i = 0; i < str.length; i++) {
		hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
	}
	// make unsigned 32-bit
	return hash >>> 0;
}

export function computeThumbmark(obj: Record<string, unknown>): string {
	const tokens = flatten(obj).sort().join('|');
	const h1 = djb2(tokens);
	// combine with length to reduce collisions
	const h2 = djb2(tokens + '|' + tokens.length);
	// produce 16-char hex
	const hex = ((BigInt(h1) << 32n) | BigInt(h2)).toString(16);
	// pad to 16 chars
	return hex.padStart(16, '0').slice(0, 16);
}
