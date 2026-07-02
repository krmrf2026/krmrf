# KRM РФ — инструкция для чайника: Codespaces, ветки, статьи, картинки, проверка, коммит и публикация

Эта инструкция написана максимально простым языком для работы с сайтом **KRM РФ** в GitHub Codespaces.

Сайт KRM РФ — это **статический HTML-first архив**. Это значит: здесь нет WordPress, админки, базы данных и кнопки «опубликовать». Всё работает через файлы.

Обычная логика такая:

```text
1. Ты заходишь в Codespaces.
2. Проверяешь ветку и подтягиваешь свежие изменения.
3. Добавляешь или правишь HTML-страницу.
4. Кладёшь картинку в правильную папку.
5. Добавляешь или правишь запись в data/pages.json.
6. Запускаешь npm run check.
7. Смотришь, что изменилось.
8. Делаешь git add -A.
9. Делаешь git commit.
10. Делаешь git push.
11. Проверяешь сайт.
```

Главное правило:

```text
Сначала проверка, потом коммит, потом push.
```

---

## 0. Самое важное, чтобы не запутаться

В проекте есть три группы файлов.

### 0.1. Файлы, которые ты обычно редактируешь руками

Обычно руками меняются только:

```text
data/pages.json
news/.../.../index.html
assessment/YYYY-MM-DD/index.html
war-crimes/.../index.html
assets/img/.../cover.webp
data/zones.geojson
```

То есть:

- запись о публикации;
- сама HTML-страница;
- обложка;
- иногда карта.

### 0.2. Файлы, которые создаёт или обновляет сборщик

После команды:

```bash
npm run check
```

могут автоматически измениться:

```text
index.html
archive/index.html
news/index.html
news/svo/index.html
kremennaya/index.html
assessment/index.html
war-crimes/index.html
reference/index.html
search/index.html
map/index.html
map/archive/index.html
data/news.json
data/search-index.json
data/site.json
data/sources.json
data/source-preservation-queue.json
data/map/manifest.json
data/map/snapshots/...
feed.xml
assessment/feed.xml
kremennaya/feed.xml
sitemap.xml
assets/img/derived/...
```

Это нормально. Если эти изменения появились после `npm run check`, чаще всего их надо коммитить.

### 0.3. Файлы, которые не надо трогать просто так

Не трогай без причины:

```text
package.json
package-lock.json
tools/*.mjs
assets/js/*.js
assets/css/*.css
assets/vendor/leaflet/...
SHA256SUMS
```

Их меняют только при технической работе.

---

## 1. Что лежит в проекте

В архиве сайта сейчас примерно такая структура:

```text
krmrf/
  index.html                         главная страница
  404.html                           страница ошибки
  CNAME                              домен krmrf.ru
  README.md                          краткая инструкция проекта
  PUBLISHING.md                      инструкция по публикации
  SOURCES.md                         инструкция по источникам
  RECOVERY.md                        восстановление и SHA-256
  CHANGELOG.md                       журнал изменений

  data/
    pages.json                       главный каталог публикаций
    news.json                        производный JSON для новостей
    search-index.json                поисковый индекс
    site.json                        данные сайта
    sources.json                     реестр источников
    source-preservation-queue.json   очередь сохранения источников
    zones.geojson                    текущая карта
    map/manifest.json                список снимков карты
    map/snapshots/...                архивные снимки карты

  news/
    svo/.../index.html               статьи СВО
    kremennaya/.../index.html        статьи по Кременной
    reference/.../index.html         памятки
    lnr/.../index.html               материалы ЛНР
    politics/.../index.html          политика
    civilian-impact/.../index.html   гражданские последствия

  assessment/
    YYYY-MM-DD/index.html            оценки фронта

  war-crimes/
    .../index.html                   досье

  assets/
    img/...                          исходные картинки
    img/derived/...                  производные картинки 480/960
    css/...                          стили
    js/...                           скрипты сайта
    vendor/leaflet/...               карта Leaflet

  tools/
    build.mjs                        сборка главной, индексов, поиска, sitemap, лент
    images.mjs                       создание производных картинок
    sources.mjs                      синхронизация источников
    map-snapshot.mjs                 снимки карты
    validate.mjs                     проверка сайта
    smoke.mjs                        smoke-тесты
    release.mjs                      релизный ZIP
    fixity.mjs                       SHA-256 проверка
```

