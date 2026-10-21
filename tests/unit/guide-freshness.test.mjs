import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {spawnSync} from 'node:child_process';
test('warning permits release, strict monitor alerts and overdue blocks without changing dates',t=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'krm-guide-'));t.after(()=>fs.rmSync(tmp,{recursive:true,force:true}));fs.mkdirSync(path.join(tmp,'data'));
 const file=path.join(tmp,'data/pages.json'),data=JSON.stringify([{id:'test',type:'guide',dateModified:'2026-09-24',reviewedAt:'2026-09-24',reviewAfter:'2026-10-24',reviewCadenceDays:30,reviewStatus:'current'}]);fs.writeFileSync(file,data);
 const run=(date,...args)=>spawnSync(process.execPath,[path.resolve('tools/review-guides.mjs'),'--check','--date='+date,...args],{cwd:tmp,encoding:'utf8'});
 assert.equal(run('2026-10-16','--strict-warning').status,0);assert.equal(run('2026-10-18').status,0);assert.equal(run('2026-10-18','--strict-warning').status,1);assert.equal(run('2026-10-24').status,0);assert.equal(run('2026-10-25').status,1);assert.equal(fs.readFileSync(file,'utf8'),data);
});
test('selected review preserves other guides; invalid selections never become bulk updates',t=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'krm-guide-select-'));t.after(()=>fs.rmSync(tmp,{recursive:true,force:true}));fs.mkdirSync(path.join(tmp,'data'));
 const file=path.join(tmp,'data/pages.json');
 const guide=id=>({id,type:'guide',dateModified:'2026-09-24',reviewedAt:'2026-09-24',reviewAfter:'2026-10-24',reviewCadenceDays:30,reviewStatus:'current'});
 const source=[guide('first'),guide('second'),{id:'article',type:'article'}];fs.writeFileSync(file,JSON.stringify(source));
 const run=(...args)=>spawnSync(process.execPath,[path.resolve('tools/review-guides.mjs'),'--date=2026-10-19',...args],{cwd:tmp,encoding:'utf8'});
 for(const args of [['--id=first','--id=missing'],['--id='],['--id'],['--ids=first']]){
  const before=fs.readFileSync(file,'utf8');assert.equal(run(...args).status,1);assert.equal(fs.readFileSync(file,'utf8'),before);
 }
 assert.equal(run('--id=first').status,0);
 const after=JSON.parse(fs.readFileSync(file,'utf8'));assert.equal(after[0].reviewedAt,'2026-10-19');assert.equal(after[0].reviewAfter,'2026-11-18');assert.deepEqual(after[1],source[1]);assert.deepEqual(after[2],source[2]);
 const check=(...args)=>spawnSync(process.execPath,[path.resolve('tools/review-guides.mjs'),'--check','--date=2026-11-01',...args],{cwd:tmp,encoding:'utf8'});
 assert.equal(check('--id=first').status,0);assert.equal(check().status,1);
});
