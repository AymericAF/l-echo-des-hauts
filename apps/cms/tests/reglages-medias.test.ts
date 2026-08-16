/**
 * LES REGLAGES DE LA MEDIATHEQUE — qu'ils soient poses, et que leur prix reste nul.
 *
 * Deux choses distinctes sont gardees ici, et la seconde compte autant que la premiere :
 *
 *  1. que `assurerReglagesMedias` ecrive les trois drapeaux dans le store, sans ecraser
 *     ce qui ne le regarde pas, et qu'il journalise meme quand il n'a rien a faire ;
 *  2. que la RAISON pour laquelle desactiver l'optimisation ne coute rien tienne toujours.
 *     Elle repose sur un fait du corpus — les seules images matricielles sont les cartes
 *     de partage, servies en `<meta og:image>` et jamais chargees par un lecteur. Le jour
 *     ou une photo d'article arrivera, ce fait tombera et le poids de page deviendra
 *     sensible a ce reglage. C'est une garde, pas une note de bas de page.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  assurerReglagesMedias,
  journalReglagesMedias,
  REGLAGES_EXIGES,
  type StorePlugin,
} from '../src/reglages-medias.ts';

const MEDIAS = path.join(import.meta.dirname, '..', 'data', 'medias');

/** Un store de plugin en memoire — ce que Strapi expose, reduit a ce qu'on appelle. */
function storeFactice(depart: Record<string, unknown> | null): StorePlugin & {
  ecritures: Record<string, unknown>[];
} {
  let valeur = depart;
  const ecritures: Record<string, unknown>[] = [];
  return {
    ecritures,
    async get() {
      return valeur;
    },
    async set({ value }) {
      valeur = value;
      ecritures.push(value);
      return value;
    },
  };
}

/* ------------------------------------------------------------------ */
/* SENS 1 — les drapeaux sont poses                                     */
/* ------------------------------------------------------------------ */

test('sur une instance FRAICHE (store vide), les trois drapeaux sont poses', async () => {
  const store = storeFactice(null);
  const rapport = await assurerReglagesMedias(store);

  assert.equal(store.ecritures.length, 1);
  assert.deepEqual(store.ecritures[0], { ...REGLAGES_EXIGES });
  assert.deepEqual(rapport.posees.sort(), ['autoOrientation', 'responsiveDimensions', 'sizeOptimization']);
  assert.equal(rapport.storeVide, true);
});

test('sur une instance NEUVE de Strapi, les defauts du plugin sont corriges', async () => {
  /* Ce que `@strapi/upload@5.51.1` pose lui-meme au bootstrap — la vraie situation. */
  const store = storeFactice({
    sizeOptimization: true,
    responsiveDimensions: true,
    autoOrientation: false,
    aiMetadata: true,
  });
  const rapport = await assurerReglagesMedias(store);

  assert.deepEqual(rapport.posees.sort(), ['responsiveDimensions', 'sizeOptimization']);
  assert.equal(
    rapport.constats.find((c) => c.cle === 'autoOrientation')?.posee,
    false,
    'autoOrientation etait deja faux : ne pas le compter comme pose',
  );
});

test('les cles qui ne nous regardent PAS sont conservees', async () => {
  const store = storeFactice({ sizeOptimization: true, aiMetadata: true, videoPreview: true });
  await assurerReglagesMedias(store);

  assert.equal(store.ecritures[0].aiMetadata, true);
  assert.equal(store.ecritures[0].videoPreview, true);
});

test('IDEMPOTENT — une instance deja conforme n est pas reecrite', async () => {
  const store = storeFactice({ ...REGLAGES_EXIGES, aiMetadata: true });
  const rapport = await assurerReglagesMedias(store);

  assert.deepEqual(store.ecritures, [], 'aucune ecriture ne doit partir vers une instance conforme');
  assert.deepEqual(rapport.posees, []);
});

/* ------------------------------------------------------------------ */
/* SENS 2 — le journal parle meme quand il n a rien fait                */
/* ------------------------------------------------------------------ */

