/**
 * LA DUREE DU JETON D'AMORCAGE, VERROUILLEE LA OU ELLE SE LIT.
 *
 * La regle « jeton d'amorcage a duree limitee, JAMAIS `Unlimited` » n'existe
 * que dans le depot de DOCUMENTATION (runbook de provisionnement, etape 21 bis
 * et matrice §13, ou elle est ecrite trois fois de facon coherente). Or ce
 * depot-ci est PUBLIC, et c'est LUI que lit la personne qui va creer le jeton :
 * jusqu'au 2026-08-11 il prescrivait le meme jeton plein acces SANS aucune
 * mention de duree, en SIX endroits. Le reflexe qui a produit l'incident du
 * 2026-08-09/10 — les deux jetons revoques n'avaient aucune expiration —
 * restait donc intact ici.
 *
 * LE PLUS NUISIBLE DES SIX est le message d'erreur affiche quand
 * `SEED_STRAPI_TOKEN` est vide : il donne le mode operatoire COMPLET de
 * creation du jeton, et il est lu a l'instant precis ou la personne va le
 * creer. Aucun test ne le verrouillait — `seed-code-sortie.test.ts` n'observe
 * que le code de sortie `2`, si bien que le texte pouvait repartir en arriere
 * sans qu'une seule assertion ne bouge. C'est ce trou-la que ce fichier ferme,
 * et il le ferme sur les SIX emplacements, pas sur le seul message : une
 * prescription corrigee a un endroit et laissee muette a un autre renvoie le
 * lecteur au reflexe qu'on vient de retirer.
 *
 * CE QUI N'EST PAS ICI, ET DELIBEREMENT : la DATE d'expiration du jeton en
 * vigueur. Elle vit au runbook et a la matrice §13, a un seul endroit ; deux
 * copies divergent a la premiere rotation. Ce depot POINTE vers elles, il ne
 * les recopie pas — et le deuxieme test le verifie en interdisant toute date
 * dans le message.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const RACINE_CMS = path.join(ICI, '..');
const RACINE_DEPOT = path.join(RACINE_CMS, '..', '..');
const SCRIPT = path.join(RACINE_CMS, 'scripts', 'seed', 'index.ts');

/**
 * Comparaison INSENSIBLE a ce qui n'est pas le fond : accents, casse, emphase
 * Markdown, retours a la ligne. Un test qui rougirait parce qu'on a passe
 * `**Full access**` en `*Full access*` se ferait desactiver, pas corriger.
 */
