// Jaccard between token sets
export function jaccard(a: string[], b: string[]) {
	const A = new Set(a);
	const B = new Set(b);
	const inter = [...A].filter((x) => B.has(x)).length;
	const union = new Set([...A, ...B]).size;
	return union === 0 ? 0 : inter / union;
}

function isNumber(x: unknown): x is number {
	return typeof x === 'number';
}

export function fieldSimilarity(qVal: any, uVal: any): number {
	// Numeric (cats, shoeSize, etc)
	if (isNumber(qVal) && isNumber(uVal)) {
		const diff = Math.abs(qVal - uVal);
		return Math.max(0, 1 - diff / 10);
	}

	// Arrays (apps, fonts)
	if (Array.isArray(qVal) || Array.isArray(uVal)) {
		const A = new Set(Array.isArray(qVal) ? qVal : [qVal]);
		const B = new Set(Array.isArray(uVal) ? uVal : [uVal]);
		const inter = [...A].filter((x) => B.has(x)).length;
		const union = new Set([...A, ...B]).size;
		return union === 0 ? 0 : inter / union;
	}

	// Strings
	if (typeof qVal === 'string' && typeof uVal === 'string') {
		const qs = qVal.toLowerCase();
		const us = uVal.toLowerCase();
		if (qs === us) return 1;
		if (qs.includes(us) || us.includes(qs)) return 0.6;
		return 0;
	}

	// Fallback
	return qVal === uVal ? 1 : 0;
}
