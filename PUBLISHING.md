# Работа с сайтом KRM РФ: публикации, ветки, карта и деплой

Эта инструкция написана для владельца сайта KRM РФ и описывает реальный рабочий порядок в GitHub Codespaces.

Сайт — статический HTML-first архив. Он не является CMS. Видимое содержание хранится в HTML-страницах, а `data/pages.json` хранит каталог публикаций и метаданные для сборщика.

## 1. Самая короткая логика

```text
HTML публикации
+ изображение
+ запись в data/pages.json
        ↓
npm run check
        ↓
сборщик обновляет производные файлы
        ↓
git commit
        ↓
git push
        ↓
Cloudflare Pages публикует сайт
```

## 2. Ветки проекта

В текущем рабочем порядке используются две основные ветки.

### `main`

`main` — главная ветка живого сайта.

В ней обычно делаются:

- публикация новых статей;
- публикация оценок фронта;
- публикация памяток;
- публикация досье;
- обновление карты;
- обычный production-деплой.

Если нужно понять, какое состояние сайта актуальное, смотреть нужно на `main`.

### `noviy-sait`

`noviy-sait` — вторичная ветка для экспериментов, проверки новых решений и предварительного просмотра.

В ней можно пробовать:

- новые элементы интерфейса;
- изменения архива;
- новые блоки на главной;
- изменения карты как интерфейса;
- новые шаблоны;
- крупные технические идеи.

Перед работой в `noviy-sait` нужно подтянуть туда свежий `main`, иначе ветка может содержать старую карту, старые публикации, старый `data/pages.json`, старый архив и старый sitemap.

## 3. Что публикует Cloudflare

Cloudflare Pages публикует то состояние файлов, которое находится в выбранной ветке и коммите.

Важно: Cloudflare не “добавляет только статью”. Он берёт весь набор файлов из коммита.

Если задеплоить устаревшую ветку, можно вернуть старые версии:

- карты;
- `data/pages.json`;
- архива;
- поиска;
- sitemap;
- главной;
- производных JSON.

Поэтому перед экспериментом и перед слиянием `noviy-sait` с `main` ветку `noviy-sait` нужно синхронизировать с `main`.

## 4. Начало любой работы в `main`

```bash
git checkout main
git pull origin main
git status
```

Нормальное состояние:

```text
nothing to commit, working tree clean
```

Если есть непонятные изменения, не начинать новую работу. Сначала посмотреть:

```bash
git diff --name-only
git diff -- data/pages.json
git diff -- data/zones.geojson
```

## 5. Обновить `noviy-sait` из `main`

Использовать перед экспериментами, после публикации статьи в `main`, после обновления карты и перед переносом изменений обратно в `main`.

```bash
git checkout main
git pull origin main
git status

git checkout noviy-sait
git merge main
npm run check
git status
```

Если после `npm run check` появились изменения, например:

```text
modified: data/zones.geojson
modified: map/index.html
untracked: data/zones.geojson....geojson
```

их нужно закоммитить:

```bash
git add -A
git commit -m "chore: синхронизировать noviy-sait с main"
git push origin noviy-sait
```

Если после проверки чисто:

```text
nothing to commit, working tree clean
```

достаточно:

```bash
git push origin noviy-sait
```

## 6. Если в `noviy-sait` уже есть незакоммиченные изменения

Сначала перейти в ветку и посмотреть состояние:

```bash
git checkout noviy-sait
git status
```

Если изменения нужны, сохранить их временным коммитом:

```bash
git add -A
git commit -m "wip: сохранить экспериментальные изменения"
```

Потом подтянуть `main`:

```bash
git checkout main
git pull origin main

git checkout noviy-sait
git merge main
npm run check
```

Если изменения не нужны, можно откатить:

```bash
git restore .
git clean -fd
```

Осторожно: `git clean -fd` удаляет новые неотслеживаемые файлы.

## 7. Перенос понравившегося эксперимента из `noviy-sait` в `main`

Перед переносом обязательно обновить `noviy-sait` из свежего `main`:

```bash
git checkout main
git pull origin main

git checkout noviy-sait
git merge main
npm run check
git status
```

Если всё хорошо:

```bash
git add -A
git commit -m "chore: подготовить noviy-sait к переносу"
git push origin noviy-sait
```

Если коммитить нечего, перейти к слиянию:

```bash
git checkout main
git merge noviy-sait
npm run check
git status
```

Если после проверки появились производные изменения:

