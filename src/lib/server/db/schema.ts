import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const user = sqliteTable('user', {
	id: text('id').primaryKey(),
	age: integer('age')
});

export const session = sqliteTable('session', {
	id: text('id').primaryKey(),
	userId: text('user_id')
		.notNull()
		.references(() => user.id),
	expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull()
});

export type Session = typeof session.$inferSelect;

export type User = typeof user.$inferSelect;

export const fingerprint = sqliteTable(
	'fingerprint',
	{
		id: text('id').primaryKey(),
		thumbmark: text('thumbmark').notNull(),
		data: text('data').notNull(),
		visitCount: integer('visit_count', { mode: 'number' }).notNull().default(1),
		createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
		lastSeen: integer('last_seen', { mode: 'timestamp' }).notNull(),
		firstIp: text('first_ip'),
		lastIp: text('last_ip')
	},
	(table) => ({
		thumbmarkIdx: uniqueIndex('fingerprint_thumbmark_idx').on(table.thumbmark)
	})
);

export type Fingerprint = typeof fingerprint.$inferSelect;
