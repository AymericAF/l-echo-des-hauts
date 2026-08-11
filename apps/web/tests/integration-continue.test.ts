/**
 * L INTEGRATION CONTINUE RELANCE-T-ELLE TOUT CE QU ELLE PRETEND RELANCER ?
 *
 * DEUX TROUS MESURES LE 2026-08-11, tous deux de la MEME FORME : un controle qui existe,
 * mais que rien ne declenche a l endroit ou il servirait.
 *
 *   1. Le pas « les six verificateurs » de `.github/workflows/gardes-du-code.yml` bouclait
 *      sur une liste ECRITE EN DUR — sortie, images, liens, origine-medias, seo,
 *      styles-en-ligne — quand `package.json` en expose NEUF. `verifier:cascade-titres`
 *      lit `dist/` sur disque, ne sort pas sur le reseau, coute quelques dizaines de
 *      millisecondes, et etait ABSENT. Il n etait donc garde que par son cablage dans
 *      `astro.config.mjs` — c est-a-dire par la chose precise que ce pas existe pour ne
 *      pas supposer, son propre commentaire le dit.
 *   2. `preuve-rendu.mjs` lancait `npx astro build`, quand la PRODUCTION lance
 *      `npm run build` — soit `astro build && node scripts/index-pagefind.mjs`. L etage
 *      qui se declare « le seul qui voie ce que le lecteur verrait » s arretait donc au
 *      premier maillon : mesure du 2026-08-11, apres `npm run preuve:rendu`,
 *      `dist/pagefind/` N EXISTAIT PAS. Or Pagefind est precisement ce qui ecrit du
 *      JavaScript dans la sortie, et « aucun JavaScript hors /recherche » est opposable.
 *
 * CE QUE CE FICHIER TIENT, ET POURQUOI PAS LE CAS PARTICULIER. Ajouter `cascade-titres` a
 * la main aurait ferme le cas et laisse la CLASSE ouverte : la liste redivergerait au
 * prochain verificateur. Ce qui est asserte ici est donc l INVARIANT — tout `verifier:*`
 * declare est relance, ou exempte PAR ECRIT avec sa raison — exactement la forme du pas
 * « aucun fichier de test n est absent du npm test », qui ferme deja cette classe pour les
 * tests.
 *
 * CE QU IL NE PROUVE PAS, et qui est assume : il lit des DECLARATIONS (un `package.json`,
 * un `.yml`, la source d un script). Il ne prouve pas qu un runner execute vraiment ce que
 * ces fichiers disent. Cela, seule une execution le prouve — le job `sortie` lui-meme, et
 * la preuve en cassant qui l a fait rougir sur un defaut que l ancien pas ne voyait pas.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  EXEMPTES_DE_L_INTEGRATION_CONTINUE,
  incoherences,
  verificateursALancer,
  verificateursDeclares,
} from '../scripts/verificateurs-de-sortie.mjs';

const RACINE = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DEPOT = path.dirname(path.dirname(RACINE));
const WORKFLOW = path.join(DEPOT, '.github', 'workflows', 'gardes-du-code.yml');

function paquet(): { scripts: Record<string, string> } {
  return JSON.parse(fs.readFileSync(path.join(RACINE, 'package.json'), 'utf8'));
}

function workflow(): string {
  return fs.readFileSync(WORKFLOW, 'utf8');
}

// ── 1. La population, et l exemption ecrite ───────────────────────────────────────────

test('tout verifier:* est relance par l integration continue, ou exempte par ecrit', () => {
  const declares = verificateursDeclares(paquet());
  assert.ok(declares.length >= 9, `${declares.length} verificateur(s) declares : la mesure du 2026-08-11 en comptait 9`);

  const lances = verificateursALancer(paquet());
  const exemptes = Object.keys(EXEMPTES_DE_L_INTEGRATION_CONTINUE).sort();

  assert.deepEqual(
    [...lances, ...exemptes].sort(),
    [...declares].sort(),
    'un verificateur n est ni relance ni exempte : ajoute-le a la boucle, ou EXEMPTE-LE ' +
      'AVEC SA RAISON dans scripts/verificateurs-de-sortie.mjs',
  );
});

test('chaque exemption porte une raison ecrite, pas un nom nu', () => {
  for (const [nom, raison] of Object.entries(EXEMPTES_DE_L_INTEGRATION_CONTINUE)) {
    /* Un nom sans raison se relit six mois plus tard comme un oubli : on le rattrape « par
       coherence », le job rougit pour une cause qui n existe pas dans le commit, et c est
       le JOB qu on desactive. La raison est ce qui empeche ce geste-la. */
    assert.equal(typeof raison, 'string', `${nom} : exemption sans raison`);
    assert.ok(
      raison.length >= 60,
      `${nom} : la raison fait ${raison.length} caracteres — trop courte pour dire POURQUOI`,
    );
  }
});

