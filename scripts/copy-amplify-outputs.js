#!/usr/bin/env node
import fs from 'fs';

const src  = 'amplify_outputs.json';
const dest = 'src/lib/amplify-outputs.ts';

if (!fs.existsSync(src)) {
  console.warn('WARNING: ' + src + ' not found. Run npm run sandbox first.');
  process.exit(0);
}

const outputs = JSON.parse(fs.readFileSync(src, 'utf8'));

const ts = [
  '// AUTO-GENERATED — do not edit.',
  '// Source: ' + src + '  |  Regenerate: node scripts/copy-amplify-outputs.js',
  '// eslint-disable-next-line @typescript-eslint/no-explicit-any',
  'const amplifyOutputs: any = ' + JSON.stringify(outputs, null, 2) + ';',
  '',
  'export default amplifyOutputs;',
].join('\n');

fs.writeFileSync(dest, ts);
console.log('Wrote ' + dest);

fs.mkdirSync('public', { recursive: true });
fs.copyFileSync(src, 'public/amplify_outputs.json');
console.log('Copied amplify_outputs.json to public/');
