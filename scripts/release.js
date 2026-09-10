#!/usr/bin/env node
// Bumps the version, tags, and pushes. Pushing the tag triggers
// .github/workflows/release.yml, which tests, builds, publishes to npm,
// and creates the GitHub release — this script only handles the local half.
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const bumpType = process.argv[2];
const validTypes = ['patch', 'minor', 'major', 'prepatch', 'preminor', 'premajor', 'prerelease'];

if (!bumpType) {
  console.error(`Usage: npm run release -- <${validTypes.join('|')}|<version>>`);
  console.error('   or: npm run release:patch / release:minor / release:major');
  process.exit(1);
}

function run(cmd) {
  console.log(`$ ${cmd}`);
  execSync(cmd, { stdio: 'inherit' });
}

function runCapture(cmd) {
  return execSync(cmd, { encoding: 'utf-8' }).trim();
}

const branch = runCapture('git rev-parse --abbrev-ref HEAD');
if (branch !== 'main') {
  console.error(`Refusing to release from branch "${branch}" — switch to main first.`);
  process.exit(1);
}

if (runCapture('git status --porcelain')) {
  console.error('Working tree is not clean — commit or stash your changes first.');
  process.exit(1);
}

run('git fetch origin main');
const local = runCapture('git rev-parse HEAD');
const remote = runCapture('git rev-parse origin/main');
if (local !== remote) {
  console.error('Local main is not in sync with origin/main — pull or push first.');
  process.exit(1);
}

const changelog = readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf-8');
const unreleased = changelog.match(/## \[Unreleased\]\n([\s\S]*?)(?=\n## \[|$)/);
if (!unreleased || !unreleased[1].trim()) {
  console.error('CHANGELOG.md has no entries under [Unreleased] — add release notes first.');
  process.exit(1);
}

run('npm run typecheck');
run('npm run lint');
run('npm run format:check');
run('npm test');
run('npm run build');

run(`npm version ${bumpType}`);
run('git push --follow-tags');

console.log('\nPushed — the release workflow will now test, build, publish to npm, and create the GitHub release.');
