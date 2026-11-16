// package.json has "type": "module", but the Electron main process and preload are compiled to
// CommonJS (a sandboxed preload cannot be ESM). This marks dist-electron/ as CommonJS.
import { writeFileSync } from 'node:fs';

writeFileSync('dist-electron/package.json', '{ "type": "commonjs" }\n');
