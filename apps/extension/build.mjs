import { build } from 'esbuild';
import { cpSync, mkdirSync, rmSync, existsSync } from 'node:fs';

const API_BASE = process.env.CRMONIA_API_BASE ?? 'https://app.crmonia.com';
// One server per country. Set both to offer a country choice at sign-in; leave them out and the build uses CRMONIA_API_BASE alone.
const REGIONS = Object.fromEntries([['ca', process.env.CRMONIA_API_BASE_CA ?? 'https://ca.crmonia.com'], ['us', process.env.CRMONIA_API_BASE_US ?? 'https://us.crmonia.com']].filter(([, v]) => v));
const DEV_BUILD = process.env.CRMONIA_DEV_BUILD === '1';
const INBOXSDK_APP_ID = process.env.INBOXSDK_APP_ID ?? 'sdk_CRMonia_b26dfb5691';

rmSync('dist', { recursive: true, force: true });
mkdirSync('dist', { recursive: true });
cpSync('public', 'dist', { recursive: true });
if (existsSync('../../node_modules/@inboxsdk/core/pageWorld.js')) {
  cpSync('../../node_modules/@inboxsdk/core/pageWorld.js', 'dist/pageWorld.js');
}
await build({
  entryPoints: { background: 'src/background.ts', content: 'src/content.ts', options: 'src/options.ts' },
  outdir: 'dist', bundle: true, format: 'iife', target: 'chrome120', minify: true, jsx: 'automatic', jsxImportSource: 'preact', sourcemap: false,
  define: { __API_BASE__: JSON.stringify(API_BASE), __REGIONS__: JSON.stringify(REGIONS), __INBOXSDK_APP_ID__: JSON.stringify(INBOXSDK_APP_ID), __DEV_BUILD__: JSON.stringify(DEV_BUILD) },
  logLevel: 'info',
});
