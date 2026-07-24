# KRM РФ — простая инструкция

## Что это за сайт

KRM РФ — статический сайт-архив о Кременной, ЛНР, восточном фронте, гражданских последствиях и практических справках.

У него нет CMS, базы данных и панели администратора. Каждая статья — обычный `index.html`. Файл `data/pages.json` хранит каталог и метаданные, а команды Node.js автоматически обновляют главную, разделы, архив, поиск, sitemap и ленты.

Такая архитектура нужна для скорости, надёжности, безопасности и простого восстановления. Техническая сборка отдельно проверяет, что тексты статей не изменились случайно.

Официальные ссылки остаются внутри самих статей. Отдельной системы сохранения источников в проекте нет.

## Ветки

- `main` — основная ветка;
- `noviy-sait` — рабочая ветка новой версии.

`git push` в `noviy-sait` не меняет `main` и не создаёт второй публичный сайт. Он сохраняет код на GitHub и запускает проверку **Quality**.

## Обычное начало работы в Codespaces

```bash
git switch noviy-sait
git pull --ff-only
nvm use
npm ci
```

Проект работает на Node.js 22. Если эта версия ещё не установлена:

```bash
nvm install 22
nvm use 22
```

## Проверка и просмотр без merge

Полная проверка:

```bash
npm run qa
```

После успешной проверки готовый сайт находится в `dist/`.

Для просмотра рабочей ветки:

```bash
PORT=8080 npm run serve:dist
```

Не нажимайте `Ctrl + C`. В Codespaces откройте **Ports / Порты**, добавьте `8080` и нажмите **Open in Browser**. Это временный просмотр `noviy-sait`; `main` не меняется.

После просмотра остановите сервер:

```text
Ctrl + C
```

## Как устроен проект

- `news/`, `assessment/`, `war-crimes/` — публикации;
- `assets/img/` — изображения;
- `data/pages.json` — каталог публикаций и SEO-метаданные;
- `data/content-integrity.json` — защита текстов;
- `data/zones.geojson`, `data/map-changes.json` — карта;
- `tools/` — сборка и проверки;
- `dist/` — готовый публичный сайт, в Git не сохраняется.

`npm run qa` проверяет изображения, HTML, ссылки, SEO, карту, поиск, размеры файлов, неизменность текстов и создаёт чистый `dist/`.

## Как добавить статью

### 1. Скопируйте похожую публикацию

Выберите такой же раздел и тип материала:

- `news/kremennaya/` — Кременная;
- `news/svo/` — фронт и СВО;
- `news/lnr/` — ЛНР;
- `news/reference/` — памятки;
- `news/civilian-impact/` — гражданские последствия;
- `news/politics/` — политика;
- `assessment/YYYY-MM-DD/` — еженедельные оценки;
- `war-crimes/` — досье.

Создайте новую папку с латинским адресом и `index.html`, например:

```text
news/kremennaya/kremennaya-2026-07-24/index.html
```

### 2. Отредактируйте `index.html`

Замените `<h1>`, дату, вводный и основной текст, подписи, внутренние ссылки и блок официальных источников. SEO-теги позже синхронизируются из `data/pages.json`.

### 3. Добавьте обложку

Пример:

```text
assets/img/news/kremennaya/kremennaya-2026-07-24/cover.webp
```

### 4. Добавьте запись в `data/pages.json`

```json
{
  "id": "kremennaya-2026-07-24",
  "type": "article",
  "title": "Заголовок для читателя",
  "url": "/news/kremennaya/kremennaya-2026-07-24/",
  "section": "kremennaya",
  "datePublished": "2026-07-24",
  "dateModified": "2026-07-24",
  "status": null,
  "excerpt": "Короткое описание для карточки.",
  "image": "/assets/img/news/kremennaya/kremennaya-2026-07-24/cover.webp",
  "imageAlt": "Что изображено на обложке",
  "locations": ["Кременная", "ЛНР"],
  "seoTitle": "Короткий SEO-заголовок",
  "seoDescription": "Описание страницы длиной от 50 до 160 символов для поиска и социальных сетей."
}
```

Типы: `article`, `guide`, `assessment`, `dossier`.

Разделы: `kremennaya`, `svo`, `lnr`, `law`, `civilian-impact`, `politics`, `assessment`, `warcrimes`.

Ограничения:

- `seoTitle` — максимум 56 символов;
- `seoDescription` — 50–160 символов;
- URL и ID должны быть уникальными;
- `dateModified` не раньше `datePublished`.

Для `guide` обязательны:

```json
"reviewedAt": "2026-07-24",
"reviewAfter": "2026-08-24",
"reviewStatus": "current"
```

Чтобы вручную поставить материал первым в нужный блок главной:

```json
"home": {
  "important": 1
}
```

Возможные блоки: `important`, `kremennaya`, `guide`, `dossier`.

### 5. Зафиксируйте текст и проверьте сайт

После новой статьи или осознанной правки текста:

```bash
npm run content:lock
npm run qa
```

При чисто техническом изменении `content:lock` не нужен.

### 6. Посмотрите результат

```bash
PORT=8080 npm run serve:dist
```

Проверьте статью, главную, нужный раздел, архив, поиск и мобильный вид.

### 7. Сохраните изменения

```bash
git diff --check
git status
git add -A
git commit -m "Добавлена статья: краткое название"
git push
```git push

Пока нет merge, обновляется только `noviy-sait`.

## Как обновить старую статью

Измените её `index.html`, обновите `dateModified` в `data/pages.json`, затем выполните:

```bash
npm run content:lock
npm run qa
```

После просмотра сделайте commit и push.

## Что не редактировать вручную

Обычно не меняйте `dist/`, `data/search-index.json`, `sitemap.xml`, `feed.xml`, карточки на главной и в разделах. Их создаёт `npm run build` или `npm run qa`.

## Карта

Для обновления карты изменяются `data/zones.geojson` и первая запись в `data/map-changes.json`. Значение `zonesUpdated` должно совпадать. После этого запускается `npm run qa`.

## Полный релиз

```bash
npm run release
```

Команда создаёт исходный ZIP для Codespaces, публичный ZIP для хостинга, SHA-256 и JSON-манифест. Для обычной статьи достаточно `npm run qa`, просмотра, commit и push.