---

## 2. Главные команды проекта

В проекте есть `package.json`. В нём прописаны команды.

### 2.1. Главная команда

```bash
npm run check
```

Она запускает всё важное:

```text
sources:sync  → синхронизация источников
images        → создание производных WebP
map:snapshot  → проверка/создание снимка карты
build         → сборка главной, индексов, поиска, sitemap, feed
validate      → проверка ошибок
test:smoke    → быстрые пользовательские тесты
```

Если `npm run check` прошёл — сайт технически собран правильно.

### 2.2. Локальный просмотр сайта

```bash
npm run serve
```

или, если надо совсем просто:

```bash
python -m http.server 8000
```

Потом открываешь порт в Codespaces и смотришь сайт в браузере.

### 2.3. Отдельные команды

```bash
npm run sources:sync   # обновить источники
npm run images         # создать недостающие 480/960 WebP
npm run map:snapshot   # создать/проверить снимок карты
npm run build          # пересобрать главную, индексы, поиск, sitemap, feed
npm run validate       # проверить сайт
npm run test:smoke     # smoke-тесты
npm run release        # релизный ZIP и SHA-256, не для каждой статьи
npm run fixity         # проверить SHA256SUMS
```

Для обычной статьи почти всегда достаточно:

```bash
npm run check
```

---

## 3. Ветки: `main` и `noviy-sait`

В проекте используются две основные ветки.

### 3.1. `main`

`main` — главная ветка живого сайта.

Обычно сюда попадает то, что должно быть опубликовано окончательно.

### 3.2. `noviy-sait`

`noviy-sait` — ветка для нового сайта, экспериментов, проверки и предварительной работы.

Ты часто работаешь именно в ней.

### 3.3. Как понять, где ты сейчас

В Codespaces в терминале выполни:

```bash
git branch
```

Пример:

```text
  main
* noviy-sait
```

Звёздочка `*` показывает текущую ветку.

Ещё можно:

```bash
git status
```

Пример нормального состояния:

```text
On branch noviy-sait
Your branch is up to date with 'origin/noviy-sait'.

nothing to commit, working tree clean
```

Это значит:

```text
ты в ветке noviy-sait
изменений нет
можно начинать работу
```

---

## 4. Как начать работу в Codespaces с самого начала

### 4.1. Открыл Codespaces

После входа открой терминал.

Проверь, где ты:

```bash
pwd
```

Должно быть примерно:

```text
/workspaces/krmrf
```

Если ты не в папке проекта, перейди туда:

```bash
cd /workspaces/krmrf
```

### 4.2. Проверь ветку

```bash
git branch
```

Если нужна ветка `noviy-sait`:

```bash
git switch noviy-sait
```

Если нужна ветка `main`:

```bash
git switch main
```

### 4.3. Проверь состояние

```bash
git status
```

Хорошо, если видишь:

```text
nothing to commit, working tree clean
```

Если есть изменения — сначала разберись, что это.

```bash
git diff --name-only
```

---

## 5. Как подтянуть свежие изменения из GitHub в Codespaces

### 5.1. Если ты работаешь в `noviy-sait`

```bash
git switch noviy-sait
git pull --rebase origin noviy-sait
```

Потом:

```bash
git status
```

Должно быть чисто.

### 5.2. Если ты работаешь в `main`

```bash
git switch main
git pull --rebase origin main
```

Потом:

```bash
git status
```

### 5.3. Если Git пишет, что есть локальные изменения

Не делай `pull` вслепую.

Сначала:

```bash
git status
git diff --name-only
```

Если изменения нужны — закоммить их.

```bash
git add -A
git commit -m "wip: сохранить текущие изменения"
```

Если изменения временные, можно спрятать:

```bash
git stash push -m "temporary changes before pull"
git pull --rebase origin noviy-sait
git stash pop
```

Если изменения точно не нужны:

```bash
git restore .
git clean -fd
```

Осторожно: `git clean -fd` удаляет новые файлы, которые Git ещё не отслеживает.

---

## 6. Как подтянуть изменения с локального компьютера в Codespaces

Есть два способа.

---

### Способ 1. Правильный: через GitHub

На локальном компьютере:

