<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import ObservationPanel from '$lib/components/ObservationPanel.svelte';
	import TransparencyModal from '$lib/components/TransparencyModal.svelte';
	import {
		buildObservations,
		type RecognitionMeta,
		type StoredFingerprint
	} from '$lib/engine/observations';
	import { computeThumbmark } from '$lib/engine/thumbmark';
	import {
		getCanvasFingerprint,
		detectFonts,
		getGPUModel,
		getBatteryStatus,
		getInstalledVoices,
		getNetworkInfo,
		checkMediaCodecs,
		checkPermissions
	} from '$lib/engine/advanced';
	import type { SafeFingerprint } from '$lib/engine/types';

	const STORAGE_KEY = 'fingerprint:last';

	let phase = $state<'intro' | 'collecting' | 'result'>('intro');
	let fingerprint = $state<StoredFingerprint | null>(null);
	let baselineFingerprint = $state<StoredFingerprint | null>(null);
	let comparedPrevious = $state<StoredFingerprint | null>(null);
	let rawFingerprint = $state<Record<string, unknown> | null>(null);
	let recognition = $state<RecognitionMeta | null>(null);
	let recognitionSummary = $state<string | null>(null);
	let observations = $state<string[]>([]);
	let error = $state<string | null>(null);
	let loading = $state(false);
	let hasMounted = $state(false);
	let showTransparency = $state(false);
	let transparencyMode = $state<'info' | 'consent'>('info');
	let serverPayload = $state<Record<string, unknown> | null>(null);
	let serverRawResponse = $state<Record<string, unknown> | null>(null);
	let clientGeo = $state<{
		ip: string;
		city?: string;
		region?: string;
		country?: string;
		org?: string;
	} | null>(null);

	let liveOverview = $state({
		browserName: '',
		platform: '',
		timezone: '',
		screenType: '',
		cookiesEnabled: null as boolean | null,
		touchPoints: 0,
		recognized: false,
		visitCount: null as number | null,
		stabilityPercent: null as number | null,
		changesList: [] as string[],
		networkChanged: null as boolean | null,
		deviceChanged: null as boolean | null,
		fingerprintSame: null as boolean | null,
		strongestTrait: '' as string | null,
		weakestTrait: '' as string | null
	});

	let canvasDataUrl = $state('');
	let detectedFonts = $state<string[]>([]);

	let gpuModel = $state('Unknown GPU');
	let battery = $state({ level: 0, charging: false, supported: false });
	let botScore = $state(0); // 0-100% probability of being a bot
	let mouseEvents = $state(0);
	let voices = $state<string[]>([]);
	let networkInfo = $state<any>(null);
	let codecs = $state<Record<string, boolean>>({});
	let permissions = $state<Record<string, string>>({});

	// Interactive Privacy Shield State
	let privacyConfig = $state({
		browser: 'Chrome', // Chrome, Firefox, Brave, Tor
		vpn: false,
		blockers: false,
		privateMode: false
	});

	let privacyScore = $derived(calculatePrivacyScore(privacyConfig));
	let privacyCommentary = $derived(getPrivacyCommentary(privacyConfig));

	function calculatePrivacyScore(config: typeof privacyConfig) {
		let score = 10; // Base score (very low)

		if (config.browser === 'Firefox') score += 20;
		if (config.browser === 'Brave') score += 30;
		if (config.browser === 'Tor') score = 95; // Tor is the gold standard

		if (config.browser !== 'Tor') {
			if (config.vpn) score += 10;
			if (config.blockers) score += 20;
			if (config.privateMode) score += 5; // Private mode helps very little against fingerprinting
		}

		return Math.min(100, score);
	}

	function getPrivacyCommentary(config: typeof privacyConfig) {
		if (config.browser === 'Tor') {
			return "Tor Browser standardizes your fingerprint so you look like every other Tor user. It's the only effective defense against advanced fingerprinting.";
		}
		if (config.browser === 'Chrome' && !config.blockers && !config.vpn) {
			return 'Standard Chrome exposes almost everything. You are highly unique and easy to track across the web.';
		}
		if (config.browser === 'Chrome' && config.privateMode) {
			return 'Private mode only clears cookies. Your screen size, hardware, and canvas hash are still visible.';
		}
		if (config.vpn && !config.blockers) {
			return 'A VPN hides your IP address, but your device fingerprint (canvas, fonts, hardware) is still wide open.';
		}
		if (config.blockers) {
			return 'Blockers stop many tracking scripts from loading, which is a huge win. But if a script gets through, your device is still unique.';
		}
		if (config.browser === 'Firefox' || config.browser === 'Brave') {
			return 'Privacy-focused browsers resist some fingerprinting techniques (like canvas reading), but you are still distinct from other users.';
		}
		return 'Every layer helps, but true anonymity is incredibly difficult to achieve on the modern web.';
	}

	let profile = $state({
		incomeTier: 'Unknown',
		techLiteracy: 'Unknown',
		persona: 'Unknown',
		adTargeting: 'Unknown',
		deviceClass: 'Unknown'
	});

	onMount(() => {
		hasMounted = true;
		const stored = loadStoredFingerprint();
		baselineFingerprint = stored;
		comparedPrevious = stored;

		// Bot detection listener
		window.addEventListener('mousemove', handleMouseMove);
		return () => {
			window.removeEventListener('mousemove', handleMouseMove);
		};
	});

	function handleMouseMove() {
		mouseEvents++;
		// Simple heuristic: bots often don't move mouse or move it perfectly straight.
		// Humans jitter. More events = more human.
		if (mouseEvents > 50) botScore = Math.max(0, botScore - 5);
		else if (mouseEvents < 10) botScore = 80;
		else botScore = 40;
	}

	function loadStoredFingerprint(): StoredFingerprint | null {
		if (typeof localStorage === 'undefined') return null;
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return null;
		try {
			return JSON.parse(raw) as StoredFingerprint;
		} catch (e) {
			console.warn('Could not parse stored fingerprint', e);
			return null;
		}
	}

	function persistFingerprint(fp: StoredFingerprint) {
		if (typeof localStorage === 'undefined') return;
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(fp));
		} catch (e) {
			console.warn('Could not persist fingerprint', e);
		}
	}

	function collectSafeFingerprint(): SafeFingerprint {
		const nav = navigator as any;
		const conn = nav.connection?.effectiveType ?? null;
		const screen = window.screen ?? {};
		return {
			userAgent: navigator.userAgent ?? null,
			platform: navigator.platform ?? null,
			language: navigator.language ?? null,
			languages: Array.isArray(navigator.languages) ? navigator.languages.slice(0, 5) : [],
			timezone: Intl.DateTimeFormat().resolvedOptions().timeZone ?? null,
			timezoneOffset: new Date().getTimezoneOffset(),
			screen: {
				width: screen.width ?? null,
				height: screen.height ?? null,
				availWidth: screen.availWidth ?? null,
				availHeight: screen.availHeight ?? null,
				colorDepth: screen.colorDepth ?? null,
				pixelDepth: screen.pixelDepth ?? null
			},
			viewport: {
				innerWidth: window.innerWidth ?? null,
				innerHeight: window.innerHeight ?? null,
				devicePixelRatio: window.devicePixelRatio ?? null
			},
			hardwareConcurrency: nav.hardwareConcurrency ?? null,
			deviceMemory: nav.deviceMemory ?? null,
			maxTouchPoints: nav.maxTouchPoints ?? 0,
			timeSincePageLoadMs:
				typeof performance !== 'undefined' ? Math.round(performance.now()) : null,
			connection: conn,
			doNotTrack: navigator.doNotTrack ?? null,
			cookiesEnabled: navigator.cookieEnabled ?? null
		};
	}

	function parseBrowserName(ua: string | null) {
		if (!ua) return 'Unknown browser';
		if (ua.includes('Firefox')) return 'Firefox';
		if (ua.includes('Chrome')) return 'Chrome';
		if (ua.includes('Safari') && !ua.includes('Chrome')) return 'Safari';
		if (ua.includes('Edg')) return 'Edge';
		return ua.split(' ')[0];
	}

	function summarizeScreen(traits: SafeFingerprint) {
		const w = traits.screen.width;
		const h = traits.screen.height;
		const dpr = traits.viewport.devicePixelRatio;
		if (w && h) return `${w}×${h}${dpr ? ` @${dpr}x` : ''}`;
		return 'Unknown display';
	}

	function computeChanges(current: SafeFingerprint, previous?: SafeFingerprint | null) {
		if (!previous) return { changes: [] as string[], stability: 100, strongest: '—', weakest: '—' };
		const watched: Array<[string, unknown, unknown, string]> = [
			['userAgent', current.userAgent, previous.userAgent, 'Browser/OS'],
			['platform', current.platform, previous.platform, 'Platform'],
			['language', current.language, previous.language, 'Language'],
			['timezone', current.timezone, previous.timezone, 'Timezone'],
			[
				'screen',
				`${current.screen.width}x${current.screen.height}`,
				`${previous.screen.width}x${previous.screen.height}`,
				'Screen'
			],
			[
				'viewport',
				`${current.viewport.innerWidth}x${current.viewport.innerHeight}`,
				`${previous.viewport.innerWidth}x${previous.viewport.innerHeight}`,
				'Viewport'
			],
			[
				'hardwareConcurrency',
				current.hardwareConcurrency,
				previous.hardwareConcurrency,
				'CPU threads'
			],
			['deviceMemory', current.deviceMemory, previous.deviceMemory, 'Memory'],
			['connection', current.connection, previous.connection, 'Network'],
			['cookiesEnabled', current.cookiesEnabled, previous.cookiesEnabled, 'Cookies']
		];
		const changes: string[] = [];
		let total = 0;
		let stable = 0;
		for (const [, a, b, label] of watched) {
			total++;
			if (a === b) {
				stable++;
			} else {
				changes.push(label);
			}
		}
		const stability = total === 0 ? 100 : Math.round((stable / total) * 100);
		const strongest =
			stable === total
				? 'Most traits stable'
				: changes.length < total
					? 'Most traits stable'
					: 'None';
		const weakest = changes[0] ?? 'None';
		return { changes, stability, strongest, weakest };
	}

	function updateLiveOverview(
		fp: StoredFingerprint,
		prior: StoredFingerprint | null,
		rec: RecognitionMeta | null
	) {
		const changes = computeChanges(fp.traits, prior?.traits);
		liveOverview = {
			browserName: parseBrowserName(fp.traits.userAgent),
			platform: fp.traits.platform ?? 'Unknown platform',
			timezone: fp.traits.timezone ?? 'Unknown timezone',
			screenType: summarizeScreen(fp.traits),
			cookiesEnabled: fp.traits.cookiesEnabled,
			touchPoints: fp.traits.maxTouchPoints ?? 0,
			recognized: rec?.seenBefore ?? false,
			visitCount: rec?.visitCount ?? (rec?.seenBefore ? (rec?.visitCount ?? null) : null),
			stabilityPercent: changes.stability,
			changesList: changes.changes,
			networkChanged: rec?.previousIp && rec?.clientIp ? rec.previousIp !== rec.clientIp : null,
			deviceChanged: changes.changes.length > 2,
			fingerprintSame: prior ? prior.thumbmark === fp.thumbmark : null,
			strongestTrait: changes.strongest,
			weakestTrait: changes.weakest
		};
		profile = deriveProfile(fp.traits);
	}

	let generatedAd = $state<{
		headline: string;
		body: string;
		category: string;
		company: string;
		website: string;
		styles?: {
			backgroundColor: string;
			textColor: string;
			accentColor: string;
			fontFamily: string;
		};
	} | null>(null);

	let generatedPricing = $state<{
		product: string;
		description: string;
		standardPrice: number;
		userPrice: number;
		markupPercentage: number;
		reason: string;
	} | null>(null);
	let isGeneratingAd = $state(false);

	async function generateAd(traits: any, context: any = {}) {
		if (!browser || isGeneratingAd) return;
		isGeneratingAd = true;
		try {
			const res = await fetch('/api/generate-ad', {
				method: 'POST',
				body: JSON.stringify({ traits, profile, context }),
				headers: { 'Content-Type': 'application/json' }
			});
			if (res.ok) {
				const data = await res.json();
				generatedAd = data.ad;
				generatedPricing = data.pricing;
			}
		} catch (e) {
			console.error('Ad generation failed', e);
		} finally {
			isGeneratingAd = false;
		}
	}

	function deriveProfile(traits: SafeFingerprint) {
		const isApple =
			traits.platform?.includes('Mac') ||
			traits.platform?.includes('iPhone') ||
			traits.platform?.includes('iPad');
		const isLinux = traits.platform?.includes('Linux') && !traits.platform?.includes('Android');
		const isWindows = traits.platform?.includes('Win');
		const isFirefox = traits.userAgent?.includes('Firefox');
		const isChrome = traits.userAgent?.includes('Chrome');
		const cores = traits.hardwareConcurrency || 4;
		const mem = traits.deviceMemory || 4;
		const screenWidth = traits.screen.width || 1920;

		let incomeTier = 'Mainstream';
		if (isApple || screenWidth > 2000 || (cores >= 8 && mem >= 16)) {
			incomeTier = 'Premium / High Disposable';
		} else if (screenWidth < 1366 && cores <= 4) {
			incomeTier = 'Budget Conscious';
		}

		let techLiteracy = 'Average';
		if (isLinux || isFirefox || (traits.languages && traits.languages.length > 2)) {
			techLiteracy = 'Tech-Savvy / Advanced';
		} else if (isApple && !isFirefox) {
			techLiteracy = 'Mainstream / Convenience-Oriented';
		}

		let persona = 'The Average User';
		let adTargeting = 'Standard consumer goods, mass-market entertainment.';

		if (incomeTier.includes('Premium') && techLiteracy.includes('Advanced')) {
			persona = 'The Tech Professional';
			adTargeting = 'Enterprise software, high-end gadgets, developer tools, crypto services.';
		} else if (incomeTier.includes('Premium')) {
			persona = 'The Affluent Consumer';
			adTargeting = 'Luxury travel, premium fashion, investment services, high-end electronics.';
		} else if (techLiteracy.includes('Advanced')) {
			persona = 'The Privacy/Tech Enthusiast';
			adTargeting = 'VPNs, privacy tools, gaming hardware, open-source projects.';
		} else if (cores >= 12 || (traits.deviceMemory && traits.deviceMemory >= 16)) {
			persona = 'The Gamer / Power User';
			adTargeting = 'Gaming peripherals, energy drinks, high-performance hardware.';
		} else if (traits.maxTouchPoints > 0) {
			persona = 'The Mobile-First User';
			adTargeting = 'App installs, mobile games, local services, social commerce.';
		}

		let deviceClass = 'Desktop / Laptop';
		if (traits.maxTouchPoints > 0) {
			if (
				traits.userAgent?.includes('Mobile') ||
				traits.userAgent?.includes('Android') ||
				traits.userAgent?.includes('iPhone')
			) {
				deviceClass = 'Smartphone / Tablet';
			} else {
				deviceClass = 'Touch-Enabled Laptop / Hybrid';
			}
		}

		return { incomeTier, techLiteracy, persona, adTargeting, deviceClass };
	}

	async function collectWithThumbmarkjs() {
		try {
			const mod = await import('@thumbmarkjs/thumbmarkjs');
			const anyMod: any = mod;
			const getFp =
				anyMod.getFingerprint ||
				anyMod.getFingerprintData ||
				anyMod.getFingerprintPerformance ||
				anyMod.default?.getFingerprint;
			if (typeof getFp === 'function') {
				const res = await getFp(true);
				if (res && typeof res === 'object') return res;
			}
		} catch (e) {
			console.warn('ThumbmarkJS not available, falling back', e);
		}
		return null;
	}

	function buildRecognitionText(rec: RecognitionMeta | null) {
		if (!rec) return null;
		if (rec.seenBefore)
			return `Your device looks familiar. This is visit #${rec.visitCount?.toString() ?? '1'}.`;
		return 'New visitor. This is the first time this signature has appeared here.';
	}

	async function fetchGeo(ip: string | null | undefined) {
		if (!ip) return null;
		try {
			// Public geolocation API (educational only); errors are swallowed.
			const res = await fetch(`https://ipapi.co/${ip}/json/`);
			if (!res.ok) return null;
			const data = await res.json();
			return {
				ip,
				city: data.city,
				region: data.region,
				country: data.country_name,
				org: data.org
			};
		} catch (e) {
			return null;
		}
	}

	const COLLECT_ENDPOINT = '/api/thumbmark';

	async function sendToServer(fp: StoredFingerprint) {
		const payload = {
			fingerprint: {
				thumbmark: fp.thumbmark,
				source: fp.source,
				collectedAt: fp.collectedAt,
				traits: fp.traits,
				note: fp.note
			}
		};

		console.log('[fingerprint] sending payload to', COLLECT_ENDPOINT, payload);
		serverPayload = payload;

		const res = await fetch(COLLECT_ENDPOINT, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(payload)
		});

		const body = await res.json();
		console.log('[fingerprint] response status', res.status, body);
		serverRawResponse = body;

		if (!res.ok) {
			throw new Error(body?.error || 'Failed to submit fingerprint');
		}

		return (body.recognition as RecognitionMeta) ?? null;
	}

	async function startFingerprint() {
		if (!hasMounted) return;
		error = null;
		loading = true;
		phase = 'collecting';
		console.log('[fingerprint] starting collection');

		const prior = baselineFingerprint;

		// Minimum delay for dramatic effect
		const delayPromise = new Promise((resolve) => setTimeout(resolve, 1400));

		try {
			const safeTraits = collectSafeFingerprint();
			rawFingerprint = safeTraits;

			let source: StoredFingerprint['source'] = 'fallback';
			let thumbmark: string | null = null;
			let raw: Record<string, unknown> | null = null;

			const tm = await collectWithThumbmarkjs();
			if (tm) {
				source = 'thumbmarkjs';
				raw = (tm as any).data || tm;
				thumbmark = (tm as any).hash || (tm as any).thumbmark || null;
				rawFingerprint = raw;
			}

			if (!thumbmark) {
				thumbmark = computeThumbmark(safeTraits as Record<string, unknown>);
			}

			const fp: StoredFingerprint = {
				thumbmark: thumbmark ?? 'unknown',
				source,
				collectedAt: new Date().toISOString(),
				traits: safeTraits,
				note:
					source === 'thumbmarkjs'
						? 'Generated via ThumbmarkJS (hash only sent to server).'
						: 'Fallback hash built from safe, browser-visible fields.'
			};

			fingerprint = fp;
			comparedPrevious = prior;

			recognition = await sendToServer(fp);
			recognitionSummary = buildRecognitionText(recognition);

			updateLiveOverview(fp, prior, recognition);
			clientGeo = await fetchGeo(recognition?.clientIp);

			observations = buildObservations({ current: fp, previous: prior, recognition });

			persistFingerprint(fp);
			baselineFingerprint = fp;

			// Advanced collection (non-blocking for main flow)
			canvasDataUrl = getCanvasFingerprint();
			detectFonts().then((fonts) => {
				detectedFonts = fonts;
			});

			gpuModel = getGPUModel();
			const batteryPromise = getBatteryStatus().then((b) => (battery = b));
			getInstalledVoices().then((v) => (voices = v));
			networkInfo = getNetworkInfo();
			checkMediaCodecs().then((c) => (codecs = c));
			checkPermissions().then((p) => (permissions = p));

			// Wait for battery to include in ad context
			await batteryPromise;

			// Generate ad with full context
			generateAd(fp.traits, {
				time: new Date().toLocaleTimeString(),
				battery: battery ? `${Math.round(battery.level * 100)}%` : 'Unknown',
				charging: battery?.charging ? 'Yes' : 'No',
				gpu: gpuModel,
				region: clientGeo?.region ?? 'Unknown',
				country: clientGeo?.country ?? 'Unknown',
				network: networkInfo?.effectiveType ?? 'Unknown',
				platform: fp.traits.platform
			});

			await delayPromise;
			phase = 'result';
		} catch (e: any) {
			error = e?.message ?? String(e);
			console.error('[fingerprint] collection failed', e);
			phase = 'intro';
		} finally {
			loading = false;
		}
	}

	async function resetLocalFingerprint() {
		if (typeof localStorage === 'undefined') return;

		if (baselineFingerprint?.thumbmark) {
			try {
				await fetch('/api/thumbmark', {
					method: 'DELETE',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ thumbmark: baselineFingerprint.thumbmark })
				});
				alert('Fingerprint data cleared from server and device.');
			} catch (e) {
				console.error('Failed to clear server data', e);
				alert('Cleared local data, but failed to clear server data.');
			}
		}

		localStorage.removeItem(STORAGE_KEY);
		baselineFingerprint = null;
		comparedPrevious = null;
		window.location.reload();
	}
