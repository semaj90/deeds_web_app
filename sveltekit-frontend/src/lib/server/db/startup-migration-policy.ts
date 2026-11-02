export function shouldRunStartupMigrations(
  isDev: boolean,
  environment: Readonly<Record<string, string | undefined>>,
): boolean {
  return !isDev &&
    environment.RUN_STARTUP_MIGRATIONS === 'true' &&
    environment.SKIP_MIGRATIONS !== 'true';
}
