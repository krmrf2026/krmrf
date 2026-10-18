import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {spawnSync} from 'node:child_process';
test('warning permits release, strict monitor alerts and overdue blocks without changing dates',t=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'krm-guide-'));t.after(()=>fs.rmSync(tmp,{recursive:true,force:true}));fs.mkdirSync(path.join(tmp,'data'));
 const file=path.join(tmp,'data/pages.json'),data=JSON.stringify([{id:'test',type:'guide',dateModified:'2026-09-24',reviewedAt:'2026-09-24',reviewAfter:'2026-10-24',reviewCadenceDays:30,reviewStatus:'current'}]);fs.writeFileSync(file,data);
 const run=(date,...args)=>spawnSync(process.execPath,[path.resolve('tools/review-guides.mjs'),'--check','--date='+date,...args],{cwd:tmp,encoding:'utf8'});
 assert.equal(run('2026-10-16','--strict-warning').status,0);assert.equal(run('2026-10-18').status,0);assert.equal(run('2026-10-18','--strict-warning').status,1);assert.equal(run('2026-10-24').status,0);assert.equal(run('2026-10-25').status,1);assert.equal(fs.readFileSync(file,'utf8'),data);
});
