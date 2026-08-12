// Declencheur CIBLE des gardes de ce depot — les tests.
//
// Lance par `.githooks/commit-msg`, qui l'appelle seulement si le commit touche
// `apps/<app>/…`, le crochet lui-meme, ou ce fichier (pre-filtre structurel, sans
// aucun nom de module).
//
// CE QU'IL FAIT, ET POURQUOI DANS CET ORDRE
//   1. Il lit les chemins REELLEMENT indexes (`git diff --cached`).
//   2. Il materialise le contenu de l'INDEX dans un dossier temporaire et
//      travaille AVEC CE DOSSIER POUR RACINE. C'est ce qui s'apprete a etre
//      commite qui est juge, jamais la copie de travail : sinon un `git add`
//      partiel — corriger le test ET la source, n'indexer que l'un des deux —
//      laisserait passer une regression, et le crochet certifierait un etat que
//      personne ne commit. Sur du CODE ce cas n'a rien de theorique : c'est le
//      geste ordinaire d'un `git add` chemin par chemin.
//   3. Il n'active que les tests dont une ENTREE est dans ce commit. Un test
//      dont rien n'a bouge ne tourne pas : sans ce ciblage, chaque commit
//      paierait les 566 tests des deux applications (~3,0 s mesurees), et le
//      crochet se ferait contourner — apres quoi on perdrait aussi ce qui
//      marchait.
//   4. Il rend 1 des qu'un test rougit, en NOMMANT le fichier de test et
//      l'entree qui l'a declenche.
//
// D'OU VIENT LA TABLE « quel fichier declenche quel test »
//   Elle n'est PAS ecrite a la main, et c'est deliberé : une table de 33 tests
//   face a ~150 modules divergerait en une semaine, et une entree oubliee est
//   un trou SILENCIEUX — le crochet dirait « 0 test lance » sur un commit qui
//   casse. Elle se DERIVE du graphe d'imports relatifs, lu dans l'index. Un
//   test suit donc automatiquement ce qu'il importe, meme indirectement.
//   Ne restent ecrits a la main que les fichiers qu'un test LIT PAR CHEMIN sans
//   les importer (`fs.readFileSync`) : le graphe d'imports ne peut pas les
//   voir. C'est la table LECTURES ci-dessous, et elle seule.
//
// EN CAS DE DOUTE, ON ELARGIT — jamais l'inverse. Un import relatif qu'on ne
// sait pas resoudre rend le test « toujours lance » au lieu de le retirer du
// lot : un declencheur qui se tait quand il ne comprend pas ne garde rien.
//
// CE QU'IL NE COUVRE PAS, ET QUI LE COUVRE. Le ciblage a par construction des
// trous (un fichier qu'aucun test n'atteint, un `--no-verify`, un clone frais
// sans `core.hooksPath`). C'est le role du second etage,
// `.github/workflows/gardes-du-code.yml`, qui lance TOUT a chaque push. Le
// crochet achete l'immediatete, l'integration achete la garantie.
//
// CODES DE SORTIE : 0 = aucun test concerne, ou tous verts ; 1 = un test rouge,
// ou un etat que ce script ne sait pas juger. Il n'existe aucun chemin qui
// rende 0 sans avoir compare.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

// ── Les applications gardees ─────────────────────────────────────────────────
// Chacune porte ses tests dans `tests/*.test.ts` et son `npm test`. Ajouter une
// application = ajouter une ligne ici, rien d'autre.
const APPS = ['apps/web', 'apps/cms'];

