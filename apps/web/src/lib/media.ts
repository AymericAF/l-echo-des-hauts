/**
 * Les medias Strapi vivent dans `public/uploads`, monte sur un volume persistant du VPS,
 * et sont servis par Strapi lui-meme (docs/modele-donnees.md §2.1, runbook etapes 7, 14
 * et 18). Le provider local rend donc des URL RELATIVES : `/uploads/…`. Servies telles
 * quelles depuis `echo.ayfiweb.fr`, elles pointeraient sur le site public, ou rien ne
 * repond. Elles s absolutisent au build, ici et nulle part ailleurs.
 */
import type { Media } from './domaine.ts';

function baseStrapi(): string {
  const depuisVite = (import.meta as { env?: Record<string, string | undefined> }).env
    ?.ECHO_STRAPI_URL;
  const base = depuisVite ?? process.env.ECHO_STRAPI_URL;
  if (!base) throw new Error('ECHO_STRAPI_URL est absente : impossible d absolutiser une URL de media.');
  return base.replace(/\/+$/, '');
}

export function urlMedia(media: Media): string {
  return /^https?:\/\//.test(media.url) ? media.url : `${baseStrapi()}${media.url}`;
}
