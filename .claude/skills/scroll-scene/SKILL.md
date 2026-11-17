---
name: scroll-scene
description: Conventions for building and porting scroll-driven animation scenes (GSAP) into this Next.js static-export landing — the sakura intro pattern. Use when adding a new animated section, porting a standalone HTML prototype, or editing src/components/sakura.
---

# Скролл-сцены в этом лендинге

Стек: Next.js 15 App Router, `output: "export"` (GitHub Pages), CSS Modules, `gsap` (без Lenis — скролл нативный).

## Шаблон (по образцу `src/components/sakura/`)
- `Component.tsx` — `"use client"`, разметка в JSX, в `useEffect` ленивый `import("./engine")` + `fetch(asset(...))` тяжёлых ассетов; возвращает disposer движка. Флаг `dead` против гонки при размонтировании.
- `engine.ts` — `initX(root, ...)` → `() => void`. Всё ищет внутри `root`, никаких `document.getElementById`.
- `Component.module.css` — классы через модуль; id-селекторы только как `.root :global(#id)`.
- Тяжёлое (большие SVG, спрайты) — в `public/<scene>/`, путь всегда через `asset()` из `src/lib/config.ts` (учитывает basePath).

## Раскладка
Секция `position:relative; height:N vh` + внутри `position:sticky; top:0; height:100vh; overflow:hidden`. Слои — `position:absolute`, не `fixed` (fixed ломает остальной сайт).

## Прогресс
```js
const rect=root.getBoundingClientRect();
if (rect.bottom<-80 || rect.top>innerHeight+80) return;      // вне экрана — не считаем кадр
const raw=clamp(-rect.top/(rect.height-innerHeight));
ps = ps<0 ? raw : ps+(raw-ps)*(1-Math.exp(-dt*4.7));       // замена Lenis lerp .075
```
Тикать через `gsap.ticker.add(tick)`, в disposer — `gsap.ticker.remove(tick)`.

## Связь со скиллами по анимации
Главный источник правил для UI-анимаций по времени (ховеры, кнопки, `Reveal`, меню) — скиллы Эмиля Ковальски: `emil-design-eng`, `review-animations`, `animation-performance`. `motion-design` — только справочник по хореографии; при расхождении в длительностях/кривых побеждают правила Эмиля. Сцены, привязанные к скроллу, этими лимитами не ограничены: их «время» — прогресс скролла, тайминги задаёт автор сцены.

## Обязательно
- Идемпотентный init/cleanup (React StrictMode монтирует эффекты дважды): снимать listeners, `split.revert()`, удалять всё вставленное в DOM.
- `prefers-reduced-motion`: CSS `display:none` для секции + ранний `return` в эффекте.
- Порт чужого прототипа: математику не трогать, менять только обвязку; файл помечать `/* eslint-disable */` + `// @ts-nocheck`.
- Фон сцены сейчас `#f2eee6`, сайта — `--bg: #fbfbfa`; стык сглаживать градиентом.
- После изменений: `npm run typecheck && npm run lint && npm run build`, затем скилл `motion-check`.