test('une exemption ne survit pas au script qu elle exempte', () => {
  /* Une exception qui survit a sa cible elargit le trou en silence : le jour ou un
     verificateur reprend ce nom, il entre par la porte laissee ouverte. */
  for (const nom of Object.keys(EXEMPTES_DE_L_INTEGRATION_CONTINUE)) {
    assert.equal(
      fs.existsSync(path.join(RACINE, 'scripts', `verifier-${nom}.mjs`)),
      true,
      `verifier-${nom}.mjs est exempte mais n existe pas`,
    );
    assert.ok(
      paquet().scripts[`verifier:${nom}`] !== undefined,
      `verifier:${nom} est exempte mais package.json ne l expose pas`,
    );
  }
});

test('cascade-titres est relance par l integration continue', () => {
  /* Le temoin du defaut du 2026-08-11, nomme. L invariant ci-dessus le couvre deja ; ce
     test-ci existe pour que le rouge NOMME le cas fondateur si la regression revient. */
  assert.ok(
    verificateursALancer(paquet()).includes('cascade-titres'),
    'cascade-titres est de nouveau hors de la boucle : il lit dist/ sur disque, il ne sort ' +
      'sur aucun reseau, il ne peut pas etre exempte pour cause d environnement',
  );
});

// ── 2. La derivation elle-meme rougit plutot que de rendre du vide ────────────────────

test('une liste vide est une INCOHERENCE, jamais un silence', () => {
  /* Le mode d echec ou succes et echec rendent la meme sortie : la derivation casse, la
     boucle tourne sur zero verificateur, le job sort en 0. Vert sur rien du tout. */
  const ecarts = incoherences({ scripts: { build: 'astro build' } });
  assert.ok(ecarts.length > 0, 'un package.json sans aucun verifier:* doit etre une incoherence');
  assert.match(ecarts.join('\n'), /aucun/i);
});

test('une exemption qui nomme un script inexistant est une INCOHERENCE', () => {
  const ecarts = incoherences({ scripts: { 'verifier:sortie': 'x' } });
  assert.ok(
    ecarts.some((e) => e.includes('en-tetes')),
    'une exemption sans script correspondant doit etre nommee dans les incoherences',
  );
});

test('le package.json reel ne porte aucune incoherence', () => {
  assert.deepEqual(incoherences(paquet()), []);
});

// ── 3. Le workflow consomme la derivation, et ne recompte rien ────────────────────────

test('le job « sortie » ne porte AUCUNE liste de verificateurs ecrite en dur', () => {
  const yml = workflow();
  /* `assert.ok(regex.test(...))` et non `assert.match(yml, ...)` : le second imprime le
     FICHIER ENTIER dans le rapport d echec — 10 Kio de YAML a faire defiler pour lire une
     ligne de message. Un rouge illisible se lit moins vite, donc se corrige moins vite. */
  assert.ok(
    /node scripts\/verificateurs-de-sortie\.mjs/.test(yml),
    'le workflow ne derive pas sa liste de package.json',
  );

  for (const [entier, variable, sujets] of yml.matchAll(/for\s+(\w+)\s+in\s+([^;\n]+);?\s*do/g)) {
    assert.match(
      sujets.trim(),
      /^"?\$/,
      `le workflow boucle sur une liste ECRITE EN DUR (« ${entier.trim()} ») : c est par la ` +
        `que cascade-titres est reste dehors. Boucle sur $${variable} derive de package.json.`,
    );
  }
});

