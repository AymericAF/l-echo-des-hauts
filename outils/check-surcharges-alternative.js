#!/usr/bin/env node
// UNE SURCHARGE D'ALTERNATIVE SE COMPTE PAR CE QU'ELLE FAIT, PAS PAR SON NOM.
//
// ── LE TROU QU'ELLE FERME (constaté le 2026-08-22, tâche `ac696998`) ───────────────────────
// Le 2026-08-21, le compte des surcharges d'alternative est passé de « huit » à « DIX », recompté
// à la source sur deux refs. Le chiffre était juste. La RECETTE DU CHIFFRE, elle, était une
// convention de nommage : « énumérer les attributs de type texte dont le nom commence par
// `alternative` ». Un champ qui ferait le même travail sous un autre nom n'aurait figuré dans
// AUCUN compte, et rien n'aurait pu le dire. C'est le mode d'échec ordinaire d'un contrôle par
// nommage : il protège tant que personne ne dévie, et devient muet à la première déviation —
// sans bruit, sans rouge, sans trace.
//
// ── D'OÙ ELLE VIENT, ET POURQUOI ELLE A DÉMÉNAGÉ (décision `b923fec4`, branche B) ──────────
// Elle est née dans le dépôt de DOCUMENTATION (`docs/check-surcharges-alternative.js`, commit
// `d8922d5`), alors qu'elle lit le dépôt de CODE — celui-ci. CONSÉQUENCE MESURÉE : en CI publique
// du dépôt doc, le dépôt de code est absent du runner, la garde y sortait en CODE 2, et elle ne
// gardait donc RIEN — elle ne tournait que si quelqu'un y pensait. C'est exactement le mode
// d'échec qu'elle a été écrite pour fermer. Ici, elle lit son propre arbre : elle tourne à chaque
// commit qui touche `mapping.ts` ou un schéma, c'est-à-dire LÀ OÙ LA DÉVIATION NAÎT.
//
// CE QU'ELLE A PERDU AU DÉMÉNAGEMENT, dit plutôt que tu : sa version doc confrontait EN PLUS le
// cardinal de A au nombre écrit dans l'encadré du §6.5 de `docs/plan-editorial.md`. Ce volet n'a
// pas été transplanté — il aurait recréé le code 2 EN MIROIR, le document étant absent d'ici. Le
// cardinal a été RETIRÉ du plan éditorial plutôt que converti en pointeur daté : un chiffre qui
// n'existe plus ne peut plus mentir, et le plan renvoie désormais à CETTE commande. C'est le
// motif « nombre retiré, trou nommé » déjà appliqué cinq fois sur ce projet.
//
// ── CE QU'ELLE FAIT, ET POURQUOI CE N'EST NI « ÉLARGIR » NI « ÉCRIRE LA CONVENTION » ───────
// Les deux remèdes évidents ont été pesés et écartés, sur des faits de CE modèle :
//
//   · ÉLARGIR LA DÉTECTION à une forme structurelle (« tout champ texte voisin d'un champ
//     `media` dans le même schéma ») rend des FAUX POSITIFS, et leur nombre est MESURÉ, pas
//     redouté : sur `origin/main` au 2026-08-22 (`2761336`), la règle rend **DIX-NEUF**
//     attributs non préfixés — `article.titre`, `article.chapo`, `article.legendeCouverture`,
//     `auteur.nom`, `auteur.fonction`, `categorie.nom`, `categorie.description`,
//     `categorie.couleurAccent`, `configuration.nomSite`, `configuration.baseline`,
//     `configuration.descriptionDefaut`, `dossier.titre`, `bloc.image-legendee.legende`,
//     `bloc.image-legendee.credit`, `bloc.video.url`, `bloc.video.legende`,
//     `partage.seo.metaTitre`, `partage.seo.metaDescription`, `partage.seo.canonique`.
//     DIX-NEUF champs sains à trier À CHAQUE PASSAGE, pour zéro défaut réel — et A-04 sépare
//     précisément la légende de l'alternative. Une garde qu'on trie est une garde qu'on éteint.
//     Resserrer l'heuristique (ne garder que les « légendes ») ne fait que déplacer le problème :
//     elle redeviendrait une liste de noms, c'est-à-dire une convention de nommage prise par
//     l'autre bout.
//   · ÉCRIRE LA CONVENTION déplace la garantie du mécanisme vers l'humain, ce que ces dépôts
//     refusent partout ailleurs ([[garantie-par-mecanisme-pas-convention]]). Elle existe déjà,
//     d'ailleurs, en fin d'A-04 de `docs/modele-donnees.md` — « les sept surcharges déjà en place
//     s'écrivent toutes `alternative` + nom du média » — et elle est DESCRIPTIVE (« s'écrivent »),
//     pas prescriptive, et déjà périmée (sept).
//
// Le remède retenu n'est ni l'un ni l'autre : ON CONFRONTE DEUX ÉNUMÉRATIONS EXACTES, chacune
// lue sur le disque de CE dépôt, aucune heuristique de part ni d'autre.
//
//   A — LE NOMMAGE. Les attributs de type `string`/`text` dont le nom commence par `alternative`,
//       dans les `content-types/*/schema.json` et les `components/*/*.json` d'`apps/cms/src`.
//   B — LE MÉCANISME. Les champs réellement passés en SURCHARGE à `avecSurcharge(…)` ou
//       `surchargerOptionnel(…)` dans `apps/web/src/lib/strapi/mapping.ts` — c'est-à-dire les
//       seuls champs qui, à l'exécution, REMPLACENT `Media.alternative`.
//
// La définition fonctionnelle est celle-là, et elle vit dans le code : un champ est une surcharge
// d'alternative SI ET SEULEMENT SI il est le second argument d'`avecSurcharge` —
// `apps/web/src/lib/strapi/mapping.ts`, `function avecSurcharge(media, surcharge)`, et
// `apps/web/src/lib/domaine.ts`, `Media.alternative`. Un champ ne peut pas faire ce travail sans
// passer par là : c'est ce qui rend l'énumération B opposable plutôt que déclarative.
//
// AUCUN FAUX POSITIF N'EST POSSIBLE : les deux côtés sont des ENSEMBLES FINIS EXACTS, pas des
// motifs approchants. Un rouge signifie toujours l'une de deux choses réelles :
//   · un nom `alternative*` que rien ne câble — champ mort, ou surcharge oubliée au mapping ;
//   · une surcharge câblée sous un nom qui ne l'annonce pas — LE TROU DE LA TÂCHE, celui
//     qu'aucun `grep` sur le préfixe ne pouvait voir.
// La convention de nommage n'est donc pas abandonnée : elle cesse d'être une prière et devient
// opposable, puisque la première déviation NOMME son auteur.
//
// ── ELLE LIT L'ARBRE DE TRAVAIL, PAS UNE RÉFÉRENCE GIT ────────────────────────────────────
// Sa version doc lisait `origin/main` par `git show`, et devait le rafraîchir d'abord — un clone
// en retard aurait certifié un modèle périmé. Ici la question ne se pose plus : ce qu'il faut
// juger est CE QUE LE COMMIT PORTE, et `actions/checkout` le pose sur le disque. Plus de `git`,
// plus de `fetch`, plus de réseau — donc trois causes d'incapacité en moins.
//
// ── L'AUTO-TEST DE L'EXTRACTEUR, ET C'EST LA MOITIÉ QUI COMPTE ─────────────────────────────
// L'énumération B se lit dans du TypeScript, au motif. Un extracteur de source qui cesse de
// reconnaître ce qu'il cherche NE SE TROMPE PAS : il ne trouve rien, et rend vert
// ([[parseur-de-prose-echoue-en-silence]]). Deux garde-fous, à chaque exécution :
//   · un TÉMOIN POSITIF et un TÉMOIN NÉGATIF, écrits ici, passés dans l'extracteur réel — le
//     positif doit rendre exactement ses deux champs (dont un déclaré par variable), le négatif
//     ne doit rien rendre ;
//   · toute forme d'argument NON RECONNUE arrête la garde en INCAPACITÉ, en citant la ligne.
//     Elle ne saute JAMAIS ce qu'elle n'a pas su lire — sauter, ici, c'est fabriquer le trou.
//
// ── CE QU'ELLE NE VOIT PAS, nommé plutôt que tu ───────────────────────────────────────────
//   1. Une surcharge appliquée AILLEURS qu'au mapping — dans un `.astro` qui lirait lui-même un
//      champ voisin. La doctrine d'A-04 l'interdit (« le repli est appliqué une seule fois, au
//      mapping, jamais dans les sept composants qui rendent un `alt` »), et c'est une DOCTRINE,
//      pas un mécanisme : rien n'empêche de l'enfreindre, et cette garde ne le verrait pas.
//   2. Le nœud `image` d'un champ `blocks` (`bloc.texte.contenu`, `bloc.encadre.contenu`) :
//      `RichTexte.astro` y lit l'`alternativeText` NATIF en clair, et un nœud de Blocks n'a
//      aucune fratrie où poser une surcharge. Trou connu d'A-04, ouvert et surveillé — il n'est
//      pas de son ressort, elle ne le comble pas et ne prétend pas le voir.
//   3. Ce qui TOURNE. Elle lit ce que l'arbre porte, pas ce qu'une instance Strapi exécute.
//
// ── LES TROIS CODES ───────────────────────────────────────────────────────────────────────
//   0 — les deux énumérations coïncident.
//   1 — DIVERGENCE nommée : nom sans mécanisme, ou mécanisme sans nom.
//   2 — INCAPACITÉ : répertoire de schémas absent, mapping illisible, forme d'argument non
//       reconnue, énumération vide, auto-test en échec. Ce n'est PAS un vert.
//
// USAGE : node outils/check-surcharges-alternative.js
// Recette : node outils/check-surcharges-alternative.recette.mjs — elle la prouve EN LA CASSANT.
//
// AUCUN PARAMÈTRE D'INJECTION : la racine se dérive de l'emplacement de CE fichier, et de rien
// d'autre. Une variable d'environnement qui la déplacerait n'existerait que pour la recette —
// laquelle jugerait alors un chemin que la production n'emprunte jamais. La recette recopie donc
// la garde dans son banc et la lance de là : c'est le MÊME chemin de résolution qui est exercé.

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const RACINE = path.join(__dirname, '..');

