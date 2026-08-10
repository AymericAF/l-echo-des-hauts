/**
 * Les trois calculs AU BUILD de la page article (§4.5 du cahier) : sommaire,
 * temps de lecture, articles lies avec repli automatique.
 *
 * Ce fichier ne teste pas un rendu, il teste les DECISIONS — c est la ou vivent les
 * modes d echec silencieux. Deux ancres identiques envoient le lecteur au mauvais
 * endroit (A-21) ; un repli qui ne se declenche pas laisse une rubrique vide sans que
 * rien ne casse (A-13). Aucun des deux ne se voit dans un build vert.
 *
 * Chaque cas est ecrit pour ECHOUER si on casse la regle qu il couvre : les valeurs
 * attendues sont posees a la main, jamais recalculees par la fonction sous test.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import type {
  Article,
  Bloc,
  Media,
  NoeudRichTexte,
  ReferenceArticle,
} from '../src/lib/domaine.ts';
import { construireSommaire, slugifier } from '../src/lib/article/sommaire.ts';
import {
  MOTS_PAR_MINUTE,
  compterMots,
  motsDeLaDynamicZone,
  tempsDeLecture,
} from '../src/lib/article/temps-lecture.ts';
import { NOMBRE_ARTICLES_LIES, articlesLies } from '../src/lib/article/articles-lies.ts';
import { nomFournisseurVideo } from '../src/lib/article/video.ts';

// ---------------------------------------------------------------------------
// fabriques : des blocs du domaine, ecrits a la main
// ---------------------------------------------------------------------------

const MEDIA: Media = {
  url: '/uploads/x.jpg',
  alternative: 'Une image',
  legende: 'Oeuvre du projet — CC0 1.0',
  largeur: 1600,
  hauteur: 900,
  mime: 'image/jpeg',
};

function texteNoeud(texte: string): NoeudRichTexte {
  return { type: 'text', text: texte };
}

function paragraphe(texte: string): NoeudRichTexte {
  return { type: 'paragraph', children: [texteNoeud(texte)] };
}

function titre(niveau: number, ...morceaux: NoeudRichTexte[]): NoeudRichTexte {
  return { type: 'heading', level: niveau, children: morceaux };
}

function blocTexte(...noeuds: NoeudRichTexte[]): Bloc {
  return { type: 'bloc.texte', contenu: noeuds };
}

function blocEncadre(titreEncadre: string | null, ...noeuds: NoeudRichTexte[]): Bloc {
  return { type: 'bloc.encadre', titre: titreEncadre, contenu: noeuds, variante: 'info' };
}

// ---------------------------------------------------------------------------
// slugifier — la brique des ancres
// ---------------------------------------------------------------------------

test('slugifier retire les accents, la ponctuation et la casse', () => {
  assert.equal(slugifier('Dix-huit mois de détours'), 'dix-huit-mois-de-detours');
  assert.equal(slugifier('Où va l’argent ?'), 'ou-va-l-argent');
  assert.equal(slugifier('  Espaces   multiples  '), 'espaces-multiples');
  assert.equal(slugifier('Ça coûte 4,2 M€'), 'ca-coute-4-2-m');
});

test('slugifier rend une valeur utilisable meme sur un titre sans caractere latin', () => {
  // Un href vide ou reduit a « # » renvoie en haut de page sans que rien ne signale l erreur.
  assert.equal(slugifier('«»— …'), 'titre');
  assert.equal(slugifier(''), 'titre');
});

// ---------------------------------------------------------------------------
// sommaire — §4.5 + A-21
// ---------------------------------------------------------------------------

test('le sommaire retient les titres de niveau 2 et 3 des blocs texte, dans l ordre', () => {
  const blocs = [
    blocTexte(titre(2, texteNoeud('Premier chapitre')), paragraphe('du texte')),
    blocTexte(titre(3, texteNoeud('Un detail')), titre(2, texteNoeud('Second chapitre'))),
  ];

  const sommaire = construireSommaire(blocs);

  assert.deepEqual(
    sommaire.entrees.map((e) => [e.niveau, e.texte, e.ancre]),
    [
      [2, 'Premier chapitre', 'premier-chapitre'],
      [3, 'Un detail', 'un-detail'],
      [2, 'Second chapitre', 'second-chapitre'],
    ],
  );
});

test('un titre de niveau 1 est retrograde en 2, comme au rendu (A-21)', () => {
  // RichTexte.astro retrograde le h1 pour que la page ne porte qu un seul <h1>. Si le
  // sommaire annoncait « niveau 1 », il decrirait un document qui n existe pas.
  const sommaire = construireSommaire([blocTexte(titre(1, texteNoeud('Titre saisi en h1')))]);

  assert.equal(sommaire.entrees.length, 1);
  assert.equal(sommaire.entrees[0]!.niveau, 2);
});

test('les titres de niveau 4 et au-dela restent hors du sommaire (§4.5)', () => {
  const sommaire = construireSommaire([
    blocTexte(titre(2, texteNoeud('Retenu')), titre(4, texteNoeud('Trop bas')), titre(5, texteNoeud('Plus bas encore'))),
  ]);

  assert.deepEqual(
    sommaire.entrees.map((e) => e.texte),
    ['Retenu'],
  );
});

test('les titres d un bloc encadre n alimentent PAS le sommaire (A-21)', () => {
  const sommaire = construireSommaire([
    blocTexte(titre(2, texteNoeud('Dans le corps'))),
    blocEncadre('Ce qu il faut retenir', titre(2, texteNoeud('Dans l encadre')), paragraphe('texte')),
  ]);

  assert.deepEqual(
    sommaire.entrees.map((e) => e.texte),
    ['Dans le corps'],
  );
});

test('aucun autre type de bloc n alimente le sommaire', () => {
  const blocs: Bloc[] = [
    { type: 'bloc.citation', texte: 'Une citation', auteurCitation: null, source: null },
    { type: 'bloc.galerie', images: [MEDIA], legende: 'Legende', disposition: 'grille' },
    { type: 'bloc.video', url: 'https://vimeo.com/1', legende: 'Video', vignette: null },
    { type: 'bloc.image-legendee', image: MEDIA, legende: 'Photo', credit: 'Credit' },
    { type: 'bloc.separateur', style: 'ligne' },
    { type: 'bloc.chiffres-cles', entrees: [{ valeur: '18', unite: 'mois', libelle: 'de fermeture' }] },
  ];

  assert.deepEqual(construireSommaire(blocs).entrees, []);
});

test('le texte d un titre est recompose a travers ses enrichissements', () => {
  const sommaire = construireSommaire([
    blocTexte(
      titre(
        2,
        texteNoeud('Le viaduc '),
        { type: 'link', url: 'https://exemple.fr', children: [{ type: 'text', text: 'rouvre' }] },
        { type: 'text', text: ' enfin', bold: true },
      ),
    ),
  ]);

  assert.equal(sommaire.entrees[0]!.texte, 'Le viaduc rouvre enfin');
  assert.equal(sommaire.entrees[0]!.ancre, 'le-viaduc-rouvre-enfin');
});

test('DEUX TITRES IDENTIQUES recoivent deux ancres distinctes (A-21)', () => {
  // Le defaut ne se voit qu en cliquant : deux ancres egales envoient le lecteur au
  // premier des deux titres, toujours. Aucun test de rendu ne l attraperait.
  const sommaire = construireSommaire([
    blocTexte(titre(2, texteNoeud('Le contexte'))),
    blocTexte(titre(2, texteNoeud('Le contexte')), titre(3, texteNoeud('Le contexte'))),
  ]);

  assert.deepEqual(
    sommaire.entrees.map((e) => e.ancre),
    ['le-contexte', 'le-contexte-2', 'le-contexte-3'],
  );
  assert.equal(new Set(sommaire.entrees.map((e) => e.ancre)).size, 3);
});

test('le dedoublonnage ne collisionne pas avec un titre qui porte deja le suffixe', () => {
  const sommaire = construireSommaire([
    blocTexte(titre(2, texteNoeud('Bilan')), titre(2, texteNoeud('Bilan 2')), titre(2, texteNoeud('Bilan'))),
  ]);

  assert.equal(new Set(sommaire.entrees.map((e) => e.ancre)).size, 3);
});

test('un titre vide ne produit ni entree de sommaire ni ancre', () => {
  const sommaire = construireSommaire([
    blocTexte(titre(2, texteNoeud('   ')), titre(2, texteNoeud('Vrai titre'))),
  ]);

  assert.deepEqual(
    sommaire.entrees.map((e) => e.texte),
    ['Vrai titre'],
  );
});

test('les ancres sont rendues par bloc, un emplacement par titre RENCONTRE', () => {
  // Le rendu pose les ancres dans l ordre des titres du bloc : si la liste sautait les
  // titres hors sommaire, toutes les ancres suivantes glisseraient d un cran et
  // pointeraient le mauvais paragraphe.
  const blocs = [
    { type: 'bloc.separateur', style: 'ligne' } as Bloc,
    blocTexte(titre(4, texteNoeud('Hors sommaire')), titre(2, texteNoeud('Dans le sommaire'))),
  ];

  const sommaire = construireSommaire(blocs);

  assert.deepEqual(sommaire.ancres.get(1), [null, 'dans-le-sommaire']);
  assert.equal(sommaire.ancres.get(0), undefined);
  assert.equal(sommaire.entrees[0]!.indexBloc, 1);
});

// ---------------------------------------------------------------------------
// temps de lecture — §4.5
// ---------------------------------------------------------------------------

test('compterMots ignore la ponctuation isolee et les espaces multiples', () => {
  assert.equal(compterMots('Le viaduc rouvre'), 3);
  assert.equal(compterMots('  Le   viaduc \n rouvre  '), 3);
  assert.equal(compterMots('Le viaduc — enfin — rouvre'), 4);
  assert.equal(compterMots('4,2 M€ de travaux'), 4);
  assert.equal(compterMots(''), 0);
  assert.equal(compterMots('   '), 0);
});

test('le comptage traverse TOUTE la Dynamic Zone, pas seulement les blocs texte', () => {
  // §4.5 : « temps de lecture derive du nombre de mots de la Dynamic Zone ». Ne compter
  // que bloc.texte sous-estimerait un article compose de citations et d encadres.
  const blocs: Bloc[] = [
    blocTexte(titre(2, texteNoeud('Trois mots ici')), paragraphe('un deux trois quatre')),
    { type: 'bloc.citation', texte: 'deux mots', auteurCitation: 'Helene Bouvier', source: 'commercante' },
    { type: 'bloc.galerie', images: [MEDIA], legende: 'legende de galerie', disposition: 'grille' },
    blocEncadre('titre encadre', paragraphe('corps de encadre')),
    { type: 'bloc.video', url: 'https://youtu.be/a', legende: 'legende video', vignette: null },
    { type: 'bloc.image-legendee', image: MEDIA, legende: 'legende image', credit: 'Photo Camille' },
    { type: 'bloc.separateur', style: 'ligne' },
    { type: 'bloc.chiffres-cles', entrees: [{ valeur: '18', unite: 'mois', libelle: 'de fermeture' }] },
  ];

  // 3 + 4 | 2 + 2 + 1 | 3 | 2 + 3 | 2 | 2 + 2 | 0 | 1 + 1 + 2
  assert.equal(motsDeLaDynamicZone(blocs), 30);
});

test('le separateur ne pese rien, et une Dynamic Zone sans texte compte zero mot', () => {
  assert.equal(motsDeLaDynamicZone([{ type: 'bloc.separateur', style: 'points' }]), 0);
});

test('le temps de lecture se derive du compte de mots, arrondi au superieur', () => {
  const mille = paragraphe(Array.from({ length: MOTS_PAR_MINUTE * 3 }, () => 'mot').join(' '));
  assert.deepEqual(tempsDeLecture([blocTexte(mille)]), { mots: MOTS_PAR_MINUTE * 3, minutes: 3 });

  const unPeuPlus = paragraphe(Array.from({ length: MOTS_PAR_MINUTE * 3 + 1 }, () => 'mot').join(' '));
  assert.equal(tempsDeLecture([blocTexte(unPeuPlus)]).minutes, 4);
});

test('un article tres court affiche 1 minute, jamais 0', () => {
  // « 0 min de lecture » se lit comme une panne d affichage, pas comme une information.
  assert.deepEqual(tempsDeLecture([blocTexte(paragraphe('Trois mots seulement'))]), {
    mots: 3,
    minutes: 1,
  });
  assert.equal(tempsDeLecture([]).minutes, 1);
});

// ---------------------------------------------------------------------------
// articles lies — champ manuel, et REPLI automatique (§4.5, A-13)
// ---------------------------------------------------------------------------

function reference(numero: number): ReferenceArticle {
  return {
    documentId: `art-manuel-${numero}`,
    titre: `Article manuel ${numero}`,
    slug: `article-manuel-${numero}`,
    chapo: 'Chapo du manuel.',
    imageCouverture: MEDIA,
  };
}

function article(options: Partial<Article> & { documentId: string }): Article {
  return {
    locale: 'fr',
    titre: `Titre de ${options.documentId}`,
    slug: `slug-de-${options.documentId}`,
    chapo: 'Chapo.',
    contenu: [blocTexte(paragraphe('corps'))],
    imageCouverture: MEDIA,
    legendeCouverture: null,
    auteur: { documentId: 'aut-1', nom: 'Camille Ferrand', slug: 'camille-ferrand' },
    categorie: { documentId: 'cat-A', nom: 'Amenagement', slug: 'amenagement', couleurAccent: null },
    tags: [],
    dossier: null,
    articlesLies: [],
    datePublication: '2026-01-01T00:00:00.000Z',
    aLaUne: false,
    seo: null,
    publishedAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    localisations: [],
    ...options,
  };
}

/** Meme categorie que le defaut de `article()`, avec une date propre. */
function voisin(id: string, date: string, categorie = 'cat-A'): Article {
  return article({
    documentId: id,
    datePublication: date,
    categorie: { documentId: categorie, nom: categorie, slug: categorie, couleurAccent: null },
  });
}

