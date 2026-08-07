/**
 * Deux executions consecutives ne doublent rien.
 *
 * Le test tourne sur le CORPUS REEL du depot, contre un faux client Strapi
 * qui imite le modele documentaire de Strapi 5 (un documentId, une entree par
 * locale). Il ne remplace pas la preuve contre une vraie instance — il la
 * precede, et il tourne partout, sans reseau.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { chargerCorpus } from '../scripts/seed/corpus.ts';
import { executerSeed } from '../scripts/seed/seed.ts';
import type { ClientStrapi } from '../scripts/seed/client.ts';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const DATA_REEL = path.join(ICI, '..', 'data');

/* ------------------------------------------------------------------ */
/* Faux Strapi 5 : documents multi-locales, medias rapproches par nom.  */
/* ------------------------------------------------------------------ */

type Entree = Record<string, any>;

class FauxStrapi implements ClientStrapi {
  /** plural -> documentId -> locale -> entree */
  documents = new Map<string, Map<string, Map<string, Entree>>>();
  singles = new Map<string, Map<string, Entree>>();
  medias = new Map<string, Entree>();
  private compteur = 0;
  /** Toutes les ecritures, pour verifier qu'aucune n'est un doublon. */
  journal: string[] = [];

  private table(plural: string) {
    if (!this.documents.has(plural)) this.documents.set(plural, new Map());
    return this.documents.get(plural)!;
  }

  async listerTout(plural: string, params: Record<string, string>): Promise<Entree[]> {
    const locale = params.locale ?? 'fr';
    const sortie: Entree[] = [];
    for (const [documentId, locales] of this.table(plural)) {
      const e = locales.get(locale);
      if (e) sortie.push({ ...e, documentId });
    }
    return sortie;
  }

  async creer(plural: string, data: Entree, params: Record<string, string>) {
    const locale = params.locale ?? 'fr';
    const documentId = `doc-${++this.compteur}`;
    this.table(plural).set(documentId, new Map([[locale, { ...data }]]));
    this.journal.push(`creer ${plural} ${locale} ${data.slug ?? ''}`);
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
    return { documentId, ...locales.get(locale), locale };
  }

  async lireSingle(singular: string, params: Record<string, string>) {
    return this.singles.get(singular)?.get(params.locale ?? 'fr') ?? null;
  }

  async majSingle(singular: string, data: Entree, params: Record<string, string>) {
    if (!this.singles.has(singular)) this.singles.set(singular, new Map());
    const locale = params.locale ?? 'fr';
    const avant = this.singles.get(singular)!.get(locale) ?? {};
    this.singles.get(singular)!.set(locale, { ...avant, ...data });
    return data;
  }

  async listerMedias(nom: string) {
    const m = this.medias.get(nom);
    return m ? [m] : [];
  }

  async televerser(f: { nom: string; chemin: string; alternativeText: string; caption: string }) {
    const media = { id: this.medias.size + 1, name: f.nom };
    this.medias.set(f.nom, media);
    this.journal.push(`upload ${f.nom}`);
    return media;
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

/* ------------------------------------------------------------------ */

test('deux executions consecutives : la seconde ne cree rien et le comptage ne bouge pas', async () => {
  const corpus = chargerCorpus(DATA_REEL);
  const faux = new FauxStrapi();

  const premier = await executerSeed(faux, corpus);
  const comptage1 = faux.comptageTotal();

  const second = await executerSeed(faux, corpus);
  const comptage2 = faux.comptageTotal();

  // Le premier passage cree ; le second ne cree rien du tout.
  assert.ok(
    Object.values(premier.crees).some((n) => n > 0),
    'la premiere execution doit creer quelque chose'
  );
  assert.deepEqual(
    Object.entries(second.crees).filter(([, n]) => n > 0),
    [],
    'la seconde execution ne doit rien creer'
  );
  assert.deepEqual(comptage2, comptage1, 'le comptage doit etre identique entre les deux passages');
});

test('la seconde execution ne reteleverse aucun media', async () => {
  const corpus = chargerCorpus(DATA_REEL);
  const faux = new FauxStrapi();

  await executerSeed(faux, corpus);
  const uploads1 = faux.journal.filter((l) => l.startsWith('upload')).length;
  await executerSeed(faux, corpus);
  const uploads2 = faux.journal.filter((l) => l.startsWith('upload')).length;

  assert.ok(uploads1 > 0, 'le premier passage doit televerser');
  assert.equal(uploads2, uploads1, 'le second passage ne doit televerser aucun fichier de plus');
});

test('le seed ecrit une localisation EN pour chaque entite qui en porte une au corpus', async () => {
  const corpus = chargerCorpus(DATA_REEL);
  const faux = new FauxStrapi();
  await executerSeed(faux, corpus);

  const compterLocale = (plural: string, locale: string) => {
    let n = 0;
    for (const locales of faux.documents.get(plural)?.values() ?? []) if (locales.has(locale)) n++;
    return n;
  };

  assert.equal(compterLocale('categories', 'en'), 6);
  assert.equal(compterLocale('tags', 'en'), 20);
  assert.equal(compterLocale('dossiers', 'en'), 2);
  assert.equal(compterLocale('auteurs', 'en'), 5);
  assert.equal(compterLocale('articles', 'en'), 8);
});

test('les relations d un article EN sont ecrites sur la localisation EN, pas sur la FR', async () => {
  const corpus = chargerCorpus(DATA_REEL);
  const faux = new FauxStrapi();
  await executerSeed(faux, corpus);

  for (const locales of faux.documents.get('articles')!.values()) {
    const en = locales.get('en');
    if (!en) continue;
    assert.ok(en.auteur, 'l article EN doit porter un auteur (requis)');
    assert.ok(en.categorie, 'l article EN doit porter une categorie (requise)');
  }
});
