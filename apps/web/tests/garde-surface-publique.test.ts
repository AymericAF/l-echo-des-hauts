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
    { chemin: '/api/articles?populate=*', role: 'public', brouillon: false, brouillonsActifs: true, profond: true, statut: 401 },
    { chemin: '/api/articles?populate=*&status=draft', role: 'public', brouillon: true, brouillonsActifs: true, profond: true, statut: 401 },
    { chemin: '/api/articles', role: 'jeton', brouillon: false, brouillonsActifs: true, statut: 200 },
    { chemin: '/api/configuration', role: 'public', brouillon: false, brouillonsActifs: false, statut: 403 },
    { chemin: '/api/configuration', role: 'jeton', brouillon: false, brouillonsActifs: false, statut: 200 },
  ];
}

// --- Famille 1 : le sens ROUGE — le role Public sert quelque chose ----------------------

/** Un lot ou le role SERT les endpoints, contenu propre — l etat voulu par la branche A. */
function sondesServies() {
  const publie = (id) => ({ data: [{ id, publishedAt: '2026-08-01T10:00:00.000Z' }] });
  return [
    { chemin: '/api/articles', role: 'public', brouillon: false, brouillonsActifs: true, statut: 200, corps: publie(1) },
    { chemin: '/api/articles?status=draft', role: 'public', brouillon: true, brouillonsActifs: true, statut: 200, corps: publie(1) },
    { chemin: '/api/articles', role: 'jeton', brouillon: false, brouillonsActifs: true, statut: 200 },
    { chemin: '/api/configuration', role: 'public', brouillon: false, brouillonsActifs: false, statut: 200, corps: publie(2) },
    { chemin: '/api/configuration', role: 'jeton', brouillon: false, brouillonsActifs: false, statut: 200 },
  ];
}

/* Les quatre tests qui suivent gardaient le meme rouge sous la branche B, ou le
   DECLENCHEUR etait l ouverture (`200` sans jeton). Sous la branche A l ouverture est
   l etat VOULU : le declencheur devient le CONTENU non publie. Ce qu ils exigeaient du
   rouge — nommer l endpoint, qualifier la fuite, rester exact, ne rien agreger — est
   inchange, et c est pour cela qu ils sont reecrits et non retires. */

test('une reponse publique qui porte du non publie est un manquement, et il NOMME l endpoint', () => {
  const sondes = sondesServies();
  sondes[0] = { ...sondes[0], corps: { data: [{ id: 4, publishedAt: null }] } };
  const rapport = jugerSondes(sondes);

  assert.equal(rapport.issue, ISSUES.ANOMALIE);
  assert.equal(rapport.manquements.length, 1);
  // Le rouge doit envoyer quelque part : le chemin exact, pas « l API est ouverte ».
  assert.match(rapport.manquements[0], /\/api\/articles/);
  assert.match(rapport.manquements[0], /200/);
});

test('un non publie servi sans jeton est qualifie de FUITE EDITORIALE, et le geste nomme le middleware', () => {
  const sondes = sondesServies();
  sondes[1] = { ...sondes[1], corps: { data: [{ id: 5, publishedAt: null }] } };
  const rapport = jugerSondes(sondes);

  assert.equal(rapport.issue, ISSUES.ANOMALIE);
  assert.equal(rapport.manquements.length, 1);
  assert.match(rapport.manquements[0], /status=draft/);
  // La distinction n est pas cosmetique : un brouillon lisible est une fuite de contenu
  // non publie, pas un reglage trop large. Les deux n appellent pas la meme urgence.
  assert.match(rapport.manquements[0], /FUITE EDITORIALE/);
  // Et sous la branche A le geste a change : ce n est plus « fermer la permission » en
  // premier, c est regarder le middleware — la fermeture n etant que l urgence.
  assert.match(rapport.manquements[0], /statut-publie/);
});

