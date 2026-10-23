#!/usr/bin/env node
/**
 * KRM РФ: адресное исправление ошибок первого QA от 21.10.2026.
 * Работает только с публикацией svo-2026-10-21 и её редакционным фрагментом.
 * Не трогает карту, другие публикации или глобальный валидатор.
 * Запуск без аргументов: безопасное исправление. --check: только проверка.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root=process.cwd();
const abs=p=>path.join(root,...p.split('/'));
const SLUG='svo-2026-10-21';
const pagePath=`news/svo/${SLUG}/index.html`;
const pagesPath='data/pages.json';
const utmPath='data/utm-campaigns.json';
const taxonomyPath='data/taxonomy.json';
const oldFragment='editorial/SVO_2026-10-21_BODY.html';
const newFragment='editorial/SVO_2026-10-21_BODY.fragment';
const imgDir=`assets/img/news/svo/${SLUG}`;
const installers=[
  'tools/install-svo-2026-10-21.mjs',
  'tools/update-existing-svo-2026-10-21.mjs'
];
const read=p=>fs.readFileSync(abs(p),'utf8');
const exists=p=>fs.existsSync(abs(p));
const check=process.argv.includes('--check');
const changes=new Map();
const deletions=new Set();
const renames=[];
const fail=m=>{throw new Error(m+' (запись отменена)');};
for(const p of [pagePath,pagesPath,utmPath,taxonomyPath,...installers]) if(!exists(p)) fail('Нет обязательного файла: '+p);
if(exists(oldFragment)&&exists(newFragment)) fail('Два варианта BODY одновременно: требуется ручная проверка');
if(!exists(oldFragment)&&!exists(newFragment)) fail('Не найден редакционный BODY-фрагмент');

const page=read(pagePath);
const article=/<article\b[\s\S]*?<\/article>/i.exec(page)?.[0];
if(!article || !page.includes(SLUG)) fail('Не найдена ожидаемая статья');
const pagesRaw=read(pagesPath), pages=JSON.parse(pagesRaw);
const record=pages.find(p=>p?.id===SLUG);
if(!record||pages.filter(p=>p?.id===SLUG).length!==1) fail('Ожидалась одна запись статьи в pages.json');

// 1. Замена невалидного таксономического ярлыка без изменения читательского текста.
let newPages=pagesRaw;
if(record.locations?.includes('Волчанский котёл')) {
  const tax=JSON.stringify(JSON.parse(read(taxonomyPath)));
  const allowed=tax.includes('"Волчанск"');
  const marker='"id": "'+SLUG+'"';
  const from=newPages.indexOf(marker);
  if(from<0) fail('Неожиданный формат страницы в pages.json');
  const suffix=newPages.slice(from);
  const locMatch=/^\s*"Волчанский котёл",?\s*\r?\n/m.exec(suffix);
  if(!locMatch) fail('Метка Волчанского котла не найдена отдельной строкой');
  const ix=from+locMatch.index;
  if(allowed){
    newPages=newPages.slice(0,ix)+locMatch[0].replace('Волчанский котёл','Волчанск')+newPages.slice(ix+locMatch[0].length);
  } else {
    newPages=newPages.slice(0,ix)+newPages.slice(ix+locMatch[0].length);
  }
  const parsed=JSON.parse(newPages).find(x=>x.id===SLUG);
  if(!parsed||parsed.locations.includes('Волчанский котёл')) fail('Ошибка исправления locations');
  changes.set(pagesPath,newPages);
  console.log('✓ Таксономия: '+(allowed?'Волчанский котёл → Волчанск':'неизвестная метка удалена из locations'));
} else {
  console.log('✓ Таксономия: проблемного значения нет');
}

// 2. Исправление HTML таблицы: подпись и соблюдение строгой CSP.
const tableCaption='Изменение отображаемой зоны контроля на карте KRM РФ, 29 сентября — 19 октября 2026 года';
function correctHTML(html,where) {
  if(!html.includes('Красный Лиман и окрестности')||!html.includes('<table')) fail('Таблица статистики не найдена: '+where);
  const tables=[...html.matchAll(/<table\b[^>]*>[\s\S]*?<\/table>/gi)];
  if(tables.length!==1) fail('Ожидалась одна таблица в '+where+', найдено '+tables.length);
  let table=tables[0][0];
  if(!/<caption\b/i.test(table)){
    table=table.replace(/<table\b[^>]*>/i,x=>x+'\n<caption>'+tableCaption+'</caption>');
  }
  table=table.replace(/\sstyle\s*=\s*"text-align:\s*right\s*;?"/gi,'');
  table=table.replace(/\sstyle\s*=\s*'text-align:\s*right\s*;?'/gi,'');
  if(/\bstyle\s*=/i.test(table)) fail('В таблице есть другие inline-style, нужна ручная проверка');
  const out=html.slice(0,tables[0].index)+table+html.slice(tables[0].index+tables[0][0].length);
  return out;
}
const nextPage=correctHTML(page,pagePath);
if(/\sstyle\s*=/i.test(nextPage)) fail('В новой статье есть другие запрещённые inline-style, автоматическое исправление отменено');
if(nextPage!==page) changes.set(pagePath,nextPage);
console.log('✓ Таблица: caption есть, inline-style отсутствуют');

// 3. Редакционный фрагмент не должен индексироваться как самостоятельная HTML-страница.
const sourcePath=exists(oldFragment)?oldFragment:newFragment;
const source=read(sourcePath);
const nextBody=correctHTML(source,sourcePath);
if(sourcePath===oldFragment){
  renames.push([oldFragment,newFragment]);
  changes.set(newFragment,nextBody);
  deletions.add(oldFragment);
  console.log('✓ BODY: .html → .fragment (не самостоятельная страница)');
} else {
  if(nextBody!==source) changes.set(newFragment,nextBody);
  console.log('✓ BODY: имеет расширение .fragment');
}
for(const file of installers){
  const raw=read(file);
  const updated=raw.replaceAll('SVO_2026-10-21_BODY.html','SVO_2026-10-21_BODY.fragment');
  if(!updated.includes('SVO_2026-10-21_BODY.fragment')) fail('Не найден путь к BODY в '+file);
  if(updated!==raw) changes.set(file,updated);
}
console.log('✓ Установщики: используют новый путь BODY');

// 4. .gitkeep больше не нужен, поскольку присутствуют четыре реальные иллюстрации.
for(const stem of ['cover','liman','volchansk','territory-stats']){
  const files=['webp','jpg','jpeg','png'].filter(ext=>exists(`${imgDir}/${stem}.${ext}`));
  if(files.length!==1) fail('Не найдено ровно одно изображение '+stem+' в '+imgDir);
  const uri=`/${imgDir}/${stem}.${files[0]}`;
  if(!page.includes(uri)) fail('Изображение '+stem+' ещё не подключено к HTML');
}
const gitkeep=`${imgDir}/.gitkeep`;
if(exists(gitkeep)){
  if(fs.statSync(abs(gitkeep)).size!==0) fail('.gitkeep не пуст, не удаляем');
  deletions.add(gitkeep);
}
console.log('✓ Изображения: все четыре подключены, пустой .gitkeep удаляется');

// 5. Исключение UTM-ошибки на новых страницах.
const utmRaw=read(utmPath), utm=JSON.parse(utmRaw);
if(!utm.campaigns || typeof utm.campaigns!=='object' || Array.isArray(utm.campaigns)) fail('Неверная структура data/utm-campaigns.json');
if(Object.hasOwn(utm.campaigns,SLUG)){
  if(utm.campaigns[SLUG]!==SLUG) fail('UTM-кампания статьи уже связана с другим идентификатором');
} else {
  utm.campaigns[SLUG]=SLUG;
  changes.set(utmPath,JSON.stringify(utm,null,2)+'\n');
}
console.log('✓ UTM: новая статья зарегистрирована');

// Данные о перепроверке берутся из подготовленного состояния файлов.
if(check){
  if(changes.size||deletions.size){
    console.error('Ещё требуются изменения:',[...changes.keys(),...deletions].join(', '));
    process.exitCode=1;
  } else console.log('PASS: адресные ошибки устранены; файлы менять не нужно');
} else {
  // Предпроверены все входные файлы и будущий JSON. Только теперь запись.
  for(const [p,data] of changes){
    if(p===newFragment && exists(newFragment) && sourcePath===oldFragment) fail('Целевой BODY уже существует');
    fs.mkdirSync(path.dirname(abs(p)),{recursive:true});
    fs.writeFileSync(abs(p),data,'utf8');
    console.log('  обновлено:',p);
  }
  for(const p of deletions){fs.unlinkSync(abs(p));console.log('  удалено:',p);}
  console.log('\nГотово. Следующий шаг: npm run validate. Затем npm run content:lock и npm run qa.');
}
