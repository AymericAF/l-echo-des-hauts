/**
 * L ORIGINE PUBLIQUE DU SITE, FABRIQUEE — ou refusee, jamais rendue vide.
 *
 * C est le PRODUCTEUR : ce que cette fonction rend prefixe les canoniques et les
 * `hreflang` du `<head>`, les `<loc>` des segments de sitemap, les `guid` et `link` des
 * deux flux RSS, et la ligne `Sitemap:` du `robots.txt`. Autrement dit tout ce qui dit
 * au monde ou vit ce site.
 *
 * CE QU IL FAISAIT AVANT LE 2026-08-10, et pourquoi c est la meme faute que celle fermee
 * chez les six verificateurs le matin meme (commit 800a978) :
 *
 *     const brute = site?.href ?? process.env.ECHO_SITE_URL ?? 'https://echo.ayfiweb.fr';
 *     return brute.replace(/\/+$/, '');
 *
 * `??` ne remplace que `null` et `undefined` — JAMAIS la chaine vide. Une variable
 * d environnement posee sans valeur (`ECHO_SITE_URL=`) traversait donc le repli et
 * ressortait telle quelle : `''`, sans une erreur ni un signal.
 *
 * CE QUE LA SUITE EN FAISAIT, MESURE PLUTOT QUE SUPPOSE (2026-08-10). La tache attendait
 * des adresses FAUSSES — canoniques vides, relatives, ou portant un nom de repli. Ce
 * n est pas ce qui se produit, et il faut l ecrire :
 *
 *     origineDuSite(undefined) avec ECHO_SITE_URL=''  ->  ""        (aucune erreur)
 *       robots.txt, ligne Sitemap  -> LEVE : TypeError: Invalid URL
 *       sitemap, premier <loc>     -> LEVE : TypeError: Invalid URL
 *       flux, lien du site         -> LEVE : TypeError: Invalid URL
 *
 * Les SIX consommateurs de cette valeur passent tous par `new URL(chemin, origine)`
 * (`metadonnees.ts:110`, `sitemap.ts:218`, `flux.ts:82`, `robots.ts:23`, et deux
 * `new URL()` en clair dans `Base.astro:158-159`) : aucun ne concatene, verifie a la
 * recherche. Or `new URL('/x', '')` et `new URL('/x', 'foo:bar')` LEVENT tous les deux.
 * Une origine illisible ne peut donc PAS produire d adresse fausse — elle produit un
 * `TypeError: Invalid URL` ANONYME, leve chez le consommateur, qui ne nomme ni la
 * variable, ni la valeur recue, ni le reglage a corriger. Le defaut de ce module n etait
 * pas d emettre du faux : c etait de faire perdre la CAUSE.
 *
 * PAR OU C ETAIT JOIGNABLE — mesure le 2026-08-10, et la reponse est : PAS PAR UN BUILD.
 * Contrairement aux verificateurs, qui avaient une ligne de commande grande ouverte, ce
 * module n a aucune porte hors d Astro. Et `astro build` refuse en amont exactement les
 * memes valeurs que celles que `lireOrigine()` declare illisibles, par la meme mecanique :
 *
 *   - `ECHO_SITE_URL=''`      -> refuse a la validation de configuration (`! Invalid URL`,
 *     code 1). Aucune page n est emise ;
 *   - `ECHO_SITE_URL='foo:bar'` -> la configuration passe, le build meurt dans le greffon
 *     vite (`Build failed`, code 1) ;
 *   - `ECHO_SITE_URL='file:///var/www/'` -> configuration ET greffon passent, puis le build
 *     meurt a la generation de la premiere route (`generate.js:375`, code 1).
 *
 * La cause des deux dernieres est une seule ligne d Astro : `this.origin =
 * new URL(settings.config.site).origin` (`core/build/index.js:66`), reutilisee ensuite
 * comme BASE d un `new URL()`. Une origine opaque y rend la chaine `'null'`, et
 * `new URL(chemin, 'null')` leve. C est le predicat de `lireOrigine()`, ecrit ailleurs
 * et pour une autre raison.
 *
 * ALORS POURQUOI CORRIGER, PUISQUE RIEN DE FAUX NE SORT. Pour deux raisons, et aucune
 * n est « le defaut etait grave » — il ne l est pas, et le dire autrement serait mentir :
 *
 *   1. LA CAUSE. Le build echoue de toute facon ; ce que ce module ajoute est le NOM de
 *      ce qui cloche. `TypeError: Invalid URL` leve dans `sitemap.ts` envoie chercher un
 *      defaut de sitemap ; « origine du site illisible : chaine VIDE — renseigne
 *      ECHO_SITE_URL » envoie corriger une variable. C est la classe deja nommee dans le
 *      depot de documentation : un `$ECHO_*` vide a l execution, qui ne casse pas la
 *      commande mais la fait chercher au mauvais endroit.
 *   2. LA DEFENSE EN PROFONDEUR. La coincidence entre le predicat d Astro et le notre vit
 *      chez un TIERS, dans un detail d implementation que rien ne documente et qu une
 *      montee de version peut deplacer. Le jour ou elle bouge, ce module est le dernier
 *      a se trouver entre une variable vide et une adresse publiee. Meme arbitrage que
 *      pour les trois gardes de `integrations/`, elles aussi hors de portee d un build
 *      reel, et corrigees quand meme.
 *
 * CE QUI N A PAS CHANGE, ET NE DOIT PAS : la valeur rendue reste `brute` privee de ses
 * slashs finaux — PAS `new URL(brute).origin`. Rendre l origine amputerait le chemin
 * (`https://exemple.test/sous-dossier`), et le canonique d un site servi sous
 * sous-dossier cesserait de correspondre a son sitemap. `lireOrigine()` sert de PREDICAT
 * de lisibilite, jamais de source de la valeur.
 *
 * POURQUOI CE FICHIER EST SEPARE DE `contexte-site.ts`. Celui-la importe `astro:content`
 * en tete, donc `node --test` ne peut pas le charger — et c est precisement pour cela que
 * `origineDuSite`, seul de tous les modules SEO, n avait AUCUN test au 2026-08-10 quand
 * `metadonnees`, `sitemap`, `flux`, `robots`, `indexation` et `gabarit-og` en avaient
 * tous. Le decoupage est celui que `contexte-site.ts` decrit deja pour les autres ; il
 * manquait a celui-ci. `contexte-site.ts` le REEXPORTE : aucun appelant ne bouge.
 */
