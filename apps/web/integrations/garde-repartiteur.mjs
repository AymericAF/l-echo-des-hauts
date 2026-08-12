/**
 * Garde §3.6/§4.4 — le repartiteur de blocs est COMPLET, et le build le dit.
 *
 * CE QUE CETTE INTEGRATION CHANGE, mesure le 2026-08-12 (tache da2975e2). La garde de
 * completude existait, entiere et juste, mais elle vivait tout entiere dans
 * `tests/repartiteur-blocs.test.ts` : elle ne tournait que dans `npm test`. Or `npm test`
 * ne tourne NULLE PART sur le chemin de la production — releve du meme jour dans la base
 * de Coolify et dans le journal du deploiement #371 (`echo-site`, commit `c35e7d5`) : le
 * plan Nixpacks reellement execute est `install -> npm ci` puis `build -> npm run build`,
 * et rien d autre. Un `--no-verify`, un deploiement manuel, un push dont l integration
 * continue n a pas fini de tourner, et le neuvieme bloc partait en production.
 *
 * Le `satisfies Record<Bloc['type'], unknown>` de `BlocContenu.astro` ne rattrapait rien :
 * Astro STRIP les types du frontmatter, il ne les verifie pas ; `astro check` n est pas
 * installe et ne le sera pas. Mesure du 2026-08-07, sur un domaine volontairement casse
 * par un neuvieme type sans rendu : `npm test` rendait 229/229 verts et `astro build`
 * allait au bout, garde T-09 comprise. Le `satisfies` est un commentaire que seul
 * l editeur d un humain qui ouvre le fichier voit passer.
 *
 * POURQUOI `astro:config:done` ET PAS `astro:build:done`. Cette garde ne lit AUCUNE
 * sortie : elle confronte trois SOURCES entre elles. Le plus tot est donc le mieux — elle
 * refuse avant qu une seule page ne soit rendue, et le message tombe a la ligne ou le
 * defaut a ete introduit plutot que sur le premier article qui porte le bloc. C est le
 * meme hook que le premier des trois de `garde-t09`, pour la meme raison.
 *
 * ⚠️ ELLE NE LIT QUE `src/`, ET C EST UNE CONTRAINTE DE PRODUCTION, PAS UNE PREFERENCE.
 * Le contexte de construction de Coolify est `/apps/web` (`nixpacks build …
 * /artifacts/<id>/apps/web`, journal #371), pas le depot. Une garde de build qui lirait
 * hors de ce repertoire ne trouverait pas son fichier dans l image, rendrait INCAPACITE,
 * et ferait echouer la PRODUCTION pour une cause qui n existe que chez elle. Les trois
 * chemins sont declares dans `scripts/repartiteur-blocs.mjs` (`CHEMINS`), tous sous
 * `src/`.
 */
import { erreurVerificationImpossible, ISSUES } from '../scripts/issues.mjs';
import { inspecterRepartiteur, resumeRepartiteur } from '../scripts/repartiteur-blocs.mjs';

const NOM = 'garde-repartiteur';

/**
 * AUCUNE CONTRAINTE D ORDRE : cette garde ne regarde jamais `dist/`. Elle tourne meme
 * avant que la sortie n existe, ce qui la rend independante de tout depot d octets.
 */
export const ROLE_SORTIE = 'sans-contrainte-d-ordre';

/** Le message d echec, ecrit pour quelqu un qui decouvre la contrainte. */
function echec(manquements) {
  return new Error(
    `[${NOM}] ${manquements.length} ecart(s) entre les trois declarations des blocs :\n` +
      manquements.map((m) => `  - ${m}`).join('\n') +
      '\n\n  §3.6 du cahier : huit types de blocs, chacun avec son composant. Les trois' +
      '\n  declarations doivent porter EXACTEMENT les memes types :' +
      '\n    - `src/lib/domaine.ts`                    → l union `Bloc`, autorite du domaine ;' +
      '\n    - `src/components/blocs/BlocContenu.astro` → la table `RENDUS`, un composant par type ;' +
      '\n    - `src/lib/strapi/mapping.ts`             → le `switch` sur `__component`.' +
      '\n' +
      '\n  Un type declare sans rendu laisse un TROU MUET dans la page — le lecteur voit un' +
      '\n  article ampute, et rien n a echoue. Un rendu sans type est un composant mort qu une' +
      '\n  suppression a oublie derriere elle.' +
      '\n' +
      '\n  Le `satisfies Record<Bloc[\'type\'], unknown>` de BlocContenu.astro NE TOURNE PAS :' +
      '\n  Astro strip les types du frontmatter. C est cette garde-ci qui le rend opposable,' +
      '\n  et elle echoue au plus tot — avant qu une page ne soit rendue.',
  );
}

/** @returns {import('astro').AstroIntegration} */
export default function gardeRepartiteur() {
  return {
    name: NOM,
    hooks: {
      'astro:config:done': ({ logger }) => {
        const rapport = inspecterRepartiteur();
        /* UNE INCAPACITE N EST PAS UNE ANOMALIE. Une source illisible ou une extraction
           muette veut dire que la GARDE est aveugle ; le message de `echec()` enverrait
           alors chercher un bloc manquant qui n existe pas. Le build echoue quand meme —
           une garde qui ne peut pas verifier doit le DIRE, jamais rendre le vert de celle
           qui a verifie. */
        if (rapport.issue === ISSUES.VERIFICATION_IMPOSSIBLE) {
          throw erreurVerificationImpossible(NOM, rapport.manquements);
        }
        if (rapport.manquements.length > 0) throw echec(rapport.manquements);
        logger.info(resumeRepartiteur(rapport));
      },
    },
  };
}
