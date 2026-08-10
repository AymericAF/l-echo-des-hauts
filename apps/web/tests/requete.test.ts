/**
 * Le populate est EXPLICITE, par type de contenu, et jamais `populate=*` (§1 du brief,
 * §4.3 du cahier). Ce fichier le verifie a trois niveaux : la serialisation, la forme
 * de chaque requete declaree, et le contenu du dossier `src/` — parce qu une regle qui
 * ne vit que dans un objet exporte peut etre contournee par un `fetch` ecrit a cote.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { REQUETES, serialiserParametres, construireUrl } from '../src/lib/strapi/requete.ts';
import type { Populate } from '../src/lib/strapi/requete.ts';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(ICI, '..', 'src');

const BLOCS_ATTENDUS = [
  'bloc.texte',
  'bloc.citation',
  'bloc.galerie',
  'bloc.encadre',
  'bloc.video',
  'bloc.image-legendee',
  'bloc.separateur',
  'bloc.chiffres-cles',
];

// ---------------------------------------------------------------------------
// Serialisation
// ---------------------------------------------------------------------------

test('serialiserParametres rend la notation a crochets attendue par Strapi', () => {
  const chaine = serialiserParametres({
    locale: 'fr',
    fields: ['titre', 'slug'],
    populate: { auteur: { fields: ['nom'] } },
    pagination: { page: 1, pageSize: 100 },
  });

  const parties = chaine.split('&');
  assert.ok(parties.includes('locale=fr'));
  assert.ok(parties.includes('fields%5B0%5D=titre'));
  assert.ok(parties.includes('fields%5B1%5D=slug'));
  assert.ok(parties.includes('populate%5Bauteur%5D%5Bfields%5D%5B0%5D=nom'));
  assert.ok(parties.includes('pagination%5BpageSize%5D=100'));
});

test('serialiserParametres encode les valeurs et ignore undefined', () => {
  const chaine = serialiserParametres({ filtre: 'a&b=c', vide: undefined });
  assert.equal(chaine, 'filtre=a%26b%3Dc');
});

test('construireUrl assemble base, chemin et parametres', () => {
  const url = construireUrl('https://echoback.ayfiweb.fr/', 'articles', { locale: 'fr' });
  assert.equal(url, 'https://echoback.ayfiweb.fr/api/articles?locale=fr');
});

// ---------------------------------------------------------------------------
// Forme des requetes declarees
// ---------------------------------------------------------------------------

/** Descend le populat et rend tous les couples [chemin, feuille]. */
function feuilles(populate: Populate, prefixe = ''): Array<[string, unknown]> {
  const trouvees: Array<[string, unknown]> = [];
  for (const [cle, valeur] of Object.entries(populate)) {
    const chemin = prefixe ? `${prefixe}.${cle}` : cle;
    if (valeur && typeof valeur === 'object' && 'on' in (valeur as any)) {
      for (const [composant, sousValeur] of Object.entries((valeur as any).on)) {
        trouvees.push(...feuilles({ [composant]: sousValeur } as Populate, chemin));
      }
      continue;
    }
    if (valeur && typeof valeur === 'object' && 'populate' in (valeur as any)) {
      trouvees.push([chemin, valeur]);
      trouvees.push(...feuilles((valeur as any).populate, chemin));
      continue;
    }
    trouvees.push([chemin, valeur]);
  }
  return trouvees;
}

test('les six requetes du site sont declarees', () => {
  assert.deepEqual(Object.keys(REQUETES).sort(), [
    'articles',
    'auteurs',
    'categories',
    'configuration',
    'dossiers',
    'tags',
  ]);
});

for (const [nom, requete] of Object.entries(REQUETES)) {
  test(`${nom} : la requete ne contient nulle part une etoile`, () => {
    const chaine = serialiserParametres(requete as Record<string, unknown>);
    assert.ok(!chaine.includes('*'), `« populate=* » interdit, trouve dans : ${chaine}`);
    assert.ok(!chaine.includes('%2A'), `« populate=* » encode interdit, trouve dans : ${chaine}`);
  });

  test(`${nom} : les champs demandes sont enumeres explicitement`, () => {
    const champs = (requete as any).fields;
    assert.ok(Array.isArray(champs) && champs.length > 0, 'fields doit etre une liste non vide');
    assert.ok(champs.every((c: unknown) => typeof c === 'string' && c !== '*'));
  });

  test(`${nom} : chaque relation peuplee nomme ses propres champs`, () => {
    const populate = (requete as any).populate as Populate | undefined;
    if (!populate) return;
    for (const [chemin, feuille] of feuilles(populate)) {
      assert.ok(
        feuille && typeof feuille === 'object',
        `populate.${chemin} vaut ${JSON.stringify(feuille)} : un populate booleen ou etoile ramene tout le sous-arbre`,
      );
      const champs = (feuille as any).fields;
      assert.ok(
        Array.isArray(champs) && champs.length > 0,
        `populate.${chemin} ne declare aucun `.concat('`fields`'),
      );
    }
  });
}