```bash
cd путь/к/krmrf
git switch noviy-sait
git status
git add -A
git commit -m "описание изменений"
git push origin noviy-sait
```

Потом в Codespaces:

```bash
cd /workspaces/krmrf
git switch noviy-sait
git pull --rebase origin noviy-sait
```

Проверка:

```bash
git status
```

---

### Способ 2. Вручную перетащить файлы

Можно перетащить файлы в левую панель VS Code Codespaces.

Например:

```text
data/pages.json
news/svo/svo-2026-07-02/index.html
assets/img/news/svo/svo-2026-07-02/cover.webp
```

После этого обязательно:

```bash
git status
npm run check
git add -A
git commit -m "обновить сайт"
git push origin noviy-sait
```

---

## 7. Как подтянуть `main` в `noviy-sait`

Это нужно, если в `main` появились новые статьи, карта или сборка, а ты хочешь, чтобы `noviy-sait` не отставал.

```bash
git switch main
git pull --rebase origin main

git switch noviy-sait
git pull --rebase origin noviy-sait
git merge main
```

После merge:

```bash
npm run check
git status
```

Если появились изменения после сборки:

```bash
git add -A
git commit -m "chore: синхронизировать noviy-sait с main"
git push origin noviy-sait
```

Если изменений нет:

```bash
git status
```

и всё.

---

## 8. Как перенести `noviy-sait` в `main`

Перед этим обязательно понять, что именно отличается.

```bash
git switch noviy-sait
git pull --rebase origin noviy-sait
npm run check
git status
```

Если всё чисто, смотри разницу:

```bash
git diff --name-only main..noviy-sait
```

Если всё нормально:

```bash
git switch main
git pull --rebase origin main
git merge noviy-sait
npm run check
git status
```

Если после проверки появились изменения:

```bash
git add -A
git commit -m "chore: пересобрать сайт после переноса noviy-sait"
```

Потом:

```bash
git push origin main
```

Важно:

```text
merge переносит ВСЁ, что есть в noviy-sait.
```

Если в `noviy-sait` накопились лишние эксперименты, они тоже уйдут в `main`.

---

## 9. Как добавить новую обычную статью

Допустим, статья будет:

```text
/news/svo/svo-2026-07-02/
```

### 9.1. Подготовь ветку

```bash
cd /workspaces/krmrf
git switch noviy-sait
git pull --rebase origin noviy-sait
git status
```

Должно быть чисто.

### 9.2. Создай папку статьи

```bash
mkdir -p news/svo/svo-2026-07-02
```

### 9.3. Создай HTML

Можно скопировать похожую старую статью:

```bash
cp news/svo/svo-2026-06-09/index.html news/svo/svo-2026-07-02/index.html
```

Потом открыть новый файл:

```text
news/svo/svo-2026-07-02/index.html
```

И заменить:

- `<title>`;
- meta description;
- canonical;
- OG/Twitter title/description/image;
- JSON-LD;
- хлебные крошки;
- H1;
- дату;
- период;
- текст статьи;
- содержание;
- ссылки на связанные материалы;
- блок источников и ограничений;
- путь к обложке.

### 9.4. Добавь обложку

Создай папку:

```bash
mkdir -p assets/img/news/svo/svo-2026-07-02
```

Положи обложку сюда:

```text
assets/img/news/svo/svo-2026-07-02/cover.webp
```

Проверить:

```bash
test -f assets/img/news/svo/svo-2026-07-02/cover.webp && echo "обложка есть" || echo "обложки нет"
```

### 9.5. Не создавай вручную 480 и 960, если не нужно

Производные картинки создаёт сборщик:

```text
assets/img/derived/news/svo/svo-2026-07-02/cover-480.webp
assets/img/derived/news/svo/svo-2026-07-02/cover-960.webp
```

Их делает:

```bash
npm run images
```

Но обычно достаточно:

```bash
npm run check
```

### 9.6. Добавь запись в `data/pages.json`

Запись должна быть в массиве публикаций. Новые материалы обычно ставятся выше старых по дате.

Пример:

