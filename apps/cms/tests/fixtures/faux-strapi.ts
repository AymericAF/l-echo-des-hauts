/**
 * FAUX STRAPI 5 — le client de substitution, DEFINI UNE SEULE FOIS.
 *
 * Il imite le modele documentaire de Strapi 5 : un `documentId` commun a toutes les locales, une
 * entree par locale, des medias rapproches par leur nom. Il ne remplace pas la preuve contre une
 * vraie instance — il la precede, et il tourne partout, sans reseau.
 *
 * POURQUOI IL EST SORTI DE `seed-idempotence.test.ts` (2026-08-14, tache `e1f49fc1`) : un second
 * test en avait besoin. Le recopier aurait cree deux clients qui divergent — exactement ce que la
 * factorisation de l'amorcage a deja coute une fois dans l'autre depot. Une meme mecanique en deux
 * implementations diverge ; celle-ci n'en a plus qu'une.
 */
import fs from 'node:fs';

import type { ClientStrapi } from '../../scripts/seed/client.ts';
import { COLLECTIONS, rendre, type Base } from './rendu-strapi.ts';

export type Entree = Record<string, any>;

/** Une ecriture telle qu'elle est partie : de quoi juger CE QUE le seed ecrit, pas ce qu'il garde. */
export type Ecriture = { plural: string; locale: string; data: Entree; geste: 'creer' | 'majr' | 'single' };

/**
 * Les extensions que Strapi sait REDIMENSIONNER — `FORMATS_TO_RESIZE` de
 * `@strapi/upload@5.51.1/dist/server/services/image-manipulation.js` (l. 17). Le SVG n'y est
 * pas : la mediatheque le sert intact et ne lui pose aucun format.
 */
const MATRICIELLES = new Set(['.png', '.jpg', '.jpeg', '.webp', '.tiff', '.gif']);

/* ------------------------------------------------------------------ */
/* Faux Strapi 5 : documents multi-locales, medias rapproches par nom.  */
/* ------------------------------------------------------------------ */


export class FauxStrapi implements ClientStrapi {
  /** plural -> documentId -> locale -> entree */
  documents = new Map<string, Map<string, Map<string, Entree>>>();
  singles = new Map<string, Map<string, Entree>>();
  medias = new Map<string, Entree>();
  private compteur = 0;
  /** Toutes les ecritures, pour verifier qu'aucune n'est un doublon. */
  journal: string[] = [];
  /**
   * L'instance dont les REGLAGES ONT DERIVE : `sizeOptimization` (ou `autoOrientation`)
   * repasse a `true`, et la mediatheque re-encode le fichier au lieu de le stocker tel quel.
   * Les octets servis cessent alors d'etre ceux du depot, et AUCUN passage ne peut converger.
   * Faux par defaut — c'est l'etat que `src/reglages-medias.ts` pose a chaque demarrage.
   */
  recompresse = false;
  /** Les PAYLOADS, tels qu'ils partent — c'est ce qui permet de juger les champs ECRITS. */
  ecritures: Ecriture[] = [];

  private table(plural: string) {
    if (!this.documents.has(plural)) this.documents.set(plural, new Map());
    return this.documents.get(plural)!;
  }

  /**
   * L'acces que le rendu populate exige : un media par son id, le slug d'un
   * document DANS UNE LOCALE — la seule cle qui distingue une localisation
   * d'une autre, `documentId` etant commun a toutes (A-06).
   */
  private base(): Base {
    return {
      media: (id) => {
        for (const m of this.medias.values()) if (m.id === id) return m;
        return undefined;
      },
      slug: (documentId, locale) => {
        for (const docs of this.documents.values()) {
          const locales = docs.get(documentId);
          if (!locales) continue;
          const slug = locales.get(locale)?.slug;
          return typeof slug === 'string' ? slug : undefined;
        }
        return undefined;
      },
    };
  }

  async listerTout(plural: string, params: Record<string, string>): Promise<Entree[]> {
    const locale = params.locale ?? 'fr';
    const attributs = COLLECTIONS.get(plural) ?? {};
    const sortie: Entree[] = [];
    for (const [documentId, locales] of this.table(plural)) {
      const e = locales.get(locale);
      if (e) sortie.push({ ...rendre(attributs, e, locale, this.base()), documentId });
    }
    return sortie;
  }

  async creer(plural: string, data: Entree, params: Record<string, string>) {
    const locale = params.locale ?? 'fr';
    const documentId = `doc-${++this.compteur}`;
    this.table(plural).set(documentId, new Map([[locale, { ...data }]]));
    this.journal.push(`creer ${plural} ${locale} ${data.slug ?? ''}`);
    this.ecritures.push({ plural, locale, data: { ...data }, geste: 'creer' });
    return { documentId, ...data, locale };
  }

