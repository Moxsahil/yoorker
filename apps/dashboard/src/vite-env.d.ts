/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** The API's address when deployed, e.g. https://staging-api.yoorker.com. Unset: /api via the dev proxy. */
  readonly VITE_API_URL?: string;
  /** Google sign-in web client id. Unset: phone sign-in only. */
  readonly VITE_GOOGLE_CLIENT_ID?: string;
  /** Maps Static API browser key. Unset: venue maps use OpenStreetMap. */
  readonly VITE_GOOGLE_MAPS_API_KEY?: string;
  /** "true" shows the sample-data tags and demo notes in a deployed build, e.g. on staging. */
  readonly VITE_DEV_NOTES?: string;
}
