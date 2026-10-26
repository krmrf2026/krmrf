import fs from 'node:fs';import path from 'node:path';
import { checkAssessmentTemplate, V5_FROM } from './lib/assessment-template.mjs';
const pages = JSON.parse(fs.readFileSync('data/pages.json', 'utf8'));let checked = 0;const errors = [];
for (const item of pages.filter(item => item.type === 'assessment' && item.datePublished >= V5_FROM)) {
  checked++;const file = path.join(item.url.slice(1), 'index.html');
  for (const error of checkAssessmentTemplate(fs.readFileSync(file, 'utf8'), item, pages)) errors.push(`${item.id}: ${error}`);
}
if (errors.length) { console.error(errors.join('\n'));process.exit(1); }
console.log(`V5 проверен: ${checked} выпусков с ${V5_FROM}. Старые выпуски сохранены в историческом шаблоне.`);
