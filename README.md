# KRM РФ

KRM РФ — статический HTML-first архив о Кременной, ЛНР, восточном фронте, гражданских последствиях, практической помощи жителям и доказательных досье.

Сайт не является CMS и не требует сервера приложений или базы данных. Основной видимый контент хранится в отдельных HTML-страницах, а `data/pages.json` служит главным каталогом публикаций и метаданных.

## Главное устройство сайта

```text
HTML публикации + изображения + запись в data/pages.json
        ↓
npm run check
        ↓
главная, индексы, архив, поиск, sitemap, Atom-ленты, JSON, производные изображения, снимки карты
        ↓
git commit + git push
        ↓
Cloudflare Pages публикует актуальную ветку
```

## Главные ветки

В текущем рабочем порядке проекта:

- `main` — основная ветка живого сайта. В ней публикуются статьи, обновляется карта и находятся актуальные файлы production-сайта.
- `noviy-sait` — вторичная ветка для экспериментов, проверки новых решений и предварительного просмотра.

Если в `main` была новая статья, новая карта или новая сборка, перед работой в `noviy-sait` нужно подтянуть в неё свежий `main`.

## Быстрый старт в Codespaces

```bash
git checkout main
git pull origin main
git status
npm run check
npm run serve
```

Открыть локальный сайт через порт Codespaces.

Остановить сервер:

```text
Ctrl + C
```

## Основные команды

```bash
npm run check          # главная команда: сборка, проверка, карта, поиск, архив, sitemap, ленты
npm run serve          # локальный сервер для просмотра сайта
npm run images         # создать недостающие производные WebP 480/960
npm run sources:sync   # синхронизировать реестр источников
npm run map:snapshot   # создать/проверить снимок карты
npm run build          # пересобрать производные HTML/JSON/XML
npm run validate       # проверить сайт
npm run test:smoke     # быстрые пользовательские smoke-тесты
npm run release        # редкий релизный ZIP + SHA256SUMS; не для каждой статьи
npm run fixity         # проверить SHA256SUMS
```

## Что редактируется вручную

Обычно вручную меняются только:

- HTML новой публикации;
- исходные изображения новой публикации;
- одна запись в `data/pages.json`;
- иногда `data/zones.geojson`, если обновляется карта;
- иногда `data/sources.json`/`SOURCES.md`, если работа идёт с источниками;
- редко `README.md`, `PUBLISHING.md`, `SOURCES.md`, `RECOVERY.md`.

## Что обычно не редактируется вручную

Эти файлы создаёт или обновляет сборщик:

- `index.html`;
- `archive/index.html`;
- разделные индексы;
- `data/search-index.json`;
- `data/news.json`;
- `data/assessment.json`;
- `data/war-crimes.json`;
- `data/site.json`;
- `sitemap.xml`;
- `feed.xml`;
- `assessment/feed.xml`;
- `kremennaya/feed.xml`;
- `assets/img/derived/...`;
- `data/map/manifest.json`;
- `data/map/snapshots/...`;
- `map/archive/index.html`;
- `data/source-preservation-queue.json`.

Если эти файлы изменились после `npm run check`, это обычно нормально. Их нужно коммитить, если изменения ожидаемые.

## Документы проекта

- `PUBLISHING.md` — основная инструкция: публикации, ветки, карта, деплой, ошибки.
- `SOURCES.md` — источники, реестр, локальные копии, очередь сохранения.
- `RECOVERY.md` — восстановление, SHA-256, release ZIP, аварийные сценарии.
- `CHANGELOG.md` — история изменений.

## Главное правило владельца

Для обычной публикации:

```bash
git checkout main
git pull origin main
git status

# создать HTML
# добавить изображение
# добавить запись в data/pages.json

npm run check
git status
git add -A
git commit -m "feat: добавить материал ..."
git push origin main
```

Для эксперимента в `noviy-sait` сначала обновить ветку из `main`:

```bash
git checkout main
git pull origin main

git checkout noviy-sait
git merge main
npm run check
git status
git add -A
git commit -m "chore: синхронизировать noviy-sait с main"
git push origin noviy-sait
```

Если после `npm run check` нет изменений, коммит не нужен.