test('un type SANS brouillon/publie ne peut pas produire de fuite : il n a pas de publishedAt', () => {
  /* Constate en mesurant le 2026-08-10 : `?status=draft` est accepte par Strapi sur TOUS
     les types, y compris ceux ou `draftAndPublish` est a `false` — ou il est inerte.
     Annoncer « un article non publie est lisible » sur `/api/tags` serait une conclusion
     fausse tiree d une mesure juste. Sous le critere de CONTENU, l exactitude est
     structurelle : une entree sans champ `publishedAt` n est jamais comptee comme non
     publiee, donc un type inerte ne peut PAS declencher la fuite. */
  const sondes = [
    { chemin: '/api/tags?status=draft', role: 'public', brouillon: true, brouillonsActifs: false,
      statut: 200, corps: { data: [{ id: 1, nom: 'Local' }] } },
    { chemin: '/api/articles?status=draft', role: 'public', brouillon: true, brouillonsActifs: true,
      statut: 200, corps: { data: [{ id: 2, publishedAt: null }] } },
    ...sondesServies().filter((s) => s.role === 'jeton'),
  ];
  const rapport = jugerSondes(sondes);

  assert.equal(rapport.manquements.length, 1, 'seul le type qui porte le brouillon doit rougir');
  assert.match(rapport.manquements[0], /\/api\/articles/);
  assert.doesNotMatch(rapport.manquements.join(' '), /\/api\/tags/);
});

