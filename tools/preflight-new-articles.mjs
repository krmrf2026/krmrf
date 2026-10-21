#!/usr/bin/env node
/** Read-only preflight for newly registered pages before npm run qa.
 * Fails early with a short, actionable list. Doesn't change site data. */
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const root=process.cwd();
const at=p=>path.join(root,...p.split('/'));
const exists=p=>fs.existsSync(at(p));
const read=p=>fs.readFileSync(at(p),'utf8');
const problems=[];
const error=m=>problems.push(m);
const pages=JSON.parse(read('data/pages.json'));
const utm=JSON.parse(read('data/utm-campaigns.json'));
const taxonomyRaw=read('data/taxonomy.json');
const git=spawnSync('git',['show','HEAD:data/pages.json'],{cwd:root,encoding:'utf8'});
if(git.status!==0){
 console.error('Нет доступной базовой версии HEAD:data/pages.json; не удалось определить новые страницы.');
 process.exit(2);
}
const old=JSON.parse(git.stdout);
const oldIds=new Set(old.map(x=>x?.id));
const additions=pages.filter(x=>x?.id&&!oldIds.has(x.id));
for(const p of additions){
 const prefix=`${p.id}: `;
 if(!utm.campaigns || utm.campaigns[p.id]!==p.id) error(prefix+'зарегистрируйте UTM-кампанию в data/utm-campaigns.json');
 for(const loc of p.locations||[]){
   if(!taxonomyRaw.includes(JSON.stringify(loc))) error(prefix+'неизвестная территория в data/taxonomy.json: '+loc);
 }
 const pageFile=p.url?.startsWith('/')?`${p.url.slice(1)}index.html`:'';
 if(!pageFile||!exists(pageFile)){error(prefix+'не найдена HTML-страница '+pageFile);continue;}
 const html=read(pageFile);
 if(/\sstyle\s*=/i.test(html))error(prefix+'запрещённый inline-style в '+pageFile);
 for(const match of html.matchAll(/<table\b[^>]*>[\s\S]*?<\/table>/gi)){
   if(!/<caption\b/i.test(match[0])) error(prefix+'таблица без <caption> в '+pageFile);
 }
 if(!/<link\b[^>]*rel=["']canonical["']/i.test(html))error(prefix+'нет canonical в '+pageFile);
 for(const match of html.matchAll(/<img\b[^>]*\bsrc=["'](\/assets\/[^"']+)["']/gi)){
   if(!exists(match[1].slice(1))) error(prefix+'нет файла картинки '+match[1]);
 }
 const cover=p.image?.startsWith('/')?path.posix.dirname(p.image.slice(1)):'';
 if(cover&&exists(`${cover}/.gitkeep`))error(prefix+'пустой .gitkeep в каталоге изображений '+cover);
}
const dir=at('editorial');
if(fs.existsSync(dir))for(const f of fs.readdirSync(dir)){
  if(/_BODY\.html$/i.test(f))error('editorial/'+f+': HTML-фрагмент нельзя оставлять с расширением .html, используйте .fragment');
}
console.log('Предварительная проверка новых публикаций:',additions.length);
if(problems.length){
 console.error('ОБНАРУЖЕНЫ ОШИБКИ ('+problems.length+'):');
 for(const m of problems)console.error(' • '+m);
 process.exitCode=1;
}else console.log('PASS: типовые ошибки установки новых статей не обнаружены. Далее npm run qa.');
