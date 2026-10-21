import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const script = path.resolve('tools/preflight-new-articles.mjs');
const make = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'krm-articles-'));
  const write = (file, content) => {
    const full = path.join(root, file);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, typeof content === 'string' ? content : JSON.stringify(content, null, 2) + '\n');
  };
  write('data/pages.json', [{id:'old-id',url:'/news/old/',locations:['ЛНР']}]);
  write('data/utm-campaigns.json', {campaigns:{'old-id':'historic-name',_home:'home',_map:'map'}});
  write('data/taxonomy.json', {locations:{'ЛНР':'ЛНР'},topics:{}});
  write('news/old/index.html', '<html><head><link rel="canonical" href="https://krmrf.ru/news/old/"></head><body><h1>Test</h1></body></html>');
  return {root,write,run:(...args)=>spawnSync(process.execPath,[script,...args],{cwd:root,encoding:'utf8'})};
};
const managed = fn => t => {
  const f = make();
  t.after(() => fs.rmSync(f.root, {recursive:true, force:true}));
  return fn(f);
};
test('checks existing pages without Git and leaves the registries untouched', managed(({run,root}) => {
  const old = fs.readFileSync(path.join(root,'data/utm-campaigns.json'),'utf8');
  assert.equal(run().status, 0);
  assert.equal(fs.readFileSync(path.join(root,'data/utm-campaigns.json'),'utf8'),old);
}));
test('automatically adds only new UTM ids and preserves historical campaigns', managed(({run,write,root}) => {
  write('data/pages.json', [
    {id:'old-id',url:'/news/old/',locations:['ЛНР']},
    {id:'new-id',url:'/news/new/',locations:['ЛНР']}
  ]);
  write('news/new/index.html', '<html><head><link rel="canonical" href="https://krmrf.ru/news/new/"></head><body></body></html>');
  assert.equal(run().status,1);
  assert.match(run().stderr,/нет UTM-кампании/);
  assert.equal(run('--sync-utm').status,0);
  const u=JSON.parse(fs.readFileSync(path.join(root,'data/utm-campaigns.json'),'utf8'));
  assert.equal(u.campaigns['new-id'],'new-id');
  assert.equal(u.campaigns['old-id'],'historic-name');
  assert.equal(run().status,0);
  assert.equal(run('--sync-utm').status,0);
}));
test('invalid taxonomy stops UTM edits rather than hiding mistakes', managed(({run,write,root}) => {
  write('data/pages.json', [{id:'new-id',url:'/news/new/',locations:['Волчанский котёл']}]);
  write('news/new/index.html', '<head><link rel="canonical" href="https://krmrf.ru/news/new/"></head>');
  const previous=fs.readFileSync(path.join(root,'data/utm-campaigns.json'),'utf8');
  const result=run('--sync-utm');
  assert.equal(result.status,1);
  assert.match(result.stderr,/Волчанский котёл/);
  assert.equal(fs.readFileSync(path.join(root,'data/utm-campaigns.json'),'utf8'),previous);
}));
test('detects tables without caption, inline styles and HTML body fragments', managed(({run,write}) => {
  write('news/old/index.html', '<link rel="canonical" href="https://krmrf.ru/news/old/"><table style="color:red"><tr><td>x</td></tr></table>');
  write('editorial/WRONG_BODY.html','<div>fragment</div>');
  write('assets/img/news/svo/.gitkeep','');
  const result=run();
  assert.equal(result.status,1);
  for(const needle of ['caption','inline style','фрагмент','gitkeep']) assert.match(result.stderr,new RegExp(needle));
}));
test('unknown arguments fail safely', managed(({run}) => {
  assert.equal(run('--garbage').status,2);
}));

test('duplicate publication ids and urls are blocked before any UTM mutation', managed(({run,write,root}) => {
  write('data/pages.json', [
    {id:'old-id',url:'/news/old/',locations:['ЛНР']},
    {id:'old-id',url:'/news/old/',locations:['ЛНР']},
    {id:'new-id',url:'/news/new/',locations:['ЛНР']}
  ]);
  write('news/new/index.html', '<link rel="canonical" href="https://krmrf.ru/news/new/">');
  const previous=fs.readFileSync(path.join(root,'data/utm-campaigns.json'),'utf8');
  const result=run('--sync-utm');
  assert.equal(result.status,1);
  assert.match(result.stderr,/повторяющийся ID/);
  assert.match(result.stderr,/повтор URL/);
  assert.equal(fs.readFileSync(path.join(root,'data/utm-campaigns.json'),'utf8'),previous);
}));
test('new UTM ids cannot hijack an existing historical campaign alias', managed(({run,write,root}) => {
  write('data/pages.json', [
    {id:'old-id',url:'/news/old/',locations:['ЛНР']},
    {id:'historic-name',url:'/news/new/',locations:['ЛНР']}
  ]);
  write('news/new/index.html', '<link rel="canonical" href="https://krmrf.ru/news/new/">');
  const previous=fs.readFileSync(path.join(root,'data/utm-campaigns.json'),'utf8');
  const result=run('--sync-utm');
  assert.equal(result.status,1);
  assert.match(result.stderr,/коллизия нового UTM ID/);
  assert.equal(fs.readFileSync(path.join(root,'data/utm-campaigns.json'),'utf8'),previous);
}));
