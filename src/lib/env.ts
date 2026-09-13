
declare const __RESU_ENV__: Record<string, string | undefined> | undefined;

export function env(name: string): string | undefined {
	const fromBuild = typeof __RESU_ENV__ === "undefined" ? undefined : __RESU_ENV__;

	const value = fromBuild?.[name] ?? globalThis.process?.env?.[name];

	return value === undefined || value.trim() === "" ? undefined : value;
}
