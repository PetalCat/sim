<script lang="ts">
	export let currentThumbmark: string | null = null;
	export let previousThumbmark: string | null = null;
	export let observations: string[] = [];
	export let recognitionSummary: string | null = null;
</script>

<div class="panel">
	<div class="header">
		<div>
			<h3>Observation Panel</h3>
			<p class="muted">These notes never leave your browser.</p>
		</div>
	</div>

	<div class="thumbs">
		<div>
			<div class="label">Current thumbmark</div>
			<div class="value">{currentThumbmark ?? 'n/a'}</div>
		</div>
		<div>
			<div class="label">Previous thumbmark</div>
			<div class="value secondary">{previousThumbmark ?? 'none stored'}</div>
		</div>
	</div>

	{#if recognitionSummary}
		<div class="summary">{recognitionSummary}</div>
	{/if}

	<ul class="list">
		{#each observations as obs}
			<li>{obs}</li>
		{/each}
	</ul>
</div>

<style>
	.panel {
		border: 1px solid #e5e7eb;
		border-radius: 12px;
		padding: 1rem;
		background: #fafafa;
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.04);
	}
	.header h3 {
		margin: 0;
		font-size: 1.1rem;
	}
	.muted {
		color: #5d6470;
		margin: 0.2rem 0 0 0;
		font-size: 0.9rem;
	}
	.thumbs {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
		gap: 1rem;
		margin: 0.8rem 0 1rem 0;
	}
	.label {
		font-size: 0.85rem;
		color: #5d6470;
	}
	.value {
		font-family: monospace;
		word-break: break-all;
		background: white;
		border: 1px dashed #d1d5db;
		border-radius: 8px;
		padding: 0.6rem;
		margin-top: 0.25rem;
	}
	.value.secondary {
		background: #f3f4f6;
	}
	.summary {
		background: #eef2ff;
		color: #4338ca;
		padding: 0.75rem 0.9rem;
		border-radius: 10px;
		border: 1px solid #c7d2fe;
		margin-bottom: 0.8rem;
	}
	.list {
		list-style: disc;
		padding-left: 1.3rem;
		margin: 0;
		display: grid;
		gap: 0.35rem;
		color: #111827;
	}
</style>