</script>

<svelte:head>
	<title>Fingerprint Demo — Your Device, Explained</title>
</svelte:head>

<main
	class="crt min-h-screen flex flex-col items-center justify-start p-6 relative overflow-hidden"
>
	<!-- Background Elements -->
	<div class="absolute inset-0 pointer-events-none overflow-hidden">
		<!-- Vibrant Technicolor Blobs -->
		<div
			class="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-surveillance-accent/30 rounded-full blur-[120px] mix-blend-multiply animate-pulse"
		></div>
		<div
			class="absolute top-[10%] right-[-10%] w-[50%] h-[60%] bg-surveillance-cyan/30 rounded-full blur-[120px] mix-blend-multiply"
		></div>
		<div
			class="absolute bottom-[-10%] left-[20%] w-[60%] h-[50%] bg-surveillance-yellow/30 rounded-full blur-[120px] mix-blend-multiply"
		></div>
		<div
			class="absolute bottom-[10%] right-[10%] w-[40%] h-[40%] bg-surveillance-green/30 rounded-full blur-[100px] mix-blend-multiply"
		></div>
	</div>

	<!-- Persistent Transparency Button -->
	<!-- Persistent Transparency Button -->
	<button
		class="transparency-btn fixed top-4 right-4 px-3 py-1.5 rounded-full bg-white/80 border border-surveillance-slate/20 text-xs text-surveillance-slate hover:text-surveillance-cloud hover:border-surveillance-accent/70 transition-all backdrop-blur-sm flex items-center gap-2 cursor-pointer shadow-sm hover:shadow-md"
		onclick={() => {
			transparencyMode = 'info';
			showTransparency = true;
		}}
	>
		<span>🛡️</span> Transparency & Data
	</button>

	<section class="max-w-4xl w-full relative z-10 flex flex-col gap-12 pb-20">
		<!-- Hero / Primer -->
		<section class="text-center space-y-6 pt-10">
			<div
				class="inline-block px-3 py-1 rounded-full bg-white/70 border border-surveillance-slate/20 text-xs font-bold tracking-wider text-surveillance-slate uppercase mb-3 shadow-sm"
			>
				Privacy Awareness Demo
			</div>

			<h1 class="text-4xl md:text-6xl font-black tracking-tight text-surveillance-cloud">
				Your device is <span
					class="text-surveillance-accent underline decoration-surveillance-cyan decoration-4 underline-offset-4"
					>more revealing</span
				> than you think.
			</h1>

			<p
				class="text-lg md:text-xl text-surveillance-slate max-w-2xl mx-auto leading-relaxed font-medium"
			>
				Not your name. Your setup. Your habits. The quiet technical clues your device broadcasts on
				every site you visit. This page lets you see what others usually keep invisible.
			</p>

			{#if phase === 'intro'}
				<div class="pt-6 flex flex-col items-center gap-4">
					<button
						onclick={() => {
							transparencyMode = 'consent';
							showTransparency = true;
						}}
						class="group relative inline-flex items-center justify-center px-8 py-3 font-bold text-white transition-all duration-200 bg-surveillance-accent border-2 border-surveillance-accent rounded-lg hover:bg-white hover:text-surveillance-accent hover:border-surveillance-accent focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-surveillance-accent focus:ring-offset-white cursor-pointer shadow-lg hover:shadow-xl hover:-translate-y-0.5"
					>
						<span class="mr-2">Show me what my device reveals</span>
						<span class="group-hover:translate-x-1 transition-transform">→</span>
					</button>

					<p class="text-sm text-surveillance-slate/70 max-w-md">
						Opt-in demo. No personal info requested. Raw fingerprint data stays in your browser;
						this site stores only an anonymous hash and visit counts.
					</p>

					<button
						onclick={() => {
							transparencyMode = 'info';
							showTransparency = true;
						}}
						class="mt-2 px-4 py-2 text-xs font-bold text-surveillance-slate hover:text-surveillance-accent border border-surveillance-slate/20 rounded-full hover:bg-white hover:shadow-md transition-all flex items-center gap-2 cursor-pointer"
					>
						<span>🛡️</span> Read Transparency Report & Data Usage
					</button>
				</div>
			{/if}

			{#if error}
				<div class="p-4 rounded-lg bg-red-900/20 border border-red-500/30 text-red-200 text-sm">
					{error}
				</div>
			{/if}
		</section>

		<!-- Small primer strip -->
		<section
			class="max-w-3xl mx-auto text-center text-sm text-surveillance-slate/80 space-y-2 font-medium"
		>
			<p>
				Every device has a technical signature. Most people never see it. This page shows you the
				same kind of recognition technique that websites use silently; but here, it’s visible,
				consented, and explained.
			</p>
		</section>

		{#if phase === 'collecting'}
			<div
				class="fixed inset-0 z-50 flex items-center justify-center bg-surveillance-charcoal/90 backdrop-blur-sm transition-all duration-500"
			>
				<div class="flex flex-col items-center gap-4">
					<div
						class="w-16 h-16 border-4 border-surveillance-slate/20 border-t-surveillance-accent rounded-full animate-spin"
					></div>
					<div class="text-surveillance-accent font-mono text-sm tracking-widest animate-pulse">
						ANALYZING DEVICE SIGNATURE…
					</div>
					<p class="text-xs text-surveillance-slate/70">
						Reading "harmless" technical traits only – no name, email, or logins.
					</p>
					<p class="text-[10px] text-surveillance-slate/80">
						Browser features, display details, timing behavior, and connection hints.
					</p>
				</div>
			</div>
		{/if}

		{#if fingerprint}
			<!-- DEMO: Recognition Banner -->
			<section
				class="motion-pop bg-white/80 border-2 border-surveillance-accent/20 rounded-2xl p-8 relative overflow-hidden scan-overlay shadow-2xl backdrop-blur-md"
			>
				<div class="relative z-10 space-y-4">
					<div class="flex items-center gap-3 mb-1">
						<div
							class="w-3 h-3 rounded-full {recognition?.seenBefore
								? 'bg-surveillance-accent shadow-[0_0_10px_var(--color-surveillance-accent)]'
								: 'bg-surveillance-cyan shadow-[0_0_10px_var(--color-surveillance-cyan)]'} animate-pulse"
						></div>
						<span class="text-xs font-mono uppercase tracking-widest text-surveillance-slate">
							{recognition?.seenBefore ? 'Device Recognized' : 'New Device Signature'}
						</span>
					</div>

					<h2 class="text-2xl md:text-3xl font-bold text-surveillance-cloud">
						{recognition?.seenBefore
							? 'I recognized your device instantly.'
							: 'Your device now has a visible signature.'}
					</h2>

					<p class="text-base md:text-lg text-surveillance-slate leading-relaxed">
						{#if recognition?.seenBefore}
							{recognitionSummary}
							<br />
							Even if you cleared history, used private mode, or switched networks, your technical setup
							stays recognizable.
						{:else}
							This is the first time this fingerprint has appeared here. From now on, this browser +
							device combination can be recognized without using cookies.
						{/if}
					</p>

					<div
						class="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm text-surveillance-slate/90"
					>
						<div>
							<div class="text-xs uppercase tracking-widest text-surveillance-slate/80">
								Approximate network location
							</div>
							<div class="mt-1 text-surveillance-cloud">
								{#if clientGeo}
									{clientGeo.city || 'Unknown city'}, {clientGeo.region || 'Unknown region'}
									{#if clientGeo.country}
										({clientGeo.country}){/if}
								{:else}
									Unavailable
								{/if}
							</div>
							{#if clientGeo?.org}
								<div class="mt-1 text-xs text-surveillance-slate/70">
									Network / ISP: {clientGeo.org}
								</div>
							{/if}
							<div class="mt-1 text-[11px] text-surveillance-slate/80">
								Based on your IP address for this visit.
							</div>
						</div>

						<div>
							<div class="text-xs uppercase tracking-widest text-surveillance-slate/80">
								IP address (this request)
							</div>
							<div class="mt-1 text-surveillance-cloud">
								{recognition?.clientIp ?? clientGeo?.ip ?? 'Unavailable'}
							</div>
							{#if recognition?.previousIp}
								<div class="mt-2 text-xs text-surveillance-slate/70">
									Previous visit IP: {recognition.previousIp}
									{#if liveOverview.networkChanged}
										<span> (network changed, device didn’t)</span>
									{/if}
								</div>
							{/if}
							<div class="mt-1 text-[11px] text-surveillance-slate/80">
								IP can change with VPNs and Wi-Fi. Your device fingerprint often does not.
							</div>
						</div>
					</div>
				</div>
			</section>

			<!-- Stats Grid: personal but educational -->
			<section class="grid grid-cols-1 md:grid-cols-2 gap-6">
				<!-- Browser -->
				<div class="stat-card punch" style="animation-delay: 0.05s;">
					<div class="stat-header">
						<span class="stat-icon">
							{#if liveOverview.browserName === 'Firefox'}🦊
							{:else if liveOverview.browserName === 'Chrome'}🌐
							{:else if liveOverview.browserName === 'Safari'}🧭
							{:else if liveOverview.browserName === 'Edge'}🪟
							{:else}💻{/if}
						</span>
						<span class="stat-label">Browser</span>
					</div>
					<div class="stat-value">{liveOverview.browserName}</div>
					<div class="stat-commentary">
						{#if liveOverview.browserName === 'Firefox'}
							A privacy-minded choice. Still exposes enough quirks to recognize your setup.
						{:else if liveOverview.browserName === 'Chrome'}
							Very common, but the exact combination of version, settings, and hardware is not.
						{:else if liveOverview.browserName === 'Safari'}
							Strong defaults, but the underlying device still gives you away.
						{:else if liveOverview.browserName === 'Edge'}
							Less popular browsers can stand out even more in fingerprinting datasets.
						{:else}
							An uncommon browser. Ironically, rarity is a stronger signal than commonality.
						{/if}
					</div>
				</div>

				<!-- Platform -->
				<div class="stat-card punch" style="animation-delay: 0.1s;">
					<div class="stat-header">
						<span class="stat-icon">
							{#if liveOverview.platform.includes('Mac')}🍎
							{:else if liveOverview.platform.includes('Win')}🪟
							{:else if liveOverview.platform.includes('Linux')}🐧
							{:else}💾{/if}
						</span>
						<span class="stat-label">Platform</span>
					</div>
					<div class="stat-value">
						{liveOverview.platform === 'Unknown platform'
							? 'Unknown'
							: liveOverview.platform.split(' ')[0]}
					</div>
					<div class="stat-commentary">
						{#if liveOverview.platform.includes('Mac')}
							Apple hardware is very consistent. Great for the user, easy for recognition systems.
						{:else if liveOverview.platform.includes('Win')}
							The Windows ecosystem is huge. That makes your particular combination surprisingly
							distinct.
						{:else if liveOverview.platform.includes('Linux')}
							Linux setups are often unique. That makes you recognizable in datasets.
						{:else}
							An unusual platform. Being an outlier often makes you easier to track.
						{/if}
					</div>
				</div>

				<!-- Location / timezone -->
				<div class="stat-card punch" style="animation-delay: 0.15s;">
					<div class="stat-header">
						<span class="stat-icon">📍</span>
						<span class="stat-label">Region hint</span>
					</div>
					<div class="stat-value">
						{liveOverview.timezone !== 'Unknown timezone'
							? liveOverview.timezone.split('/').pop()
							: 'Unknown'}
					</div>
					<div class="stat-commentary">
						Your timezone and language together give a strong guess about your region. No GPS or
						detailed location needed.
					</div>
				</div>

				<!-- Match Confidence -->
				<div class="stat-card punch" style="animation-delay: 0.2s;">
					<div class="stat-header">
						<span class="stat-icon">
							{#if (liveOverview.stabilityPercent ?? 0) >= 90}✅
							{:else if (liveOverview.stabilityPercent ?? 0) >= 70}⚠️
							{:else}❔{/if}
						</span>
						<span class="stat-label">Signature stability</span>
					</div>
					<div class="stat-value text-surveillance-accent">
						{liveOverview.stabilityPercent ?? 0}%
					</div>
					<div class="stat-commentary">
						{#if (liveOverview.stabilityPercent ?? 0) >= 95}
							Almost everything matched. This device is very easy to recognize.
						{:else if (liveOverview.stabilityPercent ?? 0) >= 80}
							Small changes detected, but the overall fingerprint is still strong.
						{:else if (liveOverview.stabilityPercent ?? 0) >= 50}
							Several traits shifted, but a more advanced tracker would still likely connect the
							dots.
						{:else}
							This looks like a significantly different setup. New device or heavily changed
							browser.
						{/if}
					</div>
				</div>

				<!-- Hardware Exposed -->
				<div class="stat-card punch" style="animation-delay: 0.3s;">
					<div class="stat-header">
						<span class="stat-icon">🔋</span>
						<span class="stat-label">Exposed Hardware</span>
					</div>
					<div class="space-y-3">
						<div>
							<div class="text-xs text-surveillance-slate/80 uppercase tracking-wider">
								GPU Model
							</div>
							<div class="text-sm text-surveillance-cloud font-mono break-words">{gpuModel}</div>
						</div>
						<div>
							<div class="text-xs text-surveillance-slate/80 uppercase tracking-wider">
								Battery Status
							</div>
							<div class="text-sm text-surveillance-cloud">
								{#if battery.supported}
									{battery.level}% • {battery.charging ? '⚡ Charging' : 'Not Charging'}
								{:else}
									<span class="text-surveillance-slate/70">Restricted / Desktop</span>
								{/if}
							</div>
						</div>
					</div>
				</div>

				<!-- Bot Probability -->
				<div class="stat-card punch" style="animation-delay: 0.35s;">
					<div class="stat-header">
						<span class="stat-icon">🤖</span>
						<span class="stat-label">Bot Probability</span>
					</div>
					<div class="text-3xl font-bold {botScore > 50 ? 'text-red-400' : 'text-green-400'}">
						{botScore}%
					</div>
					<div class="stat-commentary">
						Based on your mouse jitter and movement patterns.
						{#if botScore < 20}
							You move like a human.
						{:else}
							Suspiciously perfect movements.
						{/if}
					</div>
				</div>
			</section>

			<!-- Digital Profile / Inferences -->
			<section class="mt-12">
				<div
					class="bg-surveillance-navy/30 border border-surveillance-slate/20 rounded-2xl p-8 relative overflow-hidden"
				>
					<div class="absolute top-0 right-0 p-4 opacity-20">
						<div class="text-6xl">📂</div>
					</div>

					<div class="relative z-10">
						<h2 class="text-2xl font-bold text-surveillance-cloud mb-6 flex items-center gap-3">
							<span class="text-surveillance-accent">///</span>
							Inferred Digital Profile
						</h2>

						<div class="grid grid-cols-1 md:grid-cols-2 gap-8">
							<div class="space-y-6">
								<div>
									<div class="text-xs uppercase tracking-widest text-surveillance-slate/80 mb-1">
										Assigned Persona
									</div>
									<div class="text-3xl font-bold text-surveillance-cloud">{profile.persona}</div>
								</div>

								<div>
									<div class="text-xs uppercase tracking-widest text-surveillance-slate/80 mb-1">
										Likely Income Tier
									</div>
									<div class="text-xl text-surveillance-cloud">{profile.incomeTier}</div>
									<div class="text-xs text-surveillance-slate mt-1">
										Inferred from device cost ({liveOverview.platform})
									</div>
								</div>

								<div>
									<div class="text-xs uppercase tracking-widest text-surveillance-slate/80 mb-1">
										Tech Literacy Score
									</div>
									<div class="text-xl text-surveillance-cloud">{profile.techLiteracy}</div>
									<div class="text-xs text-surveillance-slate mt-1">
										Inferred from browser choice ({fingerprint.traits.userAgent?.includes('Chrome')
											? 'Chrome'
											: fingerprint.traits.userAgent?.includes('Firefox')
												? 'Firefox'
												: fingerprint.traits.userAgent?.includes('Safari')
													? 'Safari'
													: fingerprint.traits.userAgent?.includes('Edge')
														? 'Edge'
														: fingerprint.traits.userAgent?.includes('Opera')
															? 'Opera'
															: fingerprint.traits.userAgent?.includes('Brave')
																? 'Brave'
																: 'Other'})
									</div>
								</div>

								<div>
									<div class="text-xs uppercase tracking-widest text-surveillance-slate/80 mb-1">
										Device Class
									</div>
									<div class="text-xl text-surveillance-cloud">{profile.deviceClass}</div>
									<div class="text-xs text-surveillance-slate mt-1">
										Inferred from touch points ({fingerprint.traits.maxTouchPoints}) and user agent
									</div>
								</div>
							</div>

							<div
								class="bg-black/20 rounded-xl p-6 border border-surveillance-slate/10 relative overflow-hidden group"
							>
								<div
									class="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-20 transition-opacity"
								>
									<span class="text-4xl">🎯</span>
								</div>

								<div
									class="text-xs uppercase tracking-widest text-surveillance-accent mb-3 flex items-center gap-2"
								>
									Live Ad Targeting
									{#if isGeneratingAd}
										<span
											class="inline-block w-2 h-2 rounded-full bg-surveillance-accent animate-pulse"
										></span>
									{/if}
								</div>

								{#if generatedAd}
									<div
										class="animate-in fade-in slide-in-from-bottom-2 duration-500 p-6 mt-2 rounded-xl transition-colors shadow-lg"
										style="background-color: {generatedAd.styles?.backgroundColor ??
											'transparent'}; color: {generatedAd.styles?.textColor ??
											'inherit'}; font-family: {generatedAd.styles?.fontFamily ?? 'inherit'}"
									>
										<div
											class="text-xs mb-1 font-mono uppercase opacity-70"
											style="color: {generatedAd.styles?.accentColor ?? 'inherit'}"
										>
											{generatedAd.category}
										</div>
										<h3 class="text-xl font-bold mb-2 leading-tight">
											"{generatedAd.headline}"
										</h3>
										<p class="text-sm leading-relaxed italic opacity-90">
											{generatedAd.body}
										</p>
										<div
											class="mt-3 flex items-center justify-between border-t pt-2"
											style="border-color: {generatedAd.styles?.accentColor
												? generatedAd.styles.accentColor + '40'
												: 'rgba(255,255,255,0.1)'}"
										>
											<span class="text-xs font-bold">{generatedAd.company}</span>
											<span
												class="text-[10px] font-mono"
												style="color: {generatedAd.styles?.accentColor ?? 'inherit'}"
											>
												{generatedAd.website}
											</span>
										</div>
									</div>
								{:else if isGeneratingAd}
									<div class="space-y-3 animate-pulse">
										<div class="h-4 bg-surveillance-slate/10 rounded w-3/4"></div>
										<div class="h-3 bg-surveillance-slate/10 rounded w-full"></div>
										<div class="h-3 bg-surveillance-slate/10 rounded w-5/6"></div>
									</div>
									<div class="mt-4 text-xs text-surveillance-slate/70">
										AI is analyzing your income, device, and location...
									</div>
								{:else}
									<div class="text-surveillance-slate/70 text-sm italic">
										Waiting for fingerprint...
									</div>
								{/if}

								<div
									class="mt-4 pt-4 border-t border-surveillance-slate/10 text-xs text-surveillance-slate/80"
								>
									<p>
										Advertisers pay more to reach specific personas. We used AI to generate this ad
										based on your inferred profile.
									</p>
									<p class="mt-2 text-[10px] opacity-70">
										Disclaimer: This ad was generated by AI based on your digital profile. Any
										resemblance to real products or services is coincidental.
									</p>
								</div>
							</div>

							<!-- Dynamic Pricing Simulator -->
							<div
								class="md:col-span-2 bg-surveillance-navy/70 rounded-xl p-6 border border-surveillance-slate/20"
							>
								<h3
									class="text-sm font-bold text-surveillance-slate uppercase tracking-widest mb-4"
								>
									Live Pricing Simulator
								</h3>
								<div class="flex flex-col sm:flex-row items-center justify-between gap-6">
									<div class="flex items-center gap-4">
										<div
											class="w-16 h-16 bg-surveillance-slate/10 rounded-lg flex items-center justify-center text-3xl"
										>
											✈️
										</div>
										<div>
											<div class="text-surveillance-cloud font-medium">
												{generatedPricing?.product ?? 'Analyzing Market...'}
											</div>
											<div class="text-xs text-surveillance-slate">
												{generatedPricing?.description ?? 'Finding relevant inventory...'}
											</div>
										</div>
									</div>
									<div class="text-right">
										<div class="text-xs text-surveillance-slate mb-1">Your Price</div>
										<div
											class="text-3xl font-bold text-surveillance-accent flex flex-col items-end"
										>
											{#if generatedPricing}
												{#if generatedPricing.standardPrice !== generatedPricing.userPrice}
													<span
														class="text-xs text-surveillance-slate line-through decoration-surveillance-accent/70 mb-0.5"
													>
														${generatedPricing.standardPrice.toLocaleString()}
													</span>
												{/if}
												<span>${generatedPricing.userPrice.toLocaleString()}</span>
											{:else}
												<span class="animate-pulse">...</span>
											{/if}
										</div>
										<div class="text-[10px] text-surveillance-slate/80 mt-1">
											{#if generatedPricing}
												{#if generatedPricing.markupPercentage > 0}
													+{generatedPricing.markupPercentage}% markup ({generatedPricing.reason})
												{:else if generatedPricing.markupPercentage < 0}
													{generatedPricing.markupPercentage}% discount ({generatedPricing.reason})
												{:else}
													Standard market rate
												{/if}
											{:else}
												Calculating dynamic pricing...
											{/if}
										</div>
									</div>
								</div>
							</div>
						</div>
					</div>
				</div>
			</section>

			<!-- Deep Dive: Canvas & Fonts -->
			<section class="grid grid-cols-1 md:grid-cols-2 gap-6">
				<div class="bg-surveillance-navy/30 border border-surveillance-slate/20 rounded-2xl p-6">
					<h3 class="text-lg font-semibold text-surveillance-cloud mb-4 flex items-center gap-2">
						<span>🚫</span> The "Do Not Track" Paradox
					</h3>
					<div class="flex items-center gap-4 mb-4">
						<div class="text-4xl">{fingerprint.traits.doNotTrack === '1' ? '✅' : '❌'}</div>
						<div>
							<div class="text-sm font-bold text-surveillance-cloud">
								DNT Signal: {fingerprint.traits.doNotTrack === '1' ? 'Enabled' : 'Disabled'}
							</div>
							<div class="text-xs text-surveillance-slate">Sent with every request</div>
						</div>
					</div>
					<p class="text-sm text-surveillance-slate">
						Ironically, enabling "Do Not Track" makes you <strong>more unique</strong> because most people
						leave it off. It adds a rare bit of data to your fingerprint that trackers can use to identify
						you specifically.
					</p>
				</div>

				<div class="bg-surveillance-navy/30 border border-surveillance-slate/20 rounded-2xl p-6">
					<h3 class="text-lg font-semibold text-surveillance-cloud mb-4 flex items-center gap-2">
						<span>🎨</span> Canvas Fingerprint
					</h3>
					<p class="text-sm text-surveillance-slate mb-4">
						Your browser rendered this hidden image. Small hardware differences make it
						pixel-perfect unique to your machine.
					</p>
					<div class="p-4 bg-white rounded-lg flex items-center justify-center overflow-hidden">
						{#if canvasDataUrl}
							<img src={canvasDataUrl} alt="Canvas Fingerprint" class="max-w-full h-auto" />
						{:else}
							<div class="text-black/70 text-xs">Rendering...</div>
						{/if}
					</div>
					<div class="mt-4 text-[10px] font-mono text-surveillance-slate/70 break-all">
						Hash: {fingerprint.thumbmark.substring(0, 32)}...
					</div>
				</div>

				<div class="bg-surveillance-navy/30 border border-surveillance-slate/20 rounded-2xl p-6">
					<h3 class="text-lg font-semibold text-surveillance-cloud mb-4 flex items-center gap-2">
						<span>🔤</span> Font Detective
					</h3>
					<p class="text-sm text-surveillance-slate mb-4">
						We checked for 30 common design & system fonts. Here's what you have installed:
					</p>
					<div class="flex flex-wrap gap-2 max-h-40 overflow-y-auto pr-2">
						{#each detectedFonts as font}
							<span
								class="px-2 py-1 rounded bg-surveillance-slate/10 text-xs text-surveillance-cloud border border-surveillance-slate/20"
							>
								{font}
							</span>
						{:else}
							<span class="text-xs text-surveillance-slate/70">Scanning fonts...</span>
						{/each}
					</div>
					<div class="mt-4 text-xs text-surveillance-slate/80">
						Designers and developers often have unique font lists that act like a barcode.
					</div>
				</div>

				<!-- Voice Fingerprint -->
				<div class="bg-surveillance-navy/30 border border-surveillance-slate/20 rounded-2xl p-6">
					<h3 class="text-lg font-semibold text-surveillance-cloud mb-4 flex items-center gap-2">
						<span>🗣️</span> Voice Fingerprint
					</h3>
					<p class="text-sm text-surveillance-slate mb-4">
						Your installed text-to-speech voices reveal your OS version and regional settings.
					</p>
					<div class="flex flex-wrap gap-2 max-h-40 overflow-y-auto pr-2">
						{#each voices as voice}
							<span
								class="px-2 py-1 rounded bg-surveillance-slate/10 text-xs text-surveillance-cloud border border-surveillance-slate/20"
							>
								{voice}
							</span>
						{:else}
							<span class="text-xs text-surveillance-slate/70">Scanning voices...</span>
						{/each}
					</div>
				</div>

				<!-- System Capabilities -->
				<div class="bg-surveillance-navy/30 border border-surveillance-slate/20 rounded-2xl p-6">
					<h3 class="text-lg font-semibold text-surveillance-cloud mb-4 flex items-center gap-2">
						<span>⚙️</span> System Capabilities
					</h3>
					<div class="space-y-4">
						<div>
							<div class="text-xs text-surveillance-slate/80 uppercase tracking-wider mb-1">
								Network Quality
							</div>
							<div class="text-sm text-surveillance-cloud">
								{#if networkInfo}
									{networkInfo.effectiveType.toUpperCase()} • {networkInfo.downlink} Mbps • {networkInfo.rtt}ms
									latency
								{:else}
									Unavailable
								{/if}
							</div>
						</div>
						<div>
							<div class="text-xs text-surveillance-slate/80 uppercase tracking-wider mb-1">
								Media Codecs
							</div>
							<div class="flex flex-wrap gap-2">
								{#each Object.entries(codecs) as [name, supported]}
									<span
										class="text-xs px-2 py-0.5 rounded {supported
											? 'bg-green-500/10 text-green-400'
											: 'bg-red-500/10 text-red-400'}"
									>
										{supported ? '✅' : '❌'}
										{name}
									</span>
								{/each}
							</div>
						</div>
						<div>
							<div class="text-xs text-surveillance-slate/80 uppercase tracking-wider mb-1">
								Permission State
							</div>
							<div class="flex flex-wrap gap-2">
								{#each Object.entries(permissions) as [name, state]}
									<div
										class="text-xs px-2 py-0.5 rounded bg-surveillance-slate/10 border border-surveillance-slate/20 text-surveillance-slate capitalize"
									>
										{name}: <span class="text-surveillance-cloud">{state}</span>
									</div>
								{/each}
							</div>
						</div>
					</div>
				</div>
			</section>

			<!-- PSA: Why this matters (Refined) -->
			<section class="py-16 space-y-12">
				<div class="text-center space-y-4 max-w-4xl mx-auto">
					<h2 class="text-3xl md:text-5xl font-bold text-surveillance-cloud leading-tight">
						You’re not being tracked for what you did.<br />
						<span class="text-surveillance-accent">You’re being profiled for who you are.</span>
					</h2>
				</div>

				<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
					<!-- Card 1 -->
					<div
						class="p-6 rounded-xl bg-surveillance-navy/50 border border-surveillance-slate/20 hover:border-surveillance-accent/50 transition-colors"
					>
						<div class="text-2xl mb-3">👁️</div>
						<h3 class="text-lg font-semibold text-surveillance-cloud mb-2">
							It affects what you see
						</h3>
						<p class="text-surveillance-slate text-sm leading-relaxed">
							Tracking decides what prices you get, what news you see, what jobs appear, and what
							opportunities never reach you. Not your search history, digital identity.
						</p>
					</div>

					<!-- Card 2 -->
					<div
						class="p-6 rounded-xl bg-surveillance-navy/50 border border-surveillance-slate/20 hover:border-surveillance-accent/50 transition-colors"
					>
						<div class="text-2xl mb-3">🏷️</div>
						<h3 class="text-lg font-semibold text-surveillance-cloud mb-2">
							It affects how you’re judged
						</h3>
						<p class="text-surveillance-slate text-sm leading-relaxed">
							Your device traits place you in categories you never chose: income tier, tech-savvy,
							age range, risk score. You don’t see the labels. Companies do.
						</p>
					</div>

					<!-- Card 3 -->
					<div
						class="p-6 rounded-xl bg-surveillance-navy/50 border border-surveillance-slate/20 hover:border-surveillance-accent/50 transition-colors"
					>
						<div class="text-2xl mb-3">⚖️</div>
						<h3 class="text-lg font-semibold text-surveillance-cloud mb-2">
							It affects decisions made about you
						</h3>
						<p class="text-surveillance-slate text-sm leading-relaxed">
							Fingerprinting feeds into fraud systems, ad networks, credit filters, recommendation
							engines, insurance algorithms, political targeting.
						</p>
					</div>

					<!-- Card 5 -->
					<div
						class="p-6 rounded-xl bg-surveillance-navy/50 border border-surveillance-slate/20 hover:border-surveillance-accent/50 transition-colors md:col-span-2 lg:col-span-4"
					>
						<div class="text-2xl mb-3">🕸️</div>
						<h3 class="text-lg font-semibold text-surveillance-cloud mb-2">
							The invisible power dynamic
						</h3>
						<p class="text-surveillance-slate text-sm leading-relaxed">
							You reveal data without meaning to. Companies analyze it without telling you. The
							imbalance isn’t your fault, but it affects you. The less you know, the more power they
							have.
						</p>
					</div>
				</div>

				<!-- Shocking Facts -->
				<div
					class="mt-12 p-8 rounded-2xl bg-surveillance-slate/5 border border-surveillance-slate/10"
				>
					<h3
						class="text-center text-surveillance-slate uppercase tracking-widest text-sm font-bold mb-6"
					>
						Did you know?
					</h3>
					<ul class="space-y-4 max-w-2xl mx-auto">
						<li class="flex items-start gap-3 text-surveillance-slate/90">
							<span class="text-surveillance-accent mt-1">➤</span>
							<span>Two people visiting the same site can see different prices.</span>
						</li>
						<li class="flex items-start gap-3 text-surveillance-slate/90">
							<span class="text-surveillance-accent mt-1">➤</span>
							<span>Ad networks infer your income from your GPU.</span>
						</li>
						<li class="flex items-start gap-3 text-surveillance-slate/90">
							<span class="text-surveillance-accent mt-1">➤</span>
							<span>Your browsing pattern influences your interest rate.</span>
						</li>
						<li class="flex items-start gap-3 text-surveillance-slate/90">
							<span class="text-surveillance-accent mt-1">➤</span>
							<span>Your device fingerprint contributes to fraud risk scores.</span>
						</li>
						<li class="flex items-start gap-3 text-surveillance-slate/90">
							<span class="text-surveillance-accent mt-1">➤</span>
							<span>Your timezone affects political targeting buckets.</span>
						</li>
					</ul>
				</div>
			</section>

			<!-- How it works cards -->
			<section class="py-6 space-y-8">
				<div class="flex items-center gap-4">
					<div class="h-px flex-1 bg-surveillance-slate/20"></div>
					<h2 class="text-2xl font-semibold text-surveillance-cloud">
						How device fingerprinting actually works
					</h2>
					<div class="h-px flex-1 bg-surveillance-slate/20"></div>
				</div>

				<p class="text-center text-surveillance-slate max-w-2xl mx-auto">
					Your browser quietly shares small technical details: display traits, rendering quirks,
					hardware capabilities, timing behavior. Each detail seems harmless. Together, they form a
					pattern that’s hard to mistake.
				</p>

				<div class="grid grid-cols-2 md:grid-cols-3 gap-4">
					{#each [{ icon: '🖥️', label: 'Display', value: `${fingerprint.traits.screen?.width || '?'}×${fingerprint.traits.screen?.height || '?'}` }, { icon: '🌈', label: 'Color & pixels', value: fingerprint.traits.screen?.colorDepth != null ? `${fingerprint.traits.screen.colorDepth}-bit color` : 'Unknown' }, { icon: '🌐', label: 'Language & region', value: `${fingerprint.traits.language || 'Unknown'} · ${fingerprint.traits.timezone || 'Unknown'}` }, { icon: '🧮', label: 'CPU & memory', value: fingerprint.traits.hardwareConcurrency != null ? `${fingerprint.traits.hardwareConcurrency} threads` : 'Unknown' }, { icon: '🕒', label: 'Timing', value: fingerprint.traits.timeSincePageLoadMs != null ? `${fingerprint.traits.timeSincePageLoadMs} ms since load` : 'Unknown' }, { icon: '🔊', label: 'Audio/graphics quirks', value: (rawFingerprint as any)?.webgl ? 'Stable renderer hash' : 'Not sampled' }] as item}
						<div
							class="p-4 rounded-lg bg-surveillance-slate/5 border border-surveillance-slate/10 flex flex-col gap-2"
						>
							<div class="text-xl">{item.icon}</div>
							<div class="text-sm font-medium text-surveillance-slate uppercase tracking-wider">
								{item.label}
							</div>
							<div class="text-base text-surveillance-cloud font-mono truncate">{item.value}</div>
						</div>
					{/each}
				</div>

				<div class="text-center max-w-2xl mx-auto space-y-3">
					<p class="text-lg text-surveillance-cloud font-medium isolated leading-relaxed">
						Combined, these traits create a signature that can be as distinctive as a face. It often
						survives private mode, VPNs, and cookie clearing.
					</p>
					<p class="text-sm text-surveillance-slate leading-relaxed">
						This demo uses only safe, browser-visible data. No name, no login, no microphone or
						camera. Just the same JavaScript APIs any modern website can access.
					</p>
				</div>
			</section>

			<!-- Challenge Section -->
			<section class="bg-surveillance-navy/50 rounded-2xl p-8 border border-surveillance-slate/20">
				<h2 class="text-2xl font-bold text-center mb-2 text-surveillance-cloud">
					Try to change your fingerprint
				</h2>
				<p class="text-center text-surveillance-slate mb-8 max-w-2xl mx-auto">
					These are common “privacy” steps people take. Some of them help. Some don’t change your
					device fingerprint at all. Use this demo to see which is which.
				</p>

				<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
					<button class="challenge-btn group" onclick={() => window.location.reload()}>
						<div class="text-2xl mb-2 group-hover:scale-110 transition-transform">🔄</div>
						<div class="font-medium text-surveillance-cloud text-lg">Reload</div>
						<div class="text-sm text-surveillance-slate mt-1">
							Same browser, same device → same fingerprint.
						</div>
					</button>

					<button
						class="challenge-btn group"
						onclick={() =>
							alert(
								'Open this page in a private/incognito window and compare your thumbmark. In most browsers, it will be nearly identical.'
							)}
					>
						<div class="text-2xl mb-2 group-hover:scale-110 transition-transform">🕶️</div>
						<div class="font-medium text-surveillance-cloud text-lg">Private mode</div>
						<div class="text-sm text-surveillance-slate mt-1">
							Hides history. Hardware traits stay the same.
						</div>
					</button>

					<button
						class="challenge-btn group"
						onclick={() =>
							alert(
								'Turn on a VPN, reload, and watch the IP change while many device traits stay identical.'
							)}
					>
						<div class="text-2xl mb-2 group-hover:scale-110 transition-transform">🔐</div>
						<div class="font-medium text-surveillance-cloud text-lg">Use a VPN</div>
						<div class="text-sm text-surveillance-slate mt-1">
							Changes IP, not your underlying fingerprint.
						</div>
					</button>

					<button
						class="challenge-btn group"
						onclick={() =>
							alert(
								'Resize your window, then reload. The site still sees your full screen size and other traits.'
							)}
					>
						<div class="text-2xl mb-2 group-hover:scale-110 transition-transform">📐</div>
						<div class="font-medium text-surveillance-cloud text-lg">Resize window</div>
						<div class="text-sm text-surveillance-slate mt-1">
							Window size ≠ device configuration.
						</div>
					</button>
				</div>

				<div class="mt-8 pt-8 border-t border-surveillance-slate/10">
					<h3
						class="text-sm font-bold text-surveillance-slate uppercase tracking-wider mb-4 text-center"
					>
						What actually changes your fingerprint?
					</h3>
					<div class="flex flex-wrap justify-center gap-3 text-xs">
						<span class="badge-success">✅ New device (different hardware)</span>
						<span class="badge-success">✅ Different browser</span>
						<span class="badge-success">✅ Tor Browser (standardized fingerprint)</span>
						<span class="badge-fail">❌ Private/incognito mode</span>
						<span class="badge-fail">❌ VPN alone</span>
						<span class="badge-fail">❌ Clearing cookies</span>
					</div>
				</div>
			</section>

			<!-- What you can do about it -->
			<!-- Privacy Shield Configurator -->
			<section
				class="bg-surveillance-navy/30 rounded-2xl p-8 border border-surveillance-slate/20 mt-10 space-y-8"
			>
				<h2 class="text-2xl md:text-3xl font-bold text-surveillance-cloud text-center">
					Privacy Shield Configurator
				</h2>

				<p class="text-center text-surveillance-slate max-w-2xl mx-auto leading-relaxed">
					Many privacy tools promise anonymity, but few deliver it. Use this interactive simulator
					to test how browsers, VPNs, and blockers actually affect your fingerprintability score.
					See what works, and what doesn't.
				</p>

				<div class="grid grid-cols-1 lg:grid-cols-12 gap-8 mt-8">
					<!-- Controls -->
					<div class="lg:col-span-5 space-y-6">
						<div class="space-y-3">
							<div class="text-xs font-bold text-surveillance-slate uppercase tracking-widest">
								Browser Choice
							</div>
							<div class="grid grid-cols-2 gap-2">
								{#each ['Chrome', 'Safari', 'Firefox', 'Brave'] as b}
									<button
										class="p-3 rounded-lg border text-sm font-medium transition-all duration-200 {privacyConfig.browser ===
										b
											? 'bg-surveillance-accent/20 border-surveillance-accent text-surveillance-cloud'
											: 'bg-surveillance-slate/5 border-surveillance-slate/10 text-surveillance-slate hover:bg-surveillance-slate/10'}"
										onclick={() => (privacyConfig.browser = b)}
									>
										{b}
									</button>
								{/each}
								<button
									class="col-span-2 p-3 rounded-lg border text-sm font-medium transition-all duration-200 {privacyConfig.browser ===
									'Tor'
										? 'bg-purple-500/20 border-purple-500 text-purple-300'
										: 'bg-surveillance-slate/5 border-surveillance-slate/10 text-surveillance-slate hover:bg-surveillance-slate/10'}"
									onclick={() => (privacyConfig.browser = 'Tor')}
								>
									🧅 Tor Browser
								</button>
							</div>
						</div>

						<div class="space-y-3">
							<div class="text-xs font-bold text-surveillance-slate uppercase tracking-widest">
								Network & Tools
							</div>
							<button
								class="w-full flex items-center justify-between p-4 rounded-lg border text-sm font-medium transition-all duration-200 {privacyConfig.vpn
									? 'bg-surveillance-accent/20 border-surveillance-accent text-surveillance-cloud'
									: 'bg-surveillance-slate/5 border-surveillance-slate/10 text-surveillance-slate hover:bg-surveillance-slate/10'}"
								onclick={() => (privacyConfig.vpn = !privacyConfig.vpn)}
							>
								<span class="flex items-center gap-2">🔐 Enable VPN / Proxy</span>
								<span class="text-xs opacity-60">{privacyConfig.vpn ? 'ON' : 'OFF'}</span>
							</button>
							<button
								class="w-full flex items-center justify-between p-4 rounded-lg border text-sm font-medium transition-all duration-200 {privacyConfig.blockers
									? 'bg-surveillance-accent/20 border-surveillance-accent text-surveillance-cloud'
									: 'bg-surveillance-slate/5 border-surveillance-slate/10 text-surveillance-slate hover:bg-surveillance-slate/10'}"
								onclick={() => (privacyConfig.blockers = !privacyConfig.blockers)}
							>
								<span class="flex items-center gap-2">🛡️ Ad & Tracker Blockers</span>
								<span class="text-xs opacity-60">{privacyConfig.blockers ? 'ON' : 'OFF'}</span>
							</button>
							<button
								class="w-full flex items-center justify-between p-4 rounded-lg border text-sm font-medium transition-all duration-200 {privacyConfig.privateMode
									? 'bg-surveillance-accent/20 border-surveillance-accent text-surveillance-cloud'
									: 'bg-surveillance-slate/5 border-surveillance-slate/10 text-surveillance-slate hover:bg-surveillance-slate/10'}"
								onclick={() => (privacyConfig.privateMode = !privacyConfig.privateMode)}
							>
								<span class="flex items-center gap-2">🕶️ Private / Incognito Mode</span>
								<span class="text-xs opacity-60">{privacyConfig.privateMode ? 'ON' : 'OFF'}</span>
							</button>
						</div>
					</div>

					<!-- Meter -->
					<div
						class="lg:col-span-7 bg-black/20 rounded-xl p-6 border border-surveillance-slate/10 flex flex-col justify-center"
					>
						<div class="text-center mb-8">
							<div class="text-sm text-surveillance-slate uppercase tracking-widest mb-2">
								Fingerprintability Score
							</div>
							<div
								class="text-6xl font-bold {privacyScore > 80
									? 'text-green-400'
									: privacyScore > 50
										? 'text-yellow-400'
										: 'text-red-400'} transition-colors duration-500"
							>
								{privacyScore}/100
							</div>
							<div
								class="text-sm mt-2 {privacyScore > 80
									? 'text-green-400/70'
									: privacyScore > 50
										? 'text-yellow-400/70'
										: 'text-red-400/70'}"
							>
								{privacyScore > 80
									? 'Hard to Track'
									: privacyScore > 50
										? 'Moderately Unique'
										: 'Easily Trackable'}
							</div>
						</div>

						<div class="relative h-4 bg-surveillance-slate/10 rounded-full overflow-hidden mb-8">
							<div
								class="absolute top-0 left-0 h-full transition-all duration-500 ease-out {privacyScore >
								80
									? 'bg-green-500'
									: privacyScore > 50
										? 'bg-yellow-500'
										: 'bg-red-500'}"
								style="width: {privacyScore}%"
							></div>
						</div>

						<div
							class="bg-surveillance-slate/5 rounded-lg p-4 border border-surveillance-slate/10 min-h-[100px] flex items-center justify-center"
						>
							<p
								class="stable-text text-center text-surveillance-cloud text-sm leading-relaxed animate-in fade-in duration-300 key={privacyCommentary}"
							>
								{privacyCommentary}
							</p>
						</div>
					</div>
				</div>
			</section>

			<!-- Actionable Resources -->
			<div class="mt-16 mb-8 text-center">
				<h2 class="text-2xl font-bold text-surveillance-cloud mb-3">Take Real Action</h2>
				<p class="text-surveillance-slate max-w-2xl mx-auto leading-relaxed">
					Most "privacy" settings are just theater. If you're serious about reducing your digital
					footprint, these are the tools that actually make a difference.
				</p>
			</div>
			<section class="grid grid-cols-1 md:grid-cols-3 gap-6">
				<a
					href="https://www.torproject.org/"
					target="_blank"
					class="group p-6 rounded-xl bg-surveillance-navy/50 border border-surveillance-slate/20 hover:border-surveillance-accent/50 transition-all hover:-translate-y-1"
				>
					<div class="text-2xl mb-3">🧅</div>
					<h3
						class="text-lg font-semibold text-surveillance-cloud mb-2 group-hover:text-surveillance-accent transition-colors"
					>
						Get Tor Browser
					</h3>
					<p class="text-surveillance-slate text-sm leading-relaxed">
						The gold standard for anonymity. It routes your traffic through three volunteer servers
						and standardizes your fingerprint.
					</p>
				</a>

				<a
					href="https://ublockorigin.com/"
					target="_blank"
					class="group p-6 rounded-xl bg-surveillance-navy/50 border border-surveillance-slate/20 hover:border-surveillance-accent/50 transition-all hover:-translate-y-1"
				>
					<div class="text-2xl mb-3">🛡️</div>
					<h3
						class="text-lg font-semibold text-surveillance-cloud mb-2 group-hover:text-surveillance-accent transition-colors"
					>
						uBlock Origin
					</h3>
					<p class="text-surveillance-slate text-sm leading-relaxed">
						Not just an ad blocker. It’s a wide-spectrum content blocker that stops many tracking
						scripts from even loading.
					</p>
				</a>

				<a
					href="https://coveryourtracks.eff.org/"
					target="_blank"
					class="group p-6 rounded-xl bg-surveillance-navy/50 border border-surveillance-slate/20 hover:border-surveillance-accent/50 transition-all hover:-translate-y-1"
				>
					<div class="text-2xl mb-3">📚</div>
					<h3
						class="text-lg font-semibold text-surveillance-cloud mb-2 group-hover:text-surveillance-accent transition-colors"
					>
						EFF's Cover Your Tracks
					</h3>
					<p class="text-surveillance-slate text-sm leading-relaxed">
						Learn more from the Electronic Frontier Foundation about how trackers work and how to
						protect your digital rights.
					</p>
				</a>
			</section>

			<!-- Live System / Nerd panel -->
			<section class="mt-16 max-w-4xl mx-auto">
				<details class="group/main">
					<summary
						class="flex items-center justify-center gap-3 cursor-pointer text-surveillance-slate hover:text-surveillance-accent transition-all duration-300 py-4"
					>
						<span
							class="text-xs font-mono uppercase tracking-[0.2em] opacity-70 group-hover/main:opacity-100"
							>See the raw details</span
						>
						<span
							class="px-2 py-0.5 rounded-full bg-surveillance-accent/10 text-surveillance-accent text-[10px] font-bold tracking-wide border border-surveillance-accent/20"
							>FOR THE CURIOUS</span
						>
						<span
							class="transform group-open/main:rotate-180 transition-transform duration-300 text-surveillance-slate/70"
							>▼</span
						>
					</summary>

					<div class="mt-8 space-y-4 animate-in fade-in slide-in-from-top-4 duration-500">
						<!-- Top Stats Bar -->
						<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
							<div
								class="bg-black/50 border border-surveillance-slate/20 rounded-lg p-4 flex flex-col justify-between"
							>
								<div class="text-xs text-surveillance-slate uppercase tracking-wider mb-1">
									Current Thumbmark
								</div>
								<div class="font-mono text-surveillance-accent text-lg break-all">
									{fingerprint.thumbmark}
								</div>
							</div>

							<div class="grid grid-cols-2 gap-4">
								<div class="bg-black/50 border border-surveillance-slate/20 rounded-lg p-4">
									<div class="text-xs text-surveillance-slate uppercase tracking-wider mb-1">
										Stability
									</div>
									<div
										class="font-mono text-xl {(liveOverview.stabilityPercent ?? 0) >= 90
											? 'text-green-400'
											: 'text-yellow-400'}"
									>
										{liveOverview.stabilityPercent ?? 0}%
									</div>
								</div>
								<div class="bg-black/50 border border-surveillance-slate/20 rounded-lg p-4">
									<div class="text-xs text-surveillance-slate uppercase tracking-wider mb-1">
										Visit Count
									</div>
									<div class="font-mono text-xl text-surveillance-cloud">
										#{liveOverview.visitCount}
									</div>
								</div>
							</div>
						</div>

						{#if comparedPrevious}
							<div
								class="bg-black/50 border border-surveillance-slate/20 rounded-lg p-3 flex items-center justify-between gap-4 text-xs font-mono"
							>
								<span class="text-surveillance-slate">Previous:</span>
								<span class="text-surveillance-slate/80 break-all"
									>{comparedPrevious.thumbmark}</span
								>
							</div>
						{/if}

						<!-- Collapsible Data Panels -->
						<div class="space-y-2 mt-6">
							<!-- Local Fingerprint -->
							<details
								class="group/panel bg-surveillance-navy/20 border border-surveillance-slate/10 rounded-lg overflow-hidden"
							>
								<summary
									class="flex items-center justify-between p-4 cursor-pointer hover:bg-surveillance-slate/5 transition-colors"
								>
									<div class="flex items-center gap-3">
										<span class="text-lg">🔒</span>
										<span class="font-medium text-surveillance-cloud">Local Fingerprint Data</span>
									</div>
									<span class="text-xs text-surveillance-slate/80 group-open/panel:hidden"
										>Click to expand</span
									>
								</summary>
								<div class="p-4 bg-black/30 border-t border-surveillance-slate/10">
									<pre
										class="text-xs text-surveillance-slate/80 overflow-x-auto custom-scrollbar max-h-96">{JSON.stringify(
											rawFingerprint ?? fingerprint.traits,
											null,
											2
										)}</pre>
								</div>
							</details>

							<!-- Server Payload -->
							<details
								class="group/panel bg-surveillance-navy/20 border border-surveillance-slate/10 rounded-lg overflow-hidden"
							>
								<summary
									class="flex items-center justify-between p-4 cursor-pointer hover:bg-surveillance-slate/5 transition-colors"
								>
									<div class="flex items-center gap-3">
										<span class="text-lg">📡</span>
										<span class="font-medium text-surveillance-cloud">Server Communication</span>
									</div>
									<span class="text-xs text-surveillance-slate/80 group-open/panel:hidden"
										>Click to expand</span
									>
								</summary>
								<div class="p-4 bg-black/30 border-t border-surveillance-slate/10 space-y-4">
									<div>
										<div class="text-xs text-surveillance-slate mb-2 uppercase tracking-wider">
											Payload Sent
										</div>
										{#if serverPayload}
											<pre
												class="text-xs text-surveillance-slate/80 overflow-x-auto custom-scrollbar">{JSON.stringify(
													serverPayload,
													null,
													2
												)}</pre>
										{:else}
											<div class="text-sm text-surveillance-slate/70 italic">
												No payload captured yet.
											</div>
										{/if}
									</div>
									{#if serverRawResponse}
										<div class="border-t border-surveillance-slate/10 pt-4">
											<div class="text-xs text-surveillance-slate mb-2 uppercase tracking-wider">
												Server Response
											</div>
											<pre
												class="text-xs text-surveillance-slate/80 overflow-x-auto custom-scrollbar">{JSON.stringify(
													serverRawResponse,
													null,
													2
												)}</pre>
										</div>
									{/if}
								</div>
							</details>
						</div>
					</div>
				</details>
			</section>

			<!-- Final reflection / punchline -->
			<section class="pt-10 text-center space-y-3 max-w-3xl mx-auto">
				<p class="text-sm uppercase tracking-[0.2em] text-surveillance-slate/80">One last thing</p>
				<p class="text-xl md:text-2xl text-surveillance-cloud font-semibold">
					This entire system was built as a high-school project using public browser APIs.
				</p>
				<p class="text-sm md:text-base text-surveillance-slate leading-relaxed">
					If this demo can recognize your device, estimate your region, and track visits using only
					an anonymous hash, imagine what large companies can do with full login data, purchase
					history, location feeds, and thousands of third-party data sources.
				</p>
				<p class="text-sm text-surveillance-slate/70">
					The point isn’t to scare you. It’s to make the invisible visible so you can decide what
					you’re comfortable with.
				</p>
			</section>

			<footer class="text-center text-surveillance-slate/50 text-xs md:text-sm py-10">
				<p>Safe by design • Raw fingerprint stays local • Anonymous hash + visit counts only</p>
				<button
					class="mt-3 text-[11px] underline hover:text-surveillance-accent transition-colors"
					onclick={resetLocalFingerprint}
				>
					Clear stored fingerprint on this device
				</button>
			</footer>
		{/if}
	</section>
</main>

<TransparencyModal
	isOpen={showTransparency}
	mode={transparencyMode}
	onclose={() => (showTransparency = false)}
	onconfirm={() => {
		showTransparency = false;
		startFingerprint();
	}}
/>

<style>
	@reference './layout.css';

	/* Punchy Animations */
	@keyframes punchIn {
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	@keyframes pop {
		from {
			opacity: 0;
			transform: scale(0.94);
		}
		to {
			opacity: 1;
			transform: scale(1);
		}
	}

	.punch {
		opacity: 0;
		transform: translateY(6px);
		animation: punchIn 0.4s ease-out forwards;
	}

	.motion-pop {
		animation: pop 0.32s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
	}

	.scan-overlay::after {
		content: '';
		position: absolute;
		inset: 0;
		background: repeating-linear-gradient(
			to bottom,
			transparent,
			transparent 3px,
			rgba(255, 255, 255, 0.02) 4px
		);
		pointer-events: none;
	}

	.glow {
		text-shadow: 0 0 18px rgba(96, 165, 250, 0.35);
	}

	.isolated {
		margin-top: 1.4rem;
		margin-bottom: 1.4rem;
		padding: 0.8rem 0;
	}

	/* Utility */
	.breaker {
		height: 1px;
		background: rgba(255, 255, 255, 0.06);
		margin: 1rem 0;
	}

	/* Component Classes */
	.stat-card {
		@apply bg-white border-2 border-surveillance-slate/10 rounded-xl p-6 flex flex-col gap-2 hover:-translate-y-1 transition-transform duration-300 hover:border-surveillance-cyan hover:shadow-[5px_5px_0px_rgba(0,255,255,0.3)];
	}

	.stat-header {
		@apply flex items-center gap-2 mb-2;
	}

	.stat-label {
		@apply text-xs font-bold uppercase tracking-wider text-surveillance-slate;
	}

	.stat-value {
		@apply text-3xl font-black text-surveillance-cloud;
	}

	.stat-commentary {
		@apply text-sm text-surveillance-slate mt-2 leading-relaxed font-medium;
	}

	.challenge-btn {
		@apply flex flex-col items-center justify-center p-4 rounded-xl bg-surveillance-slate/5 border border-surveillance-slate/10 hover:bg-surveillance-slate/10 hover:border-surveillance-accent/30 transition-all duration-200 text-center;
	}

	.badge-success {
		@apply px-3 py-1 rounded-full bg-green-500/10 text-green-400 text-xs font-medium border border-green-500/20;
	}

	.badge-fail {
		@apply px-3 py-1 rounded-full bg-red-500/10 text-red-400 text-xs font-medium border border-red-500/20;
	}

	.card {
		@apply bg-white/70 border border-surveillance-slate/20 rounded-xl p-4;
	}

	.card.full {
		@apply w-full;
	}

	pre {
		background: #0f172a;
		color: #e0f2fe;
		border-radius: 0.75rem;
		padding: 1rem;
		overflow: auto;
		font-size: 0.78rem;
		line-height: 1.35rem;
		border: 1px solid #0f172a;
	}

	/* Custom Scrollbar */
	.custom-scrollbar::-webkit-scrollbar {
		height: 8px;
		width: 8px;
	}
	.custom-scrollbar::-webkit-scrollbar-track {
		background: rgba(15, 23, 42, 0.5);
		border-radius: 4px;
	}
	.custom-scrollbar::-webkit-scrollbar-thumb {
		background: rgba(51, 65, 85, 0.5);
		border-radius: 4px;
	}
	.custom-scrollbar::-webkit-scrollbar-thumb:hover {
		background: rgba(71, 85, 105, 0.8);
	}

	/* Hide default details marker */
	details > summary {
		list-style: none;
	}
	details > summary::-webkit-details-marker {
		display: none;
	}

	/* CRT Effects */
	@keyframes flicker {
		0% {
			opacity: 0.027;
		}
		5% {
			opacity: 0.034;
		}
		10% {
			opacity: 0.023;
		}
		15% {
			opacity: 0.09;
		}
		20% {
			opacity: 0.018;
		}
		25% {
			opacity: 0.083;
		}
		30% {
			opacity: 0.065;
		}
		35% {
			opacity: 0.067;
		}
		40% {
			opacity: 0.026;
		}
		45% {
			opacity: 0.084;
		}
		50% {
			opacity: 0.096;
		}
		55% {
			opacity: 0.008;
		}
		60% {
			opacity: 0.02;
		}
		65% {
			opacity: 0.071;
		}
		70% {
			opacity: 0.053;
		}
		75% {
			opacity: 0.037;
		}
		80% {
			opacity: 0.071;
		}
		85% {
			opacity: 0.07;
		}
		90% {
			opacity: 0.07;
		}
		95% {
			opacity: 0.036;
		}
		100% {
			opacity: 0.024;
		}
	}

	@keyframes textShadow {
		0% {
			text-shadow:
				0.1px 0 1px rgba(0, 30, 255, 0.5),
				-0.1px 0 1px rgba(255, 0, 80, 0.3),
				0 0 3px;
		}
		5% {
			text-shadow:
				0.2px 0 1px rgba(0, 30, 255, 0.5),
				-0.2px 0 1px rgba(255, 0, 80, 0.3),
				0 0 3px;
		}
		10% {
			text-shadow:
				0.05px 0 1px rgba(0, 30, 255, 0.5),
				-0.05px 0 1px rgba(255, 0, 80, 0.3),
				0 0 3px;
		}
		15% {
			text-shadow:
				0.3px 0 1px rgba(0, 30, 255, 0.5),
				-0.3px 0 1px rgba(255, 0, 80, 0.3),
				0 0 3px;
		}
		20% {
			text-shadow:
				0.1px 0 1px rgba(0, 30, 255, 0.5),
				-0.1px 0 1px rgba(255, 0, 80, 0.3),
				0 0 3px;
		}
		25% {
			text-shadow:
				0.4px 0 1px rgba(0, 30, 255, 0.5),
				-0.4px 0 1px rgba(255, 0, 80, 0.3),
				0 0 3px;
		}
		30% {
			text-shadow:
				0.1px 0 1px rgba(0, 30, 255, 0.5),
				-0.1px 0 1px rgba(255, 0, 80, 0.3),
				0 0 3px;
		}
		35% {
			text-shadow:
				0.3px 0 1px rgba(0, 30, 255, 0.5),
				-0.3px 0 1px rgba(255, 0, 80, 0.3),
				0 0 3px;
		}
		40% {
			text-shadow:
				0.2px 0 1px rgba(0, 30, 255, 0.5),
				-0.2px 0 1px rgba(255, 0, 80, 0.3),
				0 0 3px;
		}
		45% {
			text-shadow:
				0.15px 0 1px rgba(0, 30, 255, 0.5),
				-0.15px 0 1px rgba(255, 0, 80, 0.3),
				0 0 3px;
		}
		50% {
			text-shadow:
				0.05px 0 1px rgba(0, 30, 255, 0.5),
				-0.05px 0 1px rgba(255, 0, 80, 0.3),
				0 0 3px;
		}
		55% {
			text-shadow:
				0.25px 0 1px rgba(0, 30, 255, 0.5),
				-0.25px 0 1px rgba(255, 0, 80, 0.3),
				0 0 3px;
		}
		60% {
			text-shadow:
				0.2px 0 1px rgba(0, 30, 255, 0.5),
				-0.2px 0 1px rgba(255, 0, 80, 0.3),
				0 0 3px;
		}
		65% {
			text-shadow:
				0.3px 0 1px rgba(0, 30, 255, 0.5),
				-0.3px 0 1px rgba(255, 0, 80, 0.3),
				0 0 3px;
		}
		70% {
			text-shadow:
				0.1px 0 1px rgba(0, 30, 255, 0.5),
				-0.1px 0 1px rgba(255, 0, 80, 0.3),
				0 0 3px;
		}
		75% {
			text-shadow:
				0.2px 0 1px rgba(0, 30, 255, 0.5),
				-0.2px 0 1px rgba(255, 0, 80, 0.3),
				0 0 3px;
		}
		80% {
			text-shadow:
				0.05px 0 1px rgba(0, 30, 255, 0.5),
				-0.05px 0 1px rgba(255, 0, 80, 0.3),
				0 0 3px;
		}
		85% {
			text-shadow:
				0.1px 0 1px rgba(0, 30, 255, 0.5),
				-0.1px 0 1px rgba(255, 0, 80, 0.3),
				0 0 3px;
		}
		90% {
			text-shadow:
				0.35px 0 1px rgba(0, 30, 255, 0.5),
				-0.35px 0 1px rgba(255, 0, 80, 0.3),
				0 0 3px;
		}
		95% {
			text-shadow:
				0.2px 0 1px rgba(0, 30, 255, 0.5),
				-0.2px 0 1px rgba(255, 0, 80, 0.3),
				0 0 3px;
		}
		100% {
			text-shadow:
				0.25px 0 1px rgba(0, 30, 255, 0.5),
				-0.25px 0 1px rgba(255, 0, 80, 0.3),
				0 0 3px;
		}
	}

	:global(.crt::before) {
		content: ' ';
		display: block;
		position: absolute;
		top: 0;
		left: 0;
		bottom: 0;
		right: 0;
		background:
			linear-gradient(rgba(18, 16, 16, 0) 50%, rgba(0, 0, 0, 0.1) 50%),
			linear-gradient(90deg, rgba(255, 0, 0, 0.06), rgba(0, 255, 0, 0.02), rgba(0, 0, 255, 0.06));
		z-index: 50;
		background-size:
			100% 2px,
			3px 100%;
		pointer-events: none;
	}

	:global(.crt::after) {
		content: ' ';
		display: block;
		position: absolute;
		top: 0;
		left: 0;
		bottom: 0;
		right: 0;
		background: rgba(18, 16, 16, 0.05);
		opacity: 0;
		z-index: 50;
		pointer-events: none;
		animation: flicker 0.15s infinite;
	}

	:global(.crt) {
		animation: textShadow 1.6s infinite;
	}

	:global(.crt *) {
		text-shadow: inherit;
	}

	/* Transparency Button Override */
	:global(.transparency-btn) {
		z-index: 100 !important;
		text-shadow: none !important;
	}

	/* Global Button Stabilization */
	:global(.crt button),
	:global(.crt a),
	:global(.crt details),
	:global(.crt summary),
	:global(.crt .stable-text) {
		text-shadow: none !important;
	}
</style>
