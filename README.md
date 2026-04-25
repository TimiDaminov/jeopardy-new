# Грузия: Своя игра

Игра переведена на `Next.js` с `App Router`.

## Как запустить

1. Установите зависимости:

```bash
npm install
```

2. Запустите проект:

```bash
npm run dev
```

3. Откройте `http://localhost:3000`.

## Как собрать production-версию

```bash
npm run build
npm run start
```

## Как вести игру

- При открытии вопрос автоматически помечается как сыгранный.
- На экране вопроса нажмите `Показать ответ`.
- После ответа используйте `Следующий слайд`, чтобы пролистывать поясняющие слайды.
- Кнопка `К таблице` возвращает на игровую доску.
- Если вопрос открыли случайно, нажмите `Снять отметку`.

## Горячие клавиши

- `Enter` или `Пробел` — показать ответ или перейти на следующий слайд
- `←` или `Backspace` — назад
- `B` — вернуться к таблице
- `F` — полноэкранный режим
- `?` — подсказка по управлению

## Основные файлы

- [app/page.js](</c:/Users/User/Desktop/all/Orville Projects/jeopardy/app/page.js>) — главная страница
- [components/JeopardyGame.jsx](</c:/Users/User/Desktop/all/Orville Projects/jeopardy/components/JeopardyGame.jsx>) — клиентская логика игры
- [lib/game-data.js](</c:/Users/User/Desktop/all/Orville Projects/jeopardy/lib/game-data.js>) — категории, цены и последовательности слайдов
- [app/globals.css](</c:/Users/User/Desktop/all/Orville Projects/jeopardy/app/globals.css>) — оформление
- `public/assets/slides/` — экспортированные слайды PowerPoint
