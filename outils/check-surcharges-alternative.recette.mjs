#!/usr/bin/env node
// Recette de `outils/check-surcharges-alternative.js` — elle prouve la garde EN LA CASSANT.
//
// POURQUOI ELLE EXISTE. La garde qu'elle éprouve remplace une CONVENTION DE NOMMAGE par une
// confrontation de deux énumérations. Non prouvée, elle ne serait qu'une convention de plus —
// et celle qu'elle remplace était écrite noir sur blanc dans l'encadré du §6.5 du plan éditorial
// (« énumérer les attributs dont le nom commence par `alternative` ») sans que rien ne puisse
// dire qu'elle avait cessé de tout mesurer. Cf. [[un-controle-se-prouve-en-cassant-ce-qu-il-protege]].
//
// CE QUE CHAQUE CAS FERME :
//   1      le modèle cohérent → CONFORME. Il exerce d'emblée les DEUX formes d'argument que le
//          mapping réel emploie — l'appel direct ET la variable partagée par deux médias — et le
//          RELAIS INTERNE, qui ne nomme aucun champ et ne doit compter pour rien.
//   2      LE CAS EXIGÉ : une surcharge câblée SANS le préfixe. C'est le trou nommé par la tâche
//          `ac696998`, celui qu'aucun compte par le nom ne pouvait voir.
//   3      le sens inverse : un nom `alternative*` que rien ne câble — champ mort au modèle.
//   4      un `alternative*` d'un type qui n'est pas du texte : le nom promet une surcharge,
//          l'attribut n'en est pas une, et la garde le DIT au lieu de le compter.
//   5, 6   énumération vide d'un côté ou de l'autre → INCAPACITÉ, jamais un vert par absence de
//          matière ([[quand-succes-et-echec-rendent-la-meme-sortie]]).
//   7      UNE FORME D'ARGUMENT NON RECONNUE → INCAPACITÉ. La garde ne saute JAMAIS ce qu'elle
//          n'a pas su lire : sauter, ici, c'est fabriquer le trou qu'elle ferme.
//   8      L'AUTO-TEST, éprouvé en DÉSARMANT l'extracteur dans la copie de la garde. C'est le
//          témoin de mutisme : un extracteur qui ne reconnaît plus rien rendrait VERT sans lui
//          ([[parseur-de-prose-echoue-en-silence]]).
//   9, 10  les deux fichiers dont la garde a besoin, retirés un par un → INCAPACITÉ. Ils
//          remplacent les cas « dépôt de code absent » et « fetch impossible » de la version
//          documentation : depuis que la garde lit SON PROPRE arbre, ces deux causes-là
//          n'existent plus, et il serait malhonnête de garder des cas qui ne peuvent plus tomber.
//
// MÉTHODE. Chaque cas construit une arborescence jetable — les schémas, le mapping, et une COPIE
// DE LA GARDE dans son `outils/` —, y introduit UNE perturbation, lance la garde DEPUIS CE BANC
// et lit son CODE DE SORTIE et sa sortie. La garde est lancée depuis le banc, et non pointée
// dessus par une variable d'environnement : c'est le MÊME chemin de résolution de racine qu'en
// production qui est exercé, pas une porte ouverte pour les tests
// ([[parametre-d-injection-de-test-masque-le-chemin-de-production]]).
//
// AUCUN GIT, AUCUN RÉSEAU. La version documentation clonait un amont local pour exercer son
// `git fetch` ; la garde n'en fait plus, le banc n'en a donc plus besoin.
//
// CE QU'ELLE NE PROUVE PAS, et que la garde seule prouve : que le VRAI modèle et le VRAI mapping
// coïncident — c'est l'objet de `node outils/check-surcharges-alternative.js`. Le modèle fabriqué
// ici est volontairement petit ; ce qui est éprouvé est le MÉCANISME de confrontation, pas le
// contenu du modèle.
//
// LE RETRAIT DES BANCS EST DANS UN `finally`, ET SOUS UN FILET `exit`. Un retrait écrit à la
// dernière ligne d'un cas ne tourne pas le jour où le cas casse avant — c'est-à-dire le seul jour
// où il compte ([[un-cas-qui-echoue-ne-remet-pas-son-banc-a-neuf]]). Le banc d'un cas EN ÉCHEC est
// CONSERVÉ et son chemin imprimé : c'est la seule matière qui explique le rouge.
//
// Usage : node outils/check-surcharges-alternative.recette.mjs   (rend 0 au vert)

