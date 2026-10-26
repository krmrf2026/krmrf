import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import { checkAssessmentTemplate } from '../../tools/lib/assessment-template.mjs';
const pages=JSON.parse(fs.readFileSync('data/pages.json','utf8'));const item=pages.find(x=>x.id==='assessment-2026-10-25');
const html=fs.readFileSync('assessment/2026-10-25/index.html','utf8');
test('approved V5 passes; historical template is exempt',()=>{
 assert.deepEqual(checkAssessmentTemplate(html,item,pages),[]);
 assert.deepEqual(checkAssessmentTemplate('<article></article>',{...item,datePublished:'2026-10-18'},pages),[]);
});
test('missing cover, swapped sectors, empty summary, skipped predecessor and bold conclusions cannot pass',()=>{
 for(const mutated of [
  html.replace('src="/assets/img/assessment/2026-10-25/cover.webp"','src="/assets/img/assessment/2026-10-25/kupyansk.webp"'),
  html.replaceAll('/kupyansk.webp','/TEMP.webp').replaceAll('/borovaya.webp','/kupyansk.webp').replaceAll('/TEMP.webp','/borovaya.webp'),
  html.replace('<strong>Оценка:</strong>','<strong>Оценка: весь вывод</strong>'),
  html.replace('class="note-box"','class="removed-box"'),
  html.replaceAll('/assessment/2026-10-18/','/assessment/2026-10-11/'),
  html.replace(/(<section class="note-box"[^>]*>\s*<h2[^>]*>Коротко<\/h2>)[\s\S]*?(<\/section>)/,'$1$2')
 ]) {
  assert.notEqual(mutated,html,'The mutation must change the fixture');
  assert.ok(checkAssessmentTemplate(mutated,item,pages).length>0);
 }
});
