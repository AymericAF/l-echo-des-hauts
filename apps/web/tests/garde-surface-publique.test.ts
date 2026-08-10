/**
 * Tests de la garde « surface publique de l API » — le role Public de Strapi sert-il
 * quelque chose a qui ne presente AUCUN jeton ?
 *
 * LE DEFAUT QUE CETTE GARDE FERME, et il etait la depuis le provisionnement. Mesure le
 * 2026-08-10 : `https://echoback.ayfiweb.fr/api/articles` repondait `200` sans jeton, et
 * `…/api/articles?status=draft` AUSSI — c est-a-dire que les brouillons non publies
 * etaient lisibles par n importe qui. Prouve par temoin : un article cree en brouillon,
 * jamais publie, etait rendu titre et corps compris a un appelant sans jeton.
 *
 * CE QUI EST PIRE QUE LE TROU, ET QUI EST LA VRAIE RAISON DE CE FICHIER : la preuve qui
 * existait, celle de l etape 21 du runbook, mesurait `/api/upload/files`. Cet endpoint
 * repondait bien `403` sans jeton — parce que le role Public ne l a JAMAIS servi. La
 * preuve passait donc au vert sur une surface qui n etait pas la surface exposee, tout en
 * annoncant dans son propre texte « si les deux repondent 200, c est le role public qui
 * est trop ouvert ». Elle n exercait pas le critere qu elle pretendait exercer :
 * `[[preuve-doit-exercer-critere-acceptation]]`.
 *
 * D OU CETTE GARDE TIRE SA LISTE, et pourquoi ce n est pas une liste ecrite a la main. La
 * surface se DERIVE des schemas de `apps/cms/src/api/*` — la seule source qui dise quels
 * types de contenu existent, donc quels `api::*.find` une permission peut ouvrir. Une
 * liste recopiee ici serait exactement le defaut d origine : le jour ou un septieme type
 * de contenu apparait, une liste figee reste verte sans l avoir jamais interroge.
 *
 * LES DEUX SENS SONT EXERCES ICI. Role trop ouvert -> rouge en NOMMANT l endpoint, et en
 * distinguant la fuite de brouillon du reste. Role correct -> vert en ANNONCANT ce qui a
 * ete confronte (les chemins, le compte de sondes refusees, le compte de sondes ouvertes
 * par le jeton). Et la troisieme issue existe : quand la mesure n a PAS PU avoir lieu
 * (variable absente, reseau muet, aucun type de contenu trouve), la garde rend `2` et ne
 * se fait jamais passer pour un vert — `[[quand-succes-et-echec-rendent-la-meme-sortie]]`.
 *
 * LE PIEGE DU 2026-08-04 EST FERME ICI AUSSI. Un `ECHO_STRAPI_API_TOKEN_READONLY` absent
 * donne un en-tete `Bearer ` vide, auquel Strapi repond `403` — soit exactement le code
 * attendu de la ligne « sans jeton ». La preuve d origine rendait alors `403 / 403` sur
 * une installation parfaitement correcte, et le seul geste qu elle suggerait etait de
 * regenerer un jeton qui n avait rien. Ici, la variable absente rend `2` en la NOMMANT, et
 * un jeton qui n ouvre plus rien rend un manquement qui dit d aller regarder le nom de la
 * variable avant d accuser le jeton.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  jugerSondes,
  resumeSurface,
  sondesAttendues,
  surfaceDepuisSchemas,
  VARIABLES_REQUISES,
} from '../scripts/verifier-surface-publique.mjs';
import { ISSUES } from '../scripts/issues.mjs';

/** La surface reelle du projet, telle que les schemas la declarent. */
const SURFACE = [
  { type: 'api::article.article', chemin: 'articles', collection: true, brouillons: true },
  { type: 'api::auteur.auteur', chemin: 'auteurs', collection: true, brouillons: false },
  { type: 'api::configuration.configuration', chemin: 'configuration', collection: false, brouillons: false },
];

