import fs from 'node:fs';
import path from 'node:path';
import { SITE_URL } from './project.mjs';
const token = value => typeof value === 'string' && /^[a-z0-9][a-z0-9_-]{0,79}$/.test(value);
export const loadProtocol = (root = process.cwd()) => {
  const p = JSON.parse(fs.readFileSync(path.join(root, 'data/utm-campaigns.json'), 'utf8'));
  if (p.schema_version !== 1 || p.site !== SITE_URL || p.new_publication_campaign_rule !== 'publication_id') throw Error('Unsupported UTM registry');
  if (!p.channels?.telegram || !p.channels?.max) throw Error('Telegram and MAX channels are required');
  const used = new Set();
  for (const [key, channel] of Object.entries(p.channels)) {
    if (!token(key) || !token(channel.source) || !token(channel.medium) || used.has(channel.source)) throw Error('Invalid or duplicate source: ' + key);
    used.add(channel.source);
  }
  if (!Array.isArray(p.placements) || !p.placements.includes('post') || p.placements.some(x => !token(x)) || new Set(p.placements).size !== p.placements.length) throw Error('Invalid placements');
  if (!p.campaigns || Object.values(p.campaigns).some(x => !token(x))) throw Error('Invalid campaigns');
  return p;
};
export const publicationRecords = (root = process.cwd()) => [
  { id: '_home', url: '/', title: 'KRM РФ', excerpt: 'Архив Кременной, ЛНР и практические справки.' },
  { id: '_map', url: '/map/', title: 'Карта KRM РФ', excerpt: 'Оценка территориального контроля, дата среза и ограничения.' },
  ...JSON.parse(fs.readFileSync(path.join(root, 'data/pages.json'), 'utf8'))
];
export const campaignFor = (p, item) => {
  const value = p.campaigns[item.id] || item.id;
  if (!token(value)) throw Error('Invalid stable campaign: ' + item.id);
  return value;
};
export const buildUtm = (p, { rawUrl, source, campaign, content = 'post' }, records = []) => {
  if (!rawUrl) throw Error('--url is required');
  if (!Object.hasOwn(p.channels, source)) throw Error('Unsupported source');
  const channel = p.channels[source];
  if (!channel) throw Error('Unsupported source');
  if (!p.placements.includes(content)) throw Error('Unsupported content');
  const url = new URL(rawUrl, p.site);
  if (url.origin !== p.site || url.username || url.password) throw Error('Foreign URL or credentials');
  const item = records.find(x => x.url === url.pathname);
  const campaignValue = campaign || (item ? campaignFor(p, item) : url.pathname.split('/').filter(Boolean).at(-1) || 'home');
  if (!token(campaignValue)) throw Error('Campaign must be lowercase Latin letters, digits, _ or -, up to 80 characters');
  for (const key of [...url.searchParams.keys()]) if (/^utm_/i.test(key)) url.searchParams.delete(key);
  for (const [key, value] of Object.entries({source:channel.source, medium:channel.medium, campaign:campaignValue, content})) url.searchParams.set('utm_' + key, value);
  return url.href;
};