test('la boucle passe par npm run, donc par package.json', () => {
  /* Appeler `node scripts/verifier-x.mjs` en direct rendrait le pas independant de
     package.json — et la derivation, qui le lit, cesserait de decrire ce qui tourne. */
  assert.ok(
    /npm run --silent "verifier:\$/.test(workflow()),
    'la boucle n appelle plus les verificateurs par leur script npm',
  );
});

test('la boucle rougit si la derivation rend du vide', () => {
  assert.ok(
    /-[nz] "\$liste"/.test(workflow()),
    'sans ce garde-fou, une derivation cassee fait tourner la boucle sur zero verificateur ' +
      'et sortir le job en VERT',
  );
});

// ── 3 bis. La boucle DIT « n a pas pu juger », au lieu de le jeter ────────────────────

/**
 * DEFAUT DU 2026-08-11 (tache 794ad120 ; mode operatoire au §4 de
 * `docs/ci-incapacite-vs-anomalie.md`, depot prive). La boucle faisait
 * `npm run --silent "verifier:$v" || echec=1` : le `|| echec=1` JETAIT le code. Un `1`
 * (a juge, c est rouge -> corriger le SITE) et un `2` (n a PAS pu juger -> corriger l
 * ENVIRONNEMENT) devenaient le meme echec, dans un groupe replie qui ne portait que le nom
 * du verificateur. Les neuf verificateurs savent rendre `2` (`tests/verificateurs-incapacite`)
 * et le SEUL lecteur automatique de cette distinction dans le depot etait ce job — celui-la
 * meme qui l aplatissait. Le cout n est pas theorique : aplatis, les deux codes envoient
 * chercher dans le mauvais objet.
 *
 * CE QUE CES TESTS TIENNENT, et ce qu ils ne tiennent pas. Ils lisent une DECLARATION (le
 * `.yml`) : ils prouvent que la boucle capture, trie et nomme, et que le verdict n a pas
 * bouge. Ils ne prouvent PAS que le journal d un runner reel affiche la distinction — cela,
 * seule une execution sur GitHub Actions le prouve.
 */
