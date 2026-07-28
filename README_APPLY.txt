Готовая статья для репозитория KRM РФ.

1. Распакуйте содержимое архива в корень репозитория /workspaces/krmrf с заменой файлов.
2. Убедитесь, что активна ветка noviy-sait:
   git switch noviy-sait
3. Запустите:
   npm run qa
4. Проверьте страницу:
   /news/kremennaya/krm-2026-07-28/
5. Затем:
   git status
   git add -A
   git commit -m "Add Kremennaya update for 11-27 July 2026"
   git push origin noviy-sait

Статья сделана на шаблоне krm-2026-07-10, добавлена в data/pages.json,
изображение и производные версии включены. Полная QA-проверка пройдена.
