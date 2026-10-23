#!/usr/bin/env node
/* KRM РФ: после загрузки 4 редакционных изображений вставляет их в один материал.
 * Никаких загрузок из интернета, никаких правок старых публикаций и чужих файлов.
 * Если файла нет или он испорчен, ничего не записывает. */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
const root = process.cwd();
const rel = p => path.join(root, ...p.split('/'));
const base = 'assets/img/news/svo/svo-2026-10-21';
const articlePath = rel('news/svo/svo-2026-10-21/index.html');
const pagesPath = rel('data/pages.json');
for (const p of [articlePath, pagesPath]) if (!fs.existsSync(p)) throw Error(`Нет обязательного файла: ${p}`);
const rules = [
  {stem:'cover', label:'Обложка', cls:'article-cover', alt:'Обзор фронта СВО к 21 октября 2026 года: иллюстрация к материалу KRM РФ', caption:'Обложка обзора фронта СВО к 21 октября 2026 года.'},
  {stem:'liman', label:'Красный Лиман', cls:'article-figure', alt:'Иллюстрация к анализу изменений на Краснолиманском направлении в октябре 2026 года', caption:'Краснолиманское направление: изменение положения после сентябрьских контратак.'},
  {stem:'volchansk', label:'Волчанск', cls:'article-figure', alt:'Иллюстрация к разделу о Волчанском направлении в октябре 2026 года', caption:'Волчанское направление: ситуация вокруг предполагаемого окружения.'},
  {stem:'territory-stats', label:'Статистика карты', cls:'article-figure', alt:'Статистика карты KRM РФ с 29 сентября по 19 октября: добавлено 450,3 квадратного километра, исключено 145,6, изменение плюс 304,7', caption:'Статистика карты СВО KRM РФ за 29 сентября — 19 октября 2026 года. Итоговое изменение отображаемой зоны контроля: +304,7 км².'}
];
function dimensions(bytes,ext){
  if(ext==='png'){
    if(bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a') throw Error('Некорректный PNG');
    return [bytes.readUInt32BE(16),bytes.readUInt32BE(20)];
  }
  if(ext==='webp'){
    if(bytes.toString('ascii',0,4)!=='RIFF'||bytes.toString('ascii',8,12)!=='WEBP') throw Error('Некорректный WebP');
    const tag=bytes.toString('ascii',12,16);
    if(tag==='VP8X') return [1+bytes.readUIntLE(24,3),1+bytes.readUIntLE(27,3)];
    if(tag==='VP8 '){let i=bytes.indexOf(Buffer.from([0x9d,0x01,0x2a]),20);if(i<0)throw Error('Не найден размер WebP');return [bytes.readUInt16LE(i+3)&0x3fff,bytes.readUInt16LE(i+5)&0x3fff];}
    if(tag==='VP8L'){let i=21;if(bytes[i]!==0x2f)throw Error('Некорректный VP8L');let b0=bytes[i+1],b1=bytes[i+2],b2=bytes[i+3],b3=bytes[i+4];return [1+(((b1&0x3f)<<8)|b0),1+(((b3&0xf)<<10)|(b2<<2)|((b1&0xc0)>>6))];}
    throw Error(`Формат WebP ${tag} не распознан`);
  }
  if(ext==='jpg'||ext==='jpeg'){
    if(bytes[0]!==255||bytes[1]!==216)throw Error('Некорректный JPEG');
    let i=2;
    while(i<bytes.length-10){if(bytes[i]!==255){i++;continue;}let m=bytes[i+1];i+=2;if(m===217||m===218)break;if(m===1||(m>=208&&m<=215))continue;const n=bytes.readUInt16BE(i);if(n<2)break;if([192,193,194,195,198,199,201,202].includes(m))return [bytes.readUInt16BE(i+5),bytes.readUInt16BE(i+3)];i+=n;}
    throw Error('Не найден размер JPEG');
  }
  throw Error('Неподдерживаемый формат');
}
function esc(s){return s.replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;');}
function mkFigure(r){const eager=r.stem==='cover';return `<figure class="${r.cls}"><img src="${r.uri}" alt="${esc(r.alt)}" width="${r.w}" height="${r.h}" loading="${eager?'eager':'lazy'}" decoding="async"${eager?' fetchpriority="high"':''}/><figcaption>${esc(r.caption)}</figcaption></figure>`;}
// Read all images before touching the site. No substitutions or placeholders allowed.
for(const r of rules){
  const files=['webp','jpg','jpeg','png'].map(ext=>({ext,p:rel(`${base}/${r.stem}.${ext}`)})).filter(x=>fs.existsSync(x.p));
  if(files.length!==1)throw Error(`${r.label}: требуется ровно один файл ${r.stem}.webp/.jpg/.png; сейчас ${files.length}.`);
  const f=files[0],b=fs.readFileSync(f.p);
  if(b.length<2048)throw Error(`${r.label}: файл подозрительно маленький.`);
  [r.w,r.h]=dimensions(b,f.ext);
  if(r.w<640||r.h<300)throw Error(`${r.label}: изображение слишком маленькое (${r.w}×${r.h}).`);
  r.uri=`/${base}/${r.stem}.${f.ext}`;
}
const original=fs.readFileSync(articlePath,'utf8');
const pagesText=fs.readFileSync(pagesPath,'utf8');
const pages=JSON.parse(pagesText);
const index=pages.findIndex(x=>x.id==='svo-2026-10-21');
if(index<0)throw Error('Статья не зарегистрирована в data/pages.json.');
const markers=['KRM_MEDIA_LIMAN','KRM_MEDIA_VOLCHANSK','KRM_MEDIA_STATS'];
for(const key of markers){if(original.split(`<!-- ${key} -->`).length!==2)throw Error(`Нет одиночного маркера: ${key}. Статья изменена или изображения уже установлены.`);}
const article=/<article\b[^>]*>[\s\S]*?<\/article>/i.exec(original);
if(!article)throw Error('Не найден article.');
const currentCover=/<figure\b[^>]*class="[^"]*article-cover[^"]*"[^>]*>[\s\S]*?<\/figure>/i.exec(article[0]);
if(!currentCover)throw Error('Не найдена существующая обложка для замены.');
let next=original.replace(currentCover[0],mkFigure(rules[0]));
for(const [marker,n] of [['LIMAN',1],['VOLCHANSK',2],['STATS',3]]){
 next=next.replace(`<!-- KRM_MEDIA_${marker} -->`,mkFigure(rules[n]));
}
const oldCover=pages[index].image;
const oldAlt=pages[index].imageAlt;
if(typeof oldCover!=='string'||!oldCover.startsWith('/assets/img/'))throw Error('Неизвестная текущая обложка в pages.json.');
const absoluteOld=`https://krmrf.ru${oldCover}`;
const absoluteNew=`https://krmrf.ru${rules[0].uri}`;
next=next.replaceAll(absoluteOld,absoluteNew);
// Update explicit image metadata (schema and social cards) when they are available.
next=next.replace(/(<meta\b[^>]*property="og:image:alt"[^>]*content=")[^"]*(")/g,`$1${esc(rules[0].alt)}$2`);
next=next.replace(/(<meta\b[^>]*name="twitter:image:alt"[^>]*content=")[^"]*(")/g,`$1${esc(rules[0].alt)}$2`);
pages[index].image=rules[0].uri;
pages[index].imageAlt=rules[0].alt;
// Preserve page-order and formatting as much as possible by replacing only the single entry JSON fields.
function replaceOnce(text,oldValue,newValue){const p=text.indexOf(oldValue);if(p<0||text.indexOf(oldValue,p+oldValue.length)>=0)throw Error('Невозможно однозначно обновить JSON.');return text.slice(0,p)+newValue+text.slice(p+oldValue.length);}
// Limit replacing to the particular page record: JSON formatting may differ in actual repo.
const pos=pagesText.indexOf('"id": "svo-2026-10-21"');
if(pos<0)throw Error('Не найден ожидаемый формат ID в data/pages.json.');
let left=pagesText.slice(0,pos),right=pagesText.slice(pos);
const end=right.indexOf('\n  },');
if(end<0)throw Error('Не найден конец записи статьи.');
let target=right.slice(0,end);
const imagePair=`"image": ${JSON.stringify(oldCover)}`;
const altPair=`"imageAlt": ${JSON.stringify(oldAlt)}`;
if(!target.includes(imagePair)||!target.includes(altPair))throw Error('Текущие поля изображения в JSON не совпадают.');
target=target.replace(imagePair,`"image": ${JSON.stringify(rules[0].uri)}`);
target=target.replace(altPair,`"imageAlt": ${JSON.stringify(rules[0].alt)}`);
const nextPages=left+target+right.slice(end);
if(JSON.parse(nextPages).find(x=>x.id==='svo-2026-10-21')?.image!==rules[0].uri)throw Error('JSON не прошёл проверку.');
for(const key of markers)if(next.includes(`KRM_MEDIA_${key}`))throw Error(`Маркер ${key} остался в HTML.`);
for(const r of rules)if(!next.includes(r.uri))throw Error(`Не вставлено изображение ${r.stem}`);
fs.writeFileSync(articlePath,next,'utf8');
fs.writeFileSync(pagesPath,nextPages,'utf8');
console.log('Готово: четыре изображения подключены к статье, обложка — к SEO-метаданным.');
console.log('Далее: npm run images && npm run build && npm run content:lock && npm run qa');