```json
{
  "id": "svo-2026-07-02",
  "type": "article",
  "title": "Обстановка на фронте СВО к 2 июля 2026 года",
  "url": "/news/svo/svo-2026-07-02/",
  "section": "svo",
  "datePublished": "2026-07-02",
  "dateModified": "2026-07-02",
  "status": null,
  "excerpt": "Обзор KRM РФ к 2 июля: Красный Лиман, Купянск, Славянское направление, БПЛА, логистика, спорные зоны контроля и гражданская обстановка в ЛНР.",
  "image": "/assets/img/news/svo/svo-2026-07-02/cover.webp",
  "imageAlt": "Общая карта обстановки на фронте СВО к 2 июля 2026 года",
  "period": "после 9 июня — к 2 июля 2026 года",
  "locations": [
    "Восточный фронт",
    "Красный Лиман",
    "Купянск",
    "Славянское направление",
    "Кременная",
    "ЛНР"
  ],
  "sourceIds": []
}
```

Не придумывай `sourceIds` руками. Если в HTML есть внешние ссылки, `npm run check` сам добавит источники.

### 9.7. Если надо вывести материал на главную в «важное»

Добавь:

```json
"home": {
  "important": 3
}
```

Но следи, чтобы в блоке важного не было путаницы.

Например логика важного:

```text
important: 1  главный материал
important: 2  второй материал
important: 3  третий материал
```

Если два материала имеют одинаковый `important`, блок на главной может вести себя не так, как ожидаешь.

---

## 10. Как добавить новую оценку фронта

Оценки лежат здесь:

```text
assessment/YYYY-MM-DD/index.html
```

Пример:

```bash
mkdir -p assessment/2026-07-05
cp assessment/2026-06-28/index.html assessment/2026-07-05/index.html
mkdir -p assets/img/assessment/2026-07-05
```

Обложка:

```text
assets/img/assessment/2026-07-05/cover.webp
```

Запись в `data/pages.json`:

```json
{
  "id": "assessment-2026-07-05",
  "type": "assessment",
  "title": "Оценка боевых действий СВО: Восточный ТВД, 29 июня — 5 июля 2026",
  "url": "/assessment/2026-07-05/",
  "section": "assessment",
  "datePublished": "2026-07-05",
  "dateModified": "2026-07-05",
  "status": null,
  "excerpt": "Краткое описание главных изменений недели.",
  "image": "/assets/img/assessment/2026-07-05/cover.webp",
  "imageAlt": "Оценка фронта за 29 июня — 5 июля 2026 года",
  "period": "29 июня — 5 июля 2026",
  "locations": ["Восточный фронт", "ЛНР", "Донбасс"],
  "sourceIds": []
}
```

Потом:

```bash
npm run check
git status
git add -A
git commit -m "feat: добавить оценку фронта за 29 июня — 5 июля 2026"
git push origin noviy-sait
```

---

## 11. Как добавить новую памятку

Памятки обычно лежат тут:

```text
news/reference/.../index.html
```

Для памятки в `data/pages.json` обязательно нужны поля проверки актуальности:

```json
"reviewedAt": "2026-07-02",
"reviewAfter": "2026-10-02",
"reviewStatus": "current"
```

Если этих полей нет, проверка может упасть.

Тип памятки:

```json
"type": "guide",
"section": "law"
```

---

## 12. Как добавить новое досье

Досье лежат тут:

```text
war-crimes/.../index.html
```

В `data/pages.json`:

```json
"type": "dossier",
"section": "warcrimes",
"status": "open"
```

Для досье желательно иметь:

- точную дату;
- место;
- описание события;
- что установлено;
- что требует проверки;
- источники;
- ограничения;
- `revisionHistory`.

Пример `revisionHistory`:

```json
"revisionHistory": [
  {
    "date": "2026-07-02",
    "summary": "Создана первая публичная версия досье."
  }
]
```

---

## 13. Как работает `data/pages.json`

`data/pages.json` — главный каталог публикаций.

Каждая публикация должна иметь минимум:

```json
{
  "id": "unique-id",
  "type": "article",
  "title": "Название",
  "url": "/news/svo/example/",
  "section": "svo",
  "datePublished": "2026-07-02",
  "dateModified": "2026-07-02",
  "excerpt": "Краткое описание.",
  "image": "/assets/img/news/svo/example/cover.webp",
  "imageAlt": "Описание картинки",
  "sourceIds": []
}
```

### 13.1. Допустимые `type`

```text
article     обычный материал
guide       памятка
assessment  оценка фронта
dossier     досье
```

### 13.2. Допустимые `section`