// ── Fichiers LUS PAR CHEMIN, que le graphe d'imports ne peut pas voir ────────
// Cle : le test. Valeur : des prefixes de chemin (un `/` final = tout le
// sous-arbre). Tout ce qui est atteint par `import` est deja couvert et n'a
// rien a faire ici.
const LECTURES = {
    'apps/web/tests/astro-config.test.ts': [
        // Il IMPORTE `astro.config.mjs` — donc tout ce que le tableau
        // `integrations:` atteint est deja couvert par le graphe. Ce qu'il lit
        // en PLUS, et que le graphe ne peut pas voir : le DOSSIER
        // `integrations/` en entier, parcouru pour verifier qu'aucun module
        // livre n'a ete debranche. Sans cette ligne, ajouter un module SANS le
        // brancher ne declencherait rien — exactement le cas que ce test existe
        // pour attraper.
        'apps/web/integrations/',
    ],
    'apps/web/tests/requete.test.ts': [
        // Il PARCOURT src/ en entier a la recherche d'un populate etoile :
        // n'importe quel fichier de src/ peut le faire rougir.
        'apps/web/src/',
    ],
    'apps/web/tests/repartiteur-blocs.test.ts': [
        'apps/web/src/lib/domaine.ts',
        'apps/web/src/lib/strapi/mapping.ts',
        'apps/web/src/components/blocs/',
    ],
    'apps/web/tests/glyphes-sociaux.test.ts': ['apps/web/src/components/LiensSociaux.astro'],
    // Il PARCOURT `src/components/` en entier a la recherche d'un texte litteral
    // dans un gabarit — c'est la forme exacte du defaut du 2026-08-10
    // (`intitule="Reseaux du journal"`). Le graphe d'imports ne voit pas ce
    // parcours : sans cette ligne, ajouter une chaine en dur dans un composant ne
    // declencherait AUCUN test au commit, c'est-a-dire le trou meme que ce fichier
    // de test existe pour fermer.
    'apps/web/tests/garde-langue.test.ts': ['apps/web/src/components/'],
    'apps/web/tests/nixpacks-fontes.test.ts': [
        'apps/web/nixpacks.toml',
        'apps/web/src/lib/seo/gabarit-og.ts',
    ],
    'apps/web/tests/mapping.test.ts': ['apps/web/tests/fixtures/'],
    // Il lit les DOUZE fixtures par chemin (six par locale) et n'en importe
    // aucune. Sans cette ligne, retirer `configuration-en.json` ou vider ses
    // `reseaux` ne declencherait AUCUN test au commit — c'est-a-dire le trou
    // meme que ce fichier de test existe pour fermer.
    'apps/web/tests/fixtures-locales.test.ts': ['apps/web/tests/fixtures/'],
    // CE TEST LIT UNE AUTRE APPLICATION QUE LA SIENNE, et c'est voulu :
    // `verifier-surface-publique.mjs` DERIVE la liste des types de contenu a
    // sonder des schemas du CMS, plutot que de la recopier — une liste ecrite a
    // la main refarait le defaut du 2026-08-10 le jour du septieme type de
    // contenu. Cette ligne est donc ce qui fait que toucher un schema du CMS
    // rejoue la garde de surface d'`apps/web` (§ « lecture inter-application »
    // plus bas), et que l'arbre temporaire porte `apps/cms` meme quand le commit
    // ne concerne qu'`apps/web`.
    'apps/web/tests/garde-surface-publique.test.ts': ['apps/cms/src/api/'],
    'apps/cms/tests/modele-donnees.test.ts': ['apps/cms/src/api/', 'apps/cms/src/components/'],
    'apps/cms/tests/seed-code-sortie.test.ts': ['apps/cms/scripts/seed/', 'apps/cms/data/'],
    // CE TEST LIT LES DEUX README, dont celui de la RACINE — hors de toute
    // application. Il tient la regle « le jeton d'amorcage est a duree limitee,
    // jamais Unlimited » aux SIX endroits ou ce depot prescrit le jeton, et
    // deux de ces endroits sont des fichiers Markdown qu'aucun import ne peut
    // atteindre. Voir `SUPPORTS_HORS_APPLICATION` pour la racine : sans lui, le
    // test rougirait sur une ABSENCE dans l'arbre temporaire, pas sur une
    // regression — et un crochet qui rougit pour une raison qui n'est pas la
    // sienne se fait desactiver dans la semaine.
    'apps/cms/tests/seed-jeton-duree.test.ts': [
        'apps/cms/scripts/seed/',
        'apps/cms/README.md',
        'README.md',
    ],
    'apps/cms/tests/seed-corpus.test.ts': ['apps/cms/data/'],
    'apps/cms/tests/seed-idempotence.test.ts': ['apps/cms/data/'],
    // CE TEST LIT UN FICHIER HORS DE TOUTE APPLICATION — le workflow lui-meme.
    // Il tient deux invariants qui ne vivent que la : que le job `sortie`
    // relance TOUS les `verifier:*` non exemptes (le trou du 2026-08-11 :
    // `cascade-titres` etait hors d'une liste ecrite en dur), et que les scripts
    // de preuve construisent par la porte de la production. Voir
    // `SUPPORTS_HORS_APPLICATION` : sans lui, ce test rougirait sur une ABSENCE
    // dans l'arbre temporaire, pas sur une regression.
    'apps/web/tests/integration-continue.test.ts': [
        '.github/workflows/gardes-du-code.yml',
        'apps/web/scripts/',
    ],
};

