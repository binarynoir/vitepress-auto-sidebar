import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * A nested plain-object description of a directory tree:
 * string values are file contents, `null` an empty directory, and nested
 * objects are subdirectories.
 */
export type Tree = { [name: string]: string | null | Tree };

/** Materializes `tree` under a fresh temp directory and returns its path. */
export function createFixture(tree: Tree): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vitepress-auto-sidebar-test-'));
  writeTree(root, tree);
  return root;
}

/** Recursively removes a fixture directory created by {@link createFixture}. */
export function removeFixture(root: string): void {
  fs.rmSync(root, { recursive: true, force: true });
}

function writeTree(root: string, tree: Tree): void {
  for (const [name, value] of Object.entries(tree)) {
    const fullPath = path.join(root, name);
    if (typeof value === 'string') {
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, value);
    } else if (value === null) {
      fs.mkdirSync(fullPath, { recursive: true });
    } else {
      fs.mkdirSync(fullPath, { recursive: true });
      writeTree(fullPath, value);
    }
  }
}
