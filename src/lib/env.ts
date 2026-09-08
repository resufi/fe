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
	const value = fromBuild?.[name] ?? globalThis.process?.env?.[name];

	// Пустая строка — это НЕ значение.
	//
	// Незаполненный секрет в GitHub Actions приходит именно так, а оператор ??
	// подставляет запасное значение только вместо undefined. В результате
	// пустая строка проходит как настоящий адрес: приложение отправляло
	// запросы само себе и получало 405, вместо того чтобы взять узел по
	// умолчанию.
	return value === undefined || value.trim() === "" ? undefined : value;
}
