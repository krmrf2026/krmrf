#!/usr/bin/env node
/* KRM РФ: безопасная замена только ранее автоматически установленных редакций.
 * Любые ручные изменения текста или SEO-блока препятствуют перезаписи.
 * Прежняя обложка сохраняется; другие публикации не меняются. */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const root = process.cwd();
const at = p => path.join(root, ...p.split('/'));
const pagePath = at('news/svo/svo-2026-10-21/index.html');
const pagesPath = at('data/pages.json');
const bodyPath = at('editorial/SVO_2026-10-21_BODY.fragment');
const marker = '<!-- KRM_COVER_PLACEHOLDER -->';
const newDescription = "Фронт СВО к 21 октября 2026 года: Красный Лиман, Купянск, Доброполье, Волчанский котёл и Орехов. Итоги и изменения по карте KRM РФ.";
const newExcerpt = "Как изменился фронт после сентября: Красный Лиман, Купянск, взятие Доброполья, ситуация под Волчанском и баланс территорий по карте.";
const versions = [
  {
    name: 'первоначальная редакция',
    sha: 'a7d609ef73993f1aa39ad85744d4da9833c2c62f5a6b2790d8cab845e7251edd',
    description: 'Что изменилось на фронте СВО к 21 октября 2026 года: Красный Лиман, Купянск, Доброполье, Харьковское приграничье, Запорожье и последствия для Кременной и ЛНР.',
    excerpt: 'Краснолиманский участок после сентябрьских контратак, продвижения под Купянском и в Доброполье, спорные сообщения с Харьковского и Запорожского направлений.'
  },
  {
    name: 'предыдущая расширенная редакция',
    sha: 'c307a9a834d407b5c5883f39021a0dc8899357b2b1a362a691e3de81d468a3fe',
    description: 'Фронт СВО к 21 октября 2026 года: стабилизация под Красным Лиманом, продвижение у Купянска, взятие Доброполья и зачистка, Константиновка, Харьков и Запорожье.',
    excerpt: 'После тяжёлого сентября: стабилизация под Красным Лиманом, продвижение у Купянска, взятие Доброполья и зачистка, положение на Харьковском и Запорожском направлениях.'
  },
  {
    name: 'предыдущая компактная редакция',
    sha: '8901404a94a24cb5d1ecf84ce002da289eb8ec49f42d4b823c43adeee459b50d',
    description: 'Что изменилось на фронте СВО к 21 октября: Красный Лиман, Купянск, Доброполье, Волчанский котёл, Запорожье и ситуация в Кременной.',
    excerpt: 'После сентябрьских боёв: стабилизация у Красного Лимана, новые российские позиции у Купянска, Доброполье, Волчанск и Запорожье.'
  }
];
for (const p of [pagePath, pagesPath, bodyPath]) {
  if (!fs.existsSync(p)) throw Error('Отсутствует необходимый файл: ' + path.relative(root, p));
}
const original = fs.readFileSync(pagePath, 'utf8');
const articleMatch = /<article\b[^>]*>([\s\S]*?)<\/article>/i.exec(original);
if (!articleMatch) throw Error('В существующей странице не найден article. Обновление отменено.');
const inner = articleMatch[1].replace(/^\r?\n/, '').replace(/\r?\n$/, '');
const figureMatch = /<figure\b[^>]*class="[^"]*article-cover[^"]*"[^>]*>[\s\S]*?<\/figure>/i.exec(inner);
if (!figureMatch) throw Error('В существующей статье отсутствует обложка. Обновление отменено.');
const contentHash = createHash('sha256')
  .update(inner.replace(figureMatch[0], '__KRM_COVER__')).digest('hex');
const version = versions.find(v => v.sha === contentHash);
if (!version) throw Error('Существующая статья изменена вручную или не совпадает с известной версией. Ничего не перезаписано.');
if (!original.includes(version.description)) throw Error('SEO-описание отличается от известной версии. Обновление отменено.');
const body = fs.readFileSync(bodyPath, 'utf8');
if (body.split(marker).length !== 2) throw Error('Неверный маркер изображения в новом HTML.');
if (!body.includes('Волчанский котёл') || !body.includes('id="about"')) {
  throw Error('Новый HTML не прошёл внутреннюю проверку.');
}
const updatedBody = body.replace(marker, figureMatch[0]);
let updatedHTML = original.replace(articleMatch[0],articleMatch[0].replace(articleMatch[1], '\n'+updatedBody+'\n'));
updatedHTML = updatedHTML.replaceAll(version.description,newDescription);
updatedHTML = updatedHTML.replaceAll(
  '"keywords":"СВО, Красный Лиман, Купянск, Харьковское направление, Доброполье, Запорожское направление, Кременная, ЛНР"',
  '"keywords":"СВО, Красный Лиман, Купянск, Волчанский котёл, Доброполье, Запорожское направление, Кременная, ЛНР"'
);
const pagesRaw = fs.readFileSync(pagesPath,'utf8');
const pages = JSON.parse(pagesRaw);
const items=pages.filter(x=>x?.id==='svo-2026-10-21');
if (items.length!==1 || items[0].seoDescription!==version.description || items[0].excerpt!==version.excerpt) {
  throw Error('Запись статьи в data/pages.json изменена или отсутствует. Ничего не перезаписано.');
}
function replaceUnique(s,from,to) {
  const pos=s.indexOf(from);
  if(pos<0 || s.indexOf(from,pos+from.length)>=0) throw Error('Неоднозначный фрагмент pages.json, замена запрещена.');
  return s.slice(0,pos)+to+s.slice(pos+from.length);
}
let updatedPages=replaceUnique(pagesRaw,JSON.stringify(version.description),JSON.stringify(newDescription));
updatedPages=replaceUnique(updatedPages,JSON.stringify(version.excerpt),JSON.stringify(newExcerpt));
const newer=JSON.parse(updatedPages);
if (newer.length!==pages.length || newer.find(x=>x.id==='svo-2026-10-21')?.seoDescription!==newDescription || !updatedHTML.includes(newDescription)) {
  throw Error('Контрольная проверка обновления не прошла.');
}
// Check all content in memory before touching either of the files.
fs.writeFileSync(pagePath,updatedHTML,'utf8');
fs.writeFileSync(pagesPath,updatedPages,'utf8');
console.log(`Обновлено: ${version.name} → компактный редакционный обзор KRM РФ.`);
console.log('Сохранена действующая обложка; старые статьи не изменены.');
console.log('Выполни: npm run build && npm run content:lock && npm run qa');
