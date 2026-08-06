// @ts-check
import { defineConfig } from 'astro/config';
import { loadEnv } from 'vite';

/**
 * `output: 'static'` INTEGRAL, et aucun adaptateur (§4.1 : « aucune route serveur »).
 * Ecrit explicitement plutot que laisse au defaut : la contrainte est opposable, elle
 * doit se lire dans le fichier. T-09 pose que la garde de build reste a ecrire — une
 * seule route portant `prerender = false` ferait basculer la sortie entiere en serveur,
 * et cela ne se voit pas dans le fichier fautif.
 *
 * Les variables d environnement sont chargees ici et poussees dans `process.env` :
 * Astro n expose a `import.meta.env` que les variables prefixees `PUBLIC_`, et le jeton
 * de build est en lecture seule mais reste un secret — il ne doit atteindre AUCUN
 * bundle client. Les lire cote Node, au build, est ce qui le garantit.
 */
const env = loadEnv(process.env.NODE_ENV ?? 'production', process.cwd(), '');
for (const [cle, valeur] of Object.entries(env)) {
  if (cle.startsWith('ECHO_') && process.env[cle] === undefined) process.env[cle] = valeur;
}

export default defineConfig({
  output: 'static',
  site: process.env.ECHO_SITE_URL ?? 'https://echo.ayfiweb.fr',
  build: {
    // Une URL sans slash final est plus simple a comparer au registre des routes emises (T-04).
    format: 'directory',
  },
});
