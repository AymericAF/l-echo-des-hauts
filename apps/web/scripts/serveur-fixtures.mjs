/**
 * Un Strapi de substitution, servi depuis les fixtures de `tests/fixtures/`.
 *
 * POURQUOI il existe. Le build n a pas de mode degrade — c est voulu (`client.ts`). Or au
 * 2026-08-07 la base de `echoback.ayfiweb.fr` est VIDE : un build reel produit un site
 * sans article, et ne prouve donc rien sur le rendu d une page article. Ce serveur
 * repond exactement ce que Strapi repondrait, avec les memes fixtures que le harnais de
 * mapping, ce qui permet de CONSTRUIRE une page article et d inspecter la sortie.
 *
 * CE QU IL PROUVE, ET CE QU IL NE PROUVE PAS. Il exerce la chaine entiere — client →
 * mapping → corpus → loader → page → `dist/` → garde T-09 — sur des donnees de forme
 * Strapi. Il ne prouve RIEN sur l instance reelle : ni les permissions, ni le populate
 * accepte par la version en place, ni le contenu du seed. ~~Le jour ou la base sera
 * garnie, la preuve se refait sur elle, et celle-ci ne la remplace pas.~~
 *
 * CE JOUR EST VENU, ET LA PHRASE CI-DESSUS EST PERIMEE (marquee le 2026-08-15, tache
 * `f564a83e`). L instance rend 40 articles fr et 8 en. La preuve SUR INSTANCE existe : elle
 * se lance par `npm run preuve:rendu -- --reel` (equivalent `PREUVE_CIBLE=instance`), et
 * c est desormais un GESTE DE RECETTE joue a chaque campagne P3 — regle R-10 du
 * `docs/protocole-mesure.md` (decision `b68ddeb5`, branche A).
 *
 * CE QUI N A PAS CHANGE, en revanche : ce serveur reste le DEFAUT, celui que la CI lance a
 * chaque push, parce qu elle n a aucune instance a interroger et qu un rouge du a une
 * coupure reseau ferait apprendre a ignorer la garde. Et il ne remplace toujours pas la
 * preuve sur instance — les deux cibles ne jugent pas la meme chose, ce que R-03 du meme
 * protocole dit autrement : le banc ne vaut qu en DELTA, jamais en absolu.
 *
 * Il ne sert JAMAIS en production : aucun code de `src/` ne l importe.
 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { ISSUES } from './issues.mjs';

const RACINE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
export const FIXTURES = path.join(RACINE, 'tests', 'fixtures');

export const COLLECTIONS = ['articles', 'auteurs', 'categories', 'tags', 'dossiers'];

/**
 * TROIS ISSUES, TROIS CODES — 0 conforme, 1 anomalie, 2 verification impossible.
 *
 * La definition a DEMENAGE dans `./issues.mjs` le 2026-08-10, quand les six
 * verificateurs s en sont servis a leur tour : trois d entre eux sont importes par
 * `integrations/`, donc charges dans chaque build reel, et un build de production n a
 * rien a faire d un Strapi de substitution. Elle est REEXPORTEE ici pour qu aucun
 * appelant n ait a bouger — une seule definition, un seul domicile.
 */
export { ISSUES };

/**
 * Un media de substitution, servi sur `/uploads/…` comme le provider local de Strapi.
 *
 * IL N EST PAS DECORATIF. Depuis T-01, le build TELECHARGE les medias qu il reference et
 * les depose dans la sortie (`integrations/medias-locaux.mjs`) : un Strapi de
 * substitution qui ne servirait pas `/uploads/` ferait echouer tout build sur fixtures,
 * et surtout laisserait le telechargement hors de portee des preuves hors ligne. Les
 * octets importent peu, l aboutissement de la requete est ce qui est exerce.
 */
export const MEDIA = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="9" viewBox="0 0 16 9">' +
    '<rect width="16" height="9" fill="#d9d4c8"/></svg>',
);

