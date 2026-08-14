/**
 * TOUT CHAMP ECRIT PAR LE SEED DOIT AVOIR UNE NATURE DECLAREE — et l'oubli se voit ICI.
 *
 * ── LE DEFAUT QUE CE TEST FERME, ET POURQUOI IL N'EST PAS CELUI QU'ON CROIT ─────────────────
 * `comparerCorps` reecrit par prudence tout champ dont la nature est inconnue (`difference.ts`).
 * Ce fail-safe est le BON choix et on n'y touche pas. Mais sa consequence est brutale : un seul
 * champ non declare fait REECRIRE les 69 entrees, et le webhook `publish_to_coolify` sort un
 * deploiement par publication — l'incident du 2026-08-10, 69 requetes et 26 deploiements en
 * serie, que le seed differentiel existe precisement pour empecher.
 *
 * L'en-tete de `NATURES` affirmait que « l'oubli se paie en bruit, jamais en silence », via
 * `seed-idempotence`. C'ETAIT TROP OPTIMISTE, et c'est la raison d'etre de ce fichier : le bruit
 * n'est arrive qu'APRES la fusion du 2026-08-14, sous la forme de six tests rouges de
 * `seed-difference` dont AUCUN ne nommait la cause. Le diagnostic a coute une enquete.
 *
 * ── CE QUE CELUI-CI FAIT DE PLUS ────────────────────────────────────────────────────────────
 * Il rougit A L'AJOUT DU CHAMP, pas six tests plus loin, et il NOMME le champ et la famille :
 *
 *     le seed ecrit « seo » sur dossier:en — aucune nature declaree
 *
 * Il ne relit pas le seed : il ecoute ce qu'il ECRIT reellement, sur le corpus REEL, via les
 * payloads que `FauxStrapi` journalise. Une liste de champs tenue a la main divergerait ; celle-ci
 * se derive de l'execution.
 *
 * ── LA DETTE QU'IL COUVRE AUSSI ─────────────────────────────────────────────────────────────
 * La descente est RECURSIVE : les blocs de la Dynamic Zone contre `NATURES_BLOCS`, et les
 * composants repetables contre leur `repete`. `NATURES_BLOCS` portait la meme dette que `NATURES`
 * — un bloc dont un champ n'est pas declare produit le meme silence.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { chargerCorpus } from '../scripts/seed/corpus.ts';
import { executerSeed, NATURES } from '../scripts/seed/seed.ts';
import { FauxStrapi, type Ecriture } from './fixtures/faux-strapi.ts';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const DATA_REEL = path.join(ICI, '..', 'data');

/**
 * De la collection ecrite vers la cle de `NATURES`.
 *
 * ⚠️ ELLE EST VOLONTAIREMENT EXHAUSTIVE ET SANS DEFAUT SILENCIEUX : une collection inconnue fait
 * ECHOUER le test au lieu d'etre ignoree. Sans cela, ajouter une famille au seed la ferait sortir
 * du champ de ce test sans que rien ne le dise — ce serait recreer, un etage plus haut, le silence
 * qu'on ferme ici.
 *
 * `article` n'a pas de suffixe de locale : le seed y ecrit les memes champs en FR et en EN.
 */
const CLE_NATURES: Record<string, (locale: string) => string> = {
  categories: (l) => `categorie:${l}`,
  tags: (l) => `tag:${l}`,
  auteurs: (l) => `auteur:${l}`,
  dossiers: (l) => `dossier:${l}`,
  articles: () => 'article',
  configuration: () => 'configuration',
};

/**
 * Les cles qui ne sont PAS des champs de contenu et n'ont donc pas de nature a declarer.
 * Chacune est nommee avec sa raison : une liste d'exemptions sans motif devient un tapis.
 */
const HORS_CHAMPS: Record<string, string> = {
  locale: 'la locale est un parametre de requete, pas un champ du modele',
  publishedAt: 'l etat de publication, ecrit par l ecluse — il ne se compare pas comme un contenu',
};

type Nature = any;

