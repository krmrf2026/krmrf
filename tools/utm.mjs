import process from 'node:process';
import { SITE_URL } from './lib/project.mjs';

const args = process.argv.slice(2);
const value = flag => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : ''; };
const has = flag => args.includes(flag);
const CONTENT = new Set(['post', 'previous', 'repeat', 'pinned', 'comment', 'profile', 'digest']);

const usage = () => console.log(`KRM РФ UTM generator\n\nUsage:\n  npm run utm -- --url /news/... --source telegram --content post\n  npm run utm -- --url /news/... --source max --content post\n  npm run utm -- --url /news/... --both --content post\n\nOptions:\n  --url        Absolute krmrf.ru URL or site-relative path (required)\n  --source     telegram | max\n  --both       Print Telegram and MAX links\n  --campaign   Override campaign; default is the URL slug\n  --content    post | previous | repeat | pinned | comment | profile | digest\n`);

const slug = input => String(input || '').toLowerCase().trim()
  .replace(/[^a-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 80);

const build = ({ rawUrl, source, campaign, content }) => {
  if (!rawUrl) throw new Error('--url is required');
  if (!['telegram', 'max'].includes(source)) throw new Error('source must be telegram or max');
  if (content && !CONTENT.has(content)) throw new Error(`unsupported --content: ${content}`);
  const url = new URL(rawUrl, SITE_URL);
  if (url.origin !== new URL(SITE_URL).origin) throw new Error(`URL must belong to ${SITE_URL}`);
  for (const key of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term']) url.searchParams.delete(key);
  const parts = url.pathname.split('/').filter(Boolean);
  const campaignValue = slug(campaign || parts.at(-1) || 'home');
  if (!campaignValue) throw new Error('campaign must contain latin letters, digits, _ or -');
  url.searchParams.set('utm_source', source);
  url.searchParams.set('utm_medium', 'messenger');
  url.searchParams.set('utm_campaign', campaignValue);
  if (content) url.searchParams.set('utm_content', content);
  return url.href;
};

if (has('--help') || has('-h')) { usage(); process.exit(0); }
if (has('--self-test')) {
  const sample = new URL(build({ rawUrl: '/news/example/?x=1&utm_source=old#part', source: 'telegram', content: 'post' }));
  const ok = sample.pathname === '/news/example/' && sample.searchParams.get('x') === '1'
    && sample.searchParams.get('utm_source') === 'telegram' && sample.searchParams.get('utm_medium') === 'messenger'
    && sample.searchParams.get('utm_campaign') === 'example' && sample.searchParams.get('utm_content') === 'post'
    && sample.hash === '#part';
  const previous = new URL(build({ rawUrl: '/assessment/2026-09-27/', source: 'max', campaign: '2026-10-04', content: 'previous' }));
  const previousOk = previous.searchParams.get('utm_source') === 'max'
    && previous.searchParams.get('utm_medium') === 'messenger'
    && previous.searchParams.get('utm_campaign') === '2026-10-04'
    && previous.searchParams.get('utm_content') === 'previous';
  if (!ok || !previousOk) throw new Error(`UTM self-test failed: ${sample.href} | ${previous.href}`);
  console.log('UTM self-test passed.'); process.exit(0);
}

try {
  const rawUrl = value('--url'); const campaign = value('--campaign'); const content = value('--content');
  if (has('--both')) for (const source of ['telegram', 'max']) console.log(`${source}: ${build({ rawUrl, source, campaign, content })}`);
  else {
    const source = value('--source');
    if (!source) throw new Error('--source is required unless --both is used');
    console.log(build({ rawUrl, source, campaign, content }));
  }
} catch (error) {
  console.error(`UTM error: ${error.message}`); usage(); process.exit(1);
}
