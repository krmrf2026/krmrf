import process from 'node:process';
import assert from 'node:assert/strict';
import {loadProtocol,publicationRecords,buildUtm} from './lib/utm.mjs';
const args=process.argv.slice(2), p=loadProtocol(), records=publicationRecords();
const value=flag=>{const i=args.indexOf(flag);return i>=0?args[i+1]:undefined;};
try {
 if(args.includes('--help')||args.includes('-h')) console.log('npm run utm -- --url /news/.../ --source telegram --content post\nUse --both for Telegram/MAX; normal builds generate all links and posts in ops/.');
 else if(args.includes('--self-test')) { const u=new URL(buildUtm(p,{rawUrl:'/news/example/?x=1&utm_source=old#part',source:'telegram'},records)); assert.equal(u.searchParams.get('x'),'1');assert.equal(u.hash,'#part');assert.equal(u.searchParams.get('utm_campaign'),'example');console.log('UTM self-test passed.'); }
 else for(const source of args.includes('--both')?['telegram','max']:[value('--source')]) {
  const url=buildUtm(p,{rawUrl:value('--url'),source,campaign:value('--campaign'),content:value('--content')||'post'},records);
  console.log(args.includes('--both')?source+': '+url:url);
 }
} catch(e) {console.error('UTM error: '+e.message);process.exitCode=1;}