function boucleDesVerificateurs(): string {
  /* Le pas entier, du `echec=0` a son `exit`. Isoler le fragment plutot que de chercher
     dans 10 Kio de YAML : une assertion qui matche AILLEURS dans le fichier serait verte
     sur un pas qui, lui, aurait regresse.

     FINS DE LIGNE NORMALISEES : le depot stocke en LF, mais `core.autocrlf=true` rend un
     arbre de travail en CRLF sur le poste Windows d Aymeric. Sans cette normalisation, ces
     assertions seraient VERTES sur le runner Linux et ROUGES chez lui, pour une cause qui
     n a rien a voir avec ce qu elles gardent.

     LES COMMENTAIRES SONT RETIRES, et ce n est pas de l esthetique : mesure du 2026-08-11,
     en deplacant volontairement `::endgroup::` APRES le `case`, ces tests sont restes VERTS.
     La cause : le commentaire qui explique le piege CITE `::endgroup::` au-dessus du `case`,
     et satisfaisait a lui seul l assertion de position. Un test qu une PROSE peut rendre
     vert ne garde rien. Ce qui est asserte ici est donc le CODE, jamais sa documentation. */
  const yml = workflow().replace(/\r\n/g, '\n');
  const debut = yml.indexOf('\n          echec=0\n');
  assert.ok(debut > 0, 'le pas des verificateurs ne porte plus de compteur `echec` : relire le §4');
  const fin = yml.indexOf('exit $echec', debut);
  assert.ok(fin > debut, 'le pas des verificateurs ne se termine plus par `exit $echec`');
  return yml
    .slice(debut, fin + 'exit $echec'.length)
    .split('\n')
    .filter((ligne) => !/^\s*#/.test(ligne))
    .join('\n');
}

test('la boucle CAPTURE le code de sortie, elle ne le jette pas', () => {
  const boucle = boucleDesVerificateurs();
  assert.ok(
    /npm run --silent "verifier:\$v" \|\| code=\$\?/.test(boucle),
    'la boucle ne capture plus le code : sans `|| code=$?`, un 1 et un 2 redeviennent le ' +
      'meme echec, et la distinction que les neuf verificateurs produisent est perdue',
  );
  assert.ok(
    !/npm run[^\n]*\|\| *echec=1/.test(boucle),
    'la forme fautive du 2026-08-11 est revenue : `npm run ... || echec=1` JETTE le code',
  );
});

test('le code se capture SANS declencher `set -e`', () => {
  /* Le shell par defaut d un `run:` est `bash -e {0}` : `npm run ...; code=$?` avorterait
     le job AVANT l affectation. C est precisement pourquoi l original faisait `|| echec=1`.
     Seule la forme `code=0` puis `... || code=$?` survit a `-e`. */
  const boucle = boucleDesVerificateurs();
  assert.ok(
    /\n\s*code=0\n/.test(boucle),
    '`code` doit etre initialise a 0 avant l appel : sinon il garde la valeur du tour ' +
      'precedent quand `npm run` reussit',
  );
  assert.ok(
    !/npm run[^\n]*\n\s*code=\$\?/.test(boucle),
    '`npm run ...` suivi de `code=$?` sur la ligne suivante : `set -e` avorte le job AVANT ' +
      "l affectation. Utiliser `|| code=$?`, qui place l appel dans un compound",
  );
});

test('le groupe est REFERME avant le tri, sinon les messages restent replies', () => {
  const boucle = boucleDesVerificateurs();
  const endgroup = boucle.indexOf('::endgroup::');
  const tri = boucle.indexOf('case "$code"');
  assert.ok(endgroup > 0 && tri > 0, 'la boucle ne referme plus son groupe, ou ne trie plus');
  assert.ok(
    endgroup < tri,
    'le `case` s execute AVANT le `::endgroup::` : les messages s afficheraient dans un ' +
      'groupe replie, que le `::error::` ne rouvre pas. Le journal redeviendrait illisible',
  );
});

test('les deux natures sont NOMMEES, chacune avec le geste qu elle commande', () => {
  const boucle = boucleDesVerificateurs();
  /* Nommer le code sans nommer le geste ne repare rien : le lecteur du journal doit savoir
     OU chercher — l environnement pour un 2, le site pour un 1. */
  assert.ok(
    /N ONT PAS PU JUGER[^\n]*code 2/.test(boucle) && /ENVIRONNEMENT/.test(boucle),
    'le journal ne nomme plus l incapacite (code 2) ni le geste qu elle commande ' +
      '(corriger l ENVIRONNEMENT)',
  );
  assert.ok(
    /ONT JUGE[^\n]*code 1/.test(boucle) && /SITE/.test(boucle),
    'le journal ne nomme plus l anomalie (code 1) ni le geste qu elle commande ' +
      '(corriger le SITE)',
  );
  assert.ok(
    /::error title=/.test(boucle),
    'sans annotation `::error`, la distinction n apparait que dans le corps du journal et ' +
      'pas dans le resume du run',
  );
});

test('LE VERDICT NE BOUGE PAS : une incapacite fait toujours echouer le job', () => {
  /* La contrainte dure du correctif. Un journal correct sur un job VERT serait un echec du
     correctif, pas un succes partiel : un build qui n a rien produit ne passe pas sous
     pretexte qu on a su le nommer. */
  const boucle = boucleDesVerificateurs();
  const branches = [...boucle.matchAll(/^\s*(?:2\)|\*\))(.+)$/gm)].map(([, corps]) => corps);
  assert.equal(branches.length, 2, 'le tri ne porte plus exactement deux branches non nulles');
  for (const corps of branches) {
    assert.match(
      corps,
      /echec=1/,
      `une branche non nulle du tri ne leve plus l echec : « ${corps.trim()} » — la CI ` +
        'passerait au VERT sur un verificateur rouge',
    );
  }
  assert.ok(
    /\n\s*exit \$echec\s*$/.test(boucle),
    'le pas ne sort plus sur le compteur `echec` : le verdict cesserait de suivre la boucle',
  );
});

