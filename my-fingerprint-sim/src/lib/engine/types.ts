export type SafeFingerprint = {
	userAgent: string | null;
	platform: string | null;
	language: string | null;
	languages: string[];
	timezone: string | null;
	timezoneOffset: number | null;
	screen: {
		width: number | null;
		height: number | null;
		availWidth: number | null;
		availHeight: number | null;
		colorDepth: number | null;
		pixelDepth: number | null;
	};
	viewport: {
		innerWidth: number | null;
		innerHeight: number | null;
		devicePixelRatio: number | null;
	};
	hardwareConcurrency: number | null;
	deviceMemory: number | null;
	maxTouchPoints: number;
	timeSincePageLoadMs: number | null;
	connection: string | null;
	doNotTrack: string | null;
	cookiesEnabled: boolean | null;
};
