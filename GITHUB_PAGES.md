# GitHub Pages для PicNest Mobile Inbox

Эта папка - статический PWA-клиент. В ней нет backend PicNest, базы, локальных картинок, `.env` и Dropbox token.

## Рекомендуемый вариант

Создать отдельный публичный GitHub repository только для мобильного клиента, например `picnest-mobile-inbox`.

В корень этого repository положить содержимое папки `mobile-client`:

```text
index.html
styles.css
manifest.webmanifest
sw.js
.nojekyll
src/app.js
```

После push включить GitHub Pages:

1. Открыть repository на GitHub.
2. `Settings` -> `Pages`.
3. `Build and deployment` -> `Deploy from a branch`.
4. Branch: `main`.
5. Folder: `/root`.
6. Нажать `Save`.

Через минуту GitHub покажет HTTPS-ссылку вида:

```text
https://<github-login>.github.io/picnest-mobile-inbox/
```

## Установка на телефон

iOS:

1. Открыть ссылку в Safari.
2. Нажать `Share`.
3. Выбрать `Add to Home Screen`.

Android:

1. Открыть ссылку в Chrome.
2. Выбрать `Install app` или `Add to Home screen`.

## Настройки внутри приложения

В приложении на телефоне указать:

- Dropbox access token;
- Inbox path для теста: `/ЗП_test/PicNestInbox`;
- Inbox path для прода: `/ЗП/PicNestInbox`.

Token хранится локально в браузере телефона. В GitHub repository его добавлять нельзя.

## Как обновлять

После изменения файлов в `mobile-client` повторно скопировать их в repository GitHub Pages и сделать push.

Если на телефоне открывается старая версия:

1. Закрыть приложение.
2. Открыть ссылку в Safari/Chrome.
3. Обновить страницу.
4. Если не помогло, удалить PWA с главного экрана и добавить заново.

Версия кеша задается в `sw.js` через `CACHE_NAME`.
