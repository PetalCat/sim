import type { RequestHandler } from '@sveltejs/kit';
import { bestMatches } from '$lib/engine/matcher';
import { randomUUID } from 'crypto';
import { computeThumbmark } from '$lib/engine/thumbmark';

function ensureIdAndThumb(u: unknown, idx: number) {
	// If the user is an object and already has an `id`, keep it; otherwise create one.
	if (u && typeof u === 'object' && !Array.isArray(u)) {
		const obj = u as Record<string, unknown>;
		if (!obj.id) obj.id = `user_${randomUUID()}`;
		if (!obj.thumbmark) obj.thumbmark = computeThumbmark(obj);
		return obj;
	}

	// If a non-object is provided, coerce into an object with a generated id and value field.
	return { id: `user_${randomUUID()}`, value: u, thumbmark: computeThumbmark({ value: u }) };
}

export const POST: RequestHandler = async ({ request }) => {
	try {
		const payload = await request.json();

		// Expect the client to send `{ query: {...}, users: [...] }`.
		const query = payload?.query;
		const users = payload?.users;

		if (!query || !users || !Array.isArray(users)) {
			return new Response(
				JSON.stringify({ error: 'Request must include `query` and a `users` array in the body.' }),
				{
					status: 400,
					headers: { 'content-type': 'application/json' }
				}
			);
		}

		// Normalize users: coerce non-objects, ensure every user has an `id` and a `thumbmark`.
		const normalized = users.map((u: unknown, i: number) => ensureIdAndThumb(u, i));

		const results = bestMatches(query, normalized, 10);
		return new Response(JSON.stringify({ results }), {
			headers: { 'content-type': 'application/json' }
		});
	} catch (e: any) {
		return new Response(JSON.stringify({ error: e?.message ?? String(e) }), {
			status: 400,
			headers: { 'content-type': 'application/json' }
		});
	}
};
