# Публикация KRM РФ на GitHub Pages

## Однократная настройка репозитория

В GitHub откройте **Settings → Pages** и проверьте:

1. **Source** — `GitHub Actions`;
2. **Custom domain** — `krmrf.ru`;
3. **Enforce HTTPS** — включён после выпуска сертификата.

Файл `CNAME` входит в публичную сборку, но сам по себе не заменяет настройку домена в GitHub.

## 1. Создайте рабочую ветку

```bash
git switch -c technical/2026-07-29-r12
nvm use
npm ci
sudo apt-get update && sudo apt-get install -y imagemagick unzip
npx playwright install --with-deps chromium
```

Проект зафиксирован на Node.js 24 LTS.

## 2. Проверьте проект

```bash
npm run qa
```

Команда должна завершиться без ошибок. После неё готовая публичная версия находится в `dist/`.

Для ручной проверки:

```bash
npm run serve:dist
```

Локальный сервер намеренно ведёт себя как статический GitHub Pages: он не читает `_redirects`, не применяет `_headers` и делает только обычный переход каталога без завершающего слеша на вариант со слешем.

## 3. Опубликуйте через `main`

Сделайте commit, push и pull request в `main`:

```bash
git status
git diff --check
git add -A
git commit -m "Technical release 2026.7.29-r12"
git push -u origin technical/2026-07-29-r12
```

После merge запускается `.github/workflows/pages.yml`. Он повторно выполняет всю QA-цепочку, создаёт `dist/`, загружает только `dist` как Pages artifact и публикует его через официальный `deploy-pages`.

Не выбирайте публикацию из корня ветки и не сохраняйте `dist/` в Git.

## 4. Проверьте живой сайт

После зелёного workflow проверьте:

1. `/`;
2. `/map/`;
3. `/search/?q=Кременная`;
4. `/archive/`;
5. `/news/bobp-2026-03-04/`;
6. `/map/archive/`;
7. `/feed.xml`;
8. одинаковую версию в футерах главной, карты и публикации.

На GitHub Pages старый адрес со слешем возвращает статический HTML с кодом `200`, `noindex`, canonical и мгновенным `meta refresh`; JavaScript сохраняет query и hash. Адрес каталога без слеша сначала получает штатный GitHub Pages `301` на тот же адрес со слешем. Это не серверный `301` сразу на новый материал.

`/_redirects`, `/_headers` и `/feed.xml` должны возвращать `404`.

## 5. Создайте контрольные архивы

```bash
npm run release
```

В соседнем каталоге `krmrf-releases/` появятся:

- `krmrf-source-<version>.zip` — исходный проект;
- `krmrf-public-<version>.zip` — точное содержимое публичной версии;
- `.sha256` для каждого ZIP;
- JSON-манифест релиза.

Внутри обоих ZIP есть собственный `SHA256SUMS`. Публичный ZIP нужен для проверки и аварийного восстановления; штатная публикация GitHub Pages идёт из `dist` через workflow.

## Изменение текста публикации

После осознанной редакционной правки:

```bash
npm run content:lock
npm run qa
```

Без обновления контрольной суммы случайное изменение текста остановит выпуск.

## Обновление карты

Изменяются только:

1. `data/zones.geojson`;
2. `data/map-changes.json` — первая запись должна иметь тот же `zonesUpdated`;
3. затем `npm run qa` или `npm run release`.

Статичная дата, текстовый fallback карты и sitemap генерируются автоматически. История состояний карты не создаётся; прежний `/map/archive/` ведёт на актуальную `/map/`.