  async mettreAJour(
    plural: string,
    documentId: string,
    data: Entree,
    params: Record<string, string>
  ) {
    const locale = params.locale ?? 'fr';
    const locales = this.table(plural).get(documentId);
    if (!locales) throw new Error(`document inconnu : ${plural}/${documentId}`);
    const avant = locales.get(locale) ?? {};
    locales.set(locale, { ...avant, ...data });
    this.journal.push(`majr ${plural} ${locale} ${data.slug ?? ''}`);
    this.ecritures.push({ plural, locale, data: { ...data }, geste: 'majr' });
    return { documentId, ...locales.get(locale), locale };
  }

  async lireSingle(singular: string, params: Record<string, string>) {
    const locale = params.locale ?? 'fr';
    const entree = this.singles.get(singular)?.get(locale);
    if (!entree) return null;
    return rendre(COLLECTIONS.get(singular) ?? {}, entree, locale, this.base());
  }

  async majSingle(singular: string, data: Entree, params: Record<string, string>) {
    if (!this.singles.has(singular)) this.singles.set(singular, new Map());
    const locale = params.locale ?? 'fr';
    this.ecritures.push({ plural: singular, locale, data: { ...data }, geste: 'single' });
    const avant = this.singles.get(singular)!.get(locale) ?? {};
    this.singles.get(singular)!.set(locale, { ...avant, ...data });
    return data;
  }

  async listerMedias(nom: string) {
    const m = this.medias.get(nom);
    return m ? [m] : [];
  }

  /**
   * CE QUE LA MEDIATHEQUE FAIT D'UN FICHIER QU'ELLE RECOIT — reglages POSES.
   *
   * Les octets d'abord : `enhanceAndValidateFile` passe par `optimize()`, dont la branche
   * `if ((sizeOptimization || autoOrientation) && …)` (image-manipulation.js l. 121) est
   * SAUTEE quand les deux drapeaux sont faux. Le fichier stocke est alors CELUI DU DEPOT,
   * a l'octet. `recompresse` modelise l'instance ou ce n'est plus vrai.
   *
   * La VIGNETTE ensuite, et c'est le piege : `generateThumbnail` n'est gardee par AUCUN
   * reglage (upload.js l. 222, image-manipulation.js l. 104). Elle ne depend que du format
   * et de la taille — `width > 245 || height > 156`. Les deux PNG du corpus font 1200x630 :
   * ils porteront `formats.thumbnail` A CHAQUE televersement ET A CHAQUE REMPLACEMENT,
   * `responsiveDimensions:false` ou non. Une fiche qui porte des formats n'est donc PAS un
   * reliquat de l'ancien reglage — et une garde qui le croirait remplacerait ces deux
   * fichiers indefiniment.
   */
  private posee(media: Entree, chemin: string) {
    const octets = fs.readFileSync(chemin);
    media.octets = this.recompresse
      ? Buffer.concat([octets.subarray(0, Math.max(1, octets.length >> 1))])
      : octets;
    const point = chemin.lastIndexOf('.');
    media.formats = MATRICIELLES.has(chemin.slice(point).toLowerCase())
      ? { thumbnail: { name: `thumbnail_${media.name}` } }
      : {};
  }

  async televerser(f: { nom: string; chemin: string; alternativeText: string; caption: string }) {
    const media: Entree = {
      id: this.medias.size + 1,
      name: f.nom,
      alternativeText: f.alternativeText,
      caption: f.caption,
      url: `/uploads/${f.nom}`,
    };
    // Les OCTETS sont portes ici, comme la mediatheque les porte : sans eux,
    // ce faux client ne pourrait pas distinguer un fichier redessine d un
    // fichier intact, et le test le plus utile serait inerte.
    this.posee(media, f.chemin);
    this.medias.set(f.nom, media);
    this.journal.push(`upload ${f.nom}`);
    return media;
  }

  async octetsMedia(media: { id: number; url?: string }) {
    for (const m of this.medias.values()) if (m.id === media.id) return m.octets ?? null;
    return null;
  }

  async remplacerFichierMedia(id: number, fichier: { nom: string; chemin: string }) {
    for (const media of this.medias.values()) {
      if (media.id !== id) continue;
      // `replace` remet `formats` a {} puis `replaceImage` y REPOSE la vignette (upload.js
      // l. 354 puis l. 270) : le meme traitement qu'a l'upload, d'ou le meme appel.
      this.posee(media, fichier.chemin);
      this.journal.push(`octets ${media.name}`);
      return media;
    }
    throw new Error(`media inconnu : ${id}`);
  }

  async majInfosMedia(id: number, infos: { alternativeText: string; caption: string }) {
    for (const media of this.medias.values()) {
      if (media.id !== id) continue;
      Object.assign(media, infos);
      this.journal.push(`infos ${media.name}`);
      return media;
    }
    throw new Error(`media inconnu : ${id}`);
  }

  /** Nombre d'entrees, toutes familles et toutes locales confondues. */
  comptageTotal() {
    const comptes: Record<string, number> = {};
    for (const [plural, docs] of this.documents) {
      let n = 0;
      for (const locales of docs.values()) n += locales.size;
      comptes[plural] = n;
    }
    for (const [singular, locales] of this.singles) comptes[singular] = locales.size;
    comptes['upload/files'] = this.medias.size;
    return comptes;
  }
}
