import fs from 'node:fs';
import process from 'node:process';

const pages = JSON.parse(fs.readFileSync('data/pages.json', 'utf8'));
const search = JSON.parse(fs.readFileSync('data/search-index.json', 'utf8'));
const taxonomy = JSON.parse(fs.readFileSync('data/taxonomy.json', 'utf8'));
const archive = fs.readFileSync('archive/index.html', 'utf8');
const map = fs.readFileSync('map/index.html', 'utf8');
const errors = [];

const has = (label, predicate) => {
  if (!pages.some(predicate)) errors.push(`Нет результата для сценария: ${label}`);
};
has('ЛНР + памятка', item => item.type === 'guide' && item.locations?.includes('ЛНР'));
has('Кременная + материал', item => item.type === 'article' && item.locations?.includes('Кременная'));
has('Восточный фронт + оценка', item => item.type === 'assessment' && item.locations?.includes('Восточный фронт'));
has('Гражданские последствия', item => item.section === 'civilian-impact');

for (const token of ['data-filter-group="type"', 'data-filter-group="section"', 'data-filter-group="location"', 'id="archive-reset"']) {
  if (!archive.includes(token)) errors.push(`Архив: отсутствует ${token}`);
}


const css = [
  fs.readFileSync('assets/css/style.css', 'utf8'),
  fs.readFileSync('assets/css/page-index.css', 'utf8')
].join('\n');
if (!/\[hidden\]\s*\{[^}]*display\s*:\s*none\s*!important/i.test(css)) {
  errors.push('CSS: отсутствует правило [hidden] { display: none !important; }, фильтры могут менять hidden без визуального скрытия.');
}

for (const [value, label] of Object.entries(taxonomy.sections || {})) {
  if (pages.some(item => item.section === value) && !archive.includes(`data-filter-group="section" data-filter-label="${label}" data-filter-value="${value}"`)) {
    errors.push(`Архив: нет кнопки раздела «${label}» (${value}), хотя такие публикации есть в data/pages.json.`);
  }
}
if (!map.includes('id="mapStatus"')) errors.push('Карта: отсутствует live-status ошибок.');
if (!map.includes('id="mapChanges"')) errors.push('Карта: отсутствует блок журнала изменений.');
if (!fs.existsSync('data/map-changes.json')) errors.push('Карта: отсутствует data/map-changes.json.');
if (!archive.includes('data-locations="Восточный фронт')) errors.push('Архив: многословная территория «Восточный фронт» не записана в fallback-разметку.');
const archiveScript = fs.readFileSync('assets/js/archive-filter.js', 'utf8');
if (!archiveScript.includes("split('|')")) errors.push('Архив: территории не разбираются как отдельные фасеты.');

const normalize = value => String(value || '').toLocaleLowerCase('ru-RU').replace(/ё/g, 'е');
const queries = [
  ['кременная', item => normalize(`${item.title} ${item.text}`).includes('кременн')],
  ['выплаты', item => normalize(`${item.title} ${item.text}`).includes('выплат')],
  ['красный лиман', item => normalize(`${item.title} ${item.text}`).includes('красн') && normalize(`${item.title} ${item.text}`).includes('лиман')]
];
for (const [query, predicate] of queries) if (!search.some(predicate)) errors.push(`Поиск: контрольный запрос «${query}» не имеет результата.`);

if (errors.length) {
  console.error(errors.map(item => `• ${item}`).join('\n'));
  process.exit(1);
}
console.log('Smoke-тесты пройдены: архив, поиск, карта и ключевые пользовательские сценарии согласованы.');