/**
 * Le meme `/uploads/` pour TOUT Strapi de substitution de ce depot.
 *
 * `preuve-pagination.mjs` porte son propre serveur (son corpus n est pas celui des
 * fixtures) et avait donc sa propre omission : sans route `/uploads/`, le
 * telechargement des medias de T-01 echouait et le build de recette sortait en 1. Le
 * defaut n a pas ete vu pendant deux jours parce que rien ne lancait ce script. Poser la
 * route ICI plutot que de la recopier la-bas evite qu une troisieme preuve reintroduise
 * le meme trou.
 *
 * @returns {boolean} `true` si la requete a ete servie, `false` si elle ne visait pas un media.
 */
export function servirMedia(requete, reponse) {
  const chemin = new URL(requete.url ?? '/', 'http://localhost').pathname;
  if (!chemin.startsWith('/uploads/')) return false;
  reponse.writeHead(200, { 'content-type': 'image/svg+xml' });
  reponse.end(MEDIA);
  return true;
}

/** Le chemin d une fixture, et rien d autre — la lecture se decide plus bas. */
function cheminFixture(nom, dossier = FIXTURES) {
  return path.join(dossier, `${nom}.json`);
}

/**
 * LE CHEMIN TEL QU IL SE LIT DANS UN MESSAGE — celui du dossier REELLEMENT consulte.
 *
 * Jusqu au 2026-08-12, tous les messages d incapacite ecrivaient `tests/fixtures/<nom>.json`
 * EN DUR, quel que soit le dossier passe en parametre. Sur un banc temoin, la sortie
 * envoyait donc chercher un fichier absent dans le dossier ou il EXISTE : un message qui ne
 * casse pas la commande, mais qui la fait MENTIR — et qui aurait fait conclure « la fixture
 * est la, le banc va bien » a qui suivait l indication.
 *
 * Un dossier SOUS la racine du site se lit en relatif (`tests/fixtures/x.json`, la forme
 * courte que tout le monde connait) ; un dossier au-dehors — un `mkdtemp`, un banc temoin —
 * se lit en ABSOLU. Rendre un `../../..` relatif a la racine ne dirait a personne ou aller.
 */
export function cheminAffiche(nom, dossier = FIXTURES) {
  const absolu = cheminFixture(nom, dossier);
  const relatif = path.relative(RACINE, absolu);
  const dedans = relatif !== '' && !relatif.startsWith('..') && !path.isAbsolute(relatif);
  return (dedans ? relatif : absolu).split(path.sep).join('/');
}

export function existeFixture(nom, dossier = FIXTURES) {
  return fs.existsSync(cheminFixture(nom, dossier));
}

export function lireFixture(nom, dossier = FIXTURES) {
  return JSON.parse(fs.readFileSync(cheminFixture(nom, dossier), 'utf8'));
}

/**
 * Ce que le banc EXIGE : une fixture par collection ET par locale du site, Configuration
 * comprise. La liste est DECLAREE a partir des locales qu on lui passe — elle ne se
 * derive pas de ce que `tests/fixtures/` contient, sans quoi elle certifierait la
 * presence de ce qui est present.
 */
export function fixturesDuBanc(locales) {
  return locales.flatMap((locale) => [
    `configuration-${locale}`,
    ...COLLECTIONS.map((collection) => `${collection}-${locale}`),
  ]);
}

/** Celles qui manquent, dans l ordre ou elles etaient exigees. */
export function absencesDeBanc(noms, dossier = FIXTURES) {
  return noms.filter((nom) => !existeFixture(nom, dossier));
}

/** Le texte de la 3e issue : ce qui manque, OU on l a cherche, et ce qui n a PAS ete servi. */
export function messageVerificationImpossible(intitule, absentes, dossier = FIXTURES) {
  return [
    `VERIFICATION IMPOSSIBLE — ${intitule}`,
    ...absentes.map((nom) => `  - donnee de banc absente : ${cheminAffiche(nom, dossier)}`),
    'Aucune donnee d une autre locale, ni collection vide, n a ete servie a la place :',
    'le banc ne peut pas conclure, et ne pretend pas le contraire.',
  ].join('\n');
}

