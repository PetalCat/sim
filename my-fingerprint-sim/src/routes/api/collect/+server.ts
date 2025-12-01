import type { RequestHandler } from '@sveltejs/kit';
import { randomUUID } from 'crypto';
import { eq } from 'drizzle-orm';
import { computeThumbmark } from '$lib/engine/thumbmark';
import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';

export const POST: RequestHandler = async ({ request, getClientAddress }) => {
	try {
		const payload = await request.json();
		const fp = payload?.fingerprint;

		if (!fp || typeof fp !== 'object') {
			return new Response(
				JSON.stringify({ error: 'Request must include `fingerprint` object in the body.' }),
				{
					status: 400,
					headers: { 'content-type': 'application/json' }
				}
			);
		}

		// Sanitize and ensure we have a thumbmark
		const obj = { ...(fp as Record<string, unknown>) };
		if (!obj.id) obj.id = `visitor_${randomUUID()}`;

		let thumbmark: string | null = null;
		if (obj.thumbmark && typeof obj.thumbmark === 'string') {
			thumbmark = obj.thumbmark;
		} else {
			try {
				thumbmark = computeThumbmark(obj as Record<string, unknown>);
			} catch (e) {
				thumbmark = null;
			}
		}

		if (!thumbmark) {
			return new Response(JSON.stringify({ error: 'Unable to compute thumbmark.' }), {
				status: 400,
				headers: { 'content-type': 'application/json' }
			});
		}

		obj.thumbmark = thumbmark;

		const clientIp =
			request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || getClientAddress?.() || null;

		const now = new Date();

		// Upsert by thumbmark to keep only anonymous metadata
		const existing = await db
			.select()
			.from(table.fingerprint)
			.where(eq(table.fingerprint.thumbmark, thumbmark))
			.limit(1);

		if (existing.length > 0) {
			const current = existing[0];
			const visitCount = (current.visitCount ?? 1) + 1;
			await db
				.update(table.fingerprint)
				.set({
					data: JSON.stringify(obj),
					visitCount,
					lastSeen: now,
					lastIp: clientIp ?? current.lastIp ?? null
				})
				.where(eq(table.fingerprint.id, current.id));

			return new Response(
				JSON.stringify({
					fingerprint: obj,
					recognition: {
						seenBefore: true,
						visitCount,
						thumbmark,
						id: current.id,
						firstSeen: current.createdAt,
						lastSeen: now,
						clientIp,
						previousIp: current.lastIp ?? current.firstIp ?? null
					}
				}),
				{
					headers: { 'content-type': 'application/json' }
				}
			);
		}

		// New visitor
		const record = {
			id: String(obj.id),
			thumbmark,
			data: JSON.stringify(obj),
			visitCount: 1,
			createdAt: now,
			lastSeen: now,
			firstIp: clientIp,
			lastIp: clientIp
		};

		await db.insert(table.fingerprint).values(record);

		return new Response(
			JSON.stringify({
				fingerprint: obj,
				recognition: {
					seenBefore: false,
					visitCount: 1,
					thumbmark,
					id: record.id,
					firstSeen: now,
					lastSeen: now,
					clientIp,
					previousIp: null
				}
			}),
			{
				headers: { 'content-type': 'application/json' }
			}
		);
	} catch (e: any) {
		return new Response(JSON.stringify({ error: e?.message ?? String(e) }), {
			status: 400,
			headers: { 'content-type': 'application/json' }
		});
	}
};

export const DELETE: RequestHandler = async ({ request }) => {
	try {
		const payload = await request.json();
		const { thumbmark } = payload;

		if (!thumbmark || typeof thumbmark !== 'string') {
			return new Response(JSON.stringify({ error: 'Request must include `thumbmark` string.' }), {
				status: 400,
				headers: { 'content-type': 'application/json' }
			});
		}

		await db.delete(table.fingerprint).where(eq(table.fingerprint.thumbmark, thumbmark));

		return new Response(JSON.stringify({ success: true }), {
			headers: { 'content-type': 'application/json' }
		});
	} catch (e: any) {
		return new Response(JSON.stringify({ error: e?.message ?? String(e) }), {
			status: 500,
			headers: { 'content-type': 'application/json' }
		});
	}
};