// ── Fichiers HORS APPLICATION qu un test lit par chemin ──────────────────────
// L'arbre temporaire ne materialise que les applications (§3). Un test qui lit
// un fichier du depot situe AILLEURS — un workflow, un reglage racine —
// echouerait donc sur une absence, et un crochet qui rougit pour une raison qui
// n'est pas la sienne se fait desactiver dans la semaine. Ces prefixes sont
// poses dans l'arbre EN PLUS des applications. Ils declenchent deja par
// `LECTURES` : cette liste ne dit pas QUAND lancer, elle dit QUOI POSER.
const SUPPORTS_HORS_APPLICATION = ['.github/workflows/', 'README.md'];

// Toucher le declenchement lui-meme relance TOUT : c'est la regle qui a bouge,
// et une regle de declenchement qui ne s'exerce pas est une convention de plus.
const DECLENCHEURS_GLOBAUX = ['.githooks/commit-msg', 'outils/gardes-au-commit.js'];

// Le `test` de package.json ENUMERE les fichiers a lancer : le retoucher peut
// retirer un test du lot sans supprimer une ligne de code. On relance donc
// toute l'application concernee.
const declencheurAppEntiere = (app) => app + '/package.json';

// ── Utilitaires ──────────────────────────────────────────────────────────────
function abandonner(message) {
    console.error('');
    console.error('COMMIT REFUSE — gardes du code : ' + message);
    console.error('');
    process.exit(1);
}

function git(args, options) {
    return execFileSync('git', args, Object.assign({ maxBuffer: 256 * 1024 * 1024 }, options));
}

/** Rend la sortie de `git`, ou null si la commande echoue — jamais d exception. */
function gitOuNull(args) {
    try {
        return git(args, { encoding: 'utf8' }).trim();
    } catch {
        return null;
    }
}

/** L arbre vide de git : le parent d un commit racine, quand on doit en nommer un. */
const ARBRE_VIDE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';

/** Chemin du temoin — voir § LE TEMOIN. `--git-dir` suit l arbre de travail lie. */
function cheminDuTemoin() {
    const dir = gitOuNull(['rev-parse', '--git-dir']);
    return dir === null ? null : path.join(dir, 'gardes-au-commit-vu');
}

function lireLeTemoin() {
    const p = cheminDuTemoin();
    if (p === null) return null;
    try {
        const v = fs.readFileSync(p, 'utf8').trim();
        return /^[0-9a-f]{40}$/.test(v) ? v : null;
    } catch {
        return null;
    }
}