/** Un lot de sondes toutes conformes : le public est refuse, le jeton ouvre. */
function sondesConformes() {
  return [
    { chemin: '/api/articles', role: 'public', brouillon: false, brouillonsActifs: true, statut: 401 },
    { chemin: '/api/articles?status=draft', role: 'public', brouillon: true, brouillonsActifs: true, statut: 401 },
    { chemin: '/api/articles', role: 'jeton', brouillon: false, brouillonsActifs: true, statut: 200 },
    { chemin: '/api/configuration', role: 'public', brouillon: false, brouillonsActifs: false, statut: 403 },
    { chemin: '/api/configuration', role: 'jeton', brouillon: false, brouillonsActifs: false, statut: 200 },
  ];
}

// --- Famille 1 : le sens ROUGE — le role Public sert quelque chose ----------------------

test('un 200 sans jeton est un manquement, et le manquement NOMME l endpoint', () => {
  const sondes = sondesConformes();
  sondes[0] = { ...sondes[0], statut: 200 };
  const rapport = jugerSondes(sondes);

  assert.equal(rapport.issue, ISSUES.ANOMALIE);
  assert.equal(rapport.manquements.length, 1);
  // Le rouge doit envoyer quelque part : le chemin exact, pas « l API est ouverte ».
  assert.match(rapport.manquements[0], /\/api\/articles/);
  assert.match(rapport.manquements[0], /200/);
});

test('un 200 sans jeton sur une sonde de BROUILLON est qualifie de fuite editoriale', () => {
  const sondes = sondesConformes();
  sondes[1] = { ...sondes[1], statut: 200 };
  const rapport = jugerSondes(sondes);

  assert.equal(rapport.issue, ISSUES.ANOMALIE);
  assert.equal(rapport.manquements.length, 1);
  assert.match(rapport.manquements[0], /status=draft/);
  // La distinction n est pas cosmetique : un brouillon lisible est une fuite de contenu
  // non publie, pas un reglage trop large. Les deux n appellent pas la meme urgence.
  assert.match(rapport.manquements[0], /fuite|brouillon/i);
});

test('la fuite editoriale n est annoncee que sur un type qui PORTE reellement le brouillon', () => {
  // Constate en mesurant pour de vrai le 2026-08-10 : `?status=draft` est accepte par
  // Strapi sur TOUS les types, y compris ceux ou `draftAndPublish` est a `false` — ou il
  // est simplement inerte. Annoncer « un article non publie est lisible » sur `/api/tags`
  // serait une conclusion fausse tiree d une mesure juste : l endpoint est bien ouvert,
  // mais il n y a aucun brouillon derriere. Le rouge doit rester exact, sinon il se
  // discute au lieu de se corriger.
  const sondes = [
    { chemin: '/api/tags?status=draft', role: 'public', brouillon: true, brouillonsActifs: false, statut: 200 },
    { chemin: '/api/articles?status=draft', role: 'public', brouillon: true, brouillonsActifs: true, statut: 200 },
    ...sondesConformes().filter((s) => s.role === 'jeton'),
  ];
  const rapport = jugerSondes(sondes);

  const surTags = rapport.manquements.find((m) => m.includes('/api/tags'));
  const surArticles = rapport.manquements.find((m) => m.includes('/api/articles'));
  assert.doesNotMatch(surTags, /FUITE EDITORIALE/);
  assert.match(surTags, /inerte|ne porte pas/i);
  assert.match(surArticles, /FUITE EDITORIALE/);
});

test('chaque endpoint ouvert produit SON manquement — aucun n est resume ni avale', () => {
  const sondes = sondesConformes().map((s) => (s.role === 'public' ? { ...s, statut: 200 } : s));
  const rapport = jugerSondes(sondes);

  assert.equal(rapport.issue, ISSUES.ANOMALIE);
  assert.equal(rapport.manquements.length, 3);
  assert.equal(rapport.manquements.filter((m) => /\/api\/articles/.test(m)).length, 2);
  assert.equal(rapport.manquements.filter((m) => /\/api\/configuration/.test(m)).length, 1);
});

