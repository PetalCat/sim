import type { RequestHandler } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';

export const GET: RequestHandler = async () => {
	try {
		const rows = await db
			.select({
				id: table.fingerprint.id,
				thumbmark: table.fingerprint.thumbmark,
				data: table.fingerprint.data,
				createdAt: table.fingerprint.createdAt,
				lastSeen: table.fingerprint.lastSeen,
				visitCount: table.fingerprint.visitCount
			})
			.from(table.fingerprint)
			.orderBy(table.fingerprint.createdAt, 'desc')
			.limit(200);

		// parse stored JSON data for convenience
		const parsed = rows.map((r) => ({
			id: r.id,
			thumbmark: r.thumbmark,
			createdAt: r.createdAt,
			lastSeen: r.lastSeen,
			visitCount: r.visitCount,
			data: JSON.parse(r.data)
		}));

		return new Response(JSON.stringify({ fingerprints: parsed }), {
			headers: { 'content-type': 'application/json' }
		});
	} catch (e: any) {
		return new Response(JSON.stringify({ error: e?.message ?? String(e) }), {
			status: 500,
			headers: { 'content-type': 'application/json' }
		});
	}
};