test('aucun intitule du workflow ne COMPTE les verificateurs', () => {
  /* « les six verificateurs » a survecu a l arrivee du septieme, huit mois avant que
     quiconque recompte. Un intitule qui porte un nombre est un intitule qui mentira. */
  for (const [, intitule] of workflow().matchAll(/^\s*(?:-\s*)?name:\s*(.+)$/gm)) {
    assert.doesNotMatch(
      intitule,
      /\b(deux|trois|quatre|cinq|six|sept|huit|neuf|dix)\s+verificateur/i,
      `l intitule « ${intitule.trim()} » compte les verificateurs : il derivera`,
    );
  }
});

// ── 4. La porte du build : celle de la production, pas une plus etroite ───────────────

/**
 * LES SCRIPTS DE PREUVE QUI ONT LE DROIT DE CONSTRUIRE PAR UNE AUTRE PORTE, et pourquoi.
 *
 * `preuve-pagination.mjs` construit un CORPUS DIFFERENT (`scripts/corpus-recette.mjs`)
 * dans un repertoire different (`dist-recette/`), via `astro build --outDir`. Son objet
 * est la BORNE de pagination, pas les octets servis : `npm run build` ne saurait pas ou
 * deposer l index (`index-pagefind.mjs` prend son chemin en argument, pas de `--outDir`),
 * et l index de recherche ne prouverait rien sur une page 2. L extension de la garde a ce
 * corpus-la n a pas ete faite et n est pas prevue — c est ecrit ici plutot que tu.
 */
const PORTE_ETROITE_ADMISE: Record<string, string> = {
  'preuve-pagination.mjs':
    'corpus de recette, sortie dans dist-recette/ via --outDir : `npm run build` ne sait ' +
    "pas ou deposer l index, et l index ne prouve rien sur une borne de pagination",
};

test('aucun script de preuve ne construit par une porte plus etroite que la production', () => {
  const direct = /\[\s*'astro'\s*,\s*'build'/;
  for (const fichier of fs.readdirSync(path.join(RACINE, 'scripts')).filter((f) => /^preuve-.+\.mjs$/.test(f))) {
    const source = fs.readFileSync(path.join(RACINE, 'scripts', fichier), 'utf8');
    if (!direct.test(source)) continue;
    assert.ok(
      PORTE_ETROITE_ADMISE[fichier] !== undefined,
      `${fichier} lance « astro build » en direct : il n exerce donc AUCUN maillon que ` +
        '`npm run build` enchaine apres lui. Passe par `npm run build`, ou exempte ce ' +
        'fichier ICI avec sa raison.',
    );
  }
});

test('preuve-rendu construit par `npm run build`, la porte meme de la production', () => {
  const source = fs.readFileSync(path.join(RACINE, 'scripts', 'preuve-rendu.mjs'), 'utf8');
  assert.ok(
    /'npm',\s*\['run',\s*'build'\]/.test(source),
    'preuve-rendu.mjs doit lancer la MEME commande que Coolify : sinon tout maillon ajoute ' +
      'a `build` apres `astro build` n est exerce nulle part hors production',
  );
  assert.ok(
    !/\['astro',\s*'build'/.test(source),
    'preuve-rendu.mjs lance encore `astro build` en direct',
  );
});

test('le script `build` enchaine bien plus que `astro build`', () => {
  /* Ce qui donne son sens au test precedent : si `build` valait `astro build` tout court,
     la porte serait la meme et il n y aurait rien a garder. Le jour ou un maillon est
     ajoute, il devient exerce sans qu on ait rien a faire ici. */
  const build = paquet().scripts.build;
  assert.match(build, /astro build/);
  assert.ok(
    build.replace('astro build', '').replace(/[\s&]/g, '').length > 0,
    '`build` ne porte plus qu un seul maillon : verifier que l indexation Pagefind n a pas ' +
      'disparu du chemin de production',
  );
  assert.match(build, /index-pagefind\.mjs/);
});

test('le job « sortie » constate que l index de recherche est bien dans la sortie', () => {
  /* MECANIQUE, pas conventionnelle. Revenir a `npx astro build` dans preuve-rendu.mjs
     rendrait tous les tests ci-dessus rouges — mais un test rouge se contourne, et le job
     resterait VERT sur une sortie sans index. Ce pas-la lit le repertoire produit. */
  assert.ok(
    /dist\/pagefind/.test(workflow()),
    'le job sortie ne constate nulle part que le build a bien depose l index de recherche',
  );
});
