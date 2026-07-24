# Восстановление проекта

## Проверка скачанного архива

```bash
sha256sum -c krmrf-source-<version>.zip.sha256
unzip -t krmrf-source-<version>.zip
unzip krmrf-source-<version>.zip
cd krmrf-main
sha256sum -c SHA256SUMS
```

На Windows используйте `Get-FileHash -Algorithm SHA256` для внешнего ZIP и проверку `SHA256SUMS` из Git Bash или WSL.

## Восстановление рабочей среды

```bash
nvm use
npm ci
npm run qa
```

Если все проверки проходят, исходное состояние пригодно для продолжения работы.

## Восстановление только сайта

Публичный архив не содержит исходных инструментов:

```bash
sha256sum -c krmrf-public-<version>.zip.sha256
unzip -t krmrf-public-<version>.zip
unzip krmrf-public-<version>.zip
cd krmrf-public
sha256sum -c SHA256SUMS
```

Содержимое папки `krmrf-public/`, кроме `SHA256SUMS`, можно загружать на статический хостинг.

## Что не существует в текущей архитектуре

В проекте нет `data/map/manifest.json`, `data/map/snapshots/`, `tools/sources.mjs` и команды `npm run sources`. Восстановление выполняется из исходного ZIP и встроенных SHA-256, а не из отдельной системы снимков.
