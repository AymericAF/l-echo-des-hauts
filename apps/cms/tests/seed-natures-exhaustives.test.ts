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
import fs from 'node:fs';
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

/**
 * L ANGLE MORT DU TEST CI-DESSUS, ferme ici — ajoute le 2026-08-17 (tache `ff62eb9b`,
 * decision `5ca1ca4b`).
 *
 * Le test precedent ecoute ce que le seed ECRIT sur le corpus REEL. Il ne peut donc rien
 * dire d un bloc que le corpus ne porte pas : `bloc.video` n a plus AUCUN porteur depuis
 * l avenant A5 du 2026-08-10. Son champ `alternativeVignette` a pu etre ajoute au schema,
 * au mapping, au populate et au seed sans qu une seule ligne de test ne rougisse a l oubli
 * de sa nature — et cet oubli aurait fait REECRIRE les 69 entrees le jour ou un bloc video
 * revient au corpus, donc un deploiement par publication.
 *
 * Celui-ci ne regarde pas la donnee : il confronte `NATURES_BLOCS` aux SCHEMAS. Un attribut
 * declare dans `src/components/bloc/*.json` et absent des natures est nomme, qu il ait un
 * porteur ou non. Meme question, posee la ou l absence de donnee ne peut pas la faire taire.
 */
/**
 * LA DESCENTE SUIT LES COMPOSANTS IMBRIQUES (ajout du 2026-08-19).
 *
 * Elle s arretait au bord de la Dynamic Zone : un component imbrique (`bloc.chiffre-entree`,
 * et depuis le 2026-08-19 `bloc.image-galerie`) etait purement et simplement SAUTE, au motif
 * que le test precedent le couvre par sa descente recursive. Ce motif etait faux de la meme
 * facon que celui qui a rendu ce fichier necessaire : le test precedent ecoute ce que le seed
 * ECRIT sur le corpus REEL — il ne voit donc pas `bloc.image-galerie.alternative`, dont les
 * 22 images de galerie sont toutes `decoratif: true` et n en portent aucune. Le champ pouvait
 * arriver au schema, au corpus et au mapping sans qu une ligne rougisse a l oubli de sa
 * nature. C est exactement le trou que `bloc.video.alternativeVignette` avait ouvert.
 *
 * On resout donc le component cite par un `repete` contre SON schema, recursivement.
 */
function manquantsDe(
  natures: Record<string, any>,
  schema: any,
  prefixe: string,
  lireComposant: (uid: string) => any,
  manquants: string[],
): void {
  for (const [attribut, definition] of Object.entries<any>(schema.attributes ?? {})) {
    const nature = natures[attribut];
    if (nature === undefined) {
      manquants.push(`${prefixe}.${attribut}`);
      continue;
    }
    /* Un attribut `component` dont la nature est un `repete` : on descend dans le schema du
       component cite. Un `repete` pose sur autre chose qu un component ne descend pas — il
       n y a rien a lire. */
    if (definition?.type === 'component' && typeof nature === 'object' && nature.repete) {
      const imbrique = lireComposant(definition.component);
      if (imbrique !== null) {
        manquantsDe(nature.repete, imbrique, definition.component, lireComposant, manquants);
      }
    }
  }
}

test('CHAQUE attribut de CHAQUE bloc du modele a une nature declaree — meme sans porteur au corpus', () => {
  const naturesBlocs = (NATURES.article as any).contenu.zone as Record<string, any>;
  const racineComposants = path.join(ICI, '..', 'src', 'components');
  const dossier = path.join(racineComposants, 'bloc');

  const lireComposant = (uid: string) => {
    const [categorie, nom] = uid.split('.');
    const chemin = path.join(racineComposants, categorie, `${nom}.json`);
    return fs.existsSync(chemin) ? JSON.parse(fs.readFileSync(chemin, 'utf8')) : null;
  };

  const manquants: string[] = [];
  const vus = new Set<string>();
  for (const fichier of fs.readdirSync(dossier).filter((f) => f.endsWith('.json'))) {
    const composant = `bloc.${fichier.replace(/\.json$/, '')}`;
    const natures = naturesBlocs[composant];
    /* Les composants IMBRIQUES ne sont pas des blocs de la dynamic zone : ils n ont pas
       d entree propre dans NATURES_BLOCS. Ils sont visites par la descente ci-dessous,
       depuis le `repete` du bloc qui les porte — et si AUCUN bloc ne les porte, la garde
       suivante le dit. */
    if (natures === undefined) continue;
    vus.add(composant);
    manquantsDe(natures, JSON.parse(fs.readFileSync(path.join(dossier, fichier), 'utf8')), composant, (uid) => {
      vus.add(uid);
      return lireComposant(uid);
    }, manquants);
  }

  assert.deepEqual(
    manquants.sort(),
    [],
    'ces attributs existent au schema et n ont aucune nature dans NATURES_BLOCS. '
      + 'Le corpus ne les porte peut-etre pas AUJOURD HUI ; le jour ou il les portera, '
      + '`comparerCorps` les traitera en nature inconnue et REECRIRA toutes les entrees.'
  );

  /* PREUVE QUE LA DESCENTE A REELLEMENT EU LIEU. Sans cette ligne, la garde ci-dessus
     resterait verte si la descente cessait de descendre — succes et echec rendraient la
     meme sortie (une liste vide). */
  assert.deepEqual(
    [...vus].sort(),
    [
      'bloc.chiffre-entree',
      'bloc.chiffres-cles',
      'bloc.citation',
      'bloc.encadre',
      'bloc.galerie',
      'bloc.image-galerie',
      'bloc.image-legendee',
      'bloc.separateur',
      'bloc.texte',
      'bloc.video',
    ],
    'la descente doit atteindre les deux components IMBRIQUES, pas seulement les 8 blocs'
  );
});

