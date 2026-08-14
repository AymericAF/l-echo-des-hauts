/**
 * RENDRE une entree comme l'API de contenu de Strapi 5 la rend, populate compris.
 *
 * POURQUOI CE FICHIER EXISTE. Le faux client de `seed-idempotence.test.ts`
 * stockait le corps ECRIT et le rendait tel quel : un `documentId` nu la ou
 * l'API rend `{ documentId, slug, locale }`, un id de media nu la ou elle rend
 * un objet. Tant que le seed se contentait d'ecrire, l'ecart etait sans
 * consequence. Depuis qu'il COMPARE ce qu'il s'apprete a ecrire avec ce qu'il
 * relit, un faux qui rend une autre forme ne prouve plus rien : il jugerait
 * « different » ce que l'instance jugerait « identique », ou l'inverse.
 *
 * LES REGLES DE RENDU SE LISENT DANS LES `schema.json` DU DEPOT, jamais dans
 * une table recopiee ici. C'est ce qui rend le faux INDEPENDANT de la
 * declaration de natures de `seed.ts` : une nature fausse (un media declare
 * scalaire, une relation oubliee) fait diverger le faux du seed, donc rougir la
 * garde. Les deux se recopieraient qu'elles ne prouveraient plus rien.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const RACINE_SRC = path.join(ICI, '..', '..', 'src');

type Attribut = {
  type: string;
  multiple?: boolean;
  repeatable?: boolean;
  component?: string;
  target?: string;
};
type Attributs = Record<string, Attribut>;

function lireJson(chemin: string): any {
  return JSON.parse(fs.readFileSync(chemin, 'utf8'));
}

/** `pluralName` -> attributs, lus dans les `schema.json` de `src/api`. */
function chargerCollections(): Map<string, Attributs> {
  const sortie = new Map<string, Attributs>();
  const racine = path.join(RACINE_SRC, 'api');
  for (const api of fs.readdirSync(racine)) {
    const dossier = path.join(racine, api, 'content-types');
    if (!fs.existsSync(dossier)) continue;
    for (const type of fs.readdirSync(dossier)) {
      const fichier = path.join(dossier, type, 'schema.json');
      if (!fs.existsSync(fichier)) continue;
      const schema = lireJson(fichier);
      const cle = schema?.info?.pluralName ?? schema?.info?.singularName;
      if (cle) sortie.set(cle, schema.attributes ?? {});
      // Un single type se lit par son `singularName` : `configuration`.
      if (schema?.info?.singularName) sortie.set(schema.info.singularName, schema.attributes ?? {});
    }
  }
  return sortie;
}

/** `categorie.nom` -> attributs, lus dans les fichiers de `src/components`. */
function chargerComposants(): Map<string, Attributs> {
  const sortie = new Map<string, Attributs>();
  const racine = path.join(RACINE_SRC, 'components');
  for (const categorie of fs.readdirSync(racine)) {
    const dossier = path.join(racine, categorie);
    if (!fs.statSync(dossier).isDirectory()) continue;
    for (const fichier of fs.readdirSync(dossier)) {
      if (!fichier.endsWith('.json')) continue;
      const schema = lireJson(path.join(dossier, fichier));
      sortie.set(`${categorie}.${fichier.replace(/\.json$/, '')}`, schema.attributes ?? {});
    }
  }
  return sortie;
}

export const COLLECTIONS = chargerCollections();
export const COMPOSANTS = chargerComposants();

export type Base = {
  /** id de media -> objet media, tel que la mediatheque le rend. */
  media(id: number): Record<string, unknown> | undefined;
  /** slug d'un document DANS CETTE LOCALE — `undefined` si la localisation manque. */
  slug(documentId: string, locale: string): string | undefined;
};

const enTableau = (v: unknown): unknown[] => (v == null ? [] : Array.isArray(v) ? v : [v]);

function rendreMedia(valeur: unknown, base: Base): unknown {
  if (typeof valeur !== 'number') return valeur ?? null;
  return base.media(valeur) ?? { id: valeur };
}

function rendreRelation(valeur: unknown, locale: string, base: Base): unknown {
  if (typeof valeur !== 'string') return null;
  const slug = base.slug(valeur, locale);
  // Une localisation absente rend une entree SANS slug : c'est exactement ce
  // que la comparaison doit traiter en doute, pas en identite.
  return slug === undefined ? { documentId: valeur } : { documentId: valeur, slug, locale };
}

/** Rend un corps stocke (celui qui a ete ECRIT) sous la forme que l'API renvoie. */
export function rendre(
  attributs: Attributs,
  entree: Record<string, unknown>,
  locale: string,
  base: Base
): Record<string, unknown> {
  const sortie: Record<string, unknown> = {};

  for (const [champ, valeur] of Object.entries(entree)) {
    const attribut = attributs[champ];
    if (!attribut) {
      sortie[champ] = valeur;
      continue;
    }

    if (attribut.type === 'media') {
      sortie[champ] = attribut.multiple
        ? enTableau(valeur).map((v) => rendreMedia(v, base))
        : rendreMedia(valeur, base);
      continue;
    }

    if (attribut.type === 'relation') {
      sortie[champ] = Array.isArray(valeur)
        ? valeur.map((v) => rendreRelation(v, locale, base))
        : rendreRelation(valeur, locale, base);
      continue;
    }

    if (attribut.type === 'dynamiczone') {
      sortie[champ] = enTableau(valeur).map((bloc) => {
        const b = (bloc ?? {}) as Record<string, unknown>;
        const nom = String(b.__component ?? '');
        const sous = COMPOSANTS.get(nom) ?? {};
        return { ...rendre(sous, b, locale, base), __component: nom };
      });
      continue;
    }

    if (attribut.type === 'component') {
      const sous = COMPOSANTS.get(attribut.component ?? '') ?? {};
      sortie[champ] = attribut.repeatable
        ? enTableau(valeur).map((v) => rendre(sous, (v ?? {}) as Record<string, unknown>, locale, base))
        : valeur == null
          ? null
          : rendre(sous, valeur as Record<string, unknown>, locale, base);
      continue;
    }

    sortie[champ] = valeur;
  }

  return sortie;
}