function normaliser(texte: string): string {
  return texte
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    // Les `_` ne se retirent PAS : ils portent le nom de la variable
    // (`SEED_STRAPI_TOKEN`), qui est justement ce qu'on cherche.
    .replace(/[`*]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/**
 * UNE ANNEE. Le seul motif qui distingue une date d'expiration recopiee.
 *
 * Il est volontairement grossier — c'est ce qui le rend utile — donc il ne doit
 * JAMAIS etre confronte a autre chose qu'au texte ecrit par le seed. Voir
 * `messageDuJeton` ci-dessous : c'est la que se joue la difference entre un
 * test qui juge et un test qui clignote.
 */
const MOTIF_ANNEE = /\b(19|20)\d{2}\b/;

/**
 * LE MESSAGE DU SEED, ISOLE DU BRUIT DE NODE.
 *
 * `lancer()` recolle stdout et stderr, et Node ecrit sur stderr des
 * avertissements qu'il PREFIXE DE SON PID : `(node:1980) [MODULE_TYPELESS_...`.
 * Confronte a la sortie entiere, `MOTIF_ANNEE` attrapait donc n'importe quel
 * PID a quatre chiffres tombant dans 1900-2099 — mesure a 3 executions sur 200
 * le 2026-08-17, sans aucun rapport avec le texte teste. L'assertion ne jugeait
 * pas ce qu'elle croyait juger.
 *
 * On ne FILTRE PAS le bruit connu : une liste noire ne connait que les formes
 * d'aujourd'hui, et le prochain avertissement de Node (chargeur experimental,
 * trace de pile) rouvrirait le meme trou en silence. On garde au contraire la
 * SEULE chose ecrite par le seed : la ligne d'ancrage `SEED_STRAPI_TOKEN est
 * vide.` et ses lignes de continuation, toutes indentees. Le bruit de Node,
 * lui, commence toujours en colonne 0.
 */
function messageDuJeton(sortie: string): string {
  const lignes = sortie.split(/\r?\n/);
  const debut = lignes.findIndex((l) => /^SEED_STRAPI_TOKEN est vide\./.test(l));
  assert.ok(
    debut >= 0,
    `la sortie ne porte pas le message du jeton vide — le seed a change de message :\n${sortie}`
  );
  const bloc = [lignes[debut]];
  for (let i = debut + 1; i < lignes.length && /^\s+\S/.test(lignes[i]); i++) bloc.push(lignes[i]);
  return bloc.join('\n');
}

/** Le premier bloc de commentaire `/** … *\/` d'un fichier source. */
function enTeteDe(chemin: string): string {
  const source = fs.readFileSync(chemin, 'utf8');
  const bloc = source.match(/^\/\*\*[\s\S]*?\*\//);
  assert.ok(bloc, `${chemin} : aucun bloc de commentaire en tete`);
  return normaliser(bloc[0]);
}

/** Lance le script en sous-processus et rend son code de sortie et sa sortie. */
function lancer(args: string[], env: Record<string, string>): Promise<{ code: number; sortie: string }> {
  return new Promise((ok, ko) => {
    const enfant = spawn(process.execPath, [SCRIPT, ...args], {
      cwd: RACINE_CMS,
      env: { ...process.env, ...env },
    });
    let sortie = '';
    enfant.stdout.on('data', (d) => (sortie += d));
    enfant.stderr.on('data', (d) => (sortie += d));
    enfant.on('error', ko);
    enfant.on('close', (code) => ok({ code: code ?? -1, sortie }));
  });
}

/* ------------------------------------------------------------------ */
/* 1 et 2 — le message d'erreur, l'emplacement le plus nuisible.        */
/* ------------------------------------------------------------------ */

test("jeton vide : le message de creation nomme `Token duration` et interdit `Unlimited`", async () => {
  const { code, sortie } = await lancer([], { SEED_STRAPI_TOKEN: '' });
  assert.equal(code, 2, `le jeton vide doit toujours sortir en 2, obtenu ${code} :\n${sortie}`);

  const message = normaliser(sortie);

  // Le mode operatoire est deja la (Settings > API Tokens > Create new API
  // Token, Token type: Full access) : ce qui manquait est le CHAMP de duree.
  assert.match(
    message,
    /token duration/,
    `le message donne le mode operatoire de creation SANS le champ Token duration :\n${sortie}`
  );
  assert.match(
    message,
    /jamais unlimited/,
    `le message ne dit pas que Unlimited est interdit — c'est exactement le reflexe qui a produit les deux jetons revoques :\n${sortie}`
  );
  assert.match(
    message,
    /duree limitee/,
    `le message ne qualifie pas le jeton demande de « duree limitee » :\n${sortie}`
  );
});

test("jeton vide : le message ne recopie AUCUNE date d'expiration", async () => {
  const { sortie } = await lancer([], { SEED_STRAPI_TOKEN: '' });
  const message = messageDuJeton(sortie);

  // GARDE ANTI-DESARMEMENT. Resserrer le perimetre d'une assertion, c'est
  // risquer de ne plus rien lui donner a juger. On exige donc que le bloc
  // extrait porte encore la phrase ou une date se recopierait en pratique :
  // si `messageDuJeton` se met a rendre trop peu, ce test rougit ICI, il ne
  // passe pas au vert par disette.
  assert.match(
    normaliser(message),
    /token duration/,
    `le bloc extrait ne porte plus le mode operatoire : l extraction rend trop peu, elle ne juge plus rien :\n${message}`
  );

  // La date d'expiration du jeton en vigueur vit a UN SEUL endroit : la matrice
  // §13 du runbook, dans le depot de documentation. Recopiee ici, elle serait
  // fausse des la premiere rotation — et un message d'erreur faux est pire
  // qu'un message muet, parce qu'on le croit.
  assert.doesNotMatch(
    message,
    MOTIF_ANNEE,
    `le message porte une annee, donc probablement une date d'expiration recopiee :\n${message}`
  );
});

test("le bruit de Node ne peut plus faire rougir le test : un PID a l'allure d'une annee est ecarte", () => {
  /* LE MOTIF INVERSE, celui qu'aucune execution reelle ne fabrique a la
     demande : un PID tombant dans 1900-2099. On le pose donc a la main, sur la
     forme EXACTE que Node emet, pour prouver que l'extraction — et non la
     chance — est ce qui rend ce test stable. */
  const sortieFactice = [
    '(node:1980) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///…/index.ts is not specified',
    'Reparsing as ES module because module syntax was detected. This incurs a performance overhead.',
    '(Use `node --trace-warnings ...` to show where the warning was created)',
    'SEED_STRAPI_TOKEN est vide.',
    "  Creez un jeton d'API **full-access** et a DUREE LIMITEE dans l'admin Strapi",
    '  (Settings > API Tokens > Create new API Token, Token type: Full access,',
    '   Token duration: 30 days — JAMAIS `Unlimited` : un jeton plein acces sans',
    "   expiration survit a qui l'a cree)",
    "  et exportez-le. Ce n'est PAS le jeton du build, qui est en lecture seule.",
    '(node:2024) Warning: un avertissement emis apres coup',
  ].join('\n');

  // Sans extraction, l'assertion rougirait : c'est bien le defaut qu'on ferme.
  assert.match(sortieFactice, MOTIF_ANNEE, 'le cas fabrique doit porter un PID a l allure d annee');

  const message = messageDuJeton(sortieFactice);
  assert.doesNotMatch(message, MOTIF_ANNEE, `le PID a survecu a l extraction :\n${message}`);
  assert.match(normaliser(message), /token duration/, "l extraction a mange le message");
  assert.doesNotMatch(message, /node:/, `l extraction a garde du bruit de Node :\n${message}`);
});

/* ------------------------------------------------------------------ */
/* 3 — les quatre autres emplacements qui prescrivent le jeton.         */
/* ------------------------------------------------------------------ */

const PRESCRIPTIONS: {
  ou: string;
  texte: () => string;
  exigences: { quoi: string; motif: RegExp }[];
}[] = [
  {
    ou: 'README.md (racine) — la ligne d export',
    texte: () => normaliser(fs.readFileSync(path.join(RACINE_DEPOT, 'README.md'), 'utf8')),
    exigences: [
      {
        quoi: 'la ligne `export SEED_STRAPI_TOKEN=…` qualifie le jeton de duree limitee',
        motif: /export seed_strapi_token=<jeton api full-access, a duree limitee>/,
      },
    ],
  },
  {
    ou: 'README.md (racine) — le mode operatoire de creation',
    texte: () => normaliser(fs.readFileSync(path.join(RACINE_DEPOT, 'README.md'), 'utf8')),
    exigences: [
      { quoi: 'le champ `Token duration` est nomme', motif: /token duration/ },
      { quoi: '`Unlimited` est explicitement interdit', motif: /jamais unlimited/ },
      {
        quoi: 'la date d expiration est POINTEE (matrice des secrets), jamais recopiee',
        motif: /matrice des secrets/,
      },
    ],
  },
  {
    ou: 'apps/cms/README.md',
    texte: () => normaliser(fs.readFileSync(path.join(RACINE_CMS, 'README.md'), 'utf8')),
    exigences: [
      {
        quoi: 'la ligne `export SEED_STRAPI_TOKEN=…` qualifie le jeton de duree limitee',
        motif: /export seed_strapi_token=<jeton api full-access, a duree limitee>/,
      },
      { quoi: '`Unlimited` est explicitement interdit', motif: /jamais unlimited/ },
    ],
  },
  {
    ou: 'apps/cms/scripts/seed/index.ts — en-tete du script',
    texte: () => enTeteDe(SCRIPT),
    exigences: [
      {
        quoi: 'la variable est documentee comme un jeton a duree limitee',
        motif: /seed_strapi_token[\s\S]*duree limitee/,
      },
      { quoi: '`Unlimited` est explicitement interdit', motif: /unlimited/ },
    ],
  },
  {
    ou: 'apps/cms/scripts/seed/client.ts — en-tete du client d ecriture',
    texte: () => enTeteDe(path.join(RACINE_CMS, 'scripts', 'seed', 'client.ts')),
    exigences: [
      { quoi: 'le jeton exige est qualifie de duree limitee', motif: /duree limitee/ },
    ],
  },
];

for (const prescription of PRESCRIPTIONS) {
  for (const exigence of prescription.exigences) {
    test(`${prescription.ou} : ${exigence.quoi}`, () => {
      assert.match(
        prescription.texte(),
        exigence.motif,
        `${prescription.ou} prescrit un jeton plein acces sans dire qu'il expire`
      );
    });
  }
}
