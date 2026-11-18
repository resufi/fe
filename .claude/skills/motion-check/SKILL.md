---
name: motion-check
description: Visually verify scroll-driven animation on the landing (sakura intro and redesigned sections) in a real browser — screenshots at scroll positions, console errors, frame performance, reduced-motion and mobile. Use after any change to animation code, before reporting it done.
---

# Проверка моушена в браузере

1. Запусти dev-сервер в фоне: `npm run dev` (порт пишется в логе, обычно 3000/3001).
2. Открой страницу через chrome-devtools MCP (`navigate_page`). Если навигация упала по таймауту — страница обычно всё равно загрузилась, продолжай.
3. Подожди ~4 с (Loader + ленивая загрузка движка и `public/sakura/art.fragment.svg`).
4. Прогон по позициям скролла внутри интро `section[aria-label="Resu Protocol"]`:
   ```js
   async () => { const s=document.querySelector('section[aria-label="Resu Protocol"]'); const out=[];
     for (const f of [0,.3,.6,.95]) { scrollTo(0,(s.offsetHeight-innerHeight)*f);
       await new Promise(r=>setTimeout(r,2500));   // прогресс сглажен (~4.7/с), ждать обязательно
       out.push({f, cam:document.getElementById('cam').getAttribute('transform')}); }
     return out }
   ```
   После каждой позиции — `take_screenshot`. Ожидается: f=0 дерево и «scroll», ~.6 крупный план/белый наплыв, .95 кольцо с 5 лепестками и «RESU PROTOCOL».
5. `list_console_messages` с типами error/warn — должно быть пусто.
6. Производительность: `performance_start_trace` → проскроллить → `performance_stop_trace`; смотреть long tasks и пропуски кадров. Цель — стабильные 60 fps на десктопе.
7. Доступность: `emulate` с `prefers-reduced-motion: reduce` → интро должно исчезнуть, сайт начинается с Hero.
8. Мобильный: `resize_page` 390×844 и повторить шаг 4.
9. Останови сервер: `pkill -f "next dev"`.

Сообщай результат честно: что проверено скриншотом, что нет.
