/// <reference types="vite/client" />

/**
 * Las variables que el build mete en el bundle.
 *
 * Sólo las que empiezan con `VITE_` llegan al navegador: el resto del `.env`
 * —las claves del correo, el secreto de reCAPTCHA— se queda en el servidor.
 */
interface ImportMetaEnv {
  /** Clave pública de reCAPTCHA v3. Se fija al compilar. */
  readonly VITE_RECAPTCHA_SITE_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
