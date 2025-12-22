export enum AppEnv {
  Development = 'dev',
  Tests = 'test',
  Staging = 'stage',
  Production = 'prod',
}

function isAppEnv(candidate: string): candidate is AppEnv {
  return Object.values(AppEnv).includes(candidate as AppEnv);
}

function asAppEnv(env: string): AppEnv {
  if (isAppEnv(env)) {
    return env;
  }
  const validEnvs = Object.values(AppEnv).join(', ');
  throw new Error(`${env} is not valid app env. Choose from ${validEnvs}`);
}

export function getAppEnv(): AppEnv {
  const env = process.env.ENV;
  if (env !== undefined) {
    return asAppEnv(env);
  }
  throw new Error('Environment variable ENV is not present');
}

let appName = '';

export function getAppName(): string {
  if (!appName) {
    appName = process.env.APP_NAME ?? 'unknown-service';
  }

  return appName;
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.substring(1);
}

export function prettyAppName(): string {
  return capitalize(getAppName().split('-').join(' '));
}
