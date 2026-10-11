import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { prepareLayer, layerArea, measureLayers, EARTH_RADIUS } from '../../tools/lib/map-area.mjs';
import { core, publishedAt, geometryHash, safeSnapshot } from '../../tools/lib/map-statistics.mjs';
const ROOT = process.cwd();
const rect = (x0=30,y0=45,x1=32,y1=47) => [[x0,y0],[x1,y0],[x1,y1],[x0,y1],[x0,y0]];
const fc = (rings, updated='2026-10-01 12:00') => ({ type:'FeatureCollection',updated,features:[{type:'Feature',properties:{name:'russian'},geometry:{type:'Polygon',coordinates:rings}}] });
const sphereRect = (x0,y0,x1,y1) => EARTH_RADIUS ** 2 * (x1-x0)*Math.PI/180 * (Math.sin(y1*Math.PI/180)-Math.sin(y0*Math.PI/180))/1e6;
const near = (a,b,tolerance=1e-6) => assert.ok(Math.abs(a-b) <= tolerance, `${a} != ${b}`);
const measure = (a,b) => measureLayers(prepareLayer(a),prepareLayer(b));
test('площадь прямоугольника совпадает с аналитической площадью сферической полосы',()=>{near(layerArea(prepareLayer(fc([rect()]))),sphereRect(30,45,32,47));});
test('поворот начала кольца и обратный обход не создают изменения',()=>{
 const a=fc([rect()]),ring=rect().slice(0,-1).reverse();ring.push(ring[0]); const b=fc([ring]);
 assert.equal(geometryHash(a),geometryHash(b));const s=measure(a,b);near(s.addedKm2,0);near(s.removedKm2,0);
 const rotated=rect().slice(0,-1);rotated.push(rotated.shift());rotated.push(rotated[0]);assert.equal(geometryHash(a),geometryHash(fc([rotated])));
});
test('равные добавление и исключение сохраняются при нулевом итоге',()=>{const s=measure(fc([rect()]),fc([rect(31,45,33,47)]));near(s.netKm2,0);near(s.addedKm2,sphereRect(32,45,33,47));near(s.removedKm2,s.addedKm2);});
test('отверстия вычитаются; потеря отверстия является добавлением',()=>{const a=fc([rect(),rect(30.5,45.5,31.5,46.5)]),b=fc([rect()]);const hole=sphereRect(30.5,45.5,31.5,46.5);near(layerArea(prepareLayer(a)),sphereRect(30,45,32,47)-hole);near(measure(a,b).addedKm2,hole);near(measure(a,b).removedKm2,0);});
test('перекрывающиеся полигоны и их дубликаты считаются один раз',()=>{
const a=fc([rect()]);a.features.push(fc([rect(31,45,33,47)]).features[0],a.features[0]);near(layerArea(prepareLayer(a)),sphereRect(30,45,33,47));});
test('MultiPolygon и отдельные острова',()=>{const a=fc([rect()]);a.features[0].geometry={type:'MultiPolygon',coordinates:[[rect()],[rect(34,45,35,46)]]};near(layerArea(prepareLayer(a)),sphereRect(30,45,32,47)+sphereRect(34,45,35,46));});
test('непрямоугольные пересечения дают согласованный баланс',()=>{
const a=fc([[[30,45],[33,45],[30,48],[30,45]]]),b=fc([[[30,46],[33,46],[33,48],[30,46]]]);const s=measure(a,b);assert.ok(s.addedKm2>0&&s.removedKm2>0);near(s.beforeKm2,layerArea(prepareLayer(a)));near(s.afterKm2,layerArea(prepareLayer(b)));near(s.netKm2,s.afterKm2-s.beforeKm2);});
test('самопересечение и самокасание не исправляются молча',()=>{assert.throws(()=>prepareLayer(fc([[[30,45],[32,47],[30,47],[32,45],[30,45]]])),/пересечение/);});
test('незамкнутая, пустая, повреждённая и неверно названная геометрия не равны нулю',()=>{
assert.throws(()=>prepareLayer(fc([rect().slice(0,-1)])),/замкнуто/);assert.throws(()=>prepareLayer({type:'FeatureCollection',features:[]}),/Пустой/);
const a=fc([rect()]);a.features[0].properties.name='ukrainian';assert.throws(()=>prepareLayer(a),/Не найден/);
const b=fc([rect()]);b.features[0].geometry.coordinates[0][1][0]=NaN;assert.throws(()=>prepareLayer(b),/координаты/);
});
test('отверстия вне контура и перекрывающиеся отверстия запрещены',()=>{assert.throws(()=>prepareLayer(fc([rect(),rect(34,45,35,46)])),/отверстие вне/);assert.throws(()=>prepareLayer(fc([rect(),rect(30.2,45.2,31.2,46.2),rect(30.7,45.7,31.7,46.7)])),/отверсти|пересеч/);});
test('границы антимеридиана не создают гигантское ложное изменение',()=>{assert.throws(()=>prepareLayer(fc([rect(-179,45,179,46)])),/антимеридиан/);});
test('малые ненулевые изменения не округляются до нуля в тексте',()=>{assert.match(core.area(0.001),/<0,1/);assert.equal(core.area(null),'нет данных');assert.match(core.area(-0.001,true),/−<0,1/);});
test('даты не зависят от часового пояса сборочного сервера',()=>{assert.equal(publishedAt('2026-10-01 00:30'),'2026-09-30T21:30:00.000Z');assert.equal(core.day(publishedAt('2026-10-01 00:30')),'2026-10-01');assert.throws(()=>publishedAt('2026-02-30 12:00'),/календарная/);});
test('небезопасные ссылки на исходные срезы запрещены',()=>{assert.throws(()=>safeSnapshot('/data/map-archive/../../secret.geojson'));assert.throws(()=>safeSnapshot('https://evil.example/a.geojson'));});
const run = (root,script,args=[]) => spawnSync(process.execPath,[path.join(ROOT,script),...args],{cwd:root,encoding:'utf8',timeout:20000});
const fixture = () => {const root=fs.mkdtempSync(path.join(os.tmpdir(),'krm-map-stats-'));fs.mkdirSync(path.join(root,'data'),{recursive:true});fs.mkdirSync(path.join(root,'map'));fs.copyFileSync(path.join(ROOT,'data/map-statistics-config.json'),path.join(root,'data/map-statistics-config.json'));fs.writeFileSync(path.join(root,'map/index.html'),'<!-- KRM MAP STATISTICS START --><!-- KRM MAP STATISTICS END -->');return root;};
const put = (root,z,kind='unknown') => {fs.writeFileSync(path.join(root,'data/zones.geojson'),JSON.stringify(z));fs.writeFileSync(path.join(root,'data/map-changes.json'),JSON.stringify({schema:'krmrf-map-changes-v1',changes:[{zonesUpdated:z.updated,kind,title:'Редакционный срез',summary:'Описание обновления.'}]}));};
const okay = r => assert.equal(r.status,0,r.stdout+r.stderr);
const json = (root,rel) => JSON.parse(fs.readFileSync(path.join(root,rel),'utf8'));
test('A → B → A: журнал, пропуски дней, месяц и текст воспроизводятся без Git',()=>{
const root=fixture();try{
for(const [r,d] of [[rect(),'2026-09-28 12:00'],[rect(31,45,33,47),'2026-10-03 12:00'],[rect(),'2026-10-08 12:00']]){put(root,fc([r],d));okay(run(root,'tools/map-history.mjs'));}
okay(run(root,'tools/map-statistics.mjs'));const data=json(root,'data/map-statistics.json');assert.equal(data.snapshots.length,3);assert.equal(data.intervals.length,2);near(data.periods.all.netKm2,0);assert.ok(data.periods.all.addedKm2>0&&data.periods.all.removedKm2>0);
assert.equal(data.daily.find(d=>d.date==='2026-10-01').status,'no_snapshot');assert.equal(data.daily.find(d=>d.date==='2026-10-01').netKm2,null);
const month=data.monthly.find(m=>m.month==='2026-10');assert.equal(month.crossesMonthBoundary,true);assert.match(core.post(month,'октябрь'),/контроля ВСУ[\s\S]*не определяется/);
const before=fs.readFileSync(path.join(root,'data/map-statistics.json'),'utf8');okay(run(root,'tools/map-history.mjs'));okay(run(root,'tools/map-statistics.mjs'));assert.equal(fs.readFileSync(path.join(root,'data/map-statistics.json'),'utf8'),before);okay(run(root,'tools/map-statistics.mjs',['--check']));
}finally{fs.rmSync(root,{recursive:true,force:true});}});
test('повторная редакционная проверка той же формы даёт ноль, а не отсутствие среза',()=>{const root=fixture();try{for(const d of ['2026-10-01 12:00','2026-10-02 12:00']){put(root,fc([rect()],d),'review');okay(run(root,'tools/map-history.mjs'));}okay(run(root,'tools/map-statistics.mjs'));const d=json(root,'data/map-statistics.json');assert.equal(d.snapshots.length,2);near(d.periods.latest.netKm2,0);assert.equal(d.daily.at(-1).status,'updated');}finally{fs.rmSync(root,{recursive:true,force:true});}});
test('конфликт даты блокирует сборку до перезаписи архива',()=>{const root=fixture();try{put(root,fc([rect()]));okay(run(root,'tools/map-history.mjs'));const before=fs.readFileSync(path.join(root,'data/map-archive/journal.json'),'utf8');put(root,fc([rect(31,45,33,47)]));const r=run(root,'tools/map-history.mjs');assert.notEqual(r.status,0);assert.match(r.stderr,/Конфликт/);assert.equal(fs.readFileSync(path.join(root,'data/map-archive/journal.json'),'utf8'),before);}finally{fs.rmSync(root,{recursive:true,force:true});}});
test('смена охвата разрывает ряд вместо ложного прироста',()=>{const root=fixture();try{put(root,fc([rect()]));okay(run(root,'tools/map-history.mjs'));const z=fc([rect(30,45,34,47)],'2026-10-02 12:00');z.statistics={scopeVersion:'other-area-v2'};put(root,z);okay(run(root,'tools/map-history.mjs'));okay(run(root,'tools/map-statistics.mjs'));const d=json(root,'data/map-statistics.json');assert.equal(d.intervals[0].status,'scope_changed');assert.equal(d.periods.latest.status,'unavailable');assert.equal(d.intervals[0].netKm2,null);}finally{fs.rmSync(root,{recursive:true,force:true});}});
test('контрольные суммы исходных геометрий проверяются',()=>{const root=fixture();try{put(root,fc([rect()]));okay(run(root,'tools/map-history.mjs'));const item=json(root,'data/map-archive/journal.json').versions[0];fs.appendFileSync(path.join(root,item.snapshot.slice(1)),' ');const r=run(root,'tools/map-statistics.mjs');assert.notEqual(r.status,0);assert.match(r.stderr,/Повреждён/);}finally{fs.rmSync(root,{recursive:true,force:true});}});
test('полная Git-история импортируется сверх лимита селектора',()=>{const root=fixture();try{
okay(spawnSync('git',['init','-q'],{cwd:root,encoding:'utf8'}));
for(let n=1;n<=4;n++){put(root,fc([rect(30,45,31+n,47)],`2026-10-0${n} 12:00`));okay(spawnSync('git',['add','.'],{cwd:root,encoding:'utf8'}));okay(spawnSync('git',['-c','user.name=Test','-c','user.email=test@example.invalid','commit','-qm',String(n)],{cwd:root,encoding:'utf8'}));}
const r=spawnSync(process.execPath,[path.join(ROOT,'tools/map-history.mjs')],{cwd:root,encoding:'utf8',env:{...process.env,KRM_MAP_HISTORY_LIMIT:'2'}});okay(r);assert.equal(json(root,'data/map-archive/journal.json').versions.length,4);assert.equal(json(root,'data/map-history/manifest.json').versions.length,2);
}finally{fs.rmSync(root,{recursive:true,force:true});}});
test('фактический контур согласуется с независимым интегрированием по границе',()=>{
const z=JSON.parse(fs.readFileSync('data/zones.geojson','utf8'));const ring=z.features[0].geometry.coordinates[0];let boundary=0;
for(let i=0;i<ring.length-1;i++){const a=ring[i],b=ring[i+1],pa=a[1]*Math.PI/180,pb=b[1]*Math.PI/180;boundary+=(b[0]-a[0])*Math.PI/180*(Math.sin(pa)+4*Math.sin((pa+pb)/2)+Math.sin(pb))/6;}
near(layerArea(prepareLayer(z)),Math.abs(boundary)*EARTH_RADIUS**2/1e6,0.005);
});