/** Descend un payload et rend la liste des champs ECRITS qui n'ont aucune nature declaree. */
function champsSansNature(data: Record<string, any>, natures: Nature, chemin: string): string[] {
  const manquants: string[] = [];
  if (!natures || typeof natures !== 'object') return manquants;

  for (const [champ, valeur] of Object.entries(data)) {
    if (champ in HORS_CHAMPS) continue;
    const nature = (natures as Record<string, Nature>)[champ];
    if (nature === undefined) {
      manquants.push(`${chemin}${champ}`);
      continue;
    }
    if (valeur == null) continue;

    // Dynamic Zone : chaque bloc porte son `__component`, qui doit exister dans NATURES_BLOCS.
    if (nature && typeof nature === 'object' && 'zone' in nature) {
      for (const bloc of Array.isArray(valeur) ? valeur : [valeur]) {
        if (!bloc || typeof bloc !== 'object') continue;
        const composant = (bloc as any).__component;
        const naturesBloc = (nature.zone as Record<string, Nature>)[composant];
        if (naturesBloc === undefined) {
          manquants.push(`${chemin}${champ}[__component=${composant}]`);
          continue;
        }
        const { __component, id, ...reste } = bloc as Record<string, any>;
        manquants.push(...champsSansNature(reste, naturesBloc, `${chemin}${champ}/${composant}.`));
      }
      continue;
    }

    // Composant repetable — ou unique, que `enTableau` enveloppe de la meme facon.
    if (nature && typeof nature === 'object' && 'repete' in nature) {
      for (const element of Array.isArray(valeur) ? valeur : [valeur]) {
        if (!element || typeof element !== 'object') continue;
        const { id, ...reste } = element as Record<string, any>;
        manquants.push(...champsSansNature(reste, nature.repete, `${chemin}${champ}.`));
      }
    }
  }
  return manquants;
}

/** Joue le seed une fois sur le corpus reel et rend tout ce qu'il a ecrit. */
async function ecrituresDuSeed(): Promise<Ecriture[]> {
  const corpus = chargerCorpus(DATA_REEL);
  const faux = new FauxStrapi();
  await executerSeed(faux, corpus);
  return faux.ecritures;
}

test('le seed n ecrit AUCUN champ dont la nature ne soit declaree', async () => {
  const ecritures = await ecrituresDuSeed();
  assert.ok(ecritures.length > 0, 'le seed doit ecrire quelque chose — sinon ce test ne juge rien');

  const inconnues = [...new Set(ecritures.map((e) => e.plural))].filter((p) => !(p in CLE_NATURES));
  assert.deepEqual(
    inconnues,
    [],
    `collection(s) ecrite(s) que ce test ne sait pas rattacher a NATURES : ${inconnues.join(', ')}. `
      + 'Ajoute-la a CLE_NATURES — sans quoi elle sortirait du champ de ce test en silence.'
  );

  const manquants = new Set<string>();
  for (const e of ecritures) {
    const cle = CLE_NATURES[e.plural](e.locale);
    const natures = NATURES[cle];
    assert.ok(natures, `NATURES ne porte aucune entree « ${cle} », que le seed ecrit pourtant`);
    for (const champ of champsSansNature(e.data, natures, '')) {
      manquants.add(`le seed ecrit « ${champ} » sur ${cle} — aucune nature declaree`);
    }
  }

  assert.deepEqual(
    [...manquants].sort(),
    [],
    'Un champ ecrit sans nature declaree fait REECRIRE toutes les entrees a chaque passe '
      + '(fail-safe de `comparerCorps`), donc un deploiement par publication. '
      + 'Declare-le dans NATURES / NATURES_BLOCS de `scripts/seed/seed.ts`.'
  );
});

test('ce test regarde bien TOUTES les familles ecrites, et pas seulement les articles', async () => {
  // Une garde qui ne verrait qu'une famille rendrait vert sur l'oubli des six autres.
  const ecritures = await ecrituresDuSeed();
  const cles = new Set(ecritures.map((e) => CLE_NATURES[e.plural]?.(e.locale)).filter(Boolean));
  for (const attendue of ['article', 'categorie:fr', 'categorie:en', 'dossier:fr', 'dossier:en', 'auteur:fr', 'tag:fr']) {
    assert.ok(cles.has(attendue), `aucune ecriture observee sur « ${attendue} » : le corpus ou le seed a change`);
  }
});
