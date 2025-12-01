<script lang="ts">
	import { fade, scale } from 'svelte/transition';

	let {
		isOpen = false,
		mode = 'info',
		onclose,
		onconfirm
	}: {
		isOpen?: boolean;
		mode?: 'info' | 'consent';
		onclose?: () => void;
		onconfirm?: () => void;
	} = $props();

	function close() {
		onclose?.();
	}

	function confirm() {
		onconfirm?.();
	}

	function clearData() {
		if (typeof localStorage !== 'undefined') {
			localStorage.removeItem('fingerprint:last');
			alert('Local fingerprint data cleared. The page will reload.');
			window.location.reload();
		}
	}
</script>

{#if isOpen}
	<div
		class="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6"
		role="dialog"
		aria-modal="true"
	>
		<!-- Backdrop -->
		<button
			type="button"
			class="absolute inset-0 bg-surveillance-charcoal/90 transition-opacity"
			on:click={close}
			transition:fade={{ duration: 200 }}
			aria-label="Close modal"
		></button>

		<!-- Modal Panel -->
		<div
			class="relative w-full max-w-2xl bg-surveillance-navy border border-surveillance-slate/30 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
			transition:scale={{ duration: 200, start: 0.95 }}
		>
			<!-- Header -->
			<div
				class="p-6 border-b border-surveillance-slate/20 flex items-center justify-between bg-surveillance-slate/5"
			>
				<h2 class="text-xl font-bold text-surveillance-cloud flex items-center gap-2">
					<span>🛡️</span> Transparency & Data
				</h2>
				<button
					on:click={close}
					class="text-surveillance-slate hover:text-surveillance-cloud transition-colors p-2 rounded-lg hover:bg-surveillance-slate/10"
					aria-label="Close"
				>
					✕
				</button>
			</div>

			{#if mode === 'consent'}
				<div
					class="p-4 bg-surveillance-accent/10 border-b border-surveillance-accent/20 flex flex-col sm:flex-row items-center justify-between gap-4"
				>
					<p class="text-sm text-surveillance-cloud">
						Please review the data collection details below.
					</p>
					<button
						on:click={confirm}
						class="w-full sm:w-auto px-6 py-2 bg-surveillance-accent text-surveillance-charcoal font-bold rounded-lg hover:bg-surveillance-accent/90 transition-colors shadow-lg shadow-surveillance-accent/20"
					>
						I Understand, Show My Fingerprint →
					</button>
				</div>
			{/if}

			<!-- Content -->
			<div class="p-6 overflow-y-auto space-y-8 text-surveillance-slate">
				<section>
					<h3 class="text-lg font-semibold text-surveillance-cloud mb-3">What we collect</h3>
					<p class="mb-3">
						This site collects <strong>technical device traits</strong> to demonstrate browser
						fingerprinting. We use the open-source library
						<a
							href="https://github.com/thumbmarkjs/thumbmarkjs"
							target="_blank"
							rel="noopener noreferrer"
							class="text-surveillance-accent hover:underline">ThumbmarkJS</a
						> to generate the fingerprint. This includes:
					</p>
					<ul class="list-disc list-inside space-y-1 ml-2 text-sm">
						<li>Screen resolution and color depth</li>
						<li>Browser vendor and version</li>
						<li>Operating system platform</li>
						<li>Installed fonts and voices</li>
						<li>Hardware concurrency (CPU threads)</li>
						<li>Device memory hints</li>
						<li>Canvas rendering artifacts</li>
					</ul>
					<p class="mt-3 sm:text-sm italic opacity-80">
						We do <strong>not</strong> collect your name, email, IP address history, or precise GPS location.
					</p>
				</section>

				<section>
					<h3 class="text-lg font-semibold text-surveillance-cloud mb-3">Where data goes</h3>
					<p class="mb-2">
						1. <strong>In your browser:</strong> The raw data is analyzed locally to generate the "fingerprint"
						hash.
					</p>
					<p>
						2. <strong>On our server:</strong> We send the anonymous hash and technical traits to our
						server to:
					</p>
					<ul class="list-disc list-inside space-y-1 ml-2 text-sm mt-2">
						<li>Count how many times we've seen this specific device configuration.</li>
						<li>Generate the AI ad and pricing simulation based on the profile.</li>
					</ul>
				</section>

				<section>
					<h3 class="text-lg font-semibold text-surveillance-cloud mb-3">AI Processing</h3>
					<p class="mb-2">
						We use <strong>Google Gemini (model: gemini-2.0-flash)</strong> to generate the satirical
						ad and pricing. The following JSON data is sent to the AI provider for this purpose:
					</p>
					<div
						class="bg-black/30 p-3 rounded-lg text-xs font-mono text-surveillance-slate/80 overflow-x-auto"
					>
						<pre>{JSON.stringify(
								{
									profile: {
										incomeTier: 'Inferred from device cost',
										techLiteracy: 'Inferred from browser/OS',
										persona: "e.g. 'The Tech Professional'",
										deviceClass: "e.g. 'Desktop / Laptop'"
									},
									traits: {
										platform: "e.g. 'MacIntel'",
										screen: { width: 1920, height: 1080 },
										userAgent: 'Browser string...'
									},
									context: {
										battery: 'Level & charging status',
										time: 'Local time',
										region: 'Approximate region'
									}
								},
								null,
								2
							)}</pre>
					</div>
					<p class="mt-2 text-xs opacity-70">
						The AI is explicitly instructed <strong>NOT</strong> to identify you personally, but to construct
						a fictional "persona" based on these technical traits.
					</p>
				</section>

				<section>
					<h3 class="text-lg font-semibold text-surveillance-cloud mb-3">Your Control</h3>
					<p class="mb-4">
						We store a copy of your last fingerprint in your browser's <code>localStorage</code> to show
						you the "changes" view if you reload. You can clear this local data right now.
					</p>
					<button
						on:click={clearData}
						class="px-4 py-2 bg-red-500/10 border border-red-500/30 text-red-300 rounded-lg hover:bg-red-500/20 transition-colors text-sm font-medium"
					>
						Clear My Local Data
					</button>
				</section>
			</div>

			<!-- Footer -->
			<div class="p-4 border-t border-surveillance-slate/20 bg-surveillance-slate/5 text-center">
				<p class="text-xs text-surveillance-slate/60">
					This is an educational demo. Real tracking networks are far more invisible and persistent.
				</p>
			</div>
		</div>
	</div>
{/if}