// ── 1. Ce que ce commit porte ────────────────────────────────────────────────
//
// LE PIEGE, ET IL A COUTE UN TROU (2026-08-11, tache abf9a6c2). `git diff --cached` compare
// l index a HEAD. Pour un commit ordinaire, HEAD est bien le parent du futur commit, donc
// cette liste EST le differentiel du commit. Pour un AMENDEMENT, non : le parent du futur
// commit est HEAD^, et l index — quand rien n a ete reindexe — est deja identique a HEAD.
// La liste rendue est alors VIDE, et l ancienne version sortait a zero en annoncant
// « aucune application gardee dans ce commit », sur un commit qui en changeait une.
//
// CE QUE GIT EXPOSE, MESURE PLUTOT QUE PRESUME (2026-08-11) :
//   - `commit-msg` recoit « [.git/COMMIT_EDITMSG] [] [] » — les memes arguments pour un
//     commit ordinaire et pour un amendement. Rien a en tirer.
//   - Aucune variable d environnement ne les distingue : `GIT_AUTHOR_DATE`, `GIT_INDEX_FILE`,
//     `GIT_EDITOR` sont posees dans les DEUX cas.
//   - `prepare-commit-msg` recoit bien « commit HEAD » sur `git commit --amend`, ce qui est
//     la piste que la documentation suggere — MAIS sur `git commit --amend -m "..."` il
//     recoit « message », exactement comme un commit ordinaire. Cette piste-la est donc
//     FAUSSE une fois sur deux, et un crochet qui se croit informe est pire qu un crochet
//     qui sait qu il ne l est pas.
//
// LE TEMOIN, ET POURQUOI IL FALLAIT AUTRE CHOSE QUE LE PARENT. La piste evidente — juger le
// differentiel complet du commit amende — ferme bien le trou, mais elle fait payer une suite
// entiere a qui corrige un mot dans un message, ce qui est le geste le plus courant de tous.
// On ne peut pas non plus se taire, puisque c est le trou. La question n est donc ni « est-ce
// un amendement ? » ni « qu y a-t-il a l index ? », mais : CE CONTENU A-T-IL DEJA ETE JUGE ?
// Git ne repond pas a celle-la ; on la lui fait repondre. Apres chaque execution VERTE, le
// declencheur ecrit l empreinte de l arbre qu il vient de certifier dans
// `<git-dir>/gardes-au-commit-vu` (local, jamais versionne, propre a l arbre de travail).
//   - amendement de message seul : l arbre a commiter est celui de HEAD, deja certifie —
//     le temoin correspond, 0 test, cout d un `git write-tree` ;
//   - commit ordinaire : le temoin vaut l arbre de HEAD, le contenu de HEAD est donc juge,
//     et seul ce que l index y ajoute est neuf — comportement inchange, cout inchange ;
//   - amendement d un commit que RIEN n a juge (historique anterieur au crochet, clone sans
//     `core.hooksPath`, rebase, plomberie), ou premier commit apres un changement de
//     branche : le temoin ne vaut PAS l arbre de HEAD — on juge alors tout ce qui a change
//     depuis l arbre certifie, et la faute rougit. C est la seule branche qui elargit.
//
// CE QU IL RESTE OUVERT, ET IL FAUT LE LIRE ICI PLUTOT QUE DE LE DECOUVRIR. Le pre-filtre en
// `sh` sort a zero — sans demarrer node, donc sans consulter le temoin — quand l index
// ajoute quelque chose et que RIEN de cet ajout n est sous garde. Un amendement qui
// reindexe un fichier hors garde (un README) par-dessus un contenu jamais juge passe donc
// encore. C est assume : fermer ce cas coute un demarrage de node A CHAQUE COMMIT de
// documentation, et un crochet qui coute se fait contourner — on perdrait alors aussi ce
// qui marche. L integration continue, elle, juge le contenu POUSSE quel qu il soit : le trou
// porte sur l immediatete, pas sur la couverture finale.
//
// ELARGIR NE MENT JAMAIS, ET C EST CE QUI REND CE CHOIX SUR : un temoin absent, perime ou
// ecrit par une autre session fait juger PLUS de fichiers, jamais moins. Le declencheur juge
// toujours l arbre qui va etre commite ; un rouge y est donc toujours un vrai rouge, et le
// seul risque d un temoin faux est du temps de calcul (~3,0 s pour les deux suites entieres).

/** Vrai si un commit est en cours : git pose GIT_INDEX_FILE pour ses crochets (mesure). */
const dansUnCommit = process.env.GIT_INDEX_FILE !== undefined;

/** L empreinte de l arbre qui SERA commite — celui de l index, temporaire compris (`-a`). */
const futurArbre = dansUnCommit ? gitOuNull(['write-tree']) : null;

function fichiersIndexes(base) {
    const args = ['diff', '--cached', '--name-only', '--diff-filter=ACMRD'];
    if (base !== undefined) args.push(base);
    let sortie;
    try {
        sortie = git(args, { encoding: 'utf8' });
    } catch (e) {
        abandonner('git n a pas rendu la liste des fichiers indexes (' + e.message + ').');
    }
    return sortie
        .split('\n')
        .map((s) => s.trim().replace(/\\/g, '/'))
        .filter(Boolean);
}

// `git diff --cached` sans argument compare a HEAD : c est le cas courant, et le seul ou
// cette liste EST le differentiel du futur commit.
let indexes = fichiersIndexes();

