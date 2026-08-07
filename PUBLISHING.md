# Публикация KRM РФ на GitHub Pages

## Однократная настройка репозитория

В GitHub откройте **Settings → Pages** и проверьте:

1. **Source** — `GitHub Actions`;
2. **Custom domain** — `krmrf.ru`;
3. **Enforce HTTPS** — включён после выпуска сертификата.

Файл `CNAME` входит в публичную сборку, но сам по себе не заменяет настройку домена в GitHub.

## 1. Работайте в `noviy-sait`

```bash
git switch noviy-sait
git pull --ff-only origin noviy-sait
nvm use
npm ci
sudo apt-get update && sudo apt-get install -y imagemagick unzip
npx playwright install --with-deps chromium
```

Проект зафиксирован на Node.js 24 LTS.

## 2. Проверьте проект до commit/push

```bash
npm run qa
```

Команда должна завершиться без ошибок. После неё готовая публичная версия находится в `dist/`.

Для ручной проверки:

```bash
PORT=8080 npm run serve:dist
```

Локальный сервер намеренно ведёт себя как статический GitHub Pages: он не исполняет `_redirects` как серверные редиректы и публикует именно содержимое `dist/`.

Если менялась карта, дополнительно проверьте:

- чистый `/map/` без координат;
- hard reload;
- desktop и mobile;
- fullscreen;
- поиск населённого пункта;
- прямой `/map/?lat=...&lng=...&z=...`;
- сохранение UTM/прочих посторонних query-параметров;
- отсутствие неожиданного второго перемещения после загрузки;
- историю/сравнение, если доступны прошлые редакционные срезы.

## 3. Просмотрите diff и отправьте `noviy-sait`

```bash
git diff --check
git status
git diff
```

Добавьте только ожидаемые файлы:

```bash
git add <нужные-файлы>
git diff --cached
git status
git commit -m "Краткое описание изменения"
git push origin noviy-sait
```

После push дождитесь зелёного workflow **Quality**. Он выполняет QA с полной Git-историей (`fetch-depth: 0`), необходимой для корректной истории карты, и сохраняет `dist/` как artifact.

## 4. Merge `noviy-sait` → `main`

После зелёного **Quality** и ручной проверки создайте pull request `noviy-sait` → `main` и ещё раз просмотрите итоговый diff.

После merge `.github/workflows/pages.yml`:

1. получает полную Git-историю;
2. устанавливает Node.js 24 и зависимости;
3. выполняет `npm run qa`;
4. создаёт `dist/`;
5. загружает только `dist` как GitHub Pages artifact;
6. публикует его через официальный `deploy-pages`.

Не публикуйте корень репозитория и не сохраняйте `dist/` в Git.

## 5. Проверьте живой сайт

После зелёного Pages workflow проверьте минимум:

1. `/`;
2. `/map/`;
3. `/search/?q=Кременная`;
4. `/archive/`;
5. один актуальный материал;
6. один старый URL из `_redirects`, например `/news/bobp-2026-03-04/`;
7. `/map/archive/`.

`/_redirects`, `/_headers` и удалённый `/feed.xml` не являются публичными функциями сайта и должны оставаться недоступными в `dist/`.

На GitHub Pages старый URL со слешем обслуживается статической HTML-страницей переноса с `noindex`, canonical и мгновенным `meta refresh`; JavaScript сохраняет query/hash. Это ограничение статического хостинга, а не настоящий серверный `301` сразу на целевую публикацию.

## 6. Контрольные release-архивы

```bash
npm run release
```

`.github/workflows/release.yml` также использует полную Git-историю. В каталоге release появляются:

- `krmrf-source-<version>.zip` — исходный проект;
- `krmrf-public-<version>.zip` — содержимое публичной версии;
- `.sha256` для каждого ZIP;
- JSON-манифест релиза.

Внутри обоих ZIP есть `SHA256SUMS`. Публичный ZIP нужен для проверки и аварийного восстановления; штатная публикация GitHub Pages всё равно идёт из `dist` через workflow.

Исходный release-архив не содержит `.git`, поэтому `tools/map-history.mjs` сохраняет ранее сгенерированные редакционные срезы только если кэш валиден и относится к тому же текущему `zones.updated`.

## Изменение текста публикации

После осознанной редакционной правки:

```bash
npm run content:lock
npm run qa
```

Без обновления контрольной суммы случайное изменение видимого текста/ссылок/смыслового `alt` остановит выпуск.

## Обновление карты

При новом редакционном срезе изменяются:

1. `data/zones.geojson`;
2. `data/map-changes.json` — актуальная запись должна иметь тот же `zonesUpdated`;
3. затем выполняется `npm run qa`.

`data/map-history/` вручную не редактируется: при наличии Git он восстанавливается из истории репозитория.

## Sitemap

`lastmod` обновляется только по содержательной причине:

- публикации — через `dateModified` в `data/pages.json`;
- карта — через `data/zones.geojson.updated`;
- `/about/`, `/methodology/`, `/privacy/` — через `<meta name="date-modified">` соответствующей страницы;
- хабы — из дат актуального контента.

После изменения выполняйте `npm run qa`, а затем проверяйте diff `sitemap.xml`.
