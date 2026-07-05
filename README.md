# PicNest Mobile Inbox

Статический MVP мобильного клиента для подготовки JSON-команд PicNest Inbox Protocol.

Инструкция публикации на GitHub Pages: [GITHUB_PAGES.md](./GITHUB_PAGES.md).

## Запуск

Открыть `mobile-client/index.html` в браузере или раздать папку любым статическим сервером.

Для локальной проверки из корня репозитория:

```bash
python3 -m http.server 5179 --directory mobile-client
```

Потом открыть:

```text
http://127.0.0.1:5179
```

## Что умеет MVP

- `create_product`;
- `add_images`;
- `move_status`;
- `update_fields`;
- генерация `command_id`;
- генерация JSON-команды;
- отправка JSON и приложенных картинок в Dropbox;
- скачивание JSON;
- список ожидаемых путей для `PicNestInbox/commands` и `PicNestInbox/images`.
- картинки можно передать двумя способами:
  - приложить файл;
  - указать прямой URL картинки.

Для `create_product` пользователь вводит одну строку `import_input_line`, как в desktop-web загрузке. Клиент сам вытаскивает первый URL, определяет `source`, заполняет `title`/`user_params` по хвосту строки и строит имя картинки по схеме:

```text
Source Title user_params.jpg
```

Разобранные `title` и `user_params` можно поправить перед скачиванием JSON.

Если указан URL картинки, мобильный клиент сначала просит Dropbox сохранить эту картинку в `PicNestInbox/images/...`. В JSON-команде после отправки будет уже `image.path`, поэтому desktop PicNest не зависит от того, останется ли картинка доступной на сайте магазина.

Для команд к существующему товару (`add_images`, `move_status`, `update_fields`) можно указать:

- `product_id`, если он известен;
- или `main_image_filename`, если известен только файл основной картинки в Dropbox/PicNest.

Если расширение не указано, мобильный клиент добавляет `.jpg`.

## Dropbox

MVP умеет отправлять данные напрямую в Dropbox:

- JSON команда -> `PicNestInbox/commands/{command_id}.json`;
- приложенные файлы картинок -> `PicNestInbox/images/...`;
- URL картинки -> Dropbox `save_url` -> `PicNestInbox/images/...`, после этого JSON команда ссылается на сохраненный файл.

В настройках клиента нужно указать:

- Dropbox access token;
- Inbox path, например `/ЗП_test/PicNestInbox`.

Для прода можно заменить путь на `/ЗП/PicNestInbox`.

## iOS Без ПК

Чтобы клиент работал на телефоне без локальной сети и без включенного ПК, страница должна быть доступна самому телефону:

- временный HTTPS static hosting;
- или заранее установленная PWA с этого HTTPS-адреса.

Локальный адрес вида `http://127.0.0.1:5179` или `http://192.168...:5179` работает только пока рядом включен компьютер, который раздает файлы.

Для PWA на iOS Mac не нужен. Нужен HTTPS-адрес, открытый в Safari, затем `Share` -> `Add to Home Screen`. Нативное iOS-приложение без Mac тоже возможно только через сторонние облачные сборки/подпись, но для этого MVP проще начать с PWA.