test('un champ manuel plein est rendu tel quel, dans son ordre editorial', () => {
  const sujet = article({
    documentId: 'sujet',
    articlesLies: [reference(1), reference(2), reference(3)],
  });
  const corpus = [sujet, voisin('voisin-1', '2026-06-01T00:00:00.000Z')];

  assert.deepEqual(
    articlesLies(sujet, corpus).map((a) => a.documentId),
    ['art-manuel-1', 'art-manuel-2', 'art-manuel-3'],
  );
});

test('REPLI — champ manuel vide : les plus recents de la meme categorie, hors soi-meme', () => {
  const sujet = article({ documentId: 'sujet', datePublication: '2026-05-01T00:00:00.000Z' });
  const corpus = [
    sujet,
    voisin('vieux', '2026-01-01T00:00:00.000Z'),
    voisin('recent', '2026-04-01T00:00:00.000Z'),
    voisin('moyen', '2026-02-01T00:00:00.000Z'),
    voisin('autre-categorie', '2026-04-15T00:00:00.000Z', 'cat-B'),
  ];

  assert.deepEqual(
    articlesLies(sujet, corpus).map((a) => a.documentId),
    ['recent', 'moyen', 'vieux'],
  );
});

test('REPLI — un champ manuel partiel est COMPLETE, sans doublon ni perte de l ordre editorial', () => {
  const sujet = article({ documentId: 'sujet', articlesLies: [reference(1)] });
  const corpus = [
    sujet,
    voisin('art-manuel-1', '2026-06-01T00:00:00.000Z'),
    voisin('voisin-a', '2026-03-01T00:00:00.000Z'),
    voisin('voisin-b', '2026-02-01T00:00:00.000Z'),
    voisin('voisin-c', '2026-01-01T00:00:00.000Z'),
  ];

  const rendus = articlesLies(sujet, corpus);

  assert.deepEqual(
    rendus.map((a) => a.documentId),
    ['art-manuel-1', 'voisin-a', 'voisin-b'],
  );
  assert.equal(new Set(rendus.map((a) => a.documentId)).size, rendus.length);
});

