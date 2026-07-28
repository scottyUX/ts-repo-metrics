/**
 * Resolve the corpus described by corpus.json into concrete local checkouts.
 *
 * Clones each pinned repository into <corpusDir>/<name> at its pinned commit
 * (skipping the clone when it is already present at that commit), and resolves
 * the `self` entry to this repository's working tree at its current HEAD.
 *
 * Prints the resolved corpus as JSON on stdout:
 *   [{ name, path, commit, url }]
 *
 * Usage: node prepare_corpus.mjs <corpus.json> <corpusDir> <repoRoot>
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const [configPath, corpusDir, repoRoot] = process.argv.slice(2);
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const git = (args, cwd) =>
  execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }).trim();

const resolved = [];

for (const repo of config.repos) {
  if (repo.self) {
    resolved.push({
      name: repo.name,
      path: repoRoot,
      commit: git(['rev-parse', 'HEAD'], repoRoot),
      url: repo.url,
    });
    continue;
  }

  const dest = path.join(corpusDir, repo.name);
  let needsClone = true;
  if (fs.existsSync(path.join(dest, '.git'))) {
    try {
      needsClone = git(['rev-parse', 'HEAD'], dest) !== repo.commit;
    } catch {
      needsClone = true;
    }
  }

  if (needsClone) {
    fs.rmSync(dest, { recursive: true, force: true });
    // Fetch just the pinned commit; falls back to a full clone for servers that
    // do not allow fetching a bare SHA.
    fs.mkdirSync(dest, { recursive: true });
    try {
      git(['init', '-q'], dest);
      git(['remote', 'add', 'origin', repo.url], dest);
      git(['fetch', '-q', '--depth', '1', 'origin', repo.commit], dest);
      git(['checkout', '-q', 'FETCH_HEAD'], dest);
    } catch {
      fs.rmSync(dest, { recursive: true, force: true });
      git(['clone', '-q', repo.url, dest], corpusDir);
      git(['checkout', '-q', repo.commit], dest);
    }
  }

  resolved.push({
    name: repo.name,
    path: dest,
    commit: git(['rev-parse', 'HEAD'], dest),
    url: repo.url,
  });
}

process.stdout.write(JSON.stringify(resolved, null, 2));