import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ICI = dirname(fileURLToPath(import.meta.url));
const GARDE = 'outils/check-surcharges-alternative.js';

/* Le nom d'un banc appartient à SA course : le PID, l'instant de départ, le rang du banc. Deux
   exécutions concurrentes ne peuvent pas se disputer un nom, et un reliquat se rattache au
   processus qui l'a laissé. Même forme que `outils/bac-jetable.mjs`, qui ne sert qu'aux fichiers
   `node:test` — une recette linéaire n'a ni `after()` ni `afterEach()`. */
const COURSE = `${process.pid}-${Date.now().toString(36)}`;
let rang = 0;
const bancs = [];   // { chemin, garder: string|null }

function ouvrirBanc() {
  const gabarit = join(tmpdir(), `recette-surcharges-alt-${COURSE}-${String(++rang).padStart(3, '0')}-`);
  let d;
  try { d = mkdtempSync(gabarit); }
  catch (e) {
    throw new Error(`BANC NON CRÉÉ — mkdtemp(\`${gabarit}*\`) a échoué : ${e.code || ''} ${String(e.message).split('\n')[0]}`
      + "\n→ le banc d'essai n'a pas été monté ; ce cas ne dit RIEN de ce qu'il juge.");
  }
  bancs.push({ chemin: d, garder: null });
  return d;
}

/* ⚠️ PÉRIMÈTRE DE LA SUPPRESSION, non négociable : uniquement les chemins que CETTE course a
   créés et retenus. Jamais un balayage par motif sur le répertoire temporaire — il est celui de
   l'utilisateur, et il porte les fichiers de tout ce qui tourne sur ce poste. */
function refermerLesBancs() {
  const restants = [];
  const gardes = [];
  while (bancs.length) {
    const b = bancs.shift();
    if (b.garder) { gardes.push(`${b.chemin}  (${b.garder})`); continue; }
    try { rmSync(b.chemin, { recursive: true, force: true, maxRetries: 5, retryDelay: 120 }); }
    catch (e) { restants.push(`${b.chemin}  (${e.code || ''} ${String(e.message).split('\n')[0]})`); }
  }
  if (gardes.length) {
    console.log(`\n  CONSERVÉS À DESSEIN (${gardes.length}) — le banc des cas fautifs, pour le diagnostic :`);
    for (const g of gardes) console.log(`      ${g}`);
    console.log('        → à effacer une fois le rouge compris.');
  }
  if (restants.length) {
    console.log(`\n  ECHEC nettoyage — ${restants.length} banc(s) n'ont pas pu être effacés :`);
    for (const r of restants) console.log(`      ${r}`);
    console.log("        → ce n'est pas un défaut de ce qui est jugé ; c'est le banc qui laisse des");
    console.log('          traces, et un banc qui laisse des traces finit par juger sur celles des autres.');
  }
}
/* Le filet : `process.exit()` ne déroule aucun `finally`. */
process.on('exit', refermerLesBancs);