test('PREUVE EN CASSANT — un champ de component IMBRIQUE sans nature est bien VU', () => {
  /* Le mode d echec exact que la descente du 2026-08-19 ferme : `bloc.image-galerie`
     n a aucun porteur au corpus (ses 22 images sont `decoratif: true`), donc le test qui
     ecoute les ecritures reelles ne peut rien en dire. On retire ici la nature de son
     `alternative` et on exige que la garde la NOMME. */
  const naturesBlocs = (NATURES.article as any).contenu.zone as Record<string, any>;
  const galerie = JSON.parse(
    fs.readFileSync(path.join(ICI, '..', 'src', 'components', 'bloc', 'galerie.json'), 'utf8')
  );
  const imageGalerie = JSON.parse(
    fs.readFileSync(path.join(ICI, '..', 'src', 'components', 'bloc', 'image-galerie.json'), 'utf8')
  );

  const naturesAmputees = {
    ...naturesBlocs['bloc.galerie'],
    images: { repete: { image: 'media' } },
  };

  const manquants: string[] = [];
  manquantsDe(
    naturesAmputees,
    galerie,
    'bloc.galerie',
    (uid) => (uid === 'bloc.image-galerie' ? imageGalerie : null),
    manquants,
  );

  assert.deepEqual(manquants, ['bloc.image-galerie.alternative']);
});

test('ce test regarde bien TOUTES les familles ecrites, et pas seulement les articles', async () => {
  // Une garde qui ne verrait qu'une famille rendrait vert sur l'oubli des six autres.
  const ecritures = await ecrituresDuSeed();
  const cles = new Set(ecritures.map((e) => CLE_NATURES[e.plural]?.(e.locale)).filter(Boolean));
  for (const attendue of ['article', 'categorie:fr', 'categorie:en', 'dossier:fr', 'dossier:en', 'auteur:fr', 'tag:fr']) {
    assert.ok(cles.has(attendue), `aucune ecriture observee sur « ${attendue} » : le corpus ou le seed a change`);
  }
});

/**
 * LE MEME TRAVAIL, MAIS SUR TOUS LES COMPOSANTS — PAS SEULEMENT `bloc/` (ajout du 2026-08-19).
 *
 * La garde ci-dessus lit `src/components/bloc/` et RIEN D AUTRE. Tout composant range
 * ailleurs lui echappait, et c est exactement par la que `partage.seo` est passe : son
 * `alternativePartage` a pu manquer au seed ET a `NATURE_SEO` sans qu une ligne rougisse,
 * parce que le test qui ecoute les ecritures reelles ne voit pas un champ jamais ecrit, et
 * que le test structurel ne regardait pas ce dossier. Le correctif du 2026-08-17 a ferme le
 * trou POUR CE COMPOSANT, par un test dedie ; il ne l a pas ferme POUR LA CLASSE.
 *
 * Celui-ci descend depuis les SCHEMAS des content-types, jamais depuis la donnee — c est ce
 * qui le rend insensible au fait que le corpus n exerce qu une partie des champs. Lire la
 * donnee ici recreerait le trou qu on ferme.
 *
 * ⚠️ Il ne juge PAS l exhaustivite des attributs SCALAIRES d un content-type : `categorie:en`
 * n ecrit legitimement ni `couleurAccent` ni `ordreAffichage`, qui ne sont pas localises.
 * Un attribut de type `component`/`dynamiczone` sans nature sur une locale se lit de la meme
 * facon (`auteur:en` n ecrit pas `reseaux`) — on ne le compte donc pas manquant, mais
 * l assertion de visite en fin de test refuse qu un composant finisse SANS AUCUN chemin.
 */
const CONTENT_TYPES: Record<string, string> = {
  'categorie:fr': 'categorie',
  'categorie:en': 'categorie',
  'tag:fr': 'tag',
  'tag:en': 'tag',
  'auteur:fr': 'auteur',
  'auteur:en': 'auteur',
  'dossier:fr': 'dossier',
  'dossier:en': 'dossier',
  configuration: 'configuration',
  article: 'article',
};

