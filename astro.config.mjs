// @ts-check
import { defineConfig } from 'astro/config';

/**
 * Deployment target is GitHub Pages by default.
 *   - project site : https://blackdawnk.github.io/kstagelive  (BASE_PATH=/kstagelive)
 *   - custom domain: https://kstagelive.com                   (BASE_PATH=/)
 *
 * Both are switched by env vars so no code change is needed when the domain lands.
 */
const site = process.env.SITE_URL ?? 'https://blackdawnk.github.io';
const base = process.env.BASE_PATH ?? '/kstagelive';

export default defineConfig({
  site,
  base,
  trailingSlash: 'ignore',
  build: {
    // Emit `/about/index.html` so the static host resolves clean URLs.
    format: 'directory',
  },
  // NFR07: no client JS unless a component explicitly opts in.
  // NFR03: nothing here may add an external origin — see scripts/check-compliance.mjs.
  devToolbar: { enabled: false },
});
