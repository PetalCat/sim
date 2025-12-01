<script lang="ts">
	import { onMount } from 'svelte';

	type Collected = {
		id: string;
		thumbmark: string | null;
		createdAt: string;
		data: Record<string, unknown>;
	};
	type MatchResult = {
		user: Record<string, unknown>;
		score: number;
		breakdown?: Record<string, number>;
	};

	let collected: Collected[] = [];
	let loading = false;
	let error: string | null = null;
	let results: MatchResult[] = [];

	// simple query selection: either a custom JSON string or choose from collected
	let customQuery = '';
	let selectedCollectedId: string | null = null;

	async function loadCollected() {
		try {
			const res = await fetch('/api/fingerprints');
			const j = await res.json();
			if (res.ok) collected = j.fingerprints || [];
		} catch (e) {
			// ignore
		}
	}

	onMount(() => {
		loadCollected();
	});

	// Build a lightweight fingerprint from the browser environment
	function gatherBrowserFingerprint() {
		try {
			return {
				ua: navigator.userAgent,
				platform: navigator.platform,
				language: navigator.language,
				languages: (navigator.languages || []).slice(0, 5),
				hw: (navigator as any).hardwareConcurrency || null,
				tz: Intl.DateTimeFormat().resolvedOptions().timeZone || null,
				// small random to differentiate visits when testing
				_random: Math.random().toString(36).slice(2, 9)
			} as Record<string, unknown>;
		} catch (e) {
			return { note: 'unavailable' } as Record<string, unknown>;
		}
	}

	async function collectNow() {
		error = null;
		loading = true;
		try {
			const fp = gatherBrowserFingerprint();
			const res = await fetch('/api/thumbmark', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ fingerprint: fp })
			});
			const j = await res.json();
			if (!res.ok) throw new Error(j?.error || 'Failed to collect');
			// reload list
			await loadCollected();
		} catch (e: any) {
			error = e?.message ?? String(e);
		} finally {
			loading = false;
		}
	}

	async function runGuess() {
		error = null;
		results = [];
		loading = true;
		try {
			let query: Record<string, unknown> | null = null;
			if (selectedCollectedId) {
				const c = collected.find((x) => x.id === selectedCollectedId);
				if (c) query = c.data;
			}
			if (!query && customQuery && customQuery.trim()) {
				query = JSON.parse(customQuery);
			}
			if (!query) throw new Error('Choose a collected fingerprint or paste a custom query JSON.');

			// users dataset is the currently-collected fingerprints
			const users = collected.map((c) => c.data);

			const res = await fetch('/api/guess', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ query, users })
			});
			const j = await res.json();
			if (!res.ok) throw new Error(j?.error || 'Guess request failed');
			results = j.results || [];
		} catch (e: any) {
			error = e?.message ?? String(e);
		} finally {
			loading = false;
		}
	}
</script>

<h1>Fingerprinting — New System</h1>

<div class="panel">
	<div class="left">
		<h2>Collector</h2>
		<p>
			Click <b>Collect fingerprint</b> to gather a lightweight fingerprint from this browser and send
			it to the new `/api/thumbmark` endpoint.
		</p>
		<button on:click={collectNow} disabled={loading}
			>{loading ? 'Collecting…' : 'Collect fingerprint'}</button
		>
		{#if error}
			<div class="error">{error}</div>
		{/if}

		<h3 style="margin-top:1rem">Collected Fingerprints</h3>
		{#if collected.length === 0}
			<div class="hint">No fingerprints collected yet.</div>
		{/if}
		{#each collected as c}
			<div class="card">
				<div><b>{c.id}</b> <span class="muted">{new Date(c.createdAt).toLocaleString()}</span></div>
				<div class="thumb">{c.thumbmark}</div>
				<div style="margin-top:0.4rem">
					<label
						><input type="radio" bind:group={selectedCollectedId} value={c.id} /> Use as query</label
					>
				</div>
				<details>
					<summary>Data</summary>
					<pre>{JSON.stringify(c.data, null, 2)}</pre>
				</details>
			</div>
		{/each}
	</div>

	<div class="right">
		<h2>Run Guess</h2>
		<p>Choose a collected fingerprint above or paste a custom query JSON below.</p>
		<textarea bind:value={customQuery} rows={10} placeholder="Paste query JSON here"></textarea>
		<div class="controls">
			<button on:click={runGuess} disabled={loading}>{loading ? 'Running…' : 'Run Guess'}</button>
		</div>

		<h3 style="margin-top:1rem">Top Matches</h3>
		{#if results.length === 0}
			<div class="hint">No results yet — run a guess</div>
		{/if}
		{#each results as r}
			<div class="card">
				<div class="row">
					<b>ID:</b>
					{r.user.id} <span class="score">{r.score.toFixed(3)}</span>
				</div>
				<pre>{JSON.stringify(r.user, null, 2)}</pre>
			</div>
		{/each}
	</div>
</div>

<style>
	.panel {
		display: flex;
		gap: 1rem;
		margin-top: 1rem;
	}
	.left,
	.right {
		flex: 1;
	}
	textarea {
		width: 100%;
		font-family: monospace;
	}
	button {
		margin-top: 0.6rem;
		padding: 0.5rem 0.9rem;
	}
	.card {
		border: 1px solid #ddd;
		padding: 0.6rem;
		margin-bottom: 0.8rem;
		border-radius: 6px;
	}
	pre {
		margin: 0.5rem 0 0 0;
		max-height: 200px;
		overflow: auto;
		background: #fafafa;
		padding: 0.4rem;
	}
	.score {
		float: right;
		background: #f0f0f8;
		padding: 0.1rem 0.4rem;
		border-radius: 4px;
	}
	.hint {
		color: #666;
	}
	.error {
		color: #900;
		margin-top: 0.5rem;
	}
	.thumb {
		font-family: monospace;
		color: #333;
		margin-top: 0.3rem;
	}
</style>