test('chaque endpoint qui fuit produit SON manquement — aucun n est resume ni avale', () => {
  const nonPublie = { data: [{ id: 3, publishedAt: null }] };
  const sondes = sondesServies().map((s) => (s.role === 'public' ? { ...s, corps: nonPublie } : s));
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
  assert.match(resume, /5 sonde\(s\) publique\(s\) refusee\(s\)/);
  assert.match(resume, /2 .*jeton/);
  // Et le compte de brouillons REELS a part du compte de sondes `?status=draft` : sans
  // cette distinction, six sondes inertes se liraient comme six brouillons proteges.
  assert.match(resume, /2 sur un type qui porte reellement/);
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

// --- Famille 4 : la BRANCHE A — le role reste ouvert, le code ferme la fuite ------------
//
// La decision 7106948b a tranche la branche A : la fuite se ferme PAR DU CODE
// (`global::statut-publie`), et le role Public reste ouvert conformement au §3.9. Ce
// verificateur avait ete ecrit du temps de la branche B (« fermer le role ») : tout 200
// public y etait un manquement, le contenu n etait jamais lu. Il rendait donc l etat
// retenu IMMESURABLE — rouvrir les 11 permissions produisait une douzaine de manquements
// que le middleware fonctionne ou non, et « 0 avec le role OUVERT » etait inatteignable.
//
// Ce qui rougit desormais n est plus l OUVERTURE, c est le BROUILLON LISIBLE.

/** Une date de publication quelconque — sa VALEUR n a aucune importance, seule sa non-nullite en a. */
const PUBLIE = '2026-08-01T10:00:00.000Z';

/**
 * Le corps d une reponse `?populate=*` : la racine ET ses relations imbriquees portent
 * chacune leur `publishedAt`. C est cette forme-la que la garde doit parcourir en entier —
 * un scan limite a la racine la declarerait propre sans avoir regarde les relations.
 */
function corpsPopulate(publishedAtDuTag = PUBLIE) {
  return {
    data: [
      {
        id: 1,
        publishedAt: PUBLIE,
        auteur: { id: 3, publishedAt: PUBLIE },
        categorie: { id: 4, publishedAt: PUBLIE },
        tags: [{ id: 5, publishedAt: publishedAtDuTag }],
      },
    ],
  };
}

/** Un lot branche A : le role sert les endpoints, et le contenu servi est du publie. */
function sondesBrancheA() {
  return [
    { chemin: '/api/articles', role: 'public', brouillon: false, brouillonsActifs: true, statut: 200,
      corps: { data: [{ id: 1, publishedAt: PUBLIE }] } },
    { chemin: '/api/articles?status=draft', role: 'public', brouillon: true, brouillonsActifs: true, statut: 200,
      corps: { data: [{ id: 1, publishedAt: PUBLIE }] } },
    { chemin: '/api/articles?populate=*', role: 'public', brouillon: false, brouillonsActifs: true,
      profond: true, statut: 200, corps: corpsPopulate() },
    { chemin: '/api/articles?populate=*&status=draft', role: 'public', brouillon: true, brouillonsActifs: true,
      profond: true, statut: 200, corps: corpsPopulate() },
    { chemin: '/api/articles', role: 'jeton', brouillon: false, brouillonsActifs: true, statut: 200 },
    { chemin: '/api/configuration', role: 'public', brouillon: false, brouillonsActifs: false, statut: 200,
      corps: { data: { id: 1, publishedAt: PUBLIE } } },
    { chemin: '/api/configuration', role: 'jeton', brouillon: false, brouillonsActifs: false, statut: 200 },
  ];
}

test('branche A : un endpoint OUVERT dont le contenu ne porte que du publie n est pas un manquement', () => {
  const rapport = jugerSondes(sondesBrancheA());
  assert.deepEqual(rapport.manquements, []);
  assert.equal(rapport.issue, ISSUES.CONFORME);
});

test('branche A : une entree a publishedAt null dans une reponse PUBLIQUE est une FUITE', () => {
  /* Le discriminant du middleware. Il impose `status=published` a l appelant sans
     credence : la reponse ne peut donc porter que des versions publiees. Une entree a
     `publishedAt: null` prouve que `?status=draft` a ete honore — c est la fuite du
     2026-08-10, celle qui rendait un article non publie titre et corps compris. */
  const fuite = sondesBrancheA();
  fuite[1] = { ...fuite[1], corps: { data: [{ id: 7, publishedAt: null }] } };
  const rapport = jugerSondes(fuite);
  assert.equal(rapport.issue, ISSUES.ANOMALIE);
  const dit = rapport.manquements.join(' ');
  assert.match(dit, /\/api\/articles\?status=draft/);
  assert.match(dit, /FUITE EDITORIALE/);
  // Le compte des entrees non publiees est NOMME : « il y a une fuite » sans son ampleur
  // se discute au lieu de se corriger.
  assert.match(dit, /1 entree\(s\) non publiee\(s\)/);
});

test('branche A : le vert nomme les brouillons SERVIS ET PROTEGES, a part des refuses', () => {
  /* Un 0 avec le role FERME ne prouve que la fermeture — c est ecrit dans d9ca105f. Le
     resume doit donc permettre de lire LEQUEL des deux etats a ete mesure, sans quoi les
     deux verts sont indiscernables. */
  const resume = resumeSurface(jugerSondes(sondesBrancheA()));
  assert.match(resume, /2 brouillon\(s\) SERVI\(S\) et verifie\(s\) sans aucune entree non publiee/);
});

test('role ferme : le resume annonce ZERO brouillon servi protege — la fermeture n est pas une protection', () => {
  const resume = resumeSurface(jugerSondes(sondesConformes()));
  assert.match(resume, /0 brouillon\(s\) SERVI\(S\)/);
});

test('un 200 public dont le corps n a pas pu etre lu est une INCAPACITE, jamais un vert', () => {
  /* Sans le corps, la garde ne peut pas distinguer une protection d une fuite. Rendre
     conforme faute de mesure serait exactement le mode d echec que cette famille corrige,
     retourne : un vert obtenu sur rien. */
  const muette = sondesBrancheA();
  muette[1] = { chemin: '/api/articles?status=draft', role: 'public', brouillon: true,
                brouillonsActifs: true, statut: 200, corps: undefined };
  const rapport = jugerSondes(muette);
  assert.equal(rapport.issue, ISSUES.VERIFICATION_IMPOSSIBLE);
  assert.match(rapport.manquements.join(' '), /corps|contenu/i);
});

test('le jeton de build GARDE ses brouillons : un publishedAt null par le jeton n est pas une fuite', () => {
  /* L application d apercu en depend, et trois tests du middleware le tiennent. Ce
     verificateur ne doit pas contredire cette exigence en accusant le jeton. */
  const avecJeton = sondesBrancheA();
  avecJeton.push({ chemin: '/api/articles?status=draft', role: 'jeton', brouillon: true,
                   brouillonsActifs: true, statut: 200, corps: { data: [{ id: 9, publishedAt: null }] } });
  const rapport = jugerSondes(avecJeton);
  assert.deepEqual(rapport.manquements, []);
  assert.equal(rapport.issue, ISSUES.CONFORME);
});

// --- Famille 5 : la PROFONDEUR — `?populate=*` et les relations imbriquees ---------------
//
// Le middleware `global::statut-publie` impose `status=published` sur la query RACINE. Que
// cette contrainte se propage aux relations ramenees par `?populate=*` est un RAISONNEMENT
// sur le comportement de Strapi, pas un fait mesure : c est le seul point du lot « role
// Public » qui ne reposait sur rien d autre. Un scan limite a la racine rendrait exactement
// le meme vert qu une instance saine si une relation imbriquee fuyait — le mode d echec de
// l etape 21, deplace d un cran en profondeur.

test('profondeur : un publishedAt null dans une RELATION imbriquee est une fuite', () => {
  const fuite = sondesBrancheA();
  const i = fuite.findIndex((s) => s.chemin === '/api/articles?populate=*&status=draft');
  fuite[i] = { ...fuite[i], corps: corpsPopulate(null) };
  const rapport = jugerSondes(fuite);

  assert.equal(rapport.issue, ISSUES.ANOMALIE);
  const dit = rapport.manquements.join(' ');
  assert.match(dit, /FUITE EDITORIALE/);
  // Le rouge doit envoyer QUELQUE PART : un « il y a une fuite quelque part dans la reponse »
  // se discute, un chemin se corrige. La racine etant propre, seul le chemin de la relation
  // dit ou regarder.
  assert.match(dit, /tags/);
  assert.match(dit, /publishedAt/);
});

test('profondeur : la racine propre ne suffit plus a rendre vert', () => {
  /* La garde d avant ce lot lisait `corps.data[i].publishedAt` et rien d autre. Sur le corps
     ci-dessous elle rendait 0 : la racine est publiee, la fuite est dans le tag. Ce test
     echouerait sur elle — c est ce qui prouve que la profondeur est reellement parcourue. */
  const racinePropre = { data: [{ id: 1, publishedAt: PUBLIE, tags: [{ id: 5, publishedAt: null }] }] };
  const sondes = sondesBrancheA();
  const i = sondes.findIndex((s) => s.chemin === '/api/articles?populate=*');
  sondes[i] = { ...sondes[i], corps: racinePropre };

  assert.equal(jugerSondes(sondes).issue, ISSUES.ANOMALIE);
});

test('profondeur : le plan de sondes exerce `?populate=*` sur CHAQUE type, sans jeton et avec', () => {
  const sondes = sondesAttendues(SURFACE);
  for (const entree of SURFACE) {
    for (const role of ['public', 'jeton']) {
      const siennes = sondes.filter(
        (s) => s.role === role && s.chemin.startsWith(`/api/${entree.chemin}?populate=*`),
      );
      assert.ok(
        siennes.some((s) => !s.brouillon) && siennes.some((s) => s.brouillon),
        `${entree.chemin} (${role}) : il manque une sonde ?populate=* — avec et sans status=draft`,
      );
      assert.ok(siennes.every((s) => s.profond === true), `${entree.chemin} : sonde populate non marquee profonde`);
    }
  }
});

test('profondeur : un lot SANS aucune sonde `?populate=*` ne peut pas rendre le vert', () => {
  /* Le critere le plus grave de cette famille. Sans lui, un plan qui perdrait ses sondes de
     profondeur — refonte, filtre, regression — rendrait un vert rigoureusement identique a
     celui d une instance dont les relations ont ete verifiees. C est la meme exigence que
     celle qui porte deja sur les brouillons, un cran plus bas. */
  const sansProfondeur = sondesBrancheA().filter((s) => !s.profond);
  const rapport = jugerSondes(sansProfondeur);

  assert.equal(rapport.issue, ISSUES.VERIFICATION_IMPOSSIBLE);
  assert.match(rapport.manquements.join(' '), /populate/);
});

test('profondeur : le vert ANNONCE combien de publishedAt ont ete inspectes', () => {
  /* Une sonde `?populate=*` qui ramenerait un document PLAT — relations absentes, populate
     ignore par l instance — rendrait le meme vert qu une sonde qui a reellement parcouru les
     relations. Seul le compte des `publishedAt` rencontres distingue les deux. */
  const resume = resumeSurface(jugerSondes(sondesBrancheA()));
  assert.match(resume, /publishedAt inspecte/);
  // 2 sondes populate x 4 publishedAt (racine + auteur + categorie + tag) = 8, plus les
  // 3 sondes non profondes a 1 chacune.
  assert.match(resume, /11 publishedAt inspecte/);
});

test('profondeur : le jeton GARDE ses brouillons, relations imbriquees comprises', () => {
  /* Symetrique du test de la famille 4 : l application d apercu lit des brouillons avec le
     jeton, et la garde ne doit pas les lui reprocher — a aucune profondeur. */
  const avecJeton = sondesBrancheA();
  avecJeton.push({ chemin: '/api/articles?populate=*&status=draft', role: 'jeton', brouillon: true,
                   brouillonsActifs: true, profond: true, statut: 200, corps: corpsPopulate(null) });
  const rapport = jugerSondes(avecJeton);
  assert.deepEqual(rapport.manquements, []);
  assert.equal(rapport.issue, ISSUES.CONFORME);
});
