import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {loadProtocol,publicationRecords,campaignFor,buildUtm} from '../../tools/lib/utm.mjs';
import {listPublicFiles} from '../../tools/lib/project.mjs';
const root=process.cwd(),p=loadProtocol(),records=publicationRecords();
test('stable campaigns survive repeat and moved URL; new IDs are automatic',()=>{
 for(const r of records){assert.equal(campaignFor(p,r),p.campaigns[r.id]);assert.equal(new URL(buildUtm(p,{rawUrl:r.url,source:'max',content:'repeat'},records)).searchParams.get('utm_campaign'),p.campaigns[r.id]);assert.equal(new URL(buildUtm(p,{rawUrl:'/moved/',source:'telegram',campaign:campaignFor(p,r)},records)).searchParams.get('utm_campaign'),p.campaigns[r.id]);}
 assert.equal(campaignFor(p,{id:'new-id',url:'/different/'}),'new-id');
});
test('encoding, query and fragment survive; stale UTM keys are replaced once',()=>{
 const u=new URL(buildUtm(p,{rawUrl:'/map/?x=%26%3F&lat=49&UTM_Source=old&utm_term=old#part',source:'max'},records));
 assert.equal(u.searchParams.get('x'),'&?');assert.equal(u.searchParams.get('lat'),'49');assert.equal(u.hash,'#part');assert.equal(u.searchParams.get('UTM_Source'),null);assert.equal(u.searchParams.get('utm_term'),null);assert.equal(u.searchParams.get('utm_source'),'max');assert.equal(u.searchParams.get('utm_campaign'),'map');
});
test('invalid domain, credentials, spelling and source are rejected',()=>{
 for(const change of [{rawUrl:'https://evil.example/'},{rawUrl:'//evil.example/'},{rawUrl:'https://x:y@krmrf.ru/'},{source:'Telegram'},{source:'constructor'},{campaign:'Wrong Campaign'},{campaign:'x'.repeat(81)},{content:'POST'}])assert.throws(()=>buildUtm(p,{rawUrl:'/map/',source:'telegram',...change},records));
});
test('a registry-only channel addition produces posts; stale output and collisions fail',t=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'krm-utm-'));t.after(()=>fs.rmSync(tmp,{recursive:true,force:true}));fs.mkdirSync(path.join(tmp,'data'));
 const c=structuredClone(p);c.channels.vk={source:'vk',medium:'social'};fs.writeFileSync(path.join(tmp,'data/utm-campaigns.json'),JSON.stringify(c));fs.writeFileSync(path.join(tmp,'data/pages.json'),JSON.stringify([{id:'new-id',url:'/new/',title:'New',excerpt:'Text'}]));
 for(const d of ['', 'new','map']){fs.mkdirSync(path.join(tmp,d),{recursive:true});fs.writeFileSync(path.join(tmp,d,'index.html'),'test');}
 const run=(...args)=>spawnSync(process.execPath,[path.join(root,'tools/publish-links.mjs'),...args],{cwd:tmp,encoding:'utf8'});
 assert.equal(run().status,0);assert.equal(JSON.parse(fs.readFileSync(path.join(tmp,'ops/publish-links.json'))).links.length,9);assert.equal(run('--check').status,0);
 fs.writeFileSync(path.join(tmp,'ops/posts/vk/new-id.md'),'wrong');assert.notEqual(run('--check').status,0);c.campaigns['new-id']='map';fs.writeFileSync(path.join(tmp,'data/utm-campaigns.json'),JSON.stringify(c));assert.notEqual(run().status,0);
});
test('internal links and canonicals do not contain UTM',()=>{
 for(const file of listPublicFiles(root).filter(x=>x.endsWith('.html')))for(const m of fs.readFileSync(file,'utf8').matchAll(/<(?:a|link)\b[^>]*href=["']([^"']+)["'][^>]*>/gi)){
  const u=new URL(m[1].replaceAll('&amp;','&'),p.site);if(u.origin===p.site)assert.equal([...u.searchParams.keys()].some(k=>/^utm_/i.test(k)),false,file);
 }
});
