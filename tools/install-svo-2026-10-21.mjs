#!/usr/bin/env node
/* KRM РФ: установка нового большого обзора в текущую базу Codespaces.
   Использует СУЩЕСТВУЮЩУЮ HTML-страницу как шаблон, без глобальной смены оформления.
   Не запускает git push, не изменяет старые публикации и не пишет в dist напрямую. */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const SEP_SLUG = 'svo-2026-09-30';
const SLUG = 'svo-2026-10-21';
const title = 'Что изменилось на фронте СВО к 21 октября 2026 года';
const oldTitle = 'Что изменилось на фронте СВО за сентябрь 2026 года';
const oldDescription = 'Большой срез за сентябрь 2026 года: Красный Лиман, Купянск, Славянск, Константиновка, Доброполье, Орехов и последствия для ЛНР.';
const description = "Фронт СВО к 21 октября 2026 года: Красный Лиман, Купянск, Доброполье, Волчанский котёл и Орехов. Итоги и изменения по карте KRM РФ.";
const excerpt = "Как изменился фронт после сентября: Красный Лиман, Купянск, взятие Доброполья, ситуация под Волчанском и баланс территорий по карте.";
const period = '1–20 октября 2026 года; срез на утро 21 октября';
const rel = p => path.join(root, ...p.split('/'));
const basePage = rel(`news/svo/${SEP_SLUG}/index.html`);
const newPage = rel(`news/svo/${SLUG}/index.html`);
const pagesPath = rel('data/pages.json');
const bodyPath = rel('editorial/SVO_2026-10-21_BODY.fragment');
const imgFallback = '/assets/img/assessment/2026-09-27/cover.webp';
const imgPreferred = '/assets/img/assessment/2026-10-18/cover.webp';

for (const p of [basePage, pagesPath, bodyPath]) {
  if (!fs.existsSync(p)) throw new Error(`Отсутствует обязательный файл: ${path.relative(root,p)}`);
}
if (fs.existsSync(newPage)) throw new Error('Публикация уже существует; установка отменена для защиты существующего текста.');
const pagesRaw = fs.readFileSync(pagesPath, 'utf8');
const pages = JSON.parse(pagesRaw);
if (!Array.isArray(pages)) throw new Error('data/pages.json должен содержать массив.');
if (pages.some(x => x?.id === SLUG || x?.url === `/news/svo/${SLUG}/`)) throw new Error('В реестре уже есть такой ID или URL.');

const currentHTML = fs.readFileSync(basePage,'utf8');
const marker = '<!-- KRM_COVER_PLACEHOLDER -->';
const bodyRaw = fs.readFileSync(bodyPath,'utf8');
if (!bodyRaw.includes(marker)) throw new Error('В HTML-фрагменте отсутствует маркер обложки.');
if (!currentHTML.includes(oldTitle) || !currentHTML.includes(SEP_SLUG)) {
  throw new Error('Сентябрьская страница не соответствует ожидаемому шаблону. Ничего не изменено.');
}
const articleMatch = /<article\b[^>]*>[\s\S]*?<\/article>/i.exec(currentHTML);
if (!articleMatch) throw new Error('Не найден корневой article.');
const originalOpen = /^<article\b[^>]*>/i.exec(articleMatch[0])?.[0];
if (!originalOpen || !originalOpen.includes('content-card article')) throw new Error('Неизвестная структура article, установка отменена.');

let figureHTML = '';
let image = imgFallback;
let alt = 'Обзорная иллюстрация Восточного ТВД от 27 сентября 2026 года';
let sourceDate = '27 сентября 2026 года';
const currentAssessment = rel('assessment/2026-10-18/index.html');
if (fs.existsSync(currentAssessment) && fs.existsSync(rel(imgPreferred.slice(1)))) {
  const html = fs.readFileSync(currentAssessment,'utf8');
  const match = /<figure\b[^>]*class="[^"]*article-cover[^"]*"[^>]*>[\s\S]*?<\/figure>/i.exec(html);
  if (match) {
    figureHTML = match[0];
    image = imgPreferred;
    alt = 'Иллюстрация из недельной оценки Восточного ТВД за 12–18 октября 2026 года';
    sourceDate = '18 октября 2026 года';
  }
}
if (!figureHTML) {
  const match = /<figure\b[^>]*class="[^"]*article-cover[^"]*"[^>]*>[\s\S]*?<\/figure>/i.exec(articleMatch[0]);
  if (!match) throw new Error('Не найдена обложка ни в октябрьской оценке, ни в сентябрьском обзоре.');
  figureHTML = match[0];
  if (!fs.existsSync(rel(image.slice(1)))) throw new Error('В репозитории нет резервной иллюстрации.');
}
figureHTML = figureHTML.replace(/<figcaption\b[^>]*>[\s\S]*?<\/figcaption>/i, '');
figureHTML = figureHTML.replace(/<\/figure>/i,
  `<figcaption>Иллюстрация из редакционного архива KRM РФ по состоянию на ${sourceDate}. Она не является картой линии фронта на 21 октября; новые изменения разбираются в тексте.</figcaption></figure>`);
