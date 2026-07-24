# Публикация через Codespaces

## 1. Создайте рабочую ветку

```bash
git switch -c technical/2026-07-24-r10
nvm use
npm ci
```

## 2. Проверьте проект

```bash
npm run qa
```

Команда должна завершиться без ошибок. После неё готовая публичная версия находится в `dist/`.

Для ручной проверки:

```bash
npm run serve:dist
```

Откройте главную, поиск, архив, карту и несколько публикаций на мобильной ширине.

## 3. Создайте релиз

```bash
npm run release
```

В соседнем каталоге `krmrf-releases/` появятся:

- `krmrf-source-<version>.zip` — исходный репозиторий для Codespaces;
- `krmrf-public-<version>.zip` — только файлы для хостинга;
- `.sha256` для каждого ZIP;
- JSON-манифест релиза.

Внутри обоих ZIP есть собственный `SHA256SUMS`.

## 4. Зафиксируйте изменения

```bash
git status
git diff --check
git add .
git commit -m "Technical release 2026.7.24-r10"
git push -u origin technical/2026-07-24-r10
```

Не добавляйте в Git `dist/`, `SHA256SUMS` и локальные ZIP — они исключены через `.gitignore`.

## Изменение текста публикации

Техническая сборка защищает тексты контрольными суммами. После осознанной редакционной правки выполните:

```bash
npm run content:lock
npm run qa
```

Без этого случайное изменение текста остановит выпуск.

## Обновление карты

Изменяются только:

1. `data/zones.geojson`;
2. `data/map-changes.json` — первая запись должна иметь тот же `zonesUpdated`;
3. затем `npm run qa` или `npm run release`.

Статичная дата, текстовый fallback карты и sitemap генерируются автоматически.