import { ISSUES } from '../../../scripts/issues.mjs';
import { decrire, lireOrigine } from '../../../scripts/origine.mjs';

/**
 * Le repli quand `ECHO_SITE_URL` est ABSENTE — absente, et non vide.
 *
 * Il est ecrit ici et dans `astro.config.mjs`, `integrations/garde-*.mjs` et les trois
 * `scripts/verifier-*.mjs` : huit copies de la meme chaine au 2026-08-10. Les unifier
 * depasse le perimetre de cette tache et se fait sous son propre controle — cette
 * constante existe pour leur donner un domicile le jour ou on le fera.
 */
export const ORIGINE_PAR_DEFAUT = 'https://echo.ayfiweb.fr';

/**
 * L origine publique du site, sans slash final.
 *
 * @param site `Astro.site`, qui vient de `astro.config.mjs` — lui-meme alimente par
 *   `ECHO_SITE_URL`. Quand il manque, la variable est relue directement.
 * @throws Une erreur portant `issue = 2` (VERIFICATION IMPOSSIBLE) quand la valeur ne
 *   se lit pas comme une URL absolue. Elle ARRETE le build : une origine illisible ne
 *   doit pas produire d adresse, ni la sienne ni celle du repli.
 */
export function origineDuSite(site: URL | undefined): string {
  const brute = site?.href ?? process.env.ECHO_SITE_URL ?? ORIGINE_PAR_DEFAUT;

  if (!lireOrigine(brute).lisible) {
    /* PAS de retour au repli. Le reflexe « `??` -> `||` » rendrait ici une adresse
       PLAUSIBLE et fausse, publiee en silence : exactement ce que la convention a trois
       issues existe pour interdire. Une incapacite se declare, elle ne se remplace pas. */
    const erreur: Error & { issue?: number } = new Error(
      `[origine du site] origine du site illisible : ${decrire(brute)}.\n` +
        '  RIEN N EST PRODUIT : les canoniques, les liens de langue, les <loc> du plan de\n' +
        '  site, les identifiants du flux et la ligne Sitemap: du fichier des robots se\n' +
        '  calculent tous par `new URL(chemin, origine)`, qui LEVE sur cette valeur. Sans ce\n' +
        "  message tu lirais `TypeError: Invalid URL` chez l un d eux, sans savoir lequel\n" +
        '  des six, ni que le fautif est une variable et non le site.\n' +
        `  Renseigne ECHO_SITE_URL avec une URL absolue, par exemple ${ORIGINE_PAR_DEFAUT}.\n` +
        `  Issue ${ISSUES.VERIFICATION_IMPOSSIBLE} (verification impossible ; 0 conforme, 1 anomalie).`,
    );
    erreur.issue = ISSUES.VERIFICATION_IMPOSSIBLE;
    throw erreur;
  }

  return brute.replace(/\/+$/, '');
}
