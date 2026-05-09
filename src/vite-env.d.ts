/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GOOGLE_CLIENT_ID: string;
  readonly VITE_GOOGLE_CALENDAR_ID: string;
  readonly VITE_OPENWEATHER_API_KEY: string;
  /** When `"true"`, shows the Mother's Day splash once until dismissed (see MothersDayIntro). */
  readonly VITE_MOTHERS_DAY_INTRO?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