test('невалидные часы и секунды не переносятся на следующий день',()=>{
for(const d of ['2026-10-01 24:00','2026-10-01 23:60','2026-10-01 12:00:60']) assert.throws(()=>publishedAt(d),/время|дата/);
assert.equal(publishedAt('2026-10-01T23:59:59.999+03:00'),'2026-10-01T20:59:59.999Z');
});
test('старый час без ведущего нуля сохраняет точное московское время и строгую проверку даты',()=>{
for(const [legacy,iso] of [['2026-05-18 8:08','2026-05-18T05:08:00.000Z'],['2026-05-21 8:37','2026-05-21T05:37:00.000Z'],['2026-05-23 7:14','2026-05-23T04:14:00.000Z'],['2026-10-01 0:30','2026-09-30T21:30:00.000Z']]) assert.equal(publishedAt(legacy),iso);
assert.equal(publishedAt('2026-05-18 8:08:30.125+03:00'),'2026-05-18T05:08:30.125Z');
for(const invalid of ['2026-05-18 8:8','2026-05-18 8:60','2026-05-18 24:08','2026-02-30 8:08','2026-05-18T8:08Z','2026-05-18','8:08']) assert.throws(()=>publishedAt(invalid),/время|дата/);
});
test('срез ровно в полночь входит в новый месяц, исходным остаётся предыдущий',()=>{
const snapshots=[{id:'a',publishedAt:'2026-09-30T18:00:00.000Z',areaKm2:100},{id:'b',publishedAt:'2026-09-30T21:00:00.000Z',areaKm2:103},{id:'c',publishedAt:'2026-10-01T09:00:00.000Z',areaKm2:108}];
const data={snapshots,intervals:[{fromAt:snapshots[0].publishedAt,toAt:snapshots[1].publishedAt,status:'ok',addedKm2:3,removedKm2:0},{fromAt:snapshots[1].publishedAt,toAt:snapshots[2].publishedAt,status:'ok',addedKm2:5,removedKm2:0}]};
const p=core.period(data,'2026-09-30T21:00:00.000Z','2026-10-01T09:00:00.000Z');near(p.netKm2,8);assert.equal(p.updateCount,2);assert.equal(p.partial,false);assert.match(core.post(p,'октябрь'),/до начала выбранного периода/);
});
test('старый кэш объединяется с постоянным журналом, сохраняя отсутствовавший срез',()=>{
const old=fixture(),root=fixture();try{
put(old,fc([rect()],'2026-09-20 12:00'));okay(run(old,'tools/map-history.mjs'));
put(root,fc([rect(30,45,33,47)],'2026-10-02 12:00'));okay(run(root,'tools/map-history.mjs'));
fs.cpSync(path.join(old,'data/map-history'),path.join(root,'data/map-history'),{recursive:true});
okay(run(root,'tools/map-history.mjs'));assert.equal(json(root,'data/map-archive/journal.json').versions.length,2);okay(run(root,'tools/map-statistics.mjs'));
const before=fs.readFileSync(path.join(root,'data/map-archive/journal.json'),'utf8');okay(run(root,'tools/map-history.mjs'));assert.equal(fs.readFileSync(path.join(root,'data/map-archive/journal.json'),'utf8'),before);
}finally{fs.rmSync(old,{recursive:true,force:true});fs.rmSync(root,{recursive:true,force:true});}
});
test('повреждённая новая геометрия не попадает в постоянный журнал',()=>{
const root=fixture();try{
put(root,fc([rect()]));okay(run(root,'tools/map-history.mjs'));const before=fs.readFileSync(path.join(root,'data/map-archive/journal.json'),'utf8');
put(root,fc([[[30,45],[32,47],[30,47],[32,45],[30,45]]],'2026-10-02 12:00'));assert.notEqual(run(root,'tools/map-history.mjs').status,0);assert.equal(fs.readFileSync(path.join(root,'data/map-archive/journal.json'),'utf8'),before);
}finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('случайные прямоугольные пересечения согласуются с независимой формулой',()=>{
let seed=42619;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32;};
for(let n=0;n<100;n++){
const a=[20+random()*30,-50+random()*100],b=[20+random()*30,-50+random()*100];a.push(a[0]+0.1+random()*10,a[1]+0.1+random()*10);b.push(b[0]+0.1+random()*10,b[1]+0.1+random()*10);
const x0=Math.max(a[0],b[0]),y0=Math.max(a[1],b[1]),x1=Math.min(a[2],b[2]),y1=Math.min(a[3],b[3]);
const intersection=x1>x0&&y1>y0?sphereRect(x0,y0,x1,y1):0;const m=measure(fc([rect(...a)]),fc([rect(...b)]));
near(m.addedKm2,sphereRect(...b)-intersection,0.00002);near(m.removedKm2,sphereRect(...a)-intersection,0.00002);
}
});

test('изменение текущего контура без нового времени блокирует статистику и пост',()=>{
const root=fixture();try{
for(const [r,d] of [[rect(),'2026-10-01 12:00'],[rect(30,45,33,47),'2026-10-02 12:00']]){put(root,fc([r],d));okay(run(root,'tools/map-history.mjs'));}
okay(run(root,'tools/map-statistics.mjs'));okay(run(root,'tools/map-post.mjs'));
put(root,fc([rect(30,45,34,47)],'2026-10-02 12:00'));
const stats=run(root,'tools/map-statistics.mjs',['--check']);assert.notEqual(stats.status,0);assert.match(stats.stderr,/Текущая геометрия/);
const post=run(root,'tools/map-post.mjs');assert.notEqual(post.status,0);assert.match(post.stderr,/воспроизводимую проверку/);
const changedScope=fc([rect(30,45,33,47)],'2026-10-02 12:00');changedScope.statistics={scopeVersion:'changed-without-new-date'};put(root,changedScope);assert.notEqual(run(root,'tools/map-post.mjs').status,0);
}finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('наклонные границы: добавление и исключение проверены по независимому пересечению',()=>{
const a=[[30,45],[32,45],[30,47],[30,45]],b=[[30,46],[32,46],[32,48],[30,46]],intersection=[[30,46],[31,46],[30.5,46.5],[30,46]];
const quadrature=ring=>{let integral=0;for(let i=0;i<ring.length-1;i++){const p=ring[i],q=ring[i+1];let sum=0;for(let n=0;n<=32;n++){const phi=(p[1]+(q[1]-p[1])*n/32)*Math.PI/180;sum+=(n===0||n===32?1:n%2?4:2)*Math.sin(phi);}integral+=(q[0]-p[0])*Math.PI/180*sum/96;}return Math.abs(integral)*EARTH_RADIUS**2/1e6;};
const measured=measure(fc([a]),fc([b])),shared=quadrature(intersection);
near(measured.addedKm2,quadrature(b)-shared,0.000001);near(measured.removedKm2,quadrature(a)-shared,0.000001);
});


test('день публикации суммирует все его обновления, не распределяя многодневный интервал',()=>{
const snapshots=[{id:'a',publishedAt:'2026-10-01T09:00:00.000Z',areaKm2:100},{id:'b',publishedAt:'2026-10-04T07:00:00.000Z',areaKm2:110},{id:'c',publishedAt:'2026-10-04T18:00:00.000Z',areaKm2:100}];
const data={snapshots,daily:[{date:'2026-10-04',status:'updated',omittedSnapshotCount:0}],intervals:[{fromId:'a',toId:'b',fromAt:snapshots[0].publishedAt,toAt:snapshots[1].publishedAt,status:'ok',addedKm2:12,removedKm2:2},{fromId:'b',toId:'c',fromAt:snapshots[1].publishedAt,toAt:snapshots[2].publishedAt,status:'ok',addedKm2:5,removedKm2:15}]};
const d=core.daily(data,'2026-10-04');near(d.addedKm2,17);near(d.removedKm2,17);near(d.netKm2,0);assert.equal(d.updateCount,2);assert.equal(d.from.id,'a');assert.equal(d.to.id,'c');
assert.equal(core.daily(data,'2026-10-02').status,'insufficient');assert.equal(core.daily(data,'2026-10-02').netKm2,undefined);
data.intervals[1].status='scope_changed';assert.equal(core.daily(data,'2026-10-04').status,'unavailable');
});
test('короткий пост содержит числа и важные ограничения без журнала Git',()=>{
const d={status:'ok',from:{publishedAt:'2026-10-08T05:16:00.000Z'},to:{publishedAt:'2026-10-10T06:11:00.000Z',summary:'Служебное длинное описание'.repeat(50)},addedKm2:0.9,removedKm2:9.3,netKm2:-8.4,updateCount:1};
const text=core.post(d,'последнее обновление');assert.ok(text.length<500);assert.match(text,/Добавлено: 0,9 км²/);assert.match(text,/Исключено: 9,3 км²/);assert.match(text,/−8,4 км²/);assert.match(text,/https:\/\/krmrf.ru\/map\//);assert.doesNotMatch(text,/Git|контрольные суммы|радиуса|Служебное/);
const incomplete=core.post({...d,partial:true,crossesMonthBoundary:true,omittedSnapshotCount:3,corrections:1},'месяц');assert.match(incomplete,/часть периода/);assert.match(incomplete,/разделить его по месяцам нельзя/);assert.match(incomplete,/пропуски данных/);assert.match(incomplete,/правки контура/);
});
test('короткая дата сохраняет московский день и часы при сравнениях внутри дня',()=>{
assert.match(core.range({from:{publishedAt:'2026-10-01T00:00:00.000Z'},to:{publishedAt:'2026-10-01T09:00:00.000Z'}}),/03:00–12:00[\s\S]*МСК/);
assert.match(core.shortDate('2026-09-30T21:30:00Z'),/^1 окт/);
});

test('большой журнал импорта остаётся в данных и не перегружает публичный блок',()=>{
const root=fixture();try{
for(const date of ['2026-10-01 12:00','2026-10-02 12:00']){put(root,fc([rect()],date));okay(run(root,'tools/map-history.mjs'));}
const journal=json(root,'data/map-archive/journal.json');journal.warnings=Array.from({length:164},(_,i)=>`Служебная причина импорта: ${i}`);journal.skippedRevisions=Array.from({length:54},(_,i)=>({kind:'absent',commit:String(i).padStart(40,'0'),reason:'Файл отсутствовал'}));
fs.writeFileSync(path.join(root,'data/map-archive/journal.json'),JSON.stringify(journal));okay(run(root,'tools/map-statistics.mjs'));
const page=fs.readFileSync(path.join(root,'map/index.html'),'utf8'),d=json(root,'data/map-statistics.json');
assert.equal(d.warnings.length,164);assert.equal(d.history.skippedRevisions.length,54);assert.equal(d.snapshots.length,2);
assert.doesNotMatch(page,/Служебная причина импорта|Полнота истории|journal\.json|CSV|mapStatsCustom|mapStatsFrom|mapStatsTo/);
assert.equal((page.match(/<details\b/g)||[]).length,3);assert.match(page,/mapStatsCopy[\s\S]*mapStatsPostPreview/);assert.ok(page.length<8000);okay(run(root,'tools/map-statistics.mjs',['--check']));
}finally{fs.rmSync(root,{recursive:true,force:true});}
});
