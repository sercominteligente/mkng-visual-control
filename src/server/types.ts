export type AppBindings = {
  DB: D1Database;
  BUCKET: R2Bucket;
  ASSETS: Fetcher;
  APP_NAME: string;
  APP_URL: string;
  APP_TIMEZONE: string;
  MAX_UPLOAD_MB: string;
  INITIAL_ADMIN_NAME?: string;
  INITIAL_ADMIN_EMAIL?: string;
  INITIAL_ADMIN_PASSWORD?: string;
  SESSION_SECRET?: string;
};

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
};

export type AppVariables = {
  user: SessionUser;
};

export type AppEnv = {
  Bindings: AppBindings;
  Variables: AppVariables;
};
