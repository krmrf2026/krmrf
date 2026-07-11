# Восстановление KRM РФ: GitHub, Cloudflare, SHA-256 и откат

Цель этого документа — объяснить, как восстановить сайт, если что-то сломалось: файлы, ветки, деплой, карта, контрольные суммы или хостинг.

## 1. Что является главным источником сайта

В текущем рабочем порядке:

```text
main — основная ветка живого сайта
noviy-sait — вторичная ветка для экспериментов
```

Если нужно восстановить актуальный сайт, первым делом смотреть `main`.

## 2. Что должно храниться независимо

Минимум четыре копии:

1. GitHub-репозиторий;
2. рабочая копия в Codespaces или на компьютере;
3. датированный ZIP-релиз на отдельном физическом носителе;
4. ещё одна независимая копия вне основного компьютера.

Cloudflare Pages не считается резервной копией. Это хостинг, а не архив.

Отдельно и не в репозитории должны храниться доступы:

- GitHub;
- Cloudflare;
- домен;
- DNS;
- почта;
- 2FA;
- резервные коды;
- доступ к физическим резервным копиям.

## 3. Обычная проверка сайта

```bash
git checkout main
git pull origin main
git status
npm run check
```

Нормально:

```text
Проверка пройдена: ... ошибок нет.
Smoke-тесты пройдены.
```

Предупреждение об источниках без сохранённых копий не блокирует публикацию:

```text
В реестре ... источников без сохранённой копии
```

Это задача по доказательности, а не авария сайта.

## 4. SHA-256 и `fixity`

`SHA256SUMS` фиксирует контрольные суммы файлов на момент релиза.

Проверка:

```bash
npm run fixity
```

Если есть ошибки вида:

```text
Не совпадает SHA-256: data/pages.json
Не совпадает SHA-256: index.html
```

это значит: текущие файлы отличаются от состояния, записанного в `SHA256SUMS`.

Это не всегда означает, что сайт сломан. После обычной публикации файлы естественно меняются.

## 5. Когда запускать `npm run release`

`npm run release` не нужно запускать после каждой статьи.

Использовать только:

- после крупного обновления;
- перед важным merge;
- перед большим релизом;
- периодически для резервной копии;
- перед потенциально рискованной переработкой.

Команда:

```bash
npm run release
```

Она делает:

- `npm run check`;
- негативные тесты валидатора;
- новый `SHA256SUMS`;
- ZIP в соседнюю папку `../krmrf-releases/` (или в `KRM_RELEASE_DIR`);
- `.zip.sha256`;
- проверку `npm run fixity`.

Если ZIP создался случайно и не нужен:

```bash
rm -f ../krmrf-releases/*.zip ../krmrf-releases/*.zip.sha256
git status
```

## 6. Проверка ZIP-релиза

Рядом с ZIP должен быть файл `.sha256`.

Пример:

```bash
sha256sum -c ../krmrf-releases/krmrf-site-<VERSION>.zip.sha256
```

После распаковки:

```bash
cd krmrf-main
npm run fixity
npm run check
```

Если `fixity` не проходит, но `check` проходит, значит сайт может быть рабочим, но контрольные суммы не соответствуют этому релизу. Для доказательного архива это нужно исправить новым release.

## 7. Восстановление из GitHub

```bash
git clone https://github.com/krmrf2026/krmrf.git
cd krmrf
git checkout main
npm install
npm run check
npm run serve
```

## 8. Восстановление карты

Рабочие файлы карты:

```text
data/zones.geojson
data/map-changes.json
map/index.html
```

Если карта пропала или стала старой:

```bash
git checkout main
git pull origin main
git status
git diff -- data/zones.geojson data/map-changes.json map/index.html
npm run check
```

Если изменение было намеренным, проверь `updated` в GeoJSON и новую запись в `data/map-changes.json`, затем коммить:

```bash
git add data/zones.geojson data/map-changes.json map/index.html
git commit -m "chore: обновить карту"
git push origin main
```

Если карта не должна была меняться:

```bash
git restore data/zones.geojson data/map-changes.json map/index.html
npm run check
```


## 9. Если `noviy-sait` отстал от `main`

Обновить:

```bash
git checkout main
git pull origin main

git checkout noviy-sait
git merge main
npm run check
git status
```

Если появились изменения:

```bash
git add -A
git commit -m "chore: синхронизировать noviy-sait с main"
git push origin noviy-sait
```

## 10. Если при merge конфликт

Git покажет конфликтные файлы.

Чаще всего это:

- `data/pages.json`;
- `data/zones.geojson`;
- `data/map-changes.json`;
- `index.html`;
- `archive/index.html`;
- `sitemap.xml`;
- `data/search-index.json`.

Порядок:

1. открыть конфликтный файл;
2. выбрать правильные части;
3. сохранить;
4. выполнить:

```bash
git add -A
git commit -m "merge: разрешить конфликт с main"
npm run check
```

Если конфликт в производном файле, часто правильнее сохранить исходные файлы (`data/pages.json`, HTML, `data/zones.geojson`) и дать `npm run check` пересобрать производные.

## 11. Если публикация исчезла из архива или поиска

Проверить:

```bash
grep -n "id-materiala" data/pages.json
grep -n "/url/materiala/" archive/index.html
grep -n "id-materiala" data/search-index.json
grep -n "/url/materiala/" sitemap.xml
npm run check
```

Если в `data/pages.json` нет записи — добавить.

Если запись есть, но производных файлов нет — `npm run check` не был выполнен или изменения не были закоммичены.

## 12. Если после `git push` сайт не изменился

Проверить:

```bash
git status
git log --oneline -5
```

Возможные причины:

- файлы изменены, но не закоммичены;
- push был сделан не в ту ветку;
- Cloudflare публикует другую ветку;
- деплой ещё не завершился;
- Cloudflare закешировал старое;
- коммит не содержит нужных производных файлов.

Если после `npm run check` были изменения, но ты сделал только `git push` без `git add` и `git commit`, GitHub их не получил.

## 13. Минимальная аварийная схема

Если всё непонятно:

```bash
git checkout main
git pull origin main
git status
npm run check
```

Если проверка проходит:

```bash
git status
git add -A
git commit -m "chore: восстановить согласованное состояние сайта"
git push origin main
```

Если проверка не проходит, читать последнюю ошибку и чинить только указанный файл.

## 14. Проверка после восстановления

Открыть:

- главную;
- `/archive/`;
- `/search/`;
- `/map/`;
- последнюю публикацию;
- последнюю оценку;
- последнюю памятку;
- sitemap;
- мобильную версию.

## 15. Что не делать при аварии

Не делать:

- не править production прямо на Cloudflare;
- не удалять `data/pages.json`;
- не удалять `data/zones.geojson`;
- не делать `git reset --hard origin/main`, если есть незакоммиченная важная работа;
- не делать `git push --force` без полного понимания;
- не запускать `npm run release`, чтобы “починить” случайные изменения, пока не ясно, что они правильные.