// ── LE MODÈLE FABRIQUÉ ───────────────────────────────────────────────────────────────────────
// Trois surcharges, trois formes de porteur : une collection, un component de bloc, un single
// type dont UNE surcharge sert DEUX médias par une variable. C'est la forme du modèle réel en
// petit, pas une simplification commode : chaque cas ci-dessous perturbe une de ces formes.
const schemaArticle = (extra = {}) => JSON.stringify({
  kind: 'collectionType',
  info: { singularName: 'article', pluralName: 'articles', displayName: 'Article' },
  attributes: {
    titre: { type: 'string' },
    imageCouverture: { type: 'media' },
    legendeCouverture: { type: 'string' },
    alternativeCouverture: { type: 'string' },
    ...extra,
  },
}, null, 2);

const schemaConfiguration = () => JSON.stringify({
  kind: 'singleType',
  info: { singularName: 'configuration', displayName: 'Configuration' },
  attributes: {
    logo: { type: 'media' },
    logoSombre: { type: 'media' },
    favicon: { type: 'media' },
    alternativeLogo: { type: 'string' },
  },
}, null, 2);

const componentImageLegendee = () => JSON.stringify({
  collectionName: 'components_bloc_image_legendees',
  info: { displayName: 'image-legendee' },
  attributes: {
    image: { type: 'media' },
    legende: { type: 'string' },
    alternative: { type: 'string' },
    credit: { type: 'string' },
  },
}, null, 2);

// Le mapping fabriqué. Il porte les TROIS formes que l'extracteur doit distinguer :
// l'appel direct, la variable, et le relais interne d'un paramètre.
const MAPPING_NOMINAL = `
function avecSurcharge(media: Media, surcharge: string | null): Media {
  return surcharge === null ? media : { ...media, alternative: surcharge };
}

function surchargerOptionnel(media: Media | null, surcharge: string | null): Media | null {
  return media === null ? null : avecSurcharge(media, surcharge);
}

export function mapperArticle(brut: unknown): Article {
  const chemin = 'article';
  return {
    titre: texteRequis(brut, 'titre', chemin),
    imageCouverture: avecSurcharge(
      mediaRequis(brut, 'imageCouverture', chemin),
      texteOptionnel(brut, 'alternativeCouverture', chemin),
    ),
    legendeCouverture: texteOptionnel(brut, 'legendeCouverture', chemin),
  };
}

function bloc(brut: unknown, chemin: string) {
  switch (composant(brut, chemin)) {
    case 'bloc.image-legendee':
      return {
        type: 'bloc.image-legendee',
        image: avecSurcharge(
          mediaRequis(brut, 'image', chemin),
          texteOptionnel(brut, 'alternative', chemin),
        ),
        legende: texteOptionnel(brut, 'legende', chemin),
      };
  }
}

export function mapperConfiguration(brut: unknown): Configuration {
  const chemin = 'configuration';
  const alternativeLogo = texteOptionnel(brut, 'alternativeLogo', chemin);
  return {
    logo: avecSurcharge(mediaRequis(brut, 'logo', chemin), alternativeLogo),
    logoSombre: surchargerOptionnel(mediaOptionnel(brut, 'logoSombre', chemin), alternativeLogo),
    favicon: mediaOptionnel(brut, 'favicon', chemin),
  };
}
`;

const CHEMIN_ARTICLE = 'apps/cms/src/api/article/content-types/article/schema.json';
const CHEMIN_CONFIG = 'apps/cms/src/api/configuration/content-types/configuration/schema.json';
const CHEMIN_COMPONENT = 'apps/cms/src/components/bloc/image-legendee.json';
const CHEMIN_MAPPING = 'apps/web/src/lib/strapi/mapping.ts';

const ecrire = (racine, relatif, contenu) => {
  mkdirSync(join(racine, dirname(relatif)), { recursive: true });
  writeFileSync(join(racine, relatif), contenu);
};

