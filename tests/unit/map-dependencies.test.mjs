import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {spawnSync} from 'node:child_process';
test('known vulnerable dependency and missing worker CSP cannot pass',t=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'krm-map-deps-'));t.after(()=>fs.rmSync(tmp,{recursive:true,force:true}));
 for(const file of ['map/index.html','assets/js/map-loader.js']){fs.mkdirSync(path.dirname(path.join(tmp,file)),{recursive:true});fs.copyFileSync(file,path.join(tmp,file));}
 const file=path.join(tmp,'map/index.html'),html=fs.readFileSync(file,'utf8'),run=()=>spawnSync(process.execPath,[path.resolve('tools/check-map-dependencies.mjs'),'--root='+tmp],{encoding:'utf8'});
 assert.equal(run().status,0);fs.writeFileSync(file,html.replace("worker-src 'self' blob: https://unpkg.com/maplibre-gl@6.4.1/dist/","worker-src 'self' blob:"));assert.notEqual(run().status,0);
 fs.writeFileSync(file,html.replaceAll('@6.4.1','@5.24.0'));const loader=path.join(tmp,'assets/js/map-loader.js');fs.writeFileSync(loader,fs.readFileSync(loader,'utf8').replaceAll('@6.4.1','@5.24.0'));assert.notEqual(run().status,0);
});