```bash
git add -A
git commit -m "chore: пересобрать сайт после переноса изменений"
```

Затем:

```bash
git push origin main
```

Важно: merge переносит всё, что есть в `noviy-sait`. Если в этой ветке накопилось несколько экспериментов, в `main` уйдут все они. Перед merge нужно понимать, что именно находится в ветке:

```bash
git diff --name-only main..noviy-sait
```

## 8. Обычная публикация статьи в `main`

### 8.1. Подготовить ветку

```bash
git checkout main
git pull origin main
git status
```

### 8.2. Создать HTML

Для статьи по Кременной пример:

```bash
mkdir -p news/kremennaya/kremennaya-obstanovka-2026-06-24
cp news/kremennaya/krm-2026-06-06/index.html news/kremennaya/kremennaya-obstanovka-2026-06-24/index.html
```

После копирования открыть новый HTML и заменить:

- `<title>`;
- description;
- canonical;
- Open Graph/Twitter;
- H1;
- дату;
- текст;
- изображение;
- блок “Источники и ограничения”;
- связанные материалы.

Не менять тексты и URL других публикаций без отдельной причины.

### 8.3. Добавить изображение

```bash
mkdir -p assets/img/news/kremennaya/kremennaya-obstanovka-2026-06-24
```

Положить файл:

```text
assets/img/news/kremennaya/kremennaya-obstanovka-2026-06-24/cover.webp
```

Производные версии `cover-480.webp` и `cover-960.webp` создаёт `npm run check` через `tools/images.mjs`.

### 8.4. Добавить запись в `data/pages.json`

Пример статьи:

```json
{
  "id": "kremennaya-obstanovka-2026-06-24",
  "type": "article",
  "title": "Кременная к концу июня 2026 года: связь, бензин, дроны и жизнь под постоянной угрозой",
  "url": "/news/kremennaya/kremennaya-obstanovka-2026-06-24/",
  "section": "kremennaya",
  "datePublished": "2026-06-24",
  "dateModified": "2026-06-24",
  "status": "confirmed",
  "excerpt": "Короткое описание для карточек, архива и поиска.",
  "image": "/assets/img/news/kremennaya/kremennaya-obstanovka-2026-06-24/cover.webp",
  "imageAlt": "Кременная к концу июня 2026 года",
  "topics": ["daily", "safety", "communications", "fuel", "roads"],
  "locations": ["Кременная", "ЛНР"],
  "sourceIds": []
}
```

`sourceIds` не нужно придумывать вручную. Если в HTML есть внешние ссылки, `npm run check` найдёт их и сам обновит `sourceIds`.

### 8.5. Запустить проверку

```bash
npm run check
```

Нормальный результат:

```text
Сборка завершена: 48 публикаций.
Проверка пройдена: 48 публикаций, 66 HTML-страниц, ошибок нет.
Smoke-тесты пройдены.
```

После новой публикации число публикаций должно увеличиться.

### 8.6. Проверить изменения

```bash
git status
git diff --name-only
git diff -- data/pages.json
```

Ожидаемые изменения после новой статьи:

- новый HTML;
- новая обложка;
- `data/pages.json`;
- `data/sources.json`, если были внешние ссылки;
- `data/source-preservation-queue.json`, если появились важные источники;
- `data/search-index.json`;
- `data/news.json`;
- `data/site.json`;
- `archive/index.html`;
- `news/index.html`;
- нужный индекс раздела;
- `sitemap.xml`;
- `feed.xml`;
- производные изображения в `assets/img/derived/...`.

### 8.7. Коммит и push

```bash
git add -A
git commit -m "feat: добавить материал о Кременной к концу июня"
git push origin main
```

После push проверить деплой Cloudflare и открыть:

- главную;
- новую публикацию;
- нужный раздел;
- `/archive/`;
- `/search/`;
- изображение;
- мобильный вид.

## 9. Новая оценка фронта

Оценки лежат здесь:

```text
assessment/YYYY-MM-DD/index.html
```

Обложка:

```text
assets/img/assessment/YYYY-MM-DD/cover.webp
```

Пример:

```bash
git checkout main
git pull origin main

mkdir -p assessment/2026-06-28
cp assessment/2026-06-21/index.html assessment/2026-06-28/index.html
mkdir -p assets/img/assessment/2026-06-28
```

В `data/pages.json`:

