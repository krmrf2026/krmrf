import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {spawnSync} from 'node:child_process';
import {todayIso,addUtcDays,requiresReview,guideFreshnessState} from '../../tools/lib/guide-freshness.mjs';
const tool=path.resolve('tools/review-guides.mjs');
const guide=(id='first',extra={})=>({id,type:'guide',datePublished:'2026-09-01',dateModified:'2026-09-24',reviewedAt:'2026-09-24',reviewAfter:'2026-10-24',reviewCadenceDays:30,reviewStatus:'current',...extra});
function fixture(t,data){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'krm-review-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));fs.mkdirSync(path.join(dir,'data'));const file=path.join(dir,'data/pages.json');fs.writeFileSync(file,JSON.stringify(data));return {dir,file,run:(...args)=>spawnSync(process.execPath,[tool,...args],{cwd:dir,encoding:'utf8'})};}
test('seven-day boundary and honest overdue: release warns, strict monitor alerts',t=>{
 const f=fixture(t,[guide()]);const before=fs.readFileSync(f.file,'utf8');
 assert.equal(f.run('--check','--date=2026-10-16','--strict-warning').status,0);
 assert.equal(f.run('--check','--date=2026-10-17').status,0);
 assert.equal(f.run('--check','--date=2026-10-17','--strict-warning').status,1);
 assert.equal(f.run('--check','--date=2026-10-24').status,0);
 assert.equal(f.run('--check','--date=2026-10-25').status,1); // false current still blocks
 fs.writeFileSync(f.file,JSON.stringify([guide('first',{reviewStatus:'review-due'})]));
 assert.equal(f.run('--check','--date=2026-10-25').status,0);
 assert.equal(f.run('--check','--date=2026-10-25','--strict-warning').status,1);
 assert.notEqual(fs.readFileSync(f.file,'utf8'),before);
});
test('unscoped, empty, unknown and mixed ID writes are atomic failures',t=>{
 const f=fixture(t,[guide(),guide('second')]);const before=fs.readFileSync(f.file,'utf8');
 for(const args of [[],['--id='],['--id'],['--ids=first'],['--id=first','--id=missing']]){
  assert.equal(f.run('--date=2026-10-19',...args).status,1);assert.equal(fs.readFileSync(f.file,'utf8'),before);
 }
});
test('selected review preserves existing interval and all other records',t=>{
 const source=[guide(),guide('second'),{id:'news',type:'article'}];const f=fixture(t,source);
 assert.equal(f.run('--id=first','--date=2026-10-19').status,0);const result=JSON.parse(fs.readFileSync(f.file,'utf8'));
 assert.equal(result[0].reviewAfter,'2026-11-18');assert.deepEqual(result.slice(1),source.slice(1));
});
test('new stable guide defaults to90;180 is allowed,181 fails without writes',t=>{
 const f=fixture(t,[{id:'new',type:'guide',datePublished:'2026-09-01',dateModified:'2026-09-24'}]);
 assert.equal(f.run('--id=new','--date=2026-10-19').status,0);assert.equal(JSON.parse(fs.readFileSync(f.file))[0].reviewCadenceDays,90);
 assert.equal(f.run('--id=new','--date=2026-10-19','--cadence-days=180').status,0);
 const before=fs.readFileSync(f.file,'utf8');assert.equal(f.run('--id=new','--date=2026-10-19','--cadence-days=181').status,1);assert.equal(fs.readFileSync(f.file,'utf8'),before);
});
test('future review, invalid publication date and critical blocker fail atomically',t=>{
 for(const extra of [{datePublished:'2026-02-30'},{dateModified:'2099-01-01'},{reviewBlocker:'Подтверждён неверный срок выплаты'}]){
  const f=fixture(t,[guide(),guide('second',extra)]);const before=fs.readFileSync(f.file,'utf8');assert.equal(f.run('--id=first','--id=second','--date=2026-10-19').status,1);assert.equal(fs.readFileSync(f.file,'utf8'),before);
 }
 const f=fixture(t,[guide()]);assert.equal(f.run('--id=first','--date=2099-01-01').status,1);
});
test('pending new revision cannot claim current, but does not invent a review date',t=>{
 const f=fixture(t,[guide('first',{dateModified:'2026-10-20'})]);assert.equal(f.run('--check','--date=2026-10-21').status,1);
 const item=guide('first',{dateModified:'2026-10-20',reviewStatus:'review-due'});fs.writeFileSync(f.file,JSON.stringify([item]));assert.equal(f.run('--check','--date=2026-10-21').status,0);assert.deepEqual(JSON.parse(fs.readFileSync(f.file))[0],item);
});
test('sync only downgrades expired current; invalid data prevents every mutation',t=>{
 const expired=guide('first',{reviewedAt:'2020-01-01',reviewAfter:'2020-01-31',datePublished:'2019-01-01',dateModified:'2019-01-01'});const f=fixture(t,[expired]);assert.equal(f.run('--sync-status').status,0);const result=JSON.parse(fs.readFileSync(f.file))[0];assert.equal(result.reviewStatus,'review-due');for(const key of ['reviewedAt','reviewAfter','dateModified','reviewCadenceDays'])assert.equal(result[key],expired[key]);
 fs.writeFileSync(f.file,JSON.stringify([expired,guide('second',{reviewedAt:'BAD'})]));const before=fs.readFileSync(f.file,'utf8');assert.equal(f.run('--sync-status').status,1);assert.equal(fs.readFileSync(f.file,'utf8'),before);
});
test('practical article with metadata participates, dated news remains historical',t=>{
 assert.equal(requiresReview({type:'article'}),false);assert.equal(requiresReview({type:'article',reviewedAt:'2026-10-14'}),true);
 const f=fixture(t,[{...guide(),type:'article'}]);assert.equal(f.run('--check','--date=2026-10-25').status,1);
});
test('report is produced even on invalid metadata and does not alter catalog',t=>{
 const f=fixture(t,[guide('first',{reviewedAt:'BAD'})]);const before=fs.readFileSync(f.file,'utf8');assert.equal(f.run('--check','--report=ops/editorial-review').status,1);const report=JSON.parse(fs.readFileSync(path.join(f.dir,'ops/editorial-review.json')));assert.ok(report.errors.length);assert.equal(fs.readFileSync(f.file,'utf8'),before);
});
test('Moscow midnight and interval arithmetic are deterministic',()=>{
 assert.equal(todayIso(new Date('2026-10-24T21:30:00Z')),'2026-10-25');assert.equal(addUtcDays('2026-10-25',90),'2027-01-23');assert.equal(guideFreshnessState(guide('x',{reviewStatus:'review-due'}),'2026-10-19').state,'unreviewed');
});