test('REPLI — le plafond de 3 n est jamais depasse, meme avec un corpus abondant', () => {
  const sujet = article({ documentId: 'sujet' });
  const corpus = [
    sujet,
    ...Array.from({ length: 12 }, (_, i) => voisin(`v-${i}`, `2026-0${(i % 9) + 1}-01T00:00:00.000Z`)),
  ];

  assert.equal(articlesLies(sujet, corpus).length, NOMBRE_ARTICLES_LIES);
});

test('REPLI — une autre LOCALE ne fournit jamais de candidat', () => {
  // A-06 : une relation est localisee d office ; une carte anglaise sous un article
  // francais serait un lien vers une page que le lecteur ne lit pas.
  const sujet = article({ documentId: 'sujet' });
  const corpus = [
    sujet,
    { ...voisin('anglais', '2026-06-01T00:00:00.000Z'), locale: 'en' as const },
  ];

  assert.deepEqual(articlesLies(sujet, corpus), []);
});

test('REPLI — moins de 3 candidats : on rend ce qui existe, sans remplissage', () => {
  // A-13, precision du 2026-08-07 : sur 8 articles EN le repli peut rendre moins de 3
  // cartes. La mise en page doit tenir a 1 et a 2 — encore faut-il que le calcul le
  // permette au lieu d aller chercher ailleurs.
  const sujet = article({ documentId: 'sujet' });
  const corpus = [sujet, voisin('unique', '2026-06-01T00:00:00.000Z')];

  assert.deepEqual(
    articlesLies(sujet, corpus).map((a) => a.documentId),
    ['unique'],
  );
});

