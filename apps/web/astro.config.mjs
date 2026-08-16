// @ts-check
import { defineConfig } from 'astro/config';

import gardeCascadeTitres from './integrations/garde-cascade-titres.mjs';
import gardeImages from './integrations/garde-images.mjs';
import gardeLangue from './integrations/garde-langue.mjs';
import gardeLiens from './integrations/garde-liens.mjs';
import origineDuBuild from './integrations/origine-du-build.mjs';
import gardeOrigineMedias from './integrations/garde-origine-medias.mjs';
import gardeRepartiteur from './integrations/garde-repartiteur.mjs';
import gardeSeo from './integrations/garde-seo.mjs';
import gardeStylesEnLigne from './integrations/garde-styles-en-ligne.mjs';
import gardeT09 from './integrations/garde-t09.mjs';
import mediasLocaux from './integrations/medias-locaux.mjs';
import { resoudreEnvDuBuild } from './scripts/env-du-build.mjs';
import { ORIGINE_PAR_DEFAUT } from './scripts/origine.mjs';

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
 *
 * CET APPEL FAIT PLUS QUE CHARGER : c est lui qui fait converger les DEUX lecteurs de
 * `ECHO_STRAPI_URL` — le producteur des chemins de medias (dans Vite, `import.meta.env`
 * d abord) et le deposeur de leurs octets (hors Vite, `process.env` seul). L argument
 * complet, la mesure qui l etablit et ce qui le romprait vivent dans
 * `scripts/env-du-build.mjs` ; `tests/medias-locaux.test.ts` le verrouille.
 */
resoudreEnvDuBuild();

/**
 * L ORDRE DES INTEGRATIONS EST UNE DEPENDANCE, pas une preference. Toutes accrochent
 * `astro:build:done`, ou Astro les appelle dans l ordre de ce tableau. `mediasLocaux`
 * DEPOSE les octets des medias dans la sortie (T-01) ; TOUT CE QUI JUGE CETTE SORTIE
 * passe apres lui — pour deux raisons distinctes, que `tests/astro-config.test.ts` tient
 * separees parce que leurs modes d echec sont opposes :
 *
 *   - `gardeOrigineMedias`, `gardeLiens`, `gardeSeo` verifient qu une REFERENCE aboutit.
 *     Placees avant le depot, elles rougiraient sur un site SAIN.
 *   - `gardeT09` dresse l INVENTAIRE des fichiers servis. Placee avant le depot, elle
 *     rendait VERT sur un site FAUTIF : c est le defaut mesure et reproduit le
 *     2026-08-11 (tache 5bf5c24b) — un media `temoin-5bf5c24b.js` depose apres son
 *     passage, `[garde-t09] aucun JavaScript servi`, et 131 octets de `.js` bel et bien
 *     servis a une page. Elle etait en PREMIERE position ; elle est desormais en seconde,
 *     immediatement apres le depot.
 *
 * Ses deux autres hooks n ont pas bouge de rang utile : `astro:config:done` et
 * `astro:routes:resolved` se declenchent bien avant tout `astro:build:done`, donc une
 * configuration serveur ou une route `prerender = false` arrete toujours le build AVANT
 * le moindre telechargement de media.
 *
 * L ordre n est pas garde par ce commentaire mais par le ROLE que chaque module declare
 * (`ROLE_SORTIE`), confronte a ce tableau par `tests/astro-config.test.ts`.
 */
export default defineConfig({
  integrations: [
    /**
     * `gardeRepartiteur` EN PREMIER, et son hook est `astro:config:done` — le plus tot du
     * build. Elle ne lit aucune sortie : elle confronte trois SOURCES (l union `Bloc`, la
     * table `RENDUS`, le `switch` du mapping) et refuse avant qu une page ne soit rendue.
     * Un neuvieme type de bloc sans son composant s arretait jusqu ici a `npm test` — que
     * le build de Coolify ne lance PAS (plan Nixpacks : `npm ci` puis `npm run build`,
     * releve au journal de deploiement du 2026-08-12).
     *
     * `gardeT09` NE REMONTE PAS avec elle : elle dresse l INVENTAIRE de la sortie, donc
     * elle reste APRES `mediasLocaux` (defaut mesure le 2026-08-11, tache 5bf5c24b — en
     * premiere position elle rendait VERT sur un site qui servait 131 octets de `.js`).
     * Les deux contraintes sont opposees et coexistent : `gardeRepartiteur` juge des
     * SOURCES avant tout rendu, `gardeT09` juge des OCTETS apres tout depot.
     */
    gardeRepartiteur(),
    mediasLocaux(),
    gardeT09(),
    gardeImages(),
    gardeOrigineMedias(),
    gardeLiens(),
    gardeSeo(),
    gardeStylesEnLigne(),
    gardeCascadeTitres(),
    gardeLangue(),
    /**
     * EN DERNIER, et ce n est pas un rangement : elle n inspecte rien, elle ARCHIVE.
     * Placee ici, l artefact qu elle depose atteste d un build alle jusqu au bout —
     * une sortie produite par un build que les gardes ci-dessus ont fait echouer n a
     * pas a etre jugee, et n a donc pas a porter de reference.
     */
    origineDuBuild(),
  ],
  output: 'static',
  site: process.env.ECHO_SITE_URL ?? ORIGINE_PAR_DEFAUT,
  build: {
    // Une URL sans slash final est plus simple a comparer au registre des routes emises (T-04).
    format: 'directory',
    /**
     * `'never'` — TOUT le CSS sort en fichiers, aucun ne remonte dans le document.
     *
     * Ce n est pas une preference de taille de bundle : c est ce que la CSP du §5.5 impose.
     * Au defaut `'auto'`, Astro remontait les petites feuilles dans un `<style>` du `<head>` —
     * 65 des 86 pages en portaient un le 2026-08-09 — et `style-src 'self'` les REFUSAIT
     * toutes. Le site repondait 200, ses en-tetes etaient conformes, et il rendait autre
     * chose que ce que le build decrit : 80 px d ecart sur deux des quatre pages recettees.
     *
     * Le cout est ecrit plutot que tu : `'never'` ajoute une requete de feuille sur les pages
     * qui n en avaient pas, contre un chemin critique deja court (§7.4 (a) du brief). La
     * mesure P2 tranche — pas ce commentaire.
     *
     * `garde-styles-en-ligne` fait echouer le build si ce reglage revient a `'auto'` : la
     * contrainte n est plus tenue par la discipline.
     */
    inlineStylesheets: 'never',
  },
});
