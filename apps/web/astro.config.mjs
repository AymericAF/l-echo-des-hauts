// @ts-check
import { defineConfig } from 'astro/config';
import { loadEnv } from 'vite';

import gardeImages from './integrations/garde-images.mjs';
import gardeLiens from './integrations/garde-liens.mjs';
import gardeOrigineMedias from './integrations/garde-origine-medias.mjs';
import gardeSeo from './integrations/garde-seo.mjs';
import gardeT09 from './integrations/garde-t09.mjs';
import mediasLocaux from './integrations/medias-locaux.mjs';

/**
 * `output: 'static'` INTEGRAL, et aucun adaptateur (§4.1 : « aucune route serveur »).
 * Ecrit explicitement plutot que laisse au defaut : la contrainte est opposable, elle
 * doit se lire dans le fichier. Mais se lire ne suffit pas : une seule route portant
 * `prerender = false` ferait basculer la sortie entiere en serveur, et cela ne se voit
 * pas dans le fichier fautif. C est l objet de la garde T-09 branchee ci-dessous, qui
 * fait ECHOUER le build — la contrainte n est plus tenue par la discipline.
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

/**
 * L ORDRE DES INTEGRATIONS EST UNE DEPENDANCE, pas une preference. Toutes accrochent
 * `astro:build:done`, ou Astro les appelle dans l ordre de ce tableau. `mediasLocaux`
 * DEPOSE les octets des medias dans la sortie (T-01) ; les trois gardes qui le suivent
 * verifient qu une reference y aboutit. Le placer apres elles les ferait rougir sur un
 * site sain.
 */
export default defineConfig({
  integrations: [
    gardeT09(),
    mediasLocaux(),
    gardeImages(),
    gardeOrigineMedias(),
    gardeLiens(),
    gardeSeo(),
  ],
  output: 'static',
  site: process.env.ECHO_SITE_URL ?? 'https://echo.ayfiweb.fr',
  build: {
    // Une URL sans slash final est plus simple a comparer au registre des routes emises (T-04).
    format: 'directory',
  },
});
