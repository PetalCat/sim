// Synthetic fingerprint generator (TypeScript)
import { computeThumbmark } from '$lib/engine/thumbmark';

export function generateFakeUsers(count = 100) {
	const OS = ['Windows 10', 'Windows 11', 'macOS 14', 'Ubuntu 22.04', 'Arch Linux'];
	const GPUs = ['RTX 4090', 'GTX 1660', 'Intel Iris', 'AMD 5700XT', 'Apple M2 GPU'];
	const CPUS = ['Intel i9', 'Intel i7', 'Ryzen 9', 'Ryzen 7', 'Apple M2 CPU'];
	const APPS = ['Discord', 'Steam', 'Spotify', 'Editor', 'GameClient', 'PhotoTool'];
	const FONTS = ['Arial', 'Verdana', 'Roboto', 'Fira Code', 'Times'];
	const HOBBIES = ['gaming', 'painting', 'music', 'coding'];
	const FOODS = ['pizza', 'ramen', 'tacos', 'salad'];

	function sample(arr: string[], min = 1, max = 3) {
		const n = Math.floor(Math.random() * (max - min + 1)) + min;
		return [...arr].sort(() => 0.5 - Math.random()).slice(0, n);
	}

	return Array.from({ length: count }, (_, i) => ({
		id: `user_${i}`,
		os: OS[Math.floor(Math.random() * OS.length)],
		gpu: GPUs[Math.floor(Math.random() * GPUs.length)],
		cpu: CPUS[Math.floor(Math.random() * CPUS.length)],
		apps: sample(APPS, 1, 4),
		fonts: sample(FONTS, 1, 4),
		hobbies: sample(HOBBIES, 1, 3),
		foods: sample(FOODS, 1, 3),
		cats: Math.floor(Math.random() * 40),
		shoeSize: Math.floor(Math.random() * 8) + 6
	})).map((u) => ({ ...u, thumbmark: computeThumbmark(u) }));
}

export const fakeUsers = generateFakeUsers(200);