```json
{
  "id": "assessment-2026-06-28",
  "type": "assessment",
  "title": "Оценка боевых действий СВО: Восточный ТВД, 22–28 июня 2026 года",
  "url": "/assessment/2026-06-28/",
  "section": "assessment",
  "datePublished": "2026-06-28",
  "dateModified": "2026-06-28",
  "period": "22–28 июня 2026 года",
  "status": "confirmed",
  "excerpt": "Краткое описание главных изменений недели.",
  "image": "/assets/img/assessment/2026-06-28/cover.webp",
  "imageAlt": "Оценка фронта за 22–28 июня 2026 года",
  "topics": ["front", "map"],
  "locations": ["Восточный фронт", "ЛНР", "Донбасс"],
  "sourceIds": []
}
```

Затем:

```bash
npm run check
git status
git add -A
git commit -m "feat: добавить оценку фронта за 22–28 июня 2026"
git push origin main
```

## 10. Новая памятка

Памятки обычно лежат в:

```text
news/reference/.../index.html
```

Для памятки в `data/pages.json` обязательны поля актуальности:

```json
"type": "guide",
"reviewedAt": "2026-06-24",
"reviewAfter": "2026-09-24",
"reviewStatus": "current"
```

Для памятки источники особенно важны: постановления, официальные страницы, PDF и нормативные документы.

## 11. Новое досье

Досье лежат в:

```text
war-crimes/.../index.html
```

Для досье особенно важны:

- дата;
- место;
- объект;
- что установлено;
- что требует проверки;
- источники;
- ограничения;
- журнал обновлений;
- сохранённые копии ключевых источников.

В `data/pages.json`:

```json
"type": "dossier",
"section": "warcrimes"
```

## 12. Обновление карты

Главный файл текущей карты:

```text
data/zones.geojson
```

Не `zones.json`.

При обновлении карты менять нужно именно `data/zones.geojson`.

Если меняется геометрия или смысл карты, обязательно меняются два файла:

```text
data/zones.geojson
data/map-changes.json
```

В `data/zones.geojson` обнови поле `updated`.

В `data/map-changes.json` добавь новую верхнюю запись в `changes[0]`:

```json
{
  "id": "map-YYYY-MM-DD-HHMM",
  "zonesUpdated": "то же значение, что updated в data/zones.geojson",
  "title": "Короткий заголовок изменения",
  "summary": "1–2 предложения: что именно изменилось на карте",
  "details": ["краткий пункт", "краткий пункт"],
  "relatedUrl": "/assessment/YYYY-MM-DD/",
  "relatedTitle": "Название связанной оценки фронта",
  "status": "current"
}
```

После этого выполнить:

```bash
npm run check
```

Сборщик запустит ``.

Он:

1. читает `data/zones.geojson`;
2. проверяет поле `updated`;
3. считает SHA-256 текущей карты;
4. сравнивает карту с `data/zones.geojson`;
5. если такого снимка ещё нет, создаёт файл в `data/zones.geojson...geojson`;
6. обновляет `data/zones.geojson`;
7. проверяет согласованность `data/map-changes.json` с `data/zones.geojson`;
8. сборщик обновляет `map/index.html`.

### Зачем нужны карта

Снимки карты нужны не для красоты. Они фиксируют, как карта выглядела на конкретную дату.

Это нужно, чтобы:

- видеть историю изменений карты;
- не потерять старое состояние зоны;
- понимать, какая оценка была опубликована в прошлом;
- связать карту с оценкой фронта за период;
- иметь доказательную и редакционную преемственность;
- не перезаписывать историю задним числом.

Текущая карта — это:

```text
data/zones.geojson
```

Архивные снимки — это:

```text
data/zones.geojson2026-...geojson
```

Манифест снимков — это:

```text
data/zones.geojson
```

Страница архива карты — это:

```text
map/index.html
```

### Почему после `npm run check` появляется новый снимок карты

Новый снимок создаётся, если SHA-256 текущего `data/zones.geojson` ещё не записан в manifest.

Если карта реально обновлялась — это нормально. Нужно коммитить:

```text
data/zones.geojson
data/zones.geojson
data/zones.geojson....geojson
map/index.html
```

Если карта не должна была меняться, но появился новый снимок, нужно проверить:

```bash
git diff -- data/zones.geojson
git diff -- data/zones.geojson
```

### Важное правило карты

Если ты меняешь геометрию или смысл карты, обнови поле `updated` в `data/zones.geojson` и добавь верхнюю запись в `data/map-changes.json`.

Если попытаться создать снимок с тем же `updated`, но другой контрольной суммой, скрипт может остановиться, потому что архивные снимки нельзя перезаписывать задним числом.

