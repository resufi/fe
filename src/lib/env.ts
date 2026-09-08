/**
 * Доступ к переменным сборки.
 *
 * Читается из __RESU_ENV__ — объекта, который подставляет Vite (см.
 * vite.config.ts). Через него, а не через import.meta.env, потому что Vite
 * заменяет только статическое обращение вида import.meta.env.VITE_X, а в
 * голом Node — где гоняются проверки логики — import.meta.env нет вовсе.
 */
declare const __RESU_ENV__: Record<string, string | undefined> | undefined;

export function env(name: string): string | undefined {
	const fromBuild = typeof __RESU_ENV__ === "undefined" ? undefined : __RESU_ENV__;
	// В Node значений сборки нет — берём из окружения процесса.
	return fromBuild?.[name] ?? globalThis.process?.env?.[name];
}