```text
kremennaya
svo
lnr
law
civilian-impact
politics
assessment
warcrimes
```

### 13.3. Важные правила

`url` всегда с `/` в начале и `/` в конце:

```json
"url": "/news/svo/svo-2026-07-02/"
```

`image` всегда начинается с:

```text
/assets/img/
```

`sourceIds` должен быть массивом:

```json
"sourceIds": []
```

Даже если источников пока нет.

---

## 14. Как проверить `pages.json` вручную

Проверка валидности JSON:

```bash
python -m json.tool data/pages.json > /tmp/pages-ok.json && echo "pages.json валидный"
```

Проверка дубликатов `id`:

```bash
python - <<'PY'
import json
from collections import Counter

pages = json.load(open('data/pages.json', encoding='utf-8'))
ids = [p['id'] for p in pages]
dupes = [id for id, count in Counter(ids).items() if count > 1]

if dupes:
    print('Дубликаты id:', dupes)
    raise SystemExit(1)

print('Дубликатов id нет')
print('Всего публикаций:', len(pages))
PY
```

Проверка блока важного:

```bash
python - <<'PY'
import json

pages = json.load(open('data/pages.json', encoding='utf-8'))
important = sorted(
    (p.get('home', {}).get('important'), p['id'], p['title'])
    for p in pages
    if p.get('home', {}).get('important') is not None
)

for row in important:
    print(row)
PY
```

---

## 15. Как работают картинки

Для каждой публикации обычно есть основная обложка:

```text
assets/img/news/svo/svo-2026-07-02/cover.webp
```

В `data/pages.json` она указывается так:

```json
"image": "/assets/img/news/svo/svo-2026-07-02/cover.webp"
```

В HTML статьи обычно тоже стоит:

```html
<img src="/assets/img/news/svo/svo-2026-07-02/cover.webp" ...>
```

А в `srcset` могут быть производные:

```html
/assets/img/derived/news/svo/svo-2026-07-02/cover-480.webp
/assets/img/derived/news/svo/svo-2026-07-02/cover-960.webp
```

Эти производные создаёт:

```bash
npm run images
```

или вся проверка:

```bash
npm run check
```

### 15.1. Почему картинок нет

Обычно причина одна из этих:

```text
1. cover.webp не лежит в нужной папке.
2. путь в data/pages.json неправильный.
3. путь в HTML неправильный.
4. картинку забыли git add.
5. картинку забыли commit.
6. картинку забыли push.
7. Cloudflare ещё не обновил деплой.
```

Проверка:

```bash
test -f assets/img/news/svo/svo-2026-07-02/cover.webp && echo "cover есть" || echo "cover нет"
test -f assets/img/derived/news/svo/svo-2026-07-02/cover-480.webp && echo "480 есть" || echo "480 нет"
test -f assets/img/derived/news/svo/svo-2026-07-02/cover-960.webp && echo "960 есть" || echo "960 нет"
```

---

## 16. Как обновить карту

Главный файл карты:

```text
data/zones.geojson
```

Если ты меняешь карту, меняй именно его.

Внутри должен быть `updated`.

Пример:

```json
"updated": "2026-07-01T08:10:00+03:00"
```

После изменения карты:

```bash
npm run check
```

Скрипт создаст или проверит снимок:

```text
data/map/snapshots/2026-07-01T08-10-00+03-00.geojson
```

и обновит:

```text
data/map/manifest.json
map/index.html
map/archive/index.html
```

Важно:

```text
Если меняешь геометрию карты, но оставляешь старый updated, скрипт может ругнуться:
снимок с такой датой уже существует с другой контрольной суммой.
```

Решение: поставить новый `updated`.

---

## 17. Как работают источники

Источники живут в:

```text
data/sources.json
data/source-preservation-queue.json
```

Если в HTML публикации внутри `<main>` есть внешняя ссылка, команда:

```bash
npm run sources:sync
```

или:

```bash
npm run check
```

сама:

```text
1. найдёт ссылку;
2. добавит её в data/sources.json;
3. создаст sourceId;
4. добавит sourceId в нужную публикацию в data/pages.json;
5. обновит очередь сохранения важных источников.
```

Не надо придумывать `sourceIds` руками.

### 17.1. Предупреждение про источники

Если видишь:

