import fs from 'node:fs';
import path from 'node:path';
import {loadProtocol, publicationRecords, campaignFor, buildUtm} from './lib/utm.mjs';
const root=process.cwd(), protocol=loadProtocol(root), records=publicationRecords(root), ids=new Set(), urls=new Set(), campaigns=new Set(), links=[], files=new Map();
for (const item of records) {
  if (ids.has(item.id) || urls.has(item.url) || !/^\/(?:[a-z0-9_-]+\/)*$/.test(item.url)) throw Error('Invalid/duplicate publication: '+item.id);
  ids.add(item.id);urls.add(item.url);
  const campaign=campaignFor(protocol,item);
  if (campaigns.has(campaign)) throw Error('Campaign collision: '+campaign);
  campaigns.add(campaign);
  if (!fs.existsSync(path.join(root,item.url.slice(1),'index.html'))) throw Error('Missing landing: '+item.url);
  for (const channel of Object.keys(protocol.channels)) {
    const url=buildUtm(protocol,{rawUrl:item.url,source:channel,campaign,content:'post'},records);
    links.push({publication_id:item.id,channel,campaign,content:'post',canonical:protocol.site+item.url,url});
    files.set(`posts/${channel}/${item.id}.md`,`${item.title}\n\n${item.excerpt||''}\n\n${url}\n`);
  }
}
files.set('publish-links.json',JSON.stringify({schema_version:1,links},null,2)+'\n');
files.set('publish-links.tsv','publication_id\tchannel\tcampaign\turl\n'+links.map(x=>[x.publication_id,x.channel,x.campaign,x.url].join('\t')).join('\n')+'\n');
files.set('publication-campaigns.json',JSON.stringify({schema_version:1,campaigns:Object.fromEntries(links.filter(x=>x.channel==='telegram').map(x=>[x.publication_id,x.campaign]))},null,2)+'\n');
if (process.argv.includes('--summary')) {
  console.log('# Готовые ссылки для публикации\n\nВсе ссылки и тексты создаются в ops/. Отправку во внешние каналы выполняет редактор.\n');
  for (const item of records.slice(2).sort((a,b)=>b.datePublished.localeCompare(a.datePublished)).slice(0,10)) console.log(`- **${item.title.replaceAll('*','')}**: `+links.filter(x=>x.publication_id===item.id).map(x=>`[${x.channel}](${x.url})`).join(' · '));
} else {
  const check=process.argv.includes('--check');
  if (check) {
    for (const [name,text] of files) if (!fs.existsSync(path.join(root,'ops',name)) || fs.readFileSync(path.join(root,'ops',name),'utf8')!==text) throw Error('Stale publication bundle: '+name);
  } else {
    fs.rmSync(path.join(root,'ops/posts'),{recursive:true,force:true});
    for (const [name,text] of files) {const file=path.join(root,'ops',name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,text);}
  }
  console.log(`Publication bundle ${check?'verified':'generated'}: ${links.length} links, ${records.length} landing pages.`);
}