/**
 * LE BANC EXIGE SES DONNEES AVANT DE CONSTRUIRE — sinon il ne construit pas.
 *
 * Sort en `ISSUES.VERIFICATION_IMPOSSIBLE` (2) en nommant chaque fichier absent. Le 2
 * n existe pas par gout de la nuance : il separe « je n ai rien pu verifier » de « tout
 * va bien », que le code 0 confondait.
 */
export function exigerBanc(intitule, noms, dossier = FIXTURES) {
  const absentes = absencesDeBanc(noms, dossier);
  if (absentes.length === 0) return;
  console.error('');
  console.error(messageVerificationImpossible(intitule, absentes, dossier));
  console.error('');
  process.exit(ISSUES.VERIFICATION_IMPOSSIBLE);
}

/**
 * CHAQUE LOCALE EST SERVIE DEPUIS SA PROPRE FIXTURE, OU N EST PAS SERVIE DU TOUT.
 *
 * Jusqu au 2026-08-10 ce serveur rendait `VIDE` pour toute locale autre que `fr`, et un
 * 404 sur le Single Type. Consequence mesuree sur le `dist/` produit : les 4 pages
 * anglaises portaient le bandeau « Configuration Strapi absente » et AUCUN bloc de
 * reseaux, quand les 13 francaises en portaient un. Le site n avait pas ce trou — le seed
 * ecrit la Configuration aux DEUX locales (`apps/cms/scripts/seed/seed.ts`, §4) — c est le
 * banc qui l avait, et rien ne signalait la difference.
 *
 * LE REPLI QUI RESTAIT, ET POURQUOI IL TOMBE. La premiere correction laissait `?? VIDE` :
 * une fixture `-en` absente rendait une collection vide — « exactement ce que Strapi
 * repond quand aucune localisation n existe ». C est vrai, et c est precisement le
 * probleme : une collection vide est une REPONSE PLAUSIBLE, indiscernable du fait
 * editorial qu elle imite. Le banc n a aucun moyen de dire lequel des deux il sert, donc
 * il ne sert plus ni l un ni l autre : il DECLARE son incapacite, et l appelant la
 * remonte. Meme raisonnement pour le 404 du Single Type.
 *
 * CE QUI N EST PAS TOUCHE, et ne doit pas l etre : les asymetries qui vivent DANS les
 * fixtures — un article francais sans jumelle anglaise, une rubrique sans contrepartie,
 * une collection anglaise legitimement vide. Le cahier les prevoit (`tests/fixtures-locales.test.ts`,
 * « le manque legitime est PRESERVE »), et les supprimer rendrait la preuve rouge en
 * permanence, donc desarmee. Le critere n est pas « il y a un repli » mais « ce repli
 * fait-il passer une ABSENCE pour une REPONSE ».
 *
 * @returns `{ hors: true }` hors perimetre du banc, `{ incapacite }` si la donnee manque,
 *          `{ corps }` sinon.
 */
export function reponseDeFixture(chemin, locale, dossier = FIXTURES) {
  if (chemin !== 'configuration' && !COLLECTIONS.includes(chemin)) return { hors: true };
  const nom = `${chemin}-${locale}`;
  /* `nom` est rendu A COTE du chemin, et ce n est pas une commodite : l appelant en avait
     besoin pour composer son message, et le reconstituait par chirurgie de chaine
     (`incapacite.replace(/^tests\/fixtures\//, '').replace(/\.json$/, '')`) — une regle de
     nommage recopiee chez le lecteur, qui redevenait fausse des que le dossier bougeait. */
  if (!existeFixture(nom, dossier)) return { incapacite: cheminAffiche(nom, dossier), nom };
  return { corps: lireFixture(nom, dossier) };
}

/**
 * @param {number} port `0` laisse le systeme en choisir un libre.
 * @param {string} dossier LE BANC SERVI. Il etait, jusqu au 2026-08-12, impossible a
 *   donner : `reponseDeFixture` acceptait ce parametre depuis deux jours et personne ne le
 *   lui passait, ce qui clouait le serveur sur `tests/fixtures/`. Consequence payee une
 *   fois : pour reproduire un defaut sur un banc modifie, un run a du reecrire un serveur
 *   dans son scratchpad — non versionne, donc non rejouable par le suivant, dans un projet
 *   dont toutes les gardes se prouvent EN CASSANT. Le defaut reste `tests/fixtures/` : les
 *   preuves existantes ne changent pas de corpus.
 */