test('un jeton qui n ouvre plus rien est un manquement qui envoie regarder le NOM de la variable', () => {
  // Le defaut du 2026-08-04 : variable absente -> `Bearer ` vide -> 403, soit le meme code
  // que « sans jeton ». La garde ne doit pas le confondre avec un role bien ferme.
  const sondes = sondesConformes().map((s) => (s.role === 'jeton' ? { ...s, statut: 403 } : s));
  const rapport = jugerSondes(sondes);

  assert.equal(rapport.issue, ISSUES.ANOMALIE);
  assert.equal(rapport.manquements.length, 2);
  for (const manquement of rapport.manquements) {
    assert.match(manquement, new RegExp(VARIABLES_REQUISES.jeton));
  }
});

// --- Famille 2 : le sens VERT — et ce que le vert doit ANNONCER -------------------------

test('un role Public entierement ferme ne produit aucun manquement', () => {
  const rapport = jugerSondes(sondesConformes());
  assert.deepEqual(rapport.manquements, []);
  assert.equal(rapport.issue, ISSUES.CONFORME);
});

test('le vert ANNONCE ce qui a ete confronte : les chemins, les refus, les ouvertures', () => {
  const resume = resumeSurface(jugerSondes(sondesConformes()));

  // Les chemins sont nommes : un vert muet ressemble trait pour trait a un vert obtenu
  // sur une surface qui n est pas celle exposee — le defaut meme de l etape 21.
  assert.match(resume, /\/api\/articles/);
  assert.match(resume, /\/api\/configuration/);
  // Les brouillons sont nommes SEPAREMENT : c est le point le plus grave, il ne doit pas
  // se dissoudre dans un compte global.
  assert.match(resume, /brouillon/i);
  // Les deux comptes, pour qu un vert obtenu sur zero sonde saute aux yeux.
  assert.match(resume, /3 sonde\(s\) publique\(s\) refusee\(s\)/);
  assert.match(resume, /2 .*jeton/);
  // Et le compte de brouillons REELS a part du compte de sondes `?status=draft` : sans
  // cette distinction, six sondes inertes se liraient comme six brouillons proteges.
  assert.match(resume, /1 sur un type qui porte reellement/);
});

test('le vert ne peut pas etre obtenu sans avoir interroge de brouillon', () => {
  // Une surface sans aucune sonde `status=draft` est une surface qui n a pas exerce le
  // critere le plus grave : la garde le refuse plutot que de rendre un vert partiel.
  const sansBrouillon = sondesConformes().filter((s) => !s.brouillon);
  const rapport = jugerSondes(sansBrouillon);
  assert.equal(rapport.issue, ISSUES.VERIFICATION_IMPOSSIBLE);
  assert.match(rapport.manquements.join(' '), /brouillon/i);
});

test('le vert ne peut pas etre obtenu sur des brouillons INERTES seulement', () => {
  // Six sondes `?status=draft` toutes refusees dont aucune sur un type portant reellement
  // le brouillon/publie : le compte est rassurant, la couverture est nulle. C est le
  // defaut de l etape 21 sous un autre deguisement — beaucoup de mesures, aucune sur
  // l objet du critere.
  const inertes = sondesConformes().map((s) => ({ ...s, brouillonsActifs: false }));
  const rapport = jugerSondes(inertes);
  assert.equal(rapport.issue, ISSUES.VERIFICATION_IMPOSSIBLE);
  assert.match(rapport.manquements.join(' '), /draftAndPublish|porte reellement|inerte/i);
});

// --- Famille 3 : la troisieme issue — la mesure n a PAS eu lieu -------------------------

test('zero sonde rend VERIFICATION_IMPOSSIBLE, jamais le vert de celle qui a mesure', () => {
  const rapport = jugerSondes([]);
  assert.equal(rapport.issue, ISSUES.VERIFICATION_IMPOSSIBLE);
  assert.notEqual(rapport.manquements.length, 0);
});