function banc({ mapping = MAPPING_NOMINAL, article = schemaArticle(), gardeMutee = null } = {}) {
  const d = ouvrirBanc();
  ecrire(d, CHEMIN_ARTICLE, article);
  ecrire(d, CHEMIN_CONFIG, schemaConfiguration());
  ecrire(d, CHEMIN_COMPONENT, componentImageLegendee());
  ecrire(d, CHEMIN_MAPPING, mapping);
  mkdirSync(join(d, 'outils'), { recursive: true });
  const source = join(ICI, 'check-surcharges-alternative.js');
  if (gardeMutee) writeFileSync(join(d, GARDE), gardeMutee(readFileSync(source, 'utf8')));
  else copyFileSync(source, join(d, GARDE));
  return d;
}

function lancer(d) {
  try {
    return { code: 0, sortie: execFileSync(process.execPath, [join(d, GARDE)], { cwd: d, encoding: 'utf8', stdio: 'pipe' }) };
  } catch (e) {
    return { code: e.status ?? 1, sortie: (e.stdout || '') + (e.stderr || '') };
  }
}

let echecs = 0;
function cas(nom, attendu, motifs, fn, opts) {
  let r;
  let banque = null;
  try {
    banque = banc(opts);
    if (fn) fn(banque);
    r = lancer(banque);
  } catch (e) {
    r = { code: 'exception', sortie: String(e.stack || e) };
  }
  const codeOk = r.code === attendu;
  const manquants = (motifs || []).filter((m) => !new RegExp(m).test(r.sortie));
  if (codeOk && manquants.length === 0) {
    console.log(`  OK    ${nom}`);
    return;
  }
  echecs++;
  /* Le banc du cas fautif est CONSERVÉ : c'est l'arborescence exacte sur laquelle l'assertion a
     été lue, et un nettoyage qui l'emporte emporte la seule matière qui explique le rouge. */
  for (const b of bancs) if (b.chemin === banque && !b.garder) b.garder = `cas en échec : ${nom}`;
  console.error(`  ECHEC ${nom}`);
  console.error(`        code attendu ${attendu}, obtenu ${r.code}`);
  for (const m of manquants) console.error(`        motif attendu /${m}/ absent de la sortie`);
  console.error('        ' + String(r.sortie).trim().split('\n').join('\n        '));
}

console.log('Recette de la garde des surcharges d alternative (outils/check-surcharges-alternative.js)\n');

// ── 1 ── Le modèle cohérent. Il exerce d'emblée les trois formes : appel, variable, relais.
cas('1. modèle cohérent (appel + variable + relais) → CONFORME', 0,
  ['CONFORME', 'A — nommage   : 3', 'variable', 'relais interne'], null);

// ── 2 ── LE CAS EXIGÉ. Un champ qui fait le travail d'une surcharge sous un autre nom : invisible
// à tout compte par le préfixe, y compris à celui que le plan éditorial portait jusqu'au 2026-08-22.
cas('2. surcharge câblée SANS le préfixe → DIVERGENCE, le champ nommé', 1,
  ['DIVERGENCE', 'texteFavicon', 'ne porte PAS le préfixe'],
  (d) => ecrire(d, CHEMIN_MAPPING, MAPPING_NOMINAL.replace(
    "    favicon: mediaOptionnel(brut, 'favicon', chemin),",
    "    favicon: surchargerOptionnel(mediaOptionnel(brut, 'favicon', chemin), texteOptionnel(brut, 'texteFavicon', chemin)),")));

// ── 3 ── Le sens inverse : le nom promet une surcharge, rien ne la câble. Le champ ne surcharge RIEN.
cas('3. attribut `alternative*` câblé nulle part → DIVERGENCE, « CÂBLÉ NULLE PART »', 1,
  ['DIVERGENCE', 'alternativePortrait', 'NULLE PART'],
  (d) => ecrire(d, CHEMIN_ARTICLE, schemaArticle({ alternativePortrait: { type: 'string' } })));

// ── 4 ── Le nom promet une surcharge, le type dit autre chose. Ni surcharge, ni silence.
cas("4. `alternative*` d'un type non textuel → DIVERGENCE, le type nommé", 1,
  ['DIVERGENCE', 'alternativeActive', 'boolean'],
  (d) => ecrire(d, CHEMIN_ARTICLE, schemaArticle({ alternativeActive: { type: 'boolean' } })));

