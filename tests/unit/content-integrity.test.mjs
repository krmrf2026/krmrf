import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {spawnSync} from 'node:child_process';
function fixture(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'krm-integrity-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));fs.mkdirSync(path.join(dir,'data'));fs.mkdirSync(path.join(dir,'tools'),{recursive:true});fs.copyFileSync('tools/content-integrity.mjs',path.join(dir,'tools/content-integrity.mjs'));fs.cpSync('tools/lib',path.join(dir,'tools/lib'),{recursive:true});fs.writeFileSync(path.join(dir,'data/pages.json'),JSON.stringify([{id:'a',url:'/a/'},{id:'b',url:'/b/'}]));for(const id of ['a','b']){fs.mkdirSync(path.join(dir,id));fs.writeFileSync(path.join(dir,id,'index.html'),`<article class="article"><p>${id}</p></article>`);}const file=path.join(dir,'data/content-integrity.json');fs.writeFileSync(file,JSON.stringify({schema:'krmrf-content-integrity-v2',pages:{}}));const run=(...args)=>spawnSync(process.execPath,[path.join(dir,'tools/content-integrity.mjs'),...args],{cwd:dir,encoding:'utf8'});assert.equal(run('--write','--id=a','--id=b').status,0);return {dir,file,run};}
test('locking A never approves accidental changes in B',t=>{
 const f=fixture(t);const saved=JSON.parse(fs.readFileSync(f.file));for(const id of ['a','b'])fs.writeFileSync(path.join(f.dir,id,'index.html'),`<article class="article"><p>changed ${id}</p></article>`);
 assert.equal(f.run('--write','--id=a').status,0);const after=JSON.parse(fs.readFileSync(f.file));assert.notEqual(after.pages['/a/'],saved.pages['/a/']);assert.equal(after.pages['/b/'],saved.pages['/b/']);assert.equal(f.run().status,1);
});
test('bulk, empty and mixed unknown writes cannot modify manifest',t=>{
 const f=fixture(t);const before=fs.readFileSync(f.file,'utf8');for(const args of [['--write'],['--write','--id='],['--write','--id=a','--id=missing'],['--write','--ids=a']]){assert.equal(f.run(...args).status,1);assert.equal(fs.readFileSync(f.file,'utf8'),before);}
});
test('missing article is an error rather than a valid empty hash',t=>{
 const f=fixture(t);fs.writeFileSync(path.join(f.dir,'b/index.html'),'<main>No article</main>');const before=fs.readFileSync(f.file,'utf8');assert.equal(f.run('--write','--id=a').status,1);assert.equal(fs.readFileSync(f.file,'utf8'),before);
});
