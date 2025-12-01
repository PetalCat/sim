export function flatten(obj: any, prefix = ''): string[] {
	const tokens: string[] = [];

	for (const key in obj) {
		const value = obj[key];
		const p = prefix ? `${prefix}.${key}` : key;

		if (Array.isArray(value)) {
			for (const v of value) tokens.push(`${p}:${v}`);
		} else if (typeof value === 'object' && value !== null) {
			tokens.push(...flatten(value, p));
		} else {
			tokens.push(`${p}:${value}`);
		}
	}

	return tokens;
}