const SCHEMAS = 'apps/cms/src';
const MAPPING = 'apps/web/src/lib/strapi/mapping.ts';
const PREFIXE = /^alternative/i;
const TYPES_TEXTE = new Set(['string', 'text']);
/* Les deux seules portes par lesquelles une valeur remplace `Media.alternative`. Les nommer ici
   plutôt que de chercher « surcharge » dans le source : un commentaire n'est pas un appel. */
const APPELS = ['avecSurcharge', 'surchargerOptionnel'];

const divergences = [];

function incapacite(titre, ...details) {
  console.error(`INCAPACITÉ — ${titre}`);
  for (const d of details) console.error(`  ${d}`);
  console.error("  → rien n'a été constaté : ce n'est ni un vert ni un rouge.");
  process.exit(2);
}

/* L'énumération des schémas se fait sur le DISQUE, et elle est bornée aux deux formes que Strapi
   emploie. Un parcours large ramasserait `apps/cms/src/index.ts` et les extensions. */
function listerSchemas(racineSchemas) {
  const trouves = [];
  const marcher = (dir) => {
    let entrees;
    try { entrees = fs.readdirSync(dir, { withFileTypes: true }); }
    catch (e) { incapacite(`\`${path.relative(RACINE, dir)}\` est illisible.`, String(e.message).slice(0, 160)); }
    for (const e of entrees) {
      const complet = path.join(dir, e.name);
      if (e.isDirectory()) { marcher(complet); continue; }
      const relatif = path.relative(RACINE, complet).split(path.sep).join('/');
      if (/\/content-types\/[^/]+\/schema\.json$/.test(relatif) || /\/components\/[^/]+\/[^/]+\.json$/.test(relatif)) {
        trouves.push(relatif);
      }
    }
  };
  marcher(racineSchemas);
  return trouves.sort();
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// L'EXTRACTEUR — exercé par l'auto-test, et c'est LE MÊME code qui juge le dépôt.
//
// Il découpe l'argument de surcharge à la main plutôt qu'au motif global : l'appel imbrique
// `mediaRequis(brut, 'imageCouverture', chemin)` en premier argument, et un motif global y
// verrait un nom de champ qui n'est pas une surcharge. On équilibre donc les parenthèses, on
// coupe à la virgule de PREMIER NIVEAU, et on ne lit que ce qui suit.
// ─────────────────────────────────────────────────────────────────────────────────────────────
function extraireSurcharges(source) {
  const trouves = [];
  const illisibles = [];
  const relais = [];
  const lignes = source.split('\n');
  const ligneDe = (i) => source.slice(0, i).split('\n').length;

  for (const appel of APPELS) {
    const motif = new RegExp(`(?<![\\w.])${appel}\\s*\\(`, 'g');
    let m;
    while ((m = motif.exec(source)) !== null) {
      // La DÉFINITION de la fonction n'est pas un appel : `function avecSurcharge(media, …)`.
      const avant = source.slice(Math.max(0, m.index - 12), m.index);
      if (/function\s+$/.test(avant)) continue;

      let i = m.index + m[0].length;
      let profondeur = 1;
      let virgule = -1;
      let citation = null;
      for (; i < source.length && profondeur > 0; i++) {
        const c = source[i];
        if (citation) {
          if (c === '\\') { i++; continue; }
          if (c === citation) citation = null;
          continue;
        }
        if (c === "'" || c === '"' || c === '`') { citation = c; continue; }
        if (c === '(' || c === '[' || c === '{') profondeur++;
        else if (c === ')' || c === ']' || c === '}') profondeur--;
        else if (c === ',' && profondeur === 1 && virgule === -1) virgule = i;
      }
      if (profondeur !== 0 || virgule === -1) {
        illisibles.push({ ligne: ligneDe(m.index), texte: `${appel}( … ) — parenthèses non équilibrées ou argument unique` });
        continue;
      }
      const arg = source.slice(virgule + 1, i - 1).trim().replace(/,\s*$/, '').trim();

      // Forme 1 — l'appel direct : `texteOptionnel(brut, 'alternativeCouverture', chemin)`.
      const direct = arg.match(/^texteOptionnel\s*\(\s*[A-Za-z_$][\w$]*\s*,\s*'([^']+)'/);
      if (direct) { trouves.push({ champ: direct[1], ligne: ligneDe(virgule), forme: 'appel' }); continue; }

      if (/^[A-Za-z_$][\w$]*$/.test(arg)) {
        // Forme 2 — la VARIABLE : `const alternativeLogo = texteOptionnel(brut, 'alternativeLogo', …)`
        // puis `avecSurcharge(…, alternativeLogo)`. Une seule surcharge pour DEUX logos, et c'est
        // voulu (§3.8) : la garde doit savoir la suivre, sinon elle croit le champ non câblé.
        const decl = source.match(new RegExp(
          `(?:const|let|var)\\s+${arg}\\s*=\\s*texteOptionnel\\s*\\(\\s*[A-Za-z_$][\\w$]*\\s*,\\s*'([^']+)'`));
        if (decl) { trouves.push({ champ: decl[1], ligne: ligneDe(virgule), forme: 'variable' }); continue; }

        // Forme 3 — le RELAIS INTERNE : `surchargerOptionnel` délègue à `avecSurcharge(media,
        // surcharge)` en repassant SON PARAMÈTRE. Ce n'est pas un site de surcharge — aucun nom de
        // champ n'y est nommé —, et le compter en illisible arrêterait la garde sur le mapping réel.
        // La reconnaissance est structurelle : l'identifiant est déclaré PARAMÈTRE d'une fonction.
        if (new RegExp(`function\\s+[A-Za-z_$][\\w$]*\\s*\\([^)]*\\b${arg}\\s*[:,)]`).test(source)) {
          relais.push({ ligne: ligneDe(virgule), arg });
          continue;
        }
      }

      // Rien d'autre n'est reconnu — et on ne SAUTE PAS. Sauter ce qu'on n'a pas su lire, c'est
      // fabriquer exactement le trou que cette garde ferme.
      illisibles.push({ ligne: ligneDe(virgule), texte: `${appel}(…, ${arg.slice(0, 60).replace(/\s+/g, ' ')})` });
    }
  }
  return { trouves, illisibles, relais, lignes: lignes.length };
}

// ── AUTO-TEST — deux témoins écrits ici, passés dans l'extracteur RÉEL ───────────────────────
{
  const positif = [
    "const alternativeLogo = texteOptionnel(brut, 'alternativeLogo', chemin);",
    '  imageCouverture: avecSurcharge(',
    "    mediaRequis(brut, 'imageCouverture', chemin),",
    "    texteOptionnel(brut, 'alternativeCouverture', chemin),",
    '  ),',
    '  logo: avecSurcharge(mediaRequis(brut, "logo", chemin), alternativeLogo),',
    'function surchargerOptionnel(media: Media | null, surcharge: string | null): Media | null {',
    '  return media === null ? null : avecSurcharge(media, surcharge);',
    '}',
  ].join('\n');
  const negatif = [
    'function avecSurcharge(media: Media, surcharge: string | null): Media {',
    '  return surcharge === null ? media : { ...media, alternative: surcharge };',
    '}',
    "  favicon: mediaOptionnel(brut, 'favicon', chemin),",
    '  // avecSurcharge est cité dans ce commentaire sans être appelé.',
  ].join('\n');

  const p = extraireSurcharges(positif);
  const champsP = [...new Set(p.trouves.map((t) => t.champ))].sort();
  if (p.illisibles.length || champsP.join(',') !== 'alternativeCouverture,alternativeLogo' || p.relais.length !== 1) {
    incapacite("l'AUTO-TEST de l'extracteur a échoué sur le témoin POSITIF.",
      `attendu « alternativeCouverture,alternativeLogo » et 1 relais, obtenu « ${champsP.join(',')} » et ${p.relais.length} relais`,
      p.illisibles.length ? `et ${p.illisibles.length} forme(s) non reconnue(s)` : 'sans forme non reconnue',
      'La forme des appels de `mapping.ts` a-t-elle changé ? Un extracteur muet rendrait VERT.');
  }
  const n = extraireSurcharges(negatif);
  if (n.trouves.length || n.illisibles.length || n.relais.length) {
    incapacite("l'AUTO-TEST de l'extracteur a échoué sur le témoin NÉGATIF.",
      `${n.trouves.length} surcharge(s), ${n.illisibles.length} illisible(s) et ${n.relais.length} relais là où il n'y en a AUCUN`,
      'La définition de la fonction ou un simple `mediaOptionnel` se lit-il comme un appel ?');
  }
}

// ── 1. ÉNUMÉRATION A — le nommage, lu sur les schémas ────────────────────────────────────────
const racineSchemas = path.join(RACINE, ...SCHEMAS.split('/'));
if (!fs.existsSync(racineSchemas)) {
  incapacite(`\`${SCHEMAS}\` est introuvable sous \`${RACINE}\`.`,
    "C'est là que vit le modèle : sans lui, il n'y a rien à confronter.",
    'Lancer depuis la racine du dépôt : node outils/check-surcharges-alternative.js');
}

const fichiers = listerSchemas(racineSchemas);
if (fichiers.length === 0) {
  incapacite(`aucun fichier de schéma trouvé sous \`${SCHEMAS}\`.`,
    "Une énumération vide n'est pas une énumération : elle rendrait tout conforme.",
    'Le monorepo a-t-il déplacé ses applications ?');
}

const porteurDe = (fichier, schema) => {
  const mc = fichier.match(/\/components\/([^/]+)\/([^/]+)\.json$/);
  if (mc) return `${mc[1]}.${mc[2]}`;
  return (schema.info && (schema.info.singularName || schema.info.displayName))
    || (fichier.match(/\/content-types\/([^/]+)\//) || [])[1] || fichier;
};

const nommage = [];       // { qualifie, champ, type, fichier }
let nbAttributs = 0;
for (const f of fichiers) {
  let brut;
  try { brut = fs.readFileSync(path.join(RACINE, ...f.split('/')), 'utf8'); }
  catch (e) { incapacite(`\`${f}\` est illisible.`, String(e.message).slice(0, 160)); }
  let schema;
  try { schema = JSON.parse(brut); }
  catch (e) { incapacite(`\`${f}\` n'est pas du JSON valide.`, String(e.message).slice(0, 160)); }
  const porteur = porteurDe(f, schema);
  for (const [champ, def] of Object.entries(schema.attributes || {})) {
    nbAttributs++;
    if (!PREFIXE.test(champ)) continue;
    if (!TYPES_TEXTE.has(def && def.type)) {
      // Un `alternative*` qui n'est pas du texte n'est pas une surcharge — mais il n'est pas
      // ordinaire non plus. On le DIT plutôt que de le laisser filer en silence.
      divergences.push(`\`${porteur}.${champ}\` porte le préfixe \`alternative\` mais son type est \`${def && def.type}\`, pas du texte — ce n'est pas une surcharge, et le nom le fait croire`);
      continue;
    }
    nommage.push({ qualifie: `${porteur}.${champ}`, champ, type: def.type, fichier: f });
  }
}
if (nommage.length === 0) {
  incapacite(`aucun attribut \`alternative*\` trouvé sur ${fichiers.length} schéma(s).`,
    `${nbAttributs} attributs parcourus. Le modèle a-t-il été renommé en bloc, ou l'extraction est-elle cassée ?`);
}

// ── 2. ÉNUMÉRATION B — le mécanisme, lu sur le mapping ───────────────────────────────────────
let mapping;
try { mapping = fs.readFileSync(path.join(RACINE, ...MAPPING.split('/')), 'utf8'); }
catch (e) {
  incapacite(`\`${MAPPING}\` est illisible.`, String(e.message).slice(0, 160),
    "C'est LE fichier où la surcharge s'applique : sans lui, il n'y a pas de mécanisme à lire.");
}

const { trouves, illisibles, relais } = extraireSurcharges(mapping);
if (illisibles.length) {
  incapacite(`${illisibles.length} appel(s) de surcharge dont l'argument n'a pas été reconnu dans \`${MAPPING}\`.`,
    ...illisibles.map((x) => `l. ${x.ligne} : ${x.texte}`),
    "La garde ne saute JAMAIS ce qu'elle n'a pas su lire — un saut fabriquerait le trou qu'elle ferme.");
}
if (trouves.length === 0) {
  incapacite(`aucun appel à ${APPELS.map((a) => `\`${a}\``).join(' ni ')} dans \`${MAPPING}\`.`,
    "Le repli central d'A-04 a-t-il été déplacé ? Une énumération vide rendrait tout conforme.");
}

// ── 3. CONFRONTATION ─────────────────────────────────────────────────────────────────────────
// La comparaison porte sur les NOMS DE CHAMP. Ce n'est pas une approximation, c'est ce que les
// deux sources peuvent dire : `mapping.ts` connaît le nom du champ
// (`texteOptionnel(brut, 'alternativeHero', …)`), jamais le schéma qui le porte — deux schémas
// portent `alternativeHero`, deux autres portent `alternative`. Le compte, lui, s'affiche sur les
// ATTRIBUTS QUALIFIÉS, qui sont plus nombreux, et c'est normal.
const nomsA = new Set(nommage.map((x) => x.champ));
const nomsB = new Set(trouves.map((x) => x.champ));
const parNom = (n) => nommage.filter((x) => x.champ === n).map((x) => x.qualifie).join(', ');

console.log(`arbre jugé    : ${RACINE}`);
console.log(`A — nommage   : ${nommage.length} attribut(s) \`alternative*\` sur ${fichiers.length} schéma(s) (${nbAttributs} attributs au total)`);
for (const x of nommage.slice().sort((a, b) => a.qualifie.localeCompare(b.qualifie))) console.log(`    ${x.qualifie}  (${x.type})`);
console.log(`B — mécanisme : ${trouves.length} appel(s) de surcharge dans ${MAPPING}`);
for (const x of trouves.slice().sort((a, b) => a.ligne - b.ligne)) console.log(`    l. ${String(x.ligne).padStart(4)}  ${x.champ}  (${x.forme})`);
for (const x of relais) console.log(`    l. ${String(x.ligne).padStart(4)}  ⟨relais interne : \`${x.arg}\` est un paramètre, aucun champ nommé⟩`);

for (const n of nomsB) {
  if (!nomsA.has(n)) {
    divergences.push(`\`${n}\` est CÂBLÉ comme surcharge d'alternative dans ${MAPPING} et ne porte PAS le préfixe \`alternative\`.`
      + '\n              → il échappe à tout compte fait par le nom, donc à toute recherche par préfixe'
      + '\n              → c\'est EXACTEMENT le trou que cette garde ferme : le renommer en `alternative` + nom du média, ou assumer la déviation par écrit');
  }
}
for (const n of nomsA) {
  if (!nomsB.has(n)) {
    divergences.push(`\`${n}\` (${parNom(n)}) porte le nom d'une surcharge et n'est CÂBLÉ NULLE PART dans ${MAPPING}.`
      + '\n              → champ mort au modèle, ou surcharge posée au schéma et oubliée au mapping — dans les deux cas il ne surcharge RIEN');
  }
}

// ── 4. Verdict ───────────────────────────────────────────────────────────────────────────────
if (divergences.length) {
  console.error(`\nDIVERGENCE — ${divergences.length} écart(s) :`);
  for (const d of divergences) console.error(`  · ${d}`);
  process.exit(1);
}
console.log(`\nCONFORME — les ${nommage.length} attributs \`alternative*\` du modèle sont exactement les champs que `
  + `${MAPPING} applique en surcharge.`);
