import fs from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(process.cwd());
const standalone = path.resolve(root, '.next', 'standalone');
const publicTarget = path.resolve(standalone, 'public');
const staticTarget = path.resolve(standalone, '.next', 'static');

for (const target of [standalone, publicTarget, staticTarget]) {
  const relative = path.relative(root, target);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`拒绝工作区外路径：${target}`);
  }
}

await fs.access(path.join(standalone, 'server.js'));
await fs.rm(publicTarget, { recursive: true, force: true });
await fs.rm(staticTarget, { recursive: true, force: true });
await fs.mkdir(path.dirname(staticTarget), { recursive: true });
await fs.cp(path.join(root, 'public'), publicTarget, { recursive: true });
await fs.cp(path.join(root, '.next', 'static'), staticTarget, { recursive: true });
console.log('standalone 运行目录已包含 public 与 .next/static。');