test('une sonde en erreur reseau rend 2, et n est jamais comptee comme un refus', () => {
  const sondes = [...sondesConformes(), { chemin: '/api/tags', role: 'public', brouillon: false, erreur: 'ECONNREFUSED' }];
  const rapport = jugerSondes(sondes);
  assert.equal(rapport.issue, ISSUES.VERIFICATION_IMPOSSIBLE);
  assert.match(rapport.manquements.join(' '), /\/api\/tags/);
  assert.match(rapport.manquements.join(' '), /ECONNREFUSED/);
});

test('un 404 sur une sonde publique est une INCAPACITE : un chemin absent ne prouve aucune fermeture', () => {
  const sondes = sondesConformes();
  sondes[0] = { ...sondes[0], statut: 404 };
  const rapport = jugerSondes(sondes);
  assert.equal(rapport.issue, ISSUES.VERIFICATION_IMPOSSIBLE);
  assert.match(rapport.manquements.join(' '), /404/);
});

// --- Famille 4 : la surface se DERIVE, elle ne se recopie pas ---------------------------

test('la surface se lit dans les schemas du CMS, avec le chemin REST de chaque type', () => {
  const surface = surfaceDepuisSchemas(new URL('../../cms/src/api', import.meta.url));
  const chemins = surface.map((s) => s.chemin).sort();

  // Les six types du modele. Si le CMS en gagne un septieme, il apparait ici tout seul —
  // c est tout l interet de deriver plutot que de recopier.
  assert.deepEqual(chemins, ['articles', 'auteurs', 'categories', 'configuration', 'dossiers', 'tags']);

  // Le single type s adresse au SINGULIER : `/api/configuration`, jamais `/api/configurations`.
  const configuration = surface.find((s) => s.type === 'api::configuration.configuration');
  assert.equal(configuration.collection, false);
  assert.equal(configuration.chemin, 'configuration');

  // Seul `article` porte le brouillon/publie : c est le seul dont `?status=draft` a un sens.
  assert.equal(surface.find((s) => s.chemin === 'articles').brouillons, true);
  assert.equal(surface.find((s) => s.chemin === 'tags').brouillons, false);
});

test('une racine de schemas introuvable ne rend pas une surface vide : elle leve', () => {
  assert.throws(
    () => surfaceDepuisSchemas(new URL('../../cms/src/api-qui-n-existe-pas', import.meta.url)),
    /api-qui-n-existe-pas/,
  );
});

test('les sondes attendues couvrent, pour chaque type, le public ET le jeton, brouillons compris', () => {
  const sondes = sondesAttendues(SURFACE);

  // Chaque type est interroge sans jeton ET avec : sans le second, un role ferme et un
  // jeton mort rendent la meme sortie.
  for (const entree of SURFACE) {
    const siennes = sondes.filter((s) => s.chemin.startsWith(`/api/${entree.chemin}`));
    assert.ok(siennes.some((s) => s.role === 'public'), `aucune sonde publique sur ${entree.chemin}`);
    assert.ok(siennes.some((s) => s.role === 'jeton'), `aucune sonde jeton sur ${entree.chemin}`);
  }

  // Le brouillon est sonde sur CHAQUE type, y compris ceux qui ne portent pas le
  // brouillon/publie : `?status=draft` y est inoffensif, et le jour ou l option est
  // activee sur l un d eux, la sonde existe deja.
  for (const entree of SURFACE) {
    const sienne = sondes.find(
      (s) => s.brouillon && s.role === 'public' && s.chemin.startsWith(`/api/${entree.chemin}`),
    );
    assert.ok(sienne, `aucune sonde de brouillon sur ${entree.chemin}`);
    // La sonde PORTE l information « ce type a-t-il reellement des brouillons ? ». Sans
    // elle, le jugement ne peut pas distinguer une fuite d un parametre inerte.
    assert.equal(sienne.brouillonsActifs, entree.brouillons);
  }

  // `/api/upload/files` reste sonde — c est la surface que mesurait l ancienne preuve.
  // Elle n est plus LA preuve, elle en devient une ligne parmi les autres.
  assert.ok(sondes.some((s) => s.chemin === '/api/upload/files' && s.role === 'public'));
});