if (!dansUnCommit) {
    if (indexes.length === 0) {
        // Appel a la main (le pas « le declencheur se lance sans erreur » de l integration
        // continue, ou une verification locale) : il n y a pas de futur commit a juger, et
        // se mettre a lancer des tests ici ferait rougir un job pour une cause qui n est
        // pas la sienne. On le DIT, au lieu de rendre le meme silence qu un travail fait.
        console.error('gardes du code : aucun commit en cours (index inchange) — 0 test lance');
        process.exit(0);
    }
} else {
    // ── CONTRE QUOI JUGER : trois cas, et un seul silence ─────────────────────
    const vu = lireLeTemoin();
    const arbreDeHead = gitOuNull(['rev-parse', 'HEAD^{tree}']);

    if (futurArbre !== null && vu === futurArbre) {
        // 1. L arbre a commiter est celui que la derniere execution verte a certifie. Il
        //    n y a rien de neuf a juger, quel que soit le geste — c est ici que passe
        //    l amendement de message seul, et il ne coute rien.
        console.error(
            'gardes du code : l index n ajoute rien, et cet arbre (' +
                futurArbre.slice(0, 7) +
                ') a deja ete certifie — 0 test lance'
        );
        process.exit(0);
    } else if (vu !== null && vu !== arbreDeHead) {
        // 2. LE CONTENU DE HEAD N EST PAS CELUI QU ON A CERTIFIE. Juger « ce que l index
        //    ajoute a HEAD » supposerait HEAD deja juge, ce qui est faux ici : c est le cas
        //    de l amendement d un commit venu d ailleurs (anterieur au crochet, rebase,
        //    clone sans core.hooksPath, plomberie), et d un simple changement de branche.
        //    On juge donc TOUT CE QUI A CHANGE depuis le dernier arbre certifie. Plus
        //    large, jamais plus faux : le contenu juge reste celui qui va etre commite.
        indexes = fichiersIndexes(vu);
        console.error(
            'gardes du code : le contenu de HEAD n est pas celui qui a ete certifie (' +
                vu.slice(0, 7) +
                ') — on juge tout ce qui a change depuis (' +
                indexes.length +
                ' fichier(s))'
        );
    } else if (indexes.length === 0) {
        // 3. Rien de neuf a l index, et aucun temoin pour dire si HEAD a ete juge : c est
        //    un amendement dont on ne peut rien presumer. On juge le differentiel COMPLET
        //    du commit remplace, contre le parent qu il gardera. `HEAD^1` et non `HEAD^` :
        //    sur un commit de fusion, le premier parent est celui du differentiel. Un
        //    commit racine n a pas de parent — l arbre vide en tient lieu, sinon le crochet
        //    casserait sur un cas legitime, et un crochet qui casse se fait desarmer dans
        //    la semaine.
        const parent =
            gitOuNull(['rev-parse', '--verify', '--quiet', 'HEAD^1^{commit}']) || ARBRE_VIDE;
        const tete = gitOuNull(['rev-parse', '--short', 'HEAD']) || '(racine)';
        indexes = fichiersIndexes(parent);
        console.error(
            'gardes du code : l index n ajoute rien a ' +
                tete +
                ', et aucun temoin ne dit que cet arbre a ete juge — ce commit le REMPLACE, ' +
                'on juge son differentiel complet (' +
                indexes.length +
                ' fichier(s) contre ' +
                (parent === ARBRE_VIDE ? 'l arbre vide' : parent.slice(0, 7)) +
                ')'
        );
    }
}

const dansLeCommit = new Set(indexes);
const global = DECLENCHEURS_GLOBAUX.some((p) => dansLeCommit.has(p));

// ── 2. Quelles applications sont concernees ──────────────────────────────────
//
// LECTURE INTER-APPLICATION. Un test peut declarer, dans `LECTURES`, un chemin
// qui appartient a une AUTRE application que la sienne — `garde-surface-publique`
// derive sa liste des schemas du CMS. Deux consequences, et les oublier rendrait
// ce crochet faussement vert :
//
//   1. DECLENCHEMENT — toucher `apps/cms/src/api/` doit rejouer ce test, donc
//      rendre `apps/web` concernee alors qu'aucun de ses fichiers n'est indexe.
//      Sans cela, ajouter un type de contenu ne rejouerait jamais la garde qui
//      existe precisement pour le sonder.
//   2. MATERIALISATION — le test LIT `apps/cms/src/api/` sur disque. L'arbre
//      temporaire ne porte que les applications concernees ; sans ce calcul,
//      le test echoue non pas sur une regression mais sur une absence, et un
//      crochet qui rougit pour une raison qui n'est pas la sienne se fait
//      desactiver.
const proprietaireDuTest = (test) => APPS.find((app) => test.startsWith(app + '/'));
const toucheParLeCommit = (prefixe) =>
    indexes.some((p) => p === prefixe || (prefixe.endsWith('/') && p.startsWith(prefixe)));

