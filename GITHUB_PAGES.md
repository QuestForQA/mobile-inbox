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

- Dropbox App key;
- Inbox path для теста: `/ЗП_test/PicNestInbox`;
- Inbox path для прода: `/ЗП/PicNestInbox`.

После этого нажать `Войти в Dropbox` и разрешить доступ.

## Dropbox App для OAuth

В Dropbox нужно один раз создать app:

1. Открыть https://www.dropbox.com/developers/apps.
2. Нажать `Create app`.
3. API: `Scoped access`.
4. Access type: `Full Dropbox`.
5. Название, например `PicNest Mobile Inbox`.
6. Нажать `Create app`.
7. Во вкладке `Permissions` включить:
   - `files.content.write`;
   - `files.content.read`;
   - `files.metadata.read`.
8. Сохранить permissions.
9. Во вкладке `Settings` скопировать `App key`.
10. В блоке OAuth добавить `Redirect URI`.

Redirect URI должен совпадать с адресом PWA без query-параметров. В PWA этот адрес показан в поле `Redirect URI`.

Пример для repository `picnest-mobile-inbox`:

```text
https://<github-login>.github.io/picnest-mobile-inbox/
```

Пример для repository `mobile-inbox`:

```text
https://<github-login>.github.io/mobile-inbox/
```

`/index.html` в Dropbox Redirect URI добавлять не нужно: PWA использует канонический адрес папки с завершающим `/`.

В GitHub repository нельзя добавлять access token, refresh token или app secret. App key добавлять можно: это публичный идентификатор приложения.

## Как обновлять

После изменения файлов в `mobile-client` повторно скопировать их в repository GitHub Pages и сделать push.

Если на телефоне открывается старая версия:

1. Закрыть приложение.
2. Открыть ссылку в Safari/Chrome.
3. Обновить страницу.
4. Если не помогло, удалить PWA с главного экрана и добавить заново.

Версия кеша задается в `sw.js` через `CACHE_NAME`.
