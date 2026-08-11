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

/**
 * Nommer ce qui a ete recu — sans cela, on cherche un defaut de site la ou il y a un
 * defaut de variable.
 *
 * EXPORTE depuis le 2026-08-10 (tache e510a3f9) : le PRODUCTEUR de l origine
 * (`src/lib/seo/origine-site.ts`) doit nommer la meme valeur, mais son message ne peut
 * pas etre celui de `lireOrigine()` — « la verification n a pas eu lieu » decrit un
 * verificateur, quand le producteur, lui, n a rien PRODUIT. Le morceau commun est
 * exactement celui-ci, et rien de plus : deux `decrire()` finiraient par nommer la meme
 * chaine vide de deux facons.
 */
export function decrire(origine) {
  if (origine === undefined) return 'valeur absente (undefined)';
  if (origine === null) return 'valeur nulle (null)';
  if (typeof origine !== 'string') return `valeur de type ${typeof origine}`;
  if (origine === '') return 'chaine VIDE ("") — une variable d environnement posee sans valeur';
  return `« ${origine} »`;
}

/**
 * L ORIGINE CONTRE LAQUELLE UNE GARDE DE BUILD DOIT JUGER — celle de la configuration
 * RESOLUE par Astro, jamais celle de l environnement.
 *
 * CE QU ELLE REMPLACE, et ce qui s est mesure le 2026-08-11 avant de l ecrire. Les trois
 * gardes de `integrations/` portaient chacune leur copie de :
 *
 *     const origine = process.env.ECHO_SITE_URL ?? 'https://echo.ayfiweb.fr';
 *
 * L environnement N EST PAS la configuration. Astro resout `site` a partir de plusieurs
 * sources, et `--site` — une option PUBLIQUE, qui ne demande aucune manipulation
 * d environnement — GAGNE sur le fichier de configuration, donc sur la variable qui
 * l alimente. Mesure sur `ECHO_SITE_URL=https://echo.ayfiweb.fr npx astro build --site
 * https://autre-origine.test`, ou le producteur emet bien `https://autre-origine.test/` :
 *
 *   - `garde-origine-medias` : le build ECHOUE sur 238 references d image accusees
 *     d etre « hors du site », alors qu elles portent l origine donnee au build ;
 *   - `garde-seo`            : le build ECHOUE sur 121 manquements — 6 segments de
 *     sitemap « hors du site » et les 115 pages indexables declarees absentes d un
 *     sitemap devenu etranger a ses propres yeux ;
 *   - `garde-liens`          : VERT, code 0, meme coche — `2990 lien(s) interne(s)` au
 *     lieu de `3587`. 597 liens absolus retires de la garde SANS UN MOT.
 *
 * Les trois ne se comportaient donc pas pareil, et la troisieme est la pire : deux
 * accusent a tort, ce qui se voit ; la derniere se DESARME en affichant le signe de la
 * conformite. C est la forme deja fermee chez les six verificateurs (commit 800a978) —
 * succes et incapacite rendant la meme sortie.
 *
 * LA CHAINE DE REPLI EST CELLE DU PRODUCTEUR, a l identique
 * (`src/lib/seo/origine-site.ts` : `site?.href ?? process.env.ECHO_SITE_URL ?? repli`) :
 * c est ce qui garantit que garde et producteur jugent la MEME valeur quelle que soit la
 * source qui l a fournie. En diverger, meme « en mieux », reouvrirait le defaut.
 *
 * LE SLASH FINAL NE COMPTE PAS ICI, et c est mesure plutot que suppose : Astro rend
 * `config.site` en CHAINE, sans slash final ajoute (`"https://autre-origine.test"`),
 * quand le producteur lit `Astro.site.href`, qui en porte un. Les trois inspecteurs ne
 * consomment cette valeur que par `lireOrigine().hote`, c est-a-dire `new URL(x).origin`,
 * qui ampute chemin et slash. Les deux formes y sont donc rigoureusement equivalentes —
 * ce qui ne serait PLUS vrai pour un appelant qui la concatenerait.
 *
 * @param {string|undefined} siteResolu `config.site` du hook `astro:config:done`.
 * @param {string} repli L origine par defaut, quand ni la configuration ni la variable
 *   ne la portent. Passee par l appelant tant que les huit copies de cette chaine n ont
 *   pas de domicile commun (cf. `ORIGINE_PAR_DEFAUT` de `src/lib/seo/origine-site.ts`).
 * @returns {string} La valeur BRUTE, a passer telle quelle a `lireOrigine()` : une
 *   origine illisible doit se DECLARER chez l inspecteur, jamais etre remplacee ici.
 */
export function origineDuBuild(siteResolu, repli) {
  return siteResolu ?? process.env.ECHO_SITE_URL ?? repli;
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