let body = bodyRaw.replace(marker, figureHTML);

const opening = originalOpen.replaceAll(SEP_SLUG, SLUG);
let revisedArticle = `${opening}\n${body}\n</article>`;
const splitMarker = '<!-- KRM_NEW_ARTICLE_SLOT -->';
// Change metadata and breadcrumbs OUTSIDE the article only: links to September inside the NEW article must remain untouched.
let outerHTML = currentHTML.slice(0, articleMatch.index) + splitMarker + currentHTML.slice(articleMatch.index + articleMatch[0].length);
outerHTML = outerHTML.replaceAll(SEP_SLUG, SLUG).replaceAll(oldTitle, title);
outerHTML = outerHTML.replaceAll(oldDescription, description);
outerHTML = outerHTML.replaceAll('2026-09-30T12:00:00+03:00', '2026-10-21');
outerHTML = outerHTML.replaceAll('2026-09-30', '2026-10-21');
// Replace only metadata references to the September cover; figure src attributes retain their own honest dates.
const imageAbsOld = 'https://krmrf.ru' + imgFallback;
const imageAbsNew = 'https://krmrf.ru' + image;
outerHTML = outerHTML.replaceAll(imageAbsOld, imageAbsNew);
const oldAlt = 'Восточный ТВД к 27 сентября 2026 года: обзорная иллюстрация KRM РФ';
// Original alt in a retained figure must not be rewritten: replace only meta and JSON schema properties.
outerHTML = outerHTML.replaceAll(`content="${oldAlt}" name="twitter:image:alt"`, `content="${alt}" name="twitter:image:alt"`);
outerHTML = outerHTML.replaceAll(`content="${oldAlt}" property="og:image:alt"`, `content="${alt}" property="og:image:alt"`);
outerHTML = outerHTML.replaceAll(`"image":"${imageAbsOld}"`, `"image":"${imageAbsNew}"`);
outerHTML = outerHTML.replaceAll('"keywords":"Восточный фронт, Красный Лиман, Купянск, Славянское направление, Константиновка, Доброполье, Запорожское направление, Кременная, ЛНР"',
'"keywords":"СВО, Красный Лиман, Купянск, Волчанский котёл, Доброполье, Запорожское направление, Кременная, ЛНР"');

const newHTML = outerHTML.replace(splitMarker, revisedArticle);
if (!newHTML.includes(description) || !newHTML.includes(`href="https://krmrf.ru/news/svo/${SLUG}/"`) ||
    !newHTML.includes('2026-10-21') || !newHTML.includes('Коротко') || !newHTML.includes(image)) {
  throw new Error('Контрольная проверка нового HTML не пройдена; ничего не изменено.');
}
const entry = {
  id: SLUG, type: 'article', title, seoTitle: title, seoDescription: description,
  url: `/news/svo/${SLUG}/`, section: 'svo', datePublished: '2026-10-21',
  dateModified: '2026-10-21', status: null, excerpt, image, imageAlt: alt, period,
  locations: ['Восточный фронт','Красный Лиман','Купянск','Волчанский котёл','Харьковское направление',
    'Славянское направление','Боровая','Константиновка','Доброполье',
    'Запорожское направление','Кременная','ЛНР'], home: {important: 1}
};
// Preserve formatting and all existing entries; insert only the new record after opening bracket.
const openingArray = /^(\s*\[\s*\r?\n)/;
if (!openingArray.test(pagesRaw)) throw new Error('Неизвестный формат data/pages.json; ничего не изменено.');
const entryIndented = JSON.stringify(entry,null,2).split('\n').map(line=>'  '+line).join('\n');
const newPages = pagesRaw.replace(openingArray, `$1${entryIndented},\n`);
if (JSON.parse(newPages).length !== pages.length + 1) throw new Error('Не удалось добавить ровно одну запись в реестр.');
// Write only after every check above has passed.
fs.mkdirSync(path.dirname(newPage),{recursive:true});
fs.writeFileSync(newPage,newHTML,'utf8');
fs.writeFileSync(pagesPath,newPages,'utf8');
console.log(`Готово: news/svo/${SLUG}/index.html`);
console.log('Новая запись добавлена в data/pages.json. Изменения старых материалов не требуются.');
console.log('Проверить: npm run build && npm run content:lock && npm run qa');
console.log('Перед публикацией проверить статью и её обложку в браузере Codespaces.');
