/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_USE_REAL_API?: string;
  readonly VITE_MOCK_DELAY?: string;
  readonly VITE_MOCK_ERROR?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module '*.json' {
  const value: Record<string, unknown>;
  export default value;
}