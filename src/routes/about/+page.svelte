<script lang="ts">
	// Static informational page — no client-side logic required.
</script>

<h1>About This Project</h1>

<p>
	This project is an interactive educational website designed to demonstrate how modern web tracking
	and device fingerprinting work in the real world. Rather than relying only on cookies — which
	users can delete — the site shows how websites can identify devices using non-personal technical
	characteristics that browsers automatically expose.
</p>

<h2>What the site collects (opt-in)</h2>
<p>
	When a visitor consents, the site collects a set of non-sensitive, browser-visible attributes such
	as:
</p>
<ul>
	<li>browser and operating system details</li>
	<li>GPU and WebGL renderer information</li>
	<li>audio processing behavior</li>
	<li>display characteristics</li>
	<li>language and timezone settings</li>
	<li>feature support and environment capabilities</li>
</ul>

<h2>Privacy-preserving design</h2>
<p>
	These collected values do not contain personal information and are never stored in raw form.
	Instead, the browser combines them into a single anonymous, irreversible hash — a digital “device
	fingerprint.” Only this hash is sent to the server.
</p>

<p>
	The server retains only the anonymous hash and minimal metadata: visit count, and first-seen and
	last-seen timestamps. The system is intentionally opt-in, transparent, and educational. It does
	not attempt to identify individuals, and fingerprint hashes are periodically purged.
</p>

<h2>Why this matters</h2>
<p>
	The goal is not to track people, but to show how easily real websites could recognize a device
	even after users try common defenses such as clearing cookies, switching networks, or using
	private browsing modes. By challenging visitors to “escape” recognition, the site demonstrates
	which defenses fail and which approaches (specialized privacy-focused browsers, VM-level
	separation, etc.) can be effective.
</p>

<h2>Educational features</h2>
<ul>
	<li>Shows exactly what information the browser reveals.</li>
	<li>Explains how fingerprinting techniques combine values into a fingerprint hash.</li>
	<li>Places methods in context with commercial tracking systems and academic research.</li>
	<li>Provides links to further reading and external resources for deeper learning.</li>
</ul>

<h2>Summary</h2>
<p>
	This interactive privacy awareness tool makes abstract concepts concrete. By showing how a website
	can recognize a device without cookies, and by challenging users to evade that recognition, it
	highlights that online privacy is more complex than it appears.
</p>

<p>
	Would you like a shorter 1-paragraph version, a casual student-friendly version, a technical
	architecture description, or a teacher-friendly abstract? Reply here or use the project repository
	to request alternate versions.
</p>
