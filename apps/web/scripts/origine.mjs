/**
 * L ORIGINE PUBLIQUE DU SITE, LUE — ou DECLAREE illisible. Jamais rendue sous la forme
 * d un `null` qu un appelant traiterait comme « il n y a rien d interne a verifier ».
 *
 * CE QUE CE MODULE REMPLACE, et ce qui s est mesure avant de l ecrire. Les trois
 * verificateurs qui confrontent des URL a `dist/` portaient chacun leur copie de :
 *
 *     const hote = (() => { try { return new URL(origine).origin; } catch { return null; } })();
 *
 * puis traitaient `hote === null` comme une reponse. Le 2026-08-10, sur le `dist/` du
 * depot (22 pages, 425 liens dont 114 absolus vers notre propre origine) :
 *
 *   - `verifier-liens.mjs`  : `✔ 425 lien(s) interne(s)` avec une origine valide,
 *     `✔ 311 lien(s) interne(s)` avec une origine vide — meme coche, meme code 0, et
 *     les 114 liens absolus retires de la garde sans un mot ;
 *   - `verifier-seo.mjs`    : sortie IDENTIQUE au caractere pres, parce que son test
 *     `hote !== null && absolue.origin !== hote` se desactive en entier — toute URL,
 *     meme celle d un autre site, redevenait « interne » ;
 *   - `verifier-origine-medias.mjs` : 44 manquements accusant `https://echo.ayfiweb.fr`,
 *     NOTRE origine, d etre « hors du site » — un hote fabrique (`invalide.invalid`)
 *     servi comme un constat.
 *
 * Une incapacite a lire la reference devenait donc, selon le fichier, un laissez-passer
 * ou une fausse accusation. Les deux sont la meme faute : rendre une incapacite sous la
 * forme d une reponse plausible.
 *
 * CE QU IL NE CHANGE PAS, ET NE DOIT PAS CHANGER : quand l origine se lit, un lien vers
 * un AUTRE hote reste hors garde, et le reste silencieusement. Un verificateur qui
 * rougirait sur les liens sortants legitimes serait desarme dans la semaine.
 *
 * PAR OU LE DEFAUT ETAIT REELLEMENT JOIGNABLE — mesure le 2026-08-10, et plus etroit
 * que ce que la description de la tache supposait :
 *
 *   - PAS par `astro build`. Astro protege ses propres hooks : `ECHO_SITE_URL=''` est
 *     refuse a la validation de configuration (`! Invalid URL`, code 1) et `foo:bar`,
 *     qui passe cette validation, fait mourir le build dans `compileAstro` (`new URL`,
 *     greffon vite) AVANT `astro:build:done`. Les trois gardes de `integrations/` ne
 *     pouvaient donc pas voir le repli. Elles sont corrigees quand meme : leur defense
 *     ne doit pas dependre d une protection qui vit chez un tiers et peut bouger a la
 *     montee de version.
 *   - PAR LA LIGNE DE COMMANDE, grande ouverte, et c est la PORTE DE LA RECETTE :
 *     `node scripts/verifier-*.mjs [dist] [origine]` (usage ecrit en tete de chaque
 *     fichier) et `npm run verifier:*` avec un `ECHO_SITE_URL` exporte vide ou mal
 *     forme — `??` ne remplace que `null`/`undefined`, jamais la chaine vide. C est la
 *     seconde porte du job `sortie` de l integration continue, celle qui juge un
 *     `dist/` deja construit. Et c est la classe de defaut deja nommee dans le depot
 *     de documentation : un `$ECHO_*` vide a l execution, qui ne casse pas la commande
 *     mais la fait MENTIR.
 */
import { ISSUES } from './issues.mjs';

/** Nommer ce qui a ete recu — sans cela, on cherche un defaut de site la ou il y a un defaut de variable. */
function decrire(origine) {
  if (origine === undefined) return 'valeur absente (undefined)';
  if (origine === null) return 'valeur nulle (null)';
  if (typeof origine !== 'string') return `valeur de type ${typeof origine}`;
  if (origine === '') return 'chaine VIDE ("") — une variable d environnement posee sans valeur';
  return `« ${origine} »`;
}

/**
 * @typedef {{lisible: true, issue: 0, hote: string}
 *          |{lisible: false, issue: 2, manquement: string}} LectureOrigine
 */

/**
 * @param {string} origine La valeur brute de `ECHO_SITE_URL`, ou l argument de ligne de commande.
 * @returns {LectureOrigine}
 */
export function lireOrigine(origine) {
  let hote = null;
  try {
    hote = new URL(origine).origin;
  } catch {
    hote = null;
  }

  /* `new URL('foo:bar')` NE THROW PAS : le schema n est pas special, l origine est
     opaque, et `.origin` rend la CHAINE 'null'. Un `try/catch` seul ne la voit donc
     pas — et en ligne de commande cette valeur produisait 296 faux « href illisible »
     sur un site sain (mesure du 2026-08-10 sur `dist/`). */
  if (hote === null || hote === 'null') {
    return {
      lisible: false,
      issue: ISSUES.VERIFICATION_IMPOSSIBLE,
      manquement:
        `origine du site illisible : ${decrire(origine)}. La verification N A PAS EU LIEU — ` +
        'sans origine, aucun lien absolu ne peut etre reconnu comme interne, et tous ' +
        'seraient classes « externe, hors garde ». Renseigne `ECHO_SITE_URL` (ou le ' +
        "troisieme argument) avec une URL absolue, par exemple `https://echo.ayfiweb.fr`.",
    };
  }

  return { lisible: true, issue: ISSUES.CONFORME, hote };
}