const appsConcernees = APPS.filter(
    (app) =>
        global ||
        indexes.some((p) => p === app || p.startsWith(app + '/')) ||
        Object.entries(LECTURES).some(
            ([test, prefixes]) =>
                proprietaireDuTest(test) === app && prefixes.some(toucheParLeCommit)
        )
);

// Les applications qu'il faut POSER dans l'arbre sans y lancer de test : celles
// que les tests des applications concernees lisent par chemin.
const appsSupport = APPS.filter(
    (app) =>
        !appsConcernees.includes(app) &&
        Object.entries(LECTURES).some(
            ([test, prefixes]) =>
                appsConcernees.includes(proprietaireDuTest(test)) &&
                prefixes.some((pre) => pre === app || pre.startsWith(app + '/'))
        )
);

if (appsConcernees.length === 0) {
    console.error('gardes du code : aucune application gardee dans ce commit — 0 test lance');
    process.exit(0);
}

// ── 3. Materialiser l INDEX, pas la copie de travail ─────────────────────────
const racine = fs.mkdtempSync(path.join(os.tmpdir(), 'gardes-au-commit-'));
const jonctions = [];
let code = 0;
// Des tests ont-ils REELLEMENT tourne ? Le temoin ne certifie que ce qui a ete execute :
// un « 0 test lance » certifierait un arbre que personne n a juge, et le trou reviendrait
// par la porte que ce temoin ferme.
let testsLances = false;