test('CHAQUE attribut de CHAQUE composant du modele a une nature declaree — bloc/ ET tout le reste', () => {
  const racineCms = path.join(ICI, '..');
  const racineComposants = path.join(racineCms, 'src', 'components');

  const lireComposant = (uid: string) => {
    const [categorie, nom] = uid.split('.');
    const chemin = path.join(racineComposants, categorie, `${nom}.json`);
    return fs.existsSync(chemin) ? JSON.parse(fs.readFileSync(chemin, 'utf8')) : null;
  };

  /* Tous les composants du modele, DERIVES du disque — pas une liste tenue a la main, qui
     divergerait le jour ou un dossier de composants apparait. */
  const tousLesComposants = fs
    .readdirSync(racineComposants, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .flatMap((d) =>
      fs
        .readdirSync(path.join(racineComposants, d.name))
        .filter((f) => f.endsWith('.json'))
        .map((f) => `${d.name}.${f.replace(/\.json$/, '')}`)
    )
    .sort();

  /* Et tous les content-types, DERIVES du disque eux aussi : un content-type neuf que
     `CONTENT_TYPES` ne rattache a aucune nature sortirait sinon du champ de ce test en
     silence — le mode d echec que ce fichier existe pour fermer. */
  const racineApi = path.join(racineCms, 'src', 'api');
  const tousLesTypes = fs
    .readdirSync(racineApi, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
  assert.deepEqual(
    [...new Set(Object.values(CONTENT_TYPES))].sort(),
    tousLesTypes,
    'CONTENT_TYPES doit couvrir EXACTEMENT les content-types du depot — sinon un modele neuf '
      + 'n est confronte a aucune nature, sans que rien ne le dise.'
  );

  const manquants: string[] = [];
  const vus = new Set<string>();

  for (const [cle, natures] of Object.entries(NATURES)) {
    const type = CONTENT_TYPES[cle];
    assert.ok(type, `NATURES porte « ${cle} », que CONTENT_TYPES ne rattache a aucun content-type`);
    const schema = JSON.parse(
      fs.readFileSync(path.join(racineApi, type, 'content-types', type, 'schema.json'), 'utf8')
    );

    for (const [attribut, definition] of Object.entries<any>(schema.attributes ?? {})) {
      const nature = (natures as Record<string, any>)[attribut];

      if (definition?.type === 'dynamiczone') {
        if (nature === undefined) continue; // cette locale n ecrit pas la zone
        assert.ok(nature.zone, `« ${cle}.${attribut} » est une dynamic zone : sa nature doit porter \`zone\``);
        for (const uid of definition.components ?? []) {
          const naturesBloc = (nature.zone as Record<string, any>)[uid];
          if (naturesBloc === undefined) {
            manquants.push(`${cle}.${attribut}[${uid}]`);
            continue;
          }
          const imbrique = lireComposant(uid);
          assert.ok(imbrique, `le schema du composant « ${uid} », cite par ${cle}.${attribut}, est introuvable`);
          vus.add(uid);
          manquantsDe(naturesBloc, imbrique, uid, (u) => { vus.add(u); return lireComposant(u); }, manquants);
        }
        continue;
      }

      if (definition?.type === 'component') {
        if (nature === undefined) continue; // cette locale n ecrit pas ce composant
        assert.ok(
          nature.repete,
          `« ${cle}.${attribut} » est un composant : sa nature doit porter \`repete\` (`
            + '`enTableau` enveloppe le cas unique de la meme facon)'
        );
        const imbrique = lireComposant(definition.component);
        assert.ok(imbrique, `le schema du composant « ${definition.component} » est introuvable`);
        vus.add(definition.component);
        manquantsDe(nature.repete, imbrique, definition.component, (u) => { vus.add(u); return lireComposant(u); }, manquants);
      }
    }
  }

  /* Un meme composant est cite par plusieurs racines (`partage.seo` l est par cinq) : sans
     ce dedoublonnage, un seul oubli sortirait cinq fois et la liste deviendrait illisible. */
  assert.deepEqual(
    [...new Set(manquants)].sort(),
    [],
    'ces attributs existent au schema d un composant et n ont aucune nature declaree. '
      + 'Le corpus ne les porte peut-etre pas AUJOURD HUI ; le jour ou il les portera, '
      + '`comparerCorps` les traitera en nature inconnue et REECRIRA toutes les entrees.'
  );

  /* PREUVE QUE LA DESCENTE A REELLEMENT COUVERT LE MODELE, et la seule chose qui separe
     ce test de son ancetre : un composant qu aucun chemin de natures n atteint est NOMME,
     au lieu d etre silencieusement hors garde. C est le statut qu avaient `partage.seo` et
     `partage.lien-social` jusqu ici. */
  assert.deepEqual(
    [...vus].sort(),
    tousLesComposants,
    'un composant du modele n est atteint par AUCUN chemin de natures : il est hors garde, '
      + 'exactement comme `partage.seo` l etait avant le 2026-08-19.'
  );
});
