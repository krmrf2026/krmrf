import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

const script = path.resolve('tools/qa-visible.mjs');
const scenario = code => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(),'krm-qa-progress-'));
  const dir = path.join(root,'bin');
  fs.mkdirSync(dir);
  const file = path.join(dir,'npm');
  fs.writeFileSync(file,'#!/bin/sh\nprintf "npm notice run krmrf-static-archive@mock build\\n"\nprintf "Сборка завершена: 98 публикаций.\\n"\nexit '+code+'\n',{mode:0o755});
  try {
    const result = spawnSync(process.execPath,[script],{
      cwd:root,encoding:'utf8',env:{...process.env,PATH:dir+path.delimiter+process.env.PATH},timeout:10000
    });
    const log=fs.readFileSync(path.join(root,'.cache/qa-last.log'),'utf8');
    return {...result,log};
  } finally { fs.rmSync(root,{recursive:true,force:true}); }
};
test('qa:visible preserves success status and writes the complete log',()=>{
  const result=scenario(0);
  assert.equal(result.status,0,result.stderr);
  assert.match(result.stdout,/PASS: полная QA/);
  assert.match(result.stdout,/build/);
  assert.match(result.log,/Сборка завершена/);
});
test('qa:visible propagates failures instead of hiding a red QA',()=>{
  const result=scenario(5);
  assert.equal(result.status,5,result.stderr);
  assert.match(result.stderr,/QA EXIT 5/);
});
