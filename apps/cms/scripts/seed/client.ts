/**
 * Client REST minimal de l'API Strapi 5, cote ecriture.
 *
 * Le jeton utilise ici n'est PAS celui du build : celui du build est en lecture
 * seule (contrainte dure de la §1 ratifiee). Le seed exige un jeton
 * `full-access` et a DUREE LIMITEE (jamais `Unlimited`), injecte par
 * l'environnement — jamais ecrit dans le depot, qui est public.
 */
import fs from 'node:fs';
import { ErreurStrapi } from './erreurs.ts';

export type Parametres = Record<string, string | undefined>;

export interface ClientStrapi {
  /** Toutes les entrees d'une collection pour une locale, pagination epuisee. */
  listerTout(plural: string, params: Parametres): Promise<any[]>;
  creer(plural: string, data: Record<string, any>, params: Parametres): Promise<any>;
  mettreAJour(
    plural: string,
    documentId: string,
    data: Record<string, any>,
    params: Parametres
  ): Promise<any>;
  lireSingle(singular: string, params: Parametres): Promise<any | null>;
  majSingle(singular: string, data: Record<string, any>, params: Parametres): Promise<any>;
  listerMedias(nom: string): Promise<any[]>;
  televerser(fichier: {
    nom: string;
    chemin: string;
    alternativeText: string;
    caption: string;
  }): Promise<any>;
  /**
   * Reecrit les metadonnees d'un fichier DEJA televerse, sans renvoyer d'octets.
   *
   * Sans elle, le rapprochement par nom de fichier retient l'id et s'arrete la :
   * un media deja present garde ses metadonnees POUR TOUJOURS, et corriger le
   * manifeste ne change rien a ce qui est publie. C'est exactement le cas du
   * 2026-08-10 — les 94 lignes de credit ne creditaient rien, et les fichiers
   * etaient deja dans la mediatheque.
   */
  majInfosMedia(
    id: number,
    infos: { alternativeText: string; caption: string }
  ): Promise<any>;
}

const TYPES_MIME: Record<string, string> = {
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
};

function typeMime(nom: string): string {
  const point = nom.lastIndexOf('.');
  return TYPES_MIME[nom.slice(point).toLowerCase()] ?? 'application/octet-stream';
}

function requete(base: string, chemin: string, params: Parametres): string {
  const url = new URL(chemin, base.endsWith('/') ? base : base + '/');
  for (const [cle, valeur] of Object.entries(params)) {
    if (valeur !== undefined) url.searchParams.set(cle, valeur);
  }
  return url.toString();
}

export class ClientHttp implements ClientStrapi {
  private readonly base: string;
  private readonly jeton: string;

  constructor(base: string, jeton: string) {
    this.base = base;
    this.jeton = jeton;
  }

  private async appeler(methode: string, url: string, corps?: unknown): Promise<any> {
    const reponse = await fetch(url, {
      method: methode,
      headers: {
        Authorization: `Bearer ${this.jeton}`,
        ...(corps === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: corps === undefined ? undefined : JSON.stringify(corps),
    });
    const texte = await reponse.text();
    if (!reponse.ok) throw new ErreurStrapi(methode, url, reponse.status, texte);
    return texte === '' ? null : JSON.parse(texte);
  }

  async listerTout(plural: string, params: Parametres): Promise<any[]> {
    const entrees: any[] = [];
    let page = 1;
    // `api.rest.maxLimit` vaut 100 : demander plus serait rabote en silence.
    for (;;) {
      const url = requete(this.base, `api/${plural}`, {
        ...params,
        'pagination[page]': String(page),
        'pagination[pageSize]': '100',
      });
      const rep = await this.appeler('GET', url);
      entrees.push(...(rep?.data ?? []));
      const p = rep?.meta?.pagination;
      if (!p || page >= (p.pageCount ?? 1)) break;
      page += 1;
    }
    return entrees;
  }

  async creer(plural: string, data: Record<string, any>, params: Parametres) {
    const rep = await this.appeler('POST', requete(this.base, `api/${plural}`, params), { data });
    return rep?.data;
  }

  async mettreAJour(
    plural: string,
    documentId: string,
    data: Record<string, any>,
    params: Parametres
  ) {
    const rep = await this.appeler('PUT', requete(this.base, `api/${plural}/${documentId}`, params), {
      data,
    });
    return rep?.data;
  }

  async lireSingle(singular: string, params: Parametres) {
    try {
      const rep = await this.appeler('GET', requete(this.base, `api/${singular}`, params));
      return rep?.data ?? null;
    } catch (e) {
      // Un single type jamais rempli rend 404, pas une enveloppe vide : c'est
      // l'etat normal d'une instance fraiche, pas une erreur.
      if (e instanceof ErreurStrapi && e.statut === 404) return null;
      throw e;
    }
  }

  async majSingle(singular: string, data: Record<string, any>, params: Parametres) {
    const rep = await this.appeler('PUT', requete(this.base, `api/${singular}`, params), { data });
    return rep?.data;
  }

  async listerMedias(nom: string): Promise<any[]> {
    const url = requete(this.base, 'api/upload/files', { 'filters[name][$eq]': nom });
    const rep = await this.appeler('GET', url);
    // Le plugin Upload rend un tableau nu, pas une enveloppe `{ data }`.
    return Array.isArray(rep) ? rep : (rep?.data ?? []);
  }

  async televerser(fichier: {
    nom: string;
    chemin: string;
    alternativeText: string;
    caption: string;
  }) {
    const formulaire = new FormData();
    const octets = fs.readFileSync(fichier.chemin);
    formulaire.append(
      'files',
      new Blob([new Uint8Array(octets)], { type: typeMime(fichier.nom) }),
      fichier.nom
    );
    formulaire.append(
      'fileInfo',
      JSON.stringify({
        name: fichier.nom,
        alternativeText: fichier.alternativeText,
        caption: fichier.caption,
      })
    );

    const url = requete(this.base, 'api/upload', {});
    const reponse = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.jeton}` },
      body: formulaire,
    });
    const texte = await reponse.text();
    if (!reponse.ok) throw new ErreurStrapi('POST', url, reponse.status, texte);
    const rendu = JSON.parse(texte);
    return Array.isArray(rendu) ? rendu[0] : rendu;
  }

  async majInfosMedia(id: number, infos: { alternativeText: string; caption: string }) {
    // Le plugin Upload met a jour les METADONNEES quand `?id=` est fourni et
    // qu'aucun fichier n'accompagne le `fileInfo` — c'est la seule route qui
    // touche `caption` sans renvoyer les octets.
    const formulaire = new FormData();
    formulaire.append('fileInfo', JSON.stringify(infos));

    const url = requete(this.base, 'api/upload', { id: String(id) });
    const reponse = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.jeton}` },
      body: formulaire,
    });
    const texte = await reponse.text();
    if (!reponse.ok) throw new ErreurStrapi('POST', url, reponse.status, texte);
    const rendu = texte === '' ? null : JSON.parse(texte);
    return Array.isArray(rendu) ? rendu[0] : rendu;
  }
}