## 13. Источники при публикации

`npm run check` запускает `tools/sources.mjs`.

Он:

1. читает `data/pages.json`;
2. открывает HTML публикаций;
3. ищет внешние ссылки внутри `<main>`;
4. добавляет их в `data/sources.json`;
5. обновляет `sourceIds` в `data/pages.json`;
6. создаёт очередь `data/source-preservation-queue.json` для важных несохранённых источников.

Внешнюю ссылку лучше ставить в HTML статьи в блоке “Источники и ограничения”. После `npm run check` она сама попадёт в реестр.

Локальные копии не скачиваются автоматически. Их нужно сохранять отдельно:

```bash
npm run source:capture -- src-xxxxxxxxxxxx /путь/к/файлу.pdf
npm run check
```

Подробнее — в `SOURCES.md`.

## 14. `release`, `fixity` и SHA-256

`npm run check` — обычная команда для каждой публикации.

`npm run release` — не обычная команда для каждой статьи. Она нужна редко: после крупного обновления, перед важным релизом, перед merge или для резервного архива.

`npm run release` делает:

- полный `npm run check`;
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

Не удаляй релизный ZIP, если он специально создавался как резервная копия.

## 15. Что делать, если `npm run check` прошёл, но остались изменения

После `npm run check` всегда выполнять:

```bash
git status
```

Если есть изменённые или новые файлы, они не попадут в GitHub сами. Их нужно коммитить:

```bash
git add -A
git commit -m "chore: пересобрать производные файлы"
git push origin main
```

Если это `noviy-sait`:

```bash
git push origin noviy-sait
```

GitHub получает только коммиты. Простого `git push` недостаточно, если файлы не были добавлены и закоммичены.

## 16. Частые ошибки

### Публикация есть по прямому URL, но её нет в архиве

Проверить:

```bash
grep -n "id-materiala" data/pages.json
grep -n "/url/materiala/" archive/index.html
npm run check
```

Обычно причина: нет записи в `data/pages.json` или сборка не закоммичена.

### Публикация не ищется

Проверить:

```bash
grep -n "id-materiala" data/search-index.json
npm run check
```

### Нет картинки

Проверить путь из `data/pages.json`:

```bash
ls assets/img/...
```

### Ошибка ImageMagick

Установить:

```bash
sudo apt-get update
sudo apt-get install -y imagemagick
```

Если есть `convert`, но нет `magick`:

```bash
sudo ln -s /usr/bin/convert /usr/local/bin/magick
hash -r
magick -version
npm run images
npm run check
```

### Появился новый снимок карты, хотя ты не ожидал

Проверить:

```bash
git diff -- data/zones.geojson
git diff -- data/zones.geojson
```

Если карта изменилась намеренно — коммитить. Если нет — разобраться до коммита.

### `npm run fixity` показывает FAILED

Это значит, что текущие файлы отличаются от состояния, записанного в `SHA256SUMS`.

Для обычной публикации это не обязательно проблема. Для релизной копии нужно выполнить `npm run release` и проверить `npm run fixity`.

## 17. Что нельзя делать

Не делать:

- не редактировать производные файлы вручную без причины;
- не пушить после `npm run check`, если остались незакоммиченные изменения;
- не обновлять `noviy-sait` “от себя”, если `main` ушёл вперёд;
- не сливать `noviy-sait` в `main`, если не понятно, какие файлы там изменены;
- не добавлять HTML без записи в `data/pages.json`;
- не добавлять запись в `data/pages.json` без HTML;
- не менять URL опубликованных страниц без крайней необходимости;
- не запускать `npm run release` после каждой статьи;
- не удалять карта, если они отражают намеренное изменение карты;
- не удалять `assets/img/derived`, если они созданы сборщиком и используются сайтом.

## 18. Контрольный чек-лист перед push в `main`

```bash
npm run check
git status
git diff --name-only
```

Проверить:

- нет ли неожиданных изменений `data/zones.geojson`;
- новая публикация есть в `data/pages.json`;
- новая публикация есть в `archive/index.html`;
- новая публикация есть в `data/search-index.json`;
- новая публикация есть в `sitemap.xml`;
- обложка лежит по правильному пути;
- производные изображения созданы;
- нет ошибок проверки;
- предупреждение об источниках понятно и не блокирует публикацию.

Потом:

```bash
git add -A
git commit -m "feat: ..."
git push origin main
```
