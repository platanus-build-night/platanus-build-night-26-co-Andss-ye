/// <reference types="vite/client" />

/** Vite's `?url` suffix yields the asset's served path. */
declare module '*?url' {
  const url: string;
  export default url;
}
