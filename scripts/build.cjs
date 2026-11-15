const path = require('node:path');
const { spawnSync } = require('node:child_process');
process.env.ELECTRON_BUILDER_CACHE ||= path.resolve(__dirname, '../.cache/electron-builder');
process.env.ELECTRON_BUILDER_COMPRESSION_LEVEL ||= '1';
const result = spawnSync(process.execPath, [require.resolve('electron-builder/cli.js'), '--win', process.argv.includes('--folder') ? 'dir' : 'portable', '--x64'], { stdio: 'inherit', env: process.env });
if (result.error) { console.error(result.error.message); process.exit(1); }
process.exit(result.status ?? 1);