test('le journal rend UNE ligne meme quand rien n a change', async () => {
  const store = storeFactice({ ...REGLAGES_EXIGES });
  const lignes = journalReglagesMedias(await assurerReglagesMedias(store));

  assert.equal(lignes.length, 1);
  assert.match(lignes[0], /bootstrap exerce/);
  assert.match(lignes[0], /sizeOptimization deja false/);
});

test('PREUVE EN CASSANT — le journal DISTINGUE « rien a faire » de « corrige »', async () => {
  const conforme = journalReglagesMedias(await assurerReglagesMedias(storeFactice({ ...REGLAGES_EXIGES })));
  const corrige = journalReglagesMedias(
    await assurerReglagesMedias(storeFactice({ sizeOptimization: true, responsiveDimensions: true, autoOrientation: false })),
  );

  assert.notDeepEqual(
    conforme,
    corrige,
    'deux etats differents rendraient la meme sortie : le journal serait aveugle',
  );
  assert.match(corrige[0], /sizeOptimization POSEE a false \(elle etait true\)/);
});

/* ------------------------------------------------------------------ */
/* SENS 3 — le prix de ce reglage reste nul                             */
/* ------------------------------------------------------------------ */

function imagesMatricielles(racine: string): string[] {
  const MATRICIELLES = new Set(['.png', '.jpg', '.jpeg', '.webp', '.avif', '.gif', '.tiff']);
  const trouvees: string[] = [];
  for (const entree of fs.readdirSync(racine, { withFileTypes: true })) {
    const chemin = path.join(racine, entree.name);
    if (entree.isDirectory()) trouvees.push(...imagesMatricielles(chemin));
    else if (MATRICIELLES.has(path.extname(entree.name).toLowerCase())) trouvees.push(chemin);
  }
  return trouvees;
}

/**
 * LA GARDE QUI TIENT LE RAISONNEMENT, pas seulement le code.
 *
 * Desactiver l'optimisation ne coute rien PARCE QUE les seules images matricielles du
 * corpus sont les cartes de partage, qui ne sortent qu'en `<meta og:image>` et ne sont
 * donc jamais telechargees par un lecteur. Une photo d'article ferait tomber ce fait —
 * et le poids de page deviendrait sensible a ce reglage, sans que personne ne le voie.
 *
 * Ce test ne dit pas « n'ajoutez pas d'images ». Il dit : si vous en ajoutez une qui sera
 * SERVIE DANS UNE PAGE, revenez ici et remesurez le prix du reglage.
 */
test('les seules images matricielles du corpus restent les cartes de partage', () => {
  const attendues = ['identite/partage-defaut.png', 'partage/A01-col-des-trois-vents.png'];
  const trouvees = imagesMatricielles(MEDIAS)
    .map((chemin) => path.relative(MEDIAS, chemin).replace(/\\/g, '/'))
    .sort();

  assert.deepEqual(
    trouvees,
    attendues.sort(),
    'une image matricielle est apparue : si elle est servie dans une page, remesurer le cout de sizeOptimization:false (cf. src/reglages-medias.ts)',
  );
});

test('et elles ne sont employees QUE comme cartes de partage', () => {
  const configuration = JSON.parse(
    fs.readFileSync(path.join(import.meta.dirname, '..', 'data', 'configuration.json'), 'utf8'),
  );
  assert.equal(configuration.imagePartageDefaut, 'identite/partage-defaut.png');

  /* L'autre PNG n'est reference que par une surcharge `seo.imagePartage` d'article — le
     seul autre chemin par lequel une image matricielle entre dans ce corpus. */
  const articles = path.join(import.meta.dirname, '..', 'data', 'articles');
  const citations = fs
    .readdirSync(articles)
    .filter((nom) => nom.endsWith('.md'))
    .filter((nom) => fs.readFileSync(path.join(articles, nom), 'utf8').includes('A01-col-des-trois-vents.png'));

  assert.ok(citations.length > 0, 'la carte de partage de A01 doit etre citee par ses articles');
  for (const citation of citations) {
    const texte = fs.readFileSync(path.join(articles, citation), 'utf8');
    assert.match(
      texte,
      /imagePartage/,
      `${citation} cite la carte hors d'une surcharge imagePartage : elle serait alors servie dans la page`,
    );
  }
});