```text
В реестре 113 источников без сохранённой копии; 60 из них находятся в приоритетной очереди.
```

Это не ошибка сайта.

Это значит:

```text
ссылки есть, но не все источники сохранены локально.
```

Если ниже написано:

```text
Проверка пройдена
Smoke-тесты пройдены
```

то сайт можно публиковать.

---

## 18. Как запустить полную проверку

Главная команда:

```bash
npm run check
```

Нормальный результат выглядит примерно так:

```text
Реестр источников синхронизирован: 113 записей, 52 публикаций.
Производные изображения уже существуют: проверено 286 файлов.
Снимок карты уже существует: /data/map/snapshots/....geojson
Сборка завершена: 52 публикаций.
Проверка пройдена: 52 публикаций, 70 HTML-страниц, ошибок нет.
Smoke-тесты пройдены.
```

Если есть предупреждение, но ошибок нет — это нормально.

Если есть `ошибка`, надо читать текст ошибки.

---

## 19. Что делать после `npm run check`

Сразу смотри:

```bash
git status
```

Если видишь:

```text
Changes not staged for commit
Untracked files
```

это значит:

```text
файлы изменились, но ещё не добавлены в коммит.
```

Нужно:

```bash
git add -A
```

Потом:

```bash
git status
```

Теперь должно быть:

```text
Changes to be committed
```

После этого:

```bash
git commit -m "описание изменений"
git push origin noviy-sait
```

---

## 20. Главная ошибка: забыть `git add`

Если ты сделал:

```bash
git commit -m "Пересобрать сайт"
```

а Git ответил:

```text
no changes added to commit
```

это значит: ты забыл `git add`.

Правильно:

```bash
git add -A
git commit -m "Пересобрать сайт"
git push origin noviy-sait
```

---

## 21. Почему `git push` пишет `Everything up-to-date`

Если ты сделал:

```bash
git push origin noviy-sait
```

и видишь:

```text
Everything up-to-date
```

это значит:

```text
новых коммитов нет.
```

Возможные причины:

```text
1. ты не сделал git add;
2. ты не сделал git commit;
3. ты уже запушил этот коммит;
4. изменения есть только в рабочей папке, но не в истории Git.
```

Проверяй:

```bash
git status
git log --oneline -5
```

---

## 22. Правильный порядок коммита после сборки

После `npm run check` делай так:

```bash
git status
git add -A
git status
git commit -m "feat: добавить материал ..."
git push origin noviy-sait
git status
```

Финальное состояние должно быть:

```text
nothing to commit, working tree clean
```

---

## 23. Как выбрать сообщение коммита

Нормальные варианты:

```bash
git commit -m "feat: добавить обзор СВО к 2 июля 2026"
git commit -m "feat: добавить материал о Кременной к 24 июня"
git commit -m "fix: исправить запись в pages.json"
git commit -m "chore: пересобрать сайт"
git commit -m "chore: обновить карту и снимок"
git commit -m "docs: обновить README"
```

Не пиши слишком длинное сообщение, если оно не нужно.

---

## 24. Как проверить сайт локально

Запусти:

```bash
npm run serve
```

Если не работает, можно:

```bash
python -m http.server 8000
```

Открой порт в Codespaces.

Проверь:

```text
/
/news/
/news/svo/
/news/svo/svo-2026-07-02/
/archive/
/search/
/map/
/sitemap.xml
/feed.xml
```

Что смотреть глазами:

```text
1. открывается ли главная;
2. есть ли новая статья;
3. есть ли картинка;
4. правильный ли блок «важное»;
5. работает ли архив;
6. работает ли поиск;
7. нет ли старой статьи вместо новой;
8. нет ли битых изображений;
9. нормально ли на телефоне.
```

Остановить сервер:

```text
Ctrl + C
```

---

## 25. Полный сценарий: добавить статью и опубликовать в `noviy-sait`

