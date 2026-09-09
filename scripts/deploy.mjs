#!/usr/bin/env node
/**
 * Publish dist/ to the gh-pages branch.
 *
 * This exists because the local gh token lacks the `workflow` scope, so
 * .github/workflows/deploy.yml cannot be pushed yet. Once the scope is granted
 * (`gh auth refresh -s workflow`), push that workflow and Actions takes over —
 * this script then becomes a manual fallback rather than the main path.
 *
 * Runs the same gates as CI first: a build that would fail compliance or the
 * performance budget must not reach the public site.
 *
 * Usage: node scripts/deploy.mjs [--skip-build]
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, cpSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const REPO = 'https://github.com/blackdawnk/kstagelive.git';
const BRANCH = 'gh-pages';
const skipBuild = process.argv.includes('--skip-build');

/** npm is a .cmd shim on Windows; resolving it avoids needing `shell: true`. */
const NPM = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const run = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, { stdio: 'inherit', shell: false, ...opts });

const quiet = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], ...opts }).toString().trim();

if (!skipBuild) {
  console.log('→ sync');
  run('node', ['scripts/sync.mjs']);
  console.log('→ build');
  run(NPM, ['run', 'build']);
}

if (!existsSync('dist/index.html')) {
  console.error('deploy: dist/index.html missing — build first.');
  process.exit(1);
}

console.log('→ gates');
run(NPM, ['run', 'check:compliance']);
run(NPM, ['run', 'check:budget']);

// GitHub Pages runs Jekyll by default, which drops directories beginning with
// an underscore — including Astro's _astro/ bundle. Without this the CSS 404s.
writeFileSync('dist/.nojekyll', '');

const staging = mkdtempSync(join(tmpdir(), 'kstagelive-deploy-'));
try {
  console.log(`→ staging ${staging}`);
  cpSync('dist', staging, { recursive: true });

  const git = (...args) => quiet('git', ['-C', staging, ...args]);
  git('init', '-q', '-b', BRANCH);
  git('config', 'user.name', 'han');
  git('config', 'user.email', 'hanwj@ibizsoftware.net');
  git('add', '-A');
  git('commit', '-q', '-m', `Deploy kstagelive (${new Date().toISOString().slice(0, 16)}Z)`);

  console.log(`→ push ${BRANCH}`);
  git('push', '-f', '-q', REPO, `${BRANCH}:${BRANCH}`);

  const sha = git('rev-parse', '--short', 'HEAD');
  console.log(`\n✓ deployed ${sha} → https://blackdawnk.github.io/kstagelive/`);
} finally {
  rmSync(staging, { recursive: true, force: true });
}