export function demarrerServeurFixtures(port = 0, dossier = FIXTURES) {
  const serveur = http.createServer((requete, reponseHttp) => {
    const url = new URL(requete.url ?? '/', 'http://localhost');

    if (servirMedia(requete, reponseHttp)) return;

    const chemin = url.pathname.replace(/^\/api\//, '');
    const locale = url.searchParams.get('locale') ?? 'fr';
    const { hors, incapacite, nom, corps } = reponseDeFixture(chemin, locale, dossier);

    if (hors) {
      reponseHttp.writeHead(404, { 'content-type': 'application/json' });
      reponseHttp.end(JSON.stringify({ error: { status: 404, name: 'NotFoundError' } }));
      return;
    }

    // 500 et non 404 : un 404 dit « cette localisation n existe pas », ce que le site
    // sait traiter et absorbe en silence. Ici rien n est connu — le banc est muet, et le
    // build doit s arreter en le NOMMANT plutot que de rendre un site ampute.
    if (incapacite) {
      const message = messageVerificationImpossible(`banc de ${chemin} (${locale})`, [nom], dossier);
      console.error(`\n${message}\n`);
      reponseHttp.writeHead(500, { 'content-type': 'application/json' });
      reponseHttp.end(JSON.stringify({ error: { status: 500, name: 'BancIndisponible', message } }));
      return;
    }

    reponseHttp.writeHead(200, { 'content-type': 'application/json' });
    reponseHttp.end(JSON.stringify(corps));
  });

  return new Promise((resoudre) => {
    serveur.listen(port, '127.0.0.1', () => {
      const { port: reel } = serveur.address();
      resoudre({ url: `http://127.0.0.1:${reel}`, arreter: () => new Promise((f) => serveur.close(f)) });
    });
  });
}

// --- Usage en ligne de commande -------------------------------------------------------
/*
 * `node scripts/serveur-fixtures.mjs [dossier] [port]`
 *
 * CE QUE CE BLOC REMPLACE, et pourquoi il vaut plus que sa taille. Le 2026-08-11, pour
 * reproduire un defaut sur un banc modifie SANS muter le depot, un run a ecrit un serveur
 * de vingt lignes dans son scratchpad, s en est servi, et l a perdu avec sa session. La
 * preuve etait faite ; elle n etait pas REJOUABLE — et un projet dont chaque garde se
 * prouve en cassant ne peut pas laisser le moyen de casser hors du depot.
 *
 * Le geste, desormais :
 *
 *   cp -r apps/web/tests/fixtures /tmp/banc-temoin   # puis on abime ce qu on veut voir
 *   node apps/web/scripts/serveur-fixtures.mjs /tmp/banc-temoin
 *   ECHO_STRAPI_URL=<l URL annoncee> ECHO_STRAPI_API_TOKEN_READONLY=jeton-de-fixture npm run build
 *
 * L URL est annoncee sur stdout, seule sur sa ligne : elle se lit a l oeil comme au script.
 */
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dossier = process.argv[2] ? path.resolve(process.argv[2]) : FIXTURES;
  const port = process.argv[3] ? Number(process.argv[3]) : 0;

  if (!fs.existsSync(dossier)) {
    console.error(`\nVERIFICATION IMPOSSIBLE — banc introuvable : ${dossier}`);
    console.error('Aucun repli sur tests/fixtures/ : servir un autre corpus que celui demande');
    console.error("ferait passer un banc pour l autre, ce que ce serveur existe pour ne plus faire.\n");
    process.exit(ISSUES.VERIFICATION_IMPOSSIBLE);
  }

  const { url } = await demarrerServeurFixtures(port, dossier);
  console.log(url);
  console.error(`Strapi de substitution — banc : ${dossier}`);
  console.error('Ctrl-C pour arreter.');
}
