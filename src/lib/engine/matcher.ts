import { flatten } from '$lib/engine/flatten';
import { fieldSimilarity, jaccard } from '$lib/engine/similarity';
import { computeThumbmark } from '$lib/engine/thumbmark';

export type MatchResult = {
	user: Record<string, unknown>;
	score: number;
	breakdown?: Record<string, number>;
};

// Now accepts the user list as an argument so the caller (frontend) can provide
// the full dataset. This enables client-driven datasets and makes the API
// stateless with respect to stored fake users.
export function bestMatches(
	query: Record<string, unknown>,
	users: Array<Record<string, unknown>>,
	top = 5
): MatchResult[] {
	const results: MatchResult[] = [];

	for (const user of users) {
		let fieldScore = 0;
		let fieldCount = 0;
		const breakdown: Record<string, number> = {};

		for (const key in query) {
			if (key in user) {
				const s = fieldSimilarity(query[key], user[key]);
				breakdown[key] = s;
				fieldScore += s;
				fieldCount++;
			}
		}

		const fScore = fieldCount === 0 ? 0 : fieldScore / fieldCount;

		// token fallback for unknown fields
		const qTokens = flatten(query);
		const uTokens = flatten(user);
		const tScore = jaccard(qTokens, uTokens);

		// Thumbmark similarity: if both have thumbmark, use a strong weight.
		const qThumb = typeof query.thumbmark === 'string' ? query.thumbmark : computeThumbmark(query);
		const uThumb =
			typeof user.thumbmark === 'string' ? (user.thumbmark as string) : computeThumbmark(user);

		let thumbScore = 0;
		if (qThumb && uThumb) {
			if (qThumb === uThumb) thumbScore = 1;
			else {
				// proportion of matching chars (simple similarity)
				const len = Math.min(qThumb.length, uThumb.length);
				let matches = 0;
				for (let i = 0; i < len; i++) if (qThumb[i] === uThumb[i]) matches++;
				thumbScore = (matches / len) * 0.95;
			}
		}

		// Blend: thumbmark dominant (0.7), field average (0.2), token fallback (0.1)
		const finalScore = thumbScore * 0.7 + fScore * 0.2 + tScore * 0.1;

		results.push({ user, score: finalScore, breakdown });
	}

	return results.sort((a, b) => b.score - a.score).slice(0, top);
}