// ── 5 ── Un mapping sans le moindre appel : rien à confronter. Un vert y serait un vert par
// absence de matière — celui que ces dépôts traquent partout.
cas('5. aucun appel de surcharge dans le mapping → INCAPACIT(2)', 2,
  ['INCAPACIT', 'avecSurcharge'], null,
  { mapping: 'export function mapperArticle(brut: unknown) { return { titre: texteRequis(brut, "titre", "a") }; }\n' });

// ── 6 ── Le même vide de l'autre côté : plus aucun attribut préfixé au modèle. Le retrait passe
// par le MODÈLE, pas par un motif de texte : une substitution ratée laisserait des attributs en
// place et ferait passer ce cas pour une divergence — il serait alors éprouvé par autre chose
// que ce qu'il annonce.
cas('6. aucun attribut `alternative*` au modèle → INCAPACIT(2)', 2,
  ['INCAPACIT', 'alternative'],
  (d) => {
    for (const f of [CHEMIN_ARTICLE, CHEMIN_CONFIG, CHEMIN_COMPONENT]) {
      const j = JSON.parse(readFileSync(join(d, f), 'utf8'));
      for (const k of Object.keys(j.attributes)) if (/^alternative/i.test(k)) delete j.attributes[k];
      writeFileSync(join(d, f), JSON.stringify(j, null, 2));
    }
  });

// ── 7 ── LA FORME NON RECONNUE. Une garde qui saute ce qu'elle ne sait pas lire rend un vert
// amputé — c'est-à-dire le trou de la tâche, réintroduit par la porte de derrière.
cas("7. argument de surcharge d'une forme inconnue → INCAPACIT(2), la ligne citée", 2,
  ['INCAPACIT', "n'a pas été reconnu", 'l\\. \\d+'],
  (d) => ecrire(d, CHEMIN_MAPPING, MAPPING_NOMINAL.replace(
    "      texteOptionnel(brut, 'alternativeCouverture', chemin),",
    '      brut?.meta?.alt ?? null,')));

// ── 8 ── LE TÉMOIN DE MUTISME. On DÉSARME l'extracteur dans la copie de la garde : sans auto-test,
// elle ne trouverait plus aucun appel et rendrait un verdict sur du vide.
cas('8. extracteur désarmé dans la garde → INCAPACIT(2) par AUTO-TEST, jamais un vert', 2,
  ['INCAPACIT', 'AUTO-TEST'], null,
  { gardeMutee: (s) => s.replace(
    "const APPELS = ['avecSurcharge', 'surchargerOptionnel'];",
    "const APPELS = ['appelQuiNExistePas'];") });

// ── 9 ── Le mapping retiré : c'est LE fichier où la surcharge s'applique. Sans lui, il n'y a pas
// de mécanisme à lire — et surtout pas un modèle « conforme » à personne.
cas('9. mapping.ts absent → INCAPACIT(2), le fichier nommé', 2,
  ['INCAPACIT', 'mapping\\.ts'],
  (d) => rmSync(join(d, CHEMIN_MAPPING), { force: true }));

// ── 10 ── L'autre moitié retirée : plus de schémas du tout. C'est le cas qui remplace « dépôt de
// code absent » — la garde lit son propre arbre, et un arbre amputé ne rend pas un vert.
cas('10. répertoire des schémas absent → INCAPACIT(2), le chemin nommé', 2,
  ['INCAPACIT', 'apps/cms/src'],
  (d) => rmSync(join(d, 'apps', 'cms'), { recursive: true, force: true }));

console.log(`\n${echecs === 0 ? 'RECETTE VERTE' : `RECETTE ROUGE — ${echecs} cas en échec`}`);
process.exit(echecs === 0 ? 0 : 1);