test('REPLI — un corpus sans voisin de categorie ne rend rien plutot que n importe quoi', () => {
  const sujet = article({ documentId: 'sujet' });
  const corpus = [sujet, voisin('ailleurs', '2026-06-01T00:00:00.000Z', 'cat-B')];

  assert.deepEqual(articlesLies(sujet, corpus), []);
});

test('REPLI — a date egale, l ordre reste total et deterministe (A-16)', () => {
  // Sans cle de departage, deux articles de meme date sortent dans l ordre que la base
  // veut bien donner : la page bougerait d un build a l autre sans qu un contenu change.
  const sujet = article({ documentId: 'sujet' });
  const meme = '2026-06-01T00:00:00.000Z';
  const ordre1 = [sujet, voisin('b', meme), voisin('a', meme), voisin('c', meme)];
  const ordre2 = [sujet, voisin('c', meme), voisin('b', meme), voisin('a', meme)];

  assert.deepEqual(
    articlesLies(sujet, ordre1).map((a) => a.documentId),
    articlesLies(sujet, ordre2).map((a) => a.documentId),
  );
});

test('REPLI — la carte de secours porte tout ce qu une carte affiche', () => {
  const sujet = article({ documentId: 'sujet' });
  const corpus = [sujet, voisin('voisin', '2026-06-01T00:00:00.000Z')];

  assert.deepEqual(articlesLies(sujet, corpus)[0], {
    documentId: 'voisin',
    titre: 'Titre de voisin',
    slug: 'slug-de-voisin',
    chapo: 'Chapo.',
    imageCouverture: MEDIA,
  });
});

// ---------------------------------------------------------------------------
// bloc.video — le libelle du lien sortant (T-01)
// ---------------------------------------------------------------------------

test('le fournisseur video se lit sur l hote, sans aucun appel reseau', () => {
  assert.equal(nomFournisseurVideo('https://www.youtube.com/watch?v=aaa'), 'YouTube');
  assert.equal(nomFournisseurVideo('https://youtu.be/aaa'), 'YouTube');
  assert.equal(nomFournisseurVideo('https://www.youtube-nocookie.com/embed/aaa'), 'YouTube');
  assert.equal(nomFournisseurVideo('https://vimeo.com/123456'), 'Vimeo');
  assert.equal(nomFournisseurVideo('https://player.vimeo.com/video/123456'), 'Vimeo');
});

test('un fournisseur inconnu ou une URL illisible ne fabrique pas de nom', () => {
  assert.equal(nomFournisseurVideo('https://exemple.fr/une-video.mp4'), null);
  assert.equal(nomFournisseurVideo('pas une url'), null);
});