```bash
cd /workspaces/krmrf

git switch noviy-sait
git pull --rebase origin noviy-sait
git status

# создать папку статьи
mkdir -p news/svo/svo-2026-07-02

# создать папку картинки
mkdir -p assets/img/news/svo/svo-2026-07-02

# вручную положить:
# news/svo/svo-2026-07-02/index.html
# assets/img/news/svo/svo-2026-07-02/cover.webp
# поправить data/pages.json

# проверить основной файл обложки
test -f assets/img/news/svo/svo-2026-07-02/cover.webp && echo "cover OK" || echo "cover нет"

# проверить JSON
python -m json.tool data/pages.json > /tmp/pages-ok.json && echo "pages.json OK"

# полная проверка
npm run check

# посмотреть изменения
git status
git diff --name-only

# добавить всё в коммит
git add -A

# проверить, что файлы staged
git status

# коммит
git commit -m "feat: добавить обзор СВО к 2 июля 2026"

# отправить на GitHub
git push origin noviy-sait

# финальная проверка
git status
```

---

## 26. Полный сценарий: только пересобрать сайт после правок

Если ты уже правил файлы и просто надо пересобрать:

```bash
npm run check
git status
git add -A
git commit -m "chore: пересобрать сайт после правок"
git push origin noviy-sait
git status
```

---

## 27. Полный сценарий: правка только `pages.json`

Например, ты поменял блок `home.important`.

```bash
python -m json.tool data/pages.json > /tmp/pages-ok.json && echo "JSON OK"
npm run check
git status
git add -A
git commit -m "fix: обновить важные материалы на главной"
git push origin noviy-sait
```

Важно: даже если руками менял только `data/pages.json`, после `npm run check` изменятся главная, индексы, поиск, sitemap и JSON. Их тоже надо коммитить.

---

## 28. Полный сценарий: обновить только карту

```bash
git switch noviy-sait
git pull --rebase origin noviy-sait

# правишь data/zones.geojson

npm run check
git status
git add -A
git commit -m "chore: обновить карту"
git push origin noviy-sait
```

Ожидаемые изменения:

```text
data/zones.geojson
data/map/manifest.json
data/map/snapshots/...
map/index.html
map/archive/index.html
```

---

## 29. Как понять, какие файлы изменились

Короткий список:

```bash
git diff --name-only
```

Посмотреть конкретный файл:

```bash
git diff -- data/pages.json
```

После `git add -A`:

```bash
git diff --cached --name-only
```

Посмотреть, что попадёт в коммит:

```bash
git diff --cached
```

---

## 30. Что делать, если случайно написал русский текст в терминал

Например ты написал:

```bash
как теперь закомитить
```

Терминал ответит:

```text
bash: как: command not found
```

Это не поломка. Терминал ждёт команды, а не обычный текст.

Правильно писать команды:

```bash
git status
git add -A
git commit -m "сообщение"
git push origin noviy-sait
```

---

## 31. Частые проблемы и решения

### 31.1. `no changes added to commit`

Причина: не сделал `git add`.

Решение:

```bash
git add -A
git commit -m "сообщение"
```

### 31.2. `Everything up-to-date`

Причина: новых коммитов нет.

Проверка:

```bash
git status
git log --oneline -5
```

### 31.3. Картинка не отображается

Проверить:

```bash
test -f assets/img/news/svo/svo-2026-07-02/cover.webp && echo OK || echo НЕТ
```

Проверить путь в `data/pages.json`:

```bash
grep -n "svo-2026-07-02" -n data/pages.json
```

Проверить путь в HTML:

```bash
grep -n "cover.webp" news/svo/svo-2026-07-02/index.html
```

Потом:

```bash
npm run check
git add -A
git commit -m "fix: добавить обложку материала"
git push origin noviy-sait
```

### 31.4. JSON сломался

Проверить:

```bash
python -m json.tool data/pages.json
```

Если ошибка, там будет строка и колонка.

Частые причины:

```text
лишняя запятая
нет запятой между объектами
кавычки не двойные
случайно вставлен текст вне JSON
```

### 31.5. `npm run check` ругается на HTML

Смотри конкретный путь в ошибке. Обычно причины:

```text
нет H1
не совпадает canonical
не совпадает JSON-LD
картинка не найдена
запись в pages.json ведёт на несуществующий HTML
```

### 31.6. В главной не тот материал в «важном»

Проверь:

```bash
python - <<'PY'
import json
pages = json.load(open('data/pages.json', encoding='utf-8'))
for p in sorted([p for p in pages if p.get('home', {}).get('important')], key=lambda x: x['home']['important']):
    print(p['home']['important'], p['id'], p['title'])
PY
```

Потом исправь `home.important` и запусти:

