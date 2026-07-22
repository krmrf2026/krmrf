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
- ZIP в `releases/`;
- `.zip.sha256`;
- проверку `npm run fixity`.

Если ZIP создался случайно и не нужен:

```bash
rm -f releases/*.zip releases/*.zip.sha256
git status
```

## 6. Проверка ZIP-релиза

Рядом с ZIP должен быть файл `.sha256`.

Пример:

```bash
sha256sum -c releases/krmrf-site-2026.6.20-r4.zip.sha256
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

Открыть локальный сайт через порт Codespaces или `http://localhost:8000/`.

## 8. Восстановление из ZIP

1. Проверить `.sha256` ZIP.
2. Распаковать архив.
3. Перейти в папку.
4. Выполнить:

```bash
npm install
npm run fixity
npm run check
npm run serve
```

Если нужно заново создать репозиторий:

```bash
git init
git add -A
git commit -m "restore: восстановить KRM РФ из релизного архива"
git branch -M main
git remote add origin <новый-url-репозитория>
git push -u origin main
```

## 9. Если production сломан после push

Не править файлы руками на Cloudflare.

Порядок:

```bash
git checkout main
git pull origin main
git log --oneline -10
```

Найти плохой коммит.

Безопасный откат через revert:

```bash
git revert <hash-плохого-коммита>
npm run check
git status
git push origin main
```

Не использовать `git reset --force` для общей ветки без крайней необходимости.

## 10. Если сломалась карта

Главные файлы карты:

```text
data/zones.geojson
data/zones.geojson
data/zones.geojson...
map/index.html
map/index.html
```

Если карта пропала или стала старой:

```bash
git checkout main
git pull origin main
git status
git diff -- data/zones.geojson
git diff -- data/zones.geojson
npm run check
```

Если `npm run check` создал новый снимок карты, проверить:

```bash
git status
git diff -- data/zones.geojson
git diff -- data/zones.geojson
```

Если изменение карты было намеренным:

```bash
git add -A
git commit -m "chore: обновить снимок карты"
git push origin main
```

Если карта не должна была меняться, откатить изменения:

```bash
git restore data/zones.geojson data/zones.geojson map/index.html
npm run check
```


## 11. Если `noviy-sait` отстал от `main`

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

## 12. Если при merge конфликт

Git покажет конфликтные файлы.

Чаще всего это:

- `data/pages.json`;
- `data/zones.geojson`;
- `index.html`;
- `archive/index.html`;
- `sitemap.xml`;
- `data/search-index.json`;
- `data/zones.geojson`.

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

## 13. Если публикация исчезла из архива или поиска

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

## 14. Если после `git push` сайт не изменился

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

## 15. Минимальная аварийная схема

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

## 16. Проверка после восстановления

Открыть:

- главную;
- `/archive/`;
- `/search/`;
- `/map/`;
- `/map/`;
- последнюю публикацию;
- последнюю оценку;
- последнюю памятку;
- sitemap;
- мобильную версию.

## 17. Что не делать при аварии

Не делать:

- не править production прямо на Cloudflare;
- не удалять `data/pages.json`;
- не удалять `data/zones.geojson`;
- не делать `git reset --hard origin/main`, если есть незакоммиченная важная работа;
- не делать `git push --force` без полного понимания;
- не запускать `npm run release`, чтобы “починить” случайные изменения, пока не ясно, что они правильные.
