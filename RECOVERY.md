# Восстановление проекта

## Проверка вручную созданного исходного снимка (необязательный)

```bash
sha256sum -c krmrf-source.zip.sha256
unzip -t krmrf-source.zip
unzip krmrf-source.zip
cd krmrf-main
sha256sum -c SHA256SUMS
```

На Windows используйте `Get-FileHash -Algorithm SHA256` для внешнего ZIP и проверку `SHA256SUMS` из Git Bash или WSL.

## Основной способ восстановления: исходники из Git и рабочая среда

```bash
nvm install 24
nvm use
npm ci
sudo apt-get update && sudo apt-get install -y imagemagick librsvg2-bin
npx playwright install --with-deps chromium
npm run qa
```

Если все проверки проходят, исходное состояние пригодно для продолжения работы. После восстановления репозитория merge в `main` запускает штатный Pages workflow.

## Проверка вручную созданного публичного снимка (необязательный)

```bash
sha256sum -c krmrf-public.zip.sha256
unzip -t krmrf-public.zip
unzip krmrf-public.zip
cd krmrf-public
sha256sum -c SHA256SUMS
```

Публичный архив — точная контрольная копия `dist`. Он не содержит исходных инструментов. Для штатной публикации GitHub Pages восстанавливайте исходный проект и используйте `.github/workflows/pages.yml`, а не смешивайте файлы публичного ZIP с корнем репозитория.

## Однократные внешние настройки

Настройки GitHub не хранятся внутри ZIP. После переноса в новый репозиторий заново укажите:

1. **Settings → Pages → Source: GitHub Actions**;
2. custom domain `krmrf.ru`;
3. **Enforce HTTPS** после выпуска сертификата;
4. разрешение GitHub Actions, если оно отключено политикой репозитория.

## Что не существует в текущей архитектуре

Для обычного восстановления сперва используйте Git / GitHub: `git clone`, `nvm use`, `npm ci`, `npm run qa`. ZIP нужны только когда их сознательно создали вручную.

В проекте нет Atom/RSS, `_headers`, публичного `_redirects`, `data/map/manifest.json`, `data/map/snapshots/`, `tools/sources.mjs` и команды `npm run sources`. Восстановление выполняется из исходного ZIP и встроенных SHA-256, а не из отдельной системы снимков.