```bash
npm run check
git add -A
git commit -m "fix: обновить важные материалы"
git push origin noviy-sait
```

### 31.7. После сборки появились много изменённых файлов

Это нормально.

Если ты менял `data/pages.json`, сборщик обновляет:

```text
главную
архив
индексы
поиск
sitemap
feed
JSON
```

Коммить так:

```bash
git add -A
git commit -m "chore: пересобрать сайт"
```

---

## 32. Что делать перед каждым push

Мини-чеклист:

```text
[ ] Я в нужной ветке?
[ ] git status понятный?
[ ] npm run check прошёл?
[ ] ошибок нет?
[ ] картинки есть?
[ ] data/pages.json валидный?
[ ] git add -A сделан?
[ ] git status показывает Changes to be committed?
[ ] commit сделан?
[ ] push сделан?
[ ] после push рабочее дерево чистое?
```

Команды:

```bash
git branch
git status
npm run check
git add -A
git status
git commit -m "описание"
git push origin noviy-sait
git status
```

---

## 33. Что делать после push

После push проверь:

```bash
git status
```

Должно быть:

```text
nothing to commit, working tree clean
```

Потом проверь деплой Cloudflare/GitHub Pages, если используется.

Открой:

```text
https://krmrf.ru/
https://krmrf.ru/news/
https://krmrf.ru/archive/
https://krmrf.ru/search/
https://krmrf.ru/map/
```

И конкретную статью:

```text
https://krmrf.ru/news/svo/svo-2026-07-02/
```

---

## 34. Когда нужен `npm run release`

`npm run release` не нужен после каждой статьи.

Он нужен:

```text
после крупного обновления
перед большим релизом
перед рискованной переработкой
для создания ZIP-архива
для обновления SHA256SUMS
```

Обычная статья:

```bash
npm run check
```

Крупный релиз:

```bash
npm run release
```

`release` создаёт ZIP и SHA-256.

---

## 35. Как восстановиться, если всё сломалось

### 35.1. Посмотреть последние коммиты

```bash
git log --oneline -10
```

### 35.2. Откатить плохой коммит безопасно

```bash
git revert HASH_КОММИТА
npm run check
git push origin noviy-sait
```

Не используй `git reset --force`, если не понимаешь последствия.

### 35.3. Вернуть отдельный файл из Git

Например, вернуть `data/pages.json` к состоянию последнего коммита:

```bash
git restore data/pages.json
```

Вернуть всё рабочее дерево:

```bash
git restore .
```

Удалить неотслеживаемые файлы:

```bash
git clean -fd
```

Осторожно: это удаляет новые файлы.

---

## 36. Идеальный ежедневный сценарий работы

Если ты просто зашёл в Codespaces и хочешь нормально работать:

```bash
cd /workspaces/krmrf

git switch noviy-sait
git pull --rebase origin noviy-sait
git status

npm run check

# если всё хорошо и изменений нет — можно работать дальше
```

После правок:

```bash
npm run check
git status
git add -A
git commit -m "описание изменений"
git push origin noviy-sait
git status
```

---

## 37. Самая короткая шпаргалка

### Начать работу

```bash
cd /workspaces/krmrf
git switch noviy-sait
git pull --rebase origin noviy-sait
git status
```

### Проверить сайт

```bash
npm run check
```

### Закоммитить всё после проверки

```bash
git add -A
git commit -m "описание изменений"
git push origin noviy-sait
```

### Посмотреть локально

```bash
npm run serve
```

### Остановить сервер

```text
Ctrl + C
```

### Проверить, чисто ли всё

```bash
git status
```

Нужно увидеть:

```text
nothing to commit, working tree clean
```

---

## 38. Главное правило KRM РФ

Для этого сайта важно не просто «чтобы открылось».

Важно, чтобы:

```text
страница была в HTML;
запись была в data/pages.json;
картинка лежала по правильному пути;
источники были синхронизированы;
карта имела снимки;
поиск и архив обновились;
sitemap и feed обновились;
проверка прошла;
всё было закоммичено;
всё было запушено.
```

Поэтому лучший порядок всегда один:

```bash
git status
npm run check
git status
git add -A
git commit -m "понятное сообщение"
git push origin noviy-sait
git status
```

Если после этого `working tree clean`, значит работа сделана правильно.