try {
    let listeSuivie;
    try {
        listeSuivie = git(
            ['ls-files', '-z', '--'].concat(appsConcernees, appsSupport, SUPPORTS_HORS_APPLICATION),
            { encoding: 'buffer' }
        );
    } catch (e) {
        abandonner('git n a pas rendu la liste des fichiers suivis (' + e.message + ').');
    }
    try {
        git(['checkout-index', '-z', '--stdin', '-f', '--prefix=' + racine.replace(/\\/g, '/') + '/'], {
            input: listeSuivie,
        });
    } catch (e) {
        abandonner(
            'l index n a pas pu etre materialise — rien ne peut etre verifie (' + e.message + ').'
        );
    }

    // `node_modules` n'est pas versionne : il n'existe donc pas dans l index.
    // On le presente a l arbre temporaire par un lien (jonction sous Windows,
    // qui ne demande aucun privilege). On ne COPIE pas : ce serait plusieurs
    // centaines de mega-octets a chaque commit. Le lien est retire en sortie —
    // et le retirer n efface JAMAIS sa cible, c est le point important.
    for (const app of appsConcernees) {
        const reel = path.resolve(app, 'node_modules');
        if (!fs.existsSync(reel)) continue;
        const lien = path.join(racine, app, 'node_modules');
        try {
            fs.symlinkSync(reel, lien, 'junction');
            jonctions.push(lien);
        } catch (e) {
            abandonner(
                'le lien vers ' +
                    app +
                    '/node_modules n a pas pu etre pose (' +
                    e.message +
                    ') — les tests ne pourraient pas resoudre leurs dependances, et leur ' +
                    'echec ne prouverait rien.'
            );
        }
    }

    // ── 4. Deriver le graphe d imports, dans le contenu INDEXE ───────────────
    const RESOLUTIONS = ['', '.ts', '.mjs', '.js', '.astro', '/index.ts', '/index.js'];

    // Les fichiers de test portent des SOURCES FABRIQUEES dans des gabarits
    // (`const REPARTITEUR_FABRIQUE = ` … `import X from './Y.astro'` … `),
    // qu'un scan naif prend pour de vrais imports. Ils ne se resolvent jamais,
    // et le test serait alors elargi a CHAQUE commit — un declencheur qui
    // s'allume toujours ne cible plus rien. On retire donc gabarits et
    // commentaires avant de lire les imports. Un faux negatif introduit ici est
    // rattrape par l'integration, qui lance tout.
    const sansGabarits = (s) =>
        s
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
            .replace(/`(?:\\[\s\S]|[^\\`])*`/g, '``');

    /** Chemins repo-relatifs importes directement par `fichier` (repo-relatif). */
    function importsDirects(fichier) {
        let source;
        try {
            source = sansGabarits(fs.readFileSync(path.join(racine, fichier), 'utf8'));
        } catch {
            return { cibles: [], irresolus: [fichier] };
        }
        const cibles = [];
        const irresolus = [];
        const motif = /(?:from|import|require)\s*\(?\s*['"](\.[^'"]*)['"]/g;
        let m;
        while ((m = motif.exec(source)) !== null) {
            const brut = m[1];
            const base = path.posix.join(path.posix.dirname(fichier), brut);
            const trouve = RESOLUTIONS.map((s) => base + s).find((c) => {
                try {
                    return fs.statSync(path.join(racine, c)).isFile();
                } catch {
                    return false;
                }
            });
            if (trouve === undefined) irresolus.push(brut);
            else cibles.push(trouve);
        }
        return { cibles, irresolus };
    }

    /** Fermeture transitive des imports d un test, plus ses lectures declarees. */
    function entreesDe(test) {
        const vus = new Set([test]);
        const pile = [test];
        let elargir = false;
        while (pile.length) {
            const courant = pile.pop();
            const { cibles, irresolus } = importsDirects(courant);
            // Un import relatif qu on ne sait pas resoudre : on ELARGIT.
            if (irresolus.length) elargir = true;
            for (const c of cibles) {
                if (!vus.has(c)) {
                    vus.add(c);
                    pile.push(c);
                }
            }
        }
        return { entrees: [...vus], prefixes: LECTURES[test] || [], elargir };
    }

    // ── 5. Quels tests lancer ────────────────────────────────────────────────
    const lots = [];
    for (const app of appsConcernees) {
        const dossier = path.join(racine, app, 'tests');
        if (!fs.existsSync(dossier)) continue;
        const tests = fs
            .readdirSync(dossier)
            .filter((f) => f.endsWith('.test.ts'))
            .sort()
            .map((f) => app + '/tests/' + f);

        const appEntiere = global || dansLeCommit.has(declencheurAppEntiere(app));
        const choisis = [];
        for (const t of tests) {
            if (appEntiere) {
                choisis.push({
                    test: t,
                    par: global
                        ? DECLENCHEURS_GLOBAUX.filter((p) => dansLeCommit.has(p))
                        : [declencheurAppEntiere(app)],
                });
                continue;
            }
            const { entrees, prefixes, elargir } = entreesDe(t);
            const par = entrees.filter((p) => dansLeCommit.has(p));
            for (const pre of prefixes) {
                for (const p of indexes) {
                    if (p === pre || (pre.endsWith('/') && p.startsWith(pre))) par.push(p);
                }
            }
            if (elargir && par.length === 0) par.push('(import irresolu — elargissement)');
            if (par.length) choisis.push({ test: t, par: [...new Set(par)] });
        }
        if (choisis.length) lots.push({ app, choisis, total: tests.length });
    }

    if (lots.length === 0) {
        console.error(
            'gardes du code : aucun test ne couvre ' +
                indexes.filter((p) => APPS.some((a) => p.startsWith(a + '/'))).join(', ') +
                ' — 0 test lance'
        );
        process.exit(0);
    }

    // ── 6. Lancer, et nommer ce qui rougit ───────────────────────────────────
    for (const lot of lots) {
        const fichiers = lot.choisis.map((c) => path.posix.relative(lot.app, c.test));
        const debut = Date.now();
        const r = spawnSync(process.execPath, ['--test'].concat(fichiers), {
            cwd: path.join(racine, lot.app),
            encoding: 'utf8',
        });
        const ms = Date.now() - debut;
        if (!r.error) testsLances = true;

        if (r.error) {
            code = 1;
            console.error('');
            console.error('COMMIT REFUSE — les tests de ' + lot.app + ' n ont PAS PU se lancer :');
            console.error('  ' + r.error.message);
            continue;
        }
        if (r.status === 0) {
            // Une ligne par application, pas une par test : un crochet bavard se
            // lit comme du bruit, et ce qu'on veut savoir tient en trois nombres.
            const causes = [...new Set(lot.choisis.flatMap((c) => c.par))];
            console.error(
                'gardes VERTES — ' +
                    lot.app +
                    ' : ' +
                    fichiers.length +
                    '/' +
                    lot.total +
                    ' fichiers de test — ' +
                    ms +
                    ' ms  (declenches par ' +
                    (causes.length > 4 ? causes.length + ' fichiers indexes' : causes.join(', ')) +
                    ')'
            );
            if (fichiers.length <= 8) {
                for (const c of lot.choisis) {
                    console.error('    ' + path.posix.relative(lot.app, c.test));
                }
            }
            continue;
        }

        code = 1;
        const sortie = (r.stdout || '') + (r.stderr || '');
        // Les fichiers que node nomme comme ayant echoue. On les remonte en
        // tete : « un test a casse » sans dire lequel oblige a relire toute la
        // sortie, et c est ce qui pousse au --no-verify.
        // node ne nomme le FICHIER en echec que dans les lignes
        // « test at tests\x.test.ts:110:3 » de sa section « failing tests ».
        // C'est cette ligne qu'on lit : « un test a casse » sans dire lequel
        // oblige a relire toute la sortie, et c'est ce qui pousse au
        // --no-verify.
        const rouges = [
            ...new Set(
                [...sortie.matchAll(/^test at ([^\n:]+\.test\.ts):/gm)].map((m) =>
                    m[1].replace(/\\/g, '/')
                )
            ),
        ];
        console.error('');
        console.error('COMMIT REFUSE — garde ROUGE dans ' + lot.app + ' (code ' + r.status + ')');
        console.error(
            '  test(s) en echec  : ' + (rouges.length ? rouges.join(', ') : '(voir la sortie)')
        );
        for (const c of lot.choisis) {
            const nom = path.posix.relative(lot.app, c.test);
            if (rouges.includes(nom)) {
                console.error('    ' + nom + '  declenche par : ' + c.par.join(', '));
            }
        }
        console.error('  juge sur          : le contenu INDEXE, pas la copie de travail');
        console.error('  --- sortie des tests --------------------------------------------');
        for (const l of sortie.replace(/\s+$/, '').split('\n')) console.error('  ' + l);
        console.error('  -----------------------------------------------------------------');
        console.error(
            '  Rejouable a l identique : cd ' +
                lot.app +
                ' && node --test ' +
                fichiers.join(' ')
        );
    }
} finally {
    // Retirer les liens AVANT l arbre : `fs.rmSync` sur une jonction pourrait
    // suivre la cible, et effacer le node_modules reel du depot partage.
    for (const l of jonctions) {
        try {
            fs.unlinkSync(l);
        } catch {
            try {
                fs.rmdirSync(l);
            } catch {
                /* un lien qui survit ne fausse aucun verdict */
            }
        }
    }
    try {
        fs.rmSync(racine, { recursive: true, force: true });
    } catch {
        /* un temporaire qui survit ne fausse aucun verdict */
    }
}

// ── 7. Le temoin : consigner l arbre qui vient d etre certifie ───────────────
// Il n est ecrit QUE si des tests ont reellement tourne et qu ils sont tous verts. Il n est
// pas versionne, il vit dans le repertoire git de cet arbre de travail, et sa perte ne fait
// qu elargir le prochain jugement — jamais l inverse (cf. § LE TEMOIN plus haut).
if (code === 0 && testsLances && futurArbre !== null) {
    const p = cheminDuTemoin();
    if (p !== null) {
        try {
            fs.writeFileSync(p, futurArbre + '\n', 'utf8');
        } catch {
            /* un temoin non ecrit ne fausse aucun verdict : le prochain jugement elargit */
        }
    }
}

if (code !== 0) {
    console.error('');
    console.error(
        'Corrige la regression, ou relance `git commit` une fois le test remis au vert. ' +
            'Ne contourne pas avec --no-verify : ce commit touche precisement ce que ce ' +
            'test protege.'
    );
    console.error('');
}
process.exit(code);
