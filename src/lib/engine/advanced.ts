export function getCanvasFingerprint(): string {
	try {
		const canvas = document.createElement('canvas');
		const ctx = canvas.getContext('2d');
		if (!ctx) return '';

		canvas.width = 200;
		canvas.height = 50;

		// Text with various styles to trigger rendering differences
		ctx.textBaseline = 'top';
		ctx.font = '14px "Arial"';
		ctx.textBaseline = 'alphabetic';
		ctx.fillStyle = '#f60';
		ctx.fillRect(125, 1, 62, 20);
		ctx.fillStyle = '#069';
		ctx.fillText('Fingerprint', 2, 15);
		ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
		ctx.fillText('Fingerprint', 4, 17);

		return canvas.toDataURL();
	} catch (e) {
		return '';
	}
}

const FONT_LIST = [
	'Arial',
	'Helvetica Neue',
	'Courier New',
	'Times New Roman',
	'Verdana',
	'Georgia',
	'Palatino',
	'Garamond',
	'Bookman',
	'Comic Sans MS',
	'Trebuchet MS',
	'Arial Black',
	'Impact',
	'Tahoma',
	'Geneva',
	'Calibri',
	'Cambria',
	'Roboto',
	'Open Sans',
	'Lato',
	'Montserrat',
	'Fira Code',
	'JetBrains Mono',
	'Consolas',
	'Monaco',
	'Source Code Pro',
	'Ubuntu',
	'Segoe UI',
	'San Francisco',
	'PingFang SC' // Common on Chinese Macs
];

export async function detectFonts(): Promise<string[]> {
	if (typeof document === 'undefined') return [];

	const baseFonts = ['monospace', 'sans-serif', 'serif'];
	const testString = 'mmmmmmmmmmlli';
	const testSize = '72px';
	const h = document.getElementsByTagName('body')[0];

	// Create a span for each base font to get baseline dimensions
	const baseWidths: Record<string, number> = {};
	const spans: HTMLSpanElement[] = [];

	for (const base of baseFonts) {
		const s = document.createElement('span');
		s.style.fontSize = testSize;
		s.style.fontFamily = base;
		s.style.visibility = 'hidden';
		s.innerHTML = testString;
		h.appendChild(s);
		baseWidths[base] = s.offsetWidth;
		spans.push(s);
	}

	const detected: string[] = [];

	for (const font of FONT_LIST) {
		let matched = false;
		for (let i = 0; i < baseFonts.length; i++) {
			const base = baseFonts[i];
			const s = spans[i];
			s.style.fontFamily = `"${font}", ${base}`;
			if (s.offsetWidth !== baseWidths[base]) {
				matched = true;
				break;
			}
		}
		if (matched) {
			detected.push(font);
		}
	}

	// Cleanup
	for (const s of spans) {
		h.removeChild(s);
	}

	return detected;
}

export function calculateUniqueness(
	traits: any,
	fontCount: number,
	canvasHash: string
): { score: number; label: string; oneIn: string } {
	let score = 0;

	// Baseline uniqueness
	score += 10;

	// Platform rarity
	if (traits.platform?.includes('Linux')) score += 40;
	else if (traits.platform?.includes('Mac')) score += 10;
	else if (traits.platform?.includes('Win')) score += 5;

	// Browser rarity
	if (traits.userAgent?.includes('Firefox')) score += 15;
	else if (traits.userAgent?.includes('Edge')) score += 10;

	// Hardware
	if ((traits.hardwareConcurrency || 4) > 8) score += 15;
	if ((traits.deviceMemory || 4) >= 16) score += 15;

	// Screen
	const res = `${traits.screen.width}x${traits.screen.height}`;
	if (res !== '1920x1080' && res !== '1366x768' && res !== '1440x900') score += 20;

	// Fonts
	if (fontCount > 10) score += 20;
	if (fontCount > 20) score += 20;

	// Cap at 99.99
	score = Math.min(99.99, score);

	let label = 'Common';
	let oneIn = '1 in 50';

	if (score > 90) {
		label = 'Very Unique';
		oneIn = '1 in 10,000+';
	} else if (score > 70) {
		label = 'Distinct';
		oneIn = '1 in 1,000';
	} else if (score > 40) {
		label = 'Moderately Unique';
		oneIn = '1 in 250';
	}

	return { score, label, oneIn };
}

export function getGPUModel(): string {
	try {
		const canvas = document.createElement('canvas');
		const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
		if (!gl) return 'Unknown GPU';

		const debugInfo = (gl as WebGLRenderingContext).getExtension('WEBGL_debug_renderer_info');
		if (!debugInfo) return 'Unknown GPU';

		const renderer = (gl as WebGLRenderingContext).getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
		return renderer || 'Unknown GPU';
	} catch (e) {
		return 'Unknown GPU';
	}
}

export async function getBatteryStatus(): Promise<{
	level: number;
	charging: boolean;
	supported: boolean;
}> {
	try {
		// @ts-ignore - navigator.getBattery is not in all TS definitions
		if (navigator.getBattery) {
			// @ts-ignore
			const battery = await navigator.getBattery();
			return {
				level: Math.round(battery.level * 100),
				charging: battery.charging,
				supported: true
			};
		}
	} catch (e) {
		// ignore
	}
	return { level: 0, charging: false, supported: false };
}

export async function getInstalledVoices(): Promise<string[]> {
	if (typeof window === 'undefined' || !window.speechSynthesis) return [];

	return new Promise((resolve) => {
		let voices = window.speechSynthesis.getVoices();
		if (voices.length > 0) {
			resolve(voices.map((v) => v.name));
			return;
		}

		window.speechSynthesis.onvoiceschanged = () => {
			voices = window.speechSynthesis.getVoices();
			resolve(voices.map((v) => v.name));
		};

		// Fallback if event never fires
		setTimeout(() => resolve([]), 1000);
	});
}

export function getNetworkInfo() {
	// @ts-ignore
	const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
	if (!conn) return null;
	return {
		downlink: conn.downlink,
		rtt: conn.rtt,
		effectiveType: conn.effectiveType,
		saveData: conn.saveData
	};
}

export async function checkMediaCodecs() {
	if (!navigator.mediaCapabilities) return {};
	const codecs = [
		{ name: 'H.264', type: 'video/mp4; codecs="avc1.42E01E"' },
		{ name: 'VP9', type: 'video/webm; codecs="vp9"' },
		{ name: 'AV1', type: 'video/mp4; codecs="av01.0.05M.08"' },
		{ name: 'HEVC', type: 'video/mp4; codecs="hvc1.1.6.L93.B0"' }
	];

	const results: Record<string, boolean> = {};
	for (const c of codecs) {
		try {
			const res = await navigator.mediaCapabilities.decodingInfo({
				type: 'file',
				video: { contentType: c.type, width: 1920, height: 1080, bitrate: 2646242, framerate: 60 }
			});
			results[c.name] = res.supported;
		} catch (e) {
			results[c.name] = false;
		}
	}
	return results;
}

export async function checkPermissions() {
	if (!navigator.permissions) return {};
	const perms = ['geolocation', 'notifications', 'camera', 'microphone'];
	const results: Record<string, string> = {};

	for (const p of perms) {
		try {
			// @ts-ignore
			const status = await navigator.permissions.query({ name: p });
			results[p] = status.state;
		} catch (e) {
			results[p] = 'unknown';
		}
	}
	return results;
}
