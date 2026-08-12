/**
 * A-09, deuxieme moitie : un `slug` VIDE doit etre refuse a l ecriture.
 *
 * Ce que ce test corrige. Le §11 de `docs/plan-editorial.md` justifiait le controle 12
 * par « un slug EN manquant est rejete a l ecriture (A-09) ». Mesure le 2026-08-10 sur
 * `echoback.ayfiweb.fr` : FAUX. Un `PUT` posant `slug:""` est ACCEPTE en 200, et l API
 * sert ensuite `["territory", ..., "outdoors", ""]`. La cause tient en une ligne de
 * Strapi : le `uid` est valide contre `/^[A-Za-z0-9-_.~]*$/` — un motif en `*` que la
 * chaine vide satisfait — et `required: true` porte sur la PRESENCE de la cle, pas sur
 * le contenu de la valeur. Seul un espace etait refuse, parce qu il sort de l alphabet.
 *
 * Ce que ce test exerce, et pourquoi ainsi. Il ne reimplemente pas la regle : il
 * construit le validateur AVEC LE CODE DE STRAPI (`@strapi/core`, service
 * `entity-validator`) et AVEC L ATTRIBUT LU DANS LE VRAI `schema.json`. Une regle
 * recopiee ici ne prouverait que sa propre copie ; c est exactement le mode d echec
 * qu on ferme. Il tourne en millisecondes, sans base ni serveur.
 *
 * Ce qu il ne prouve PAS, et qui a ete mesure ailleurs (voir la tache de controle) :
 * qu une instance Strapi complete refuse le meme payload par le service de documents
 * (mesure le 2026-08-11 sur une COPIE de la base locale, jamais la production).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const RACINE = path.join(ICI, '..');
const requis = createRequire(path.join(RACINE, 'package.json'));

// Chemin de fichier, et non sous-chemin de paquet : `@strapi/core` n exporte pas ses
// services dans son `exports`. C est assume — on veut LE code qui valide en production,
// pas une reimplementation de sa regle.
const { Validators } = requis(
  path.join(RACINE, 'node_modules', '@strapi', 'core', 'dist', 'services', 'entity-validator', 'validators.js')
);

/** Les 5 collections qui portent un `uid` (A-09). `Configuration` n en a pas. */
const COLLECTIONS = ['article', 'auteur', 'categorie', 'dossier', 'tag'] as const;

function attributSlug(nom: string): any {
  const p = path.join(RACINE, 'src', 'api', nom, 'content-types', nom, 'schema.json');
  const schema = JSON.parse(fs.readFileSync(p, 'utf8'));
  const attr = schema.attributes?.slug;
  assert.ok(attr, `${nom} : pas d attribut « slug » — le test ne prouverait rien`);
  assert.equal(attr.type, 'uid', `${nom}.slug : type attendu « uid »`);
  return attr;
}

/**
 * Le validateur de `slug` tel que Strapi le construit pour ce content type.
 *
 * `isDraft: false` = l etat dans lequel une entree est SERVIE par l API publique, donc
 * le seul qui gouverne ce que le site peut lire. Strapi desactive volontairement
 * minLength et le motif sur les brouillons (`addMinLengthValidator`, `uidValidator`).
 */
function validateurSlug(nom: string, isDraft = false) {
  // `unique` interroge la base pour toute valeur non vide : on rend la base muette,
  // l unicite n est pas le sujet de ce test.
  (globalThis as any).strapi = { db: { query: () => ({ findOne: async () => null }) } };
  return Validators.uid(
    {
      attr: attributSlug(nom),
      model: { uid: `api::${nom}.${nom}`, attributes: {} },
      updatedAttribute: { name: 'slug', value: undefined },
      entity: null,
      componentContext: undefined,
    },
    { isDraft }
  );
}

async function refus(nom: string, valeur: string, isDraft = false): Promise<string | null> {
  try {
    await validateurSlug(nom, isDraft).validate(valeur);
    return null;
  } catch (e: any) {
    return String(e?.message ?? e);
  }
}

for (const nom of COLLECTIONS) {
  test(`${nom}.slug : la chaine vide est REFUSEE (A-09, trou mesure le 2026-08-10)`, async () => {
    const message = await refus(nom, '');
    assert.ok(
      message,
      `${nom}.slug : "" a ete ACCEPTE — c est le trou du 2026-08-10, une URL sans segment ` +
        `ou une collision de route sur le site statique`
    );
    assert.match(
      message,
      /at least 1 character/,
      `${nom}.slug : refuse, mais pas par la contrainte de longueur — verifier quelle regle a mordu`
    );
  });

  test(`${nom}.slug : un slug legitime reste ACCEPTE`, async () => {
    // Pris du corpus reel (`apps/cms/data`), pas invente.
    for (const legitime of ['territoire', 'lives-here', 'juin-1983-le-dernier-jour-de-la-filature']) {
      assert.equal(
        await refus(nom, legitime),
        null,
        `${nom}.slug : « ${legitime} » refuse — la garde casse un slug du corpus`
      );
    }
  });

  test(`${nom}.slug : un slug hors alphabet uid reste refuse (non-regression)`, async () => {
    assert.ok(await refus(nom, '   '), `${nom}.slug : "   " accepte`);
  });

  test(`${nom}.slug : PREUVE EN CASSANT — sans minLength, la chaine vide repasse`, async () => {
    const attr = { ...attributSlug(nom) };
    delete attr.minLength;
    (globalThis as any).strapi = { db: { query: () => ({ findOne: async () => null }) } };
    const validateur = Validators.uid(
      {
        attr,
        model: { uid: `api::${nom}.${nom}`, attributes: {} },
        updatedAttribute: { name: 'slug', value: undefined },
        entity: null,
        componentContext: undefined,
      },
      { isDraft: false }
    );
    await validateur.validate('');
    // Si cette ligne est atteinte, c est bien `minLength` — et rien d autre — qui ferme
    // le trou : le test ci-dessus ne serait pas vert « tout seul ».
    assert.ok(true);
  });
}
