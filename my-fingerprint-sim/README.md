# sv

Everything you need to build a Svelte project, powered by [`sv`](https://github.com/sveltejs/cli).

## Creating a project

If you're seeing this, you've probably already done this step. Congrats!

```sh
# create a new project in the current directory
npx sv create

# create a new project in my-app
npx sv create my-app
```

## Developing

Once you've created a project and installed dependencies with `npm install` (or `pnpm install` or `yarn`), start a development server:

```sh
npm run dev

# or start the server and open the app in a new browser tab
npm run dev -- --open
```

## Building

To create a production version of your app:

```sh
npm run build
```

You can preview the production build with `npm run preview`.

> To deploy your app, you may need to install an [adapter](https://svelte.dev/docs/kit/adapters) for your target environment.

## About this project

This repository contains an interactive educational site that demonstrates how device
fingerprinting works and why it matters for online privacy. The demo collects non-sensitive
browser-visible attributes (opt-in), combines them into an irreversible fingerprint hash,
and stores only that hash plus minimal metadata (visit count and timestamps). The site is
designed for education and awareness — it does not store personal data and periodically
purges fingerprint hashes.

Open the app and visit the `/about` route for the full high-level project description.