/**
 * Le `caption` est le PORTEUR DU CREDIT (plan editorial §6.5), et la page auteur l affiche
 * sous le portrait depuis la decision du 2026-08-03 (§13, point 6b). Un populate qui cesse
 * de le demander ne casse rien de visible : Strapi rend une cle en moins, `lecture.ts` leve,
 * et le build s arrete — mais seulement parce que le mapping l exige. Ce test tient l autre
 * bout, sur la requete elle-meme, et il le fait pour TOUT media : le credit voyage avec le
 * fichier, pas avec la page ou il est rendu aujourd hui.
 *
 * Un media se reconnait a sa forme, pas a une liste de chemins recopiee ici — une liste
 * derive, une forme non.
 */
function estFeuilleMedia(feuille: unknown): boolean {
  const champs = (feuille as any)?.fields;
  return Array.isArray(champs) && champs.includes('url') && champs.includes('alternativeText');
}

function mediasDe(requete: unknown): Array<[string, unknown]> {
  const populate = (requete as any).populate as Populate | undefined;
  if (!populate) return [];
  return feuilles(populate).filter(([, feuille]) => estFeuilleMedia(feuille));
}

test('les requetes declarent bien des medias (sinon le controle suivant est vide)', () => {
  const total = Object.values(REQUETES).reduce((somme, requete) => somme + mediasDe(requete).length, 0);
  assert.ok(total > 0, 'aucun media reconnu dans REQUETES : l extracteur ne voit plus rien');
});

for (const [nom, requete] of Object.entries(REQUETES)) {
  test(`${nom} : chaque media demande son `.concat('`caption`', ' (porteur du credit, §6.5)'), () => {
    for (const [chemin, feuille] of mediasDe(requete)) {
      assert.ok(
        (feuille as any).fields.includes('caption'),
        `populate.${chemin} ne demande pas « caption » : le credit ne parviendrait jamais au rendu`,
      );
    }
  });
}

test('articles : la Dynamic Zone est peuplee composant par composant, les 8 y sont', () => {
  const contenu = (REQUETES.articles as any).populate.contenu;
  assert.ok(contenu.on, 'une Dynamic Zone se peuple avec `on`, jamais en bloc');
  assert.deepEqual(Object.keys(contenu.on).sort(), [...BLOCS_ATTENDUS].sort());
});

test('articles : les localisations sont demandees avec leur propre slug (jamais deduit du FR)', () => {
  const localizations = (REQUETES.articles as any).populate.localizations;
  assert.ok(localizations.fields.includes('slug'));
  assert.ok(localizations.fields.includes('locale'));
});

test('articles : le populate demande bien les cinq relations localisees d office', () => {
  const populate = (REQUETES.articles as any).populate;
  for (const relation of ['auteur', 'categorie', 'tags', 'dossier', 'articlesLies']) {
    assert.ok(populate[relation], `relation « ${relation} » absente du populate explicite`);
  }
});

// ---------------------------------------------------------------------------
// Garde de depot : aucune etoile nulle part dans src/
// ---------------------------------------------------------------------------

function fichiersDe(dossier: string): string[] {
  const trouves: string[] = [];
  for (const entree of fs.readdirSync(dossier, { withFileTypes: true })) {
    const complet = path.join(dossier, entree.name);
    if (entree.isDirectory()) trouves.push(...fichiersDe(complet));
    else if (/\.(ts|mjs|js|astro)$/.test(entree.name)) trouves.push(complet);
  }
  return trouves;
}

test('aucun fichier de src/ ne contient un populate etoile', () => {
  const motifs = [/populate=\*/, /populate\s*:\s*['"`]\*['"`]/, /populate\[/];
  const fautifs: string[] = [];
  for (const fichier of fichiersDe(SRC)) {
    const contenu = fs.readFileSync(fichier, 'utf8');
    for (const motif of motifs) {
      if (motif.test(contenu)) fautifs.push(`${path.relative(SRC, fichier)} :: ${motif}`);
    }
  }
  assert.deepEqual(fautifs, [], 'le populate se declare dans REQUETES, jamais en chaine de caracteres');
});
