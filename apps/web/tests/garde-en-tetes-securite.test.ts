/**
 * Tests de la garde « en-tetes de securite servis » — la production sert-elle ENCORE la
 * politique qu on croit y avoir posee ?
 *
 * LE DEFAUT QUE CETTE GARDE FERME, et il est arrive. Le 2026-08-10, entre 04:09 et 08:28,
 * la valeur `custom_labels` de l application Coolify `echo-site` a ete remplacee par le
 * jeu que l outil engendre par defaut. Les quatre lignes qui definissaient le middleware
 * `echo-headers` et la ligne qui l APPLIQUAIT au routeur ont disparu ensemble. Depuis le
 * deploiement de 08:47, `https://echo.ayfiweb.fr/` repondait `200` sans aucun
 * `Content-Security-Policy`, sans `X-Content-Type-Options`, sans `Referrer-Policy` et sans
 * `Permissions-Policy`.
 *
 * CE QUI REND CE DEFAUT DIFFERENT DES AUTRES : IL N A FAIT AUCUN BRUIT. Le build a reussi,
 * les six verificateurs de ce depot sont restes verts — ils jugent la SORTIE CONSTRUITE,
 * et la sortie etait irreprochable. Le site a repondu 200 sur chaque URL. Les images se
 * sont affichees, les styles aussi : la disparition de la politique les AUTORISE toutes
 * les deux. Rien, nulle part, n a signale que la posture de securite du site venait de
 * tomber — et sans mesure fortuite, personne n aurait su ni quoi, ni depuis quand.
 *
 * POURQUOI ELLE JUGE LA REPONSE SERVIE, ET RIEN D AUTRE. L en-tete ne vit dans aucun
 * fichier de ce depot : il vit dans les labels Traefik de l application Coolify, en base
 * de l instance (`docs/runbook-provisionnement.md`, etape 27). Une garde qui relirait le
 * depot ne verrait donc jamais ce defaut — c est exactement ce qui s est passe. Seule la
 * reponse HTTP fait foi : `[[garantie-par-mecanisme-pas-convention]]`.
 *
 * POURQUOI ELLE PORTE UNE COPIE DE LA POLITIQUE, alors que ce projet interdit partout la
 * seconde source de verite. Parce qu il n en existait AUCUNE : la politique n etait ecrite
 * nulle part sous une forme comparable en machine, et c est precisement ce qui a rendu sa
 * disparition indetectable. Une attente declaree est le contraire d une duplication : sans
 * elle, il n y a rien a confronter. Le prix est nomme et assume — quand la politique change
 * volontairement (l ouverture de `/recherche` a Pagefind, par exemple), c est CE FICHIER
 * qu il faut changer, en le sachant, et le test rouge est la pour l imposer.
 *
 * LES DEUX SENS SONT EXERCES ICI : en-tete absent ou devie -> rouge en NOMMANT ce qui
 * manque ; en-tete conforme -> vert en ANNONCANT ce qui a ete verifie. Et une troisieme
 * issue existe, distincte des deux : quand la mesure n a PAS PU avoir lieu (reseau, statut
 * inattendu), la garde rend `2` et ne se fait jamais passer pour un vert.
 *
 * ── DEPUIS LE 2026-08-12, LE SITE SERT DEUX POLITIQUES, ET LA FRONTIERE EST L OBJET ────
 *
 * Le changement volontaire annonce ci-dessus a eu lieu : un SECOND routeur Traefik
 * (`echo-headers-recherche`, runbook etape 27 point 4) porte une politique OUVERTE sur
 * `/recherche`, `/en/recherche` et `/pagefind` — `script-src 'self' '<empreinte>'
 * 'wasm-unsafe-eval'`, `connect-src 'self'` — pendant que TOUT le reste du site reste
 * ferme. La garde ne pouvait donc plus tenir une politique unique.
 *
 * CE QUI ETAIT OUVERT ET QUE CES TESTS FERMENT : `URLS_PAR_DEFAUT` ne mesurait que `/`,
 * un media et `/robots.txt`. Aucune des trois routes ouvertes n etait regardee. La
 * politique de la recherche pouvait donc disparaitre, se refermer ou s elargir sans qu une
 * seule garde ne bronche — le defaut du 2026-08-10 a l identique, sur le perimetre qui
 * venait d etre cree.
 *
 * LES DEUX SENS DE LA FRONTIERE SONT DES DEFAUTS, ET AUCUN NE SE VOIT A L OEIL :
 *
 *   - la politique FERMEE servie sur `/recherche` -> la page repond `200`, s affiche
 *     normalement, et la recherche ne cherche pas. C est arrive DEUX FOIS (2026-08-10,
 *     puis le premier essai du 2026-08-12, borne au seul `/recherche` sans `/pagefind`) ;
 *   - la politique OUVERTE servie sur une page ORDINAIRE -> rien ne casse, rien ne
 *     s affiche differemment, et le site entier a perdu `script-src 'none'`, c est-a-dire
 *     le verdict « zero octet de JS » du §1 et la posture qui va avec.
 *
 * L EMPREINTE N EST PAS JUGEE A LA LETTRE, ET C EST UN ARBITRAGE : le motif est ecrit en
 * tete de `verifier-en-tetes.mjs`. Ce qui est juge ici, c est le JEU DE SOURCES — ni une de
 * plus, ni une de moins — et la FORME de l empreinte.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MARQUEUR_EMPREINTE,
  POLITIQUE_ATTENDUE,
  POLITIQUE_RECHERCHE,
  PREFIXES_RECHERCHE,
  URLS_PAR_DEFAUT,
  directivesDe,
  inspecterEnTetes,
  jugerReponse,
  politiquePour,
  resumeEnTetes,
} from '../scripts/verifier-en-tetes.mjs';
import { ISSUES } from '../scripts/issues.mjs';

/**
 * L empreinte REELLEMENT SERVIE le 2026-08-14 par `https://echo.ayfiweb.fr/recherche`.
 *
 * Elle n est ici que pour fabriquer des reponses realistes : la garde ne la compare JAMAIS
 * a la lettre (motif en tete de `verifier-en-tetes.mjs`), et le test
 * « deux empreintes differentes passent » le prouve en changeant celle-ci.
 */
const EMPREINTE_SERVIE = "'sha256-urNDGBXjkCXmKLEppFdMdUMasfH9vYiR+8cKV+DrGSc='";

/** La politique, telle qu un serveur conforme la servirait, avec une empreinte reelle. */
function politiqueServie(politique: typeof POLITIQUE_ATTENDUE, empreinte = EMPREINTE_SERVIE) {
  const enTetes: Record<string, string> = {};
  for (const [nom, regle] of Object.entries(politique)) {
    enTetes[nom] = regle.valeur.replace(MARQUEUR_EMPREINTE, empreinte);
  }
  return enTetes;
}

/** La reponse d une production conforme : tous les en-tetes attendus, a la lettre. */
function reponseConforme(url = 'https://echo.ayfiweb.fr/', ajouts: Record<string, string> = {}) {
  const { politique } = politiquePour(url);
  return { url, statut: 200, enTetes: { ...politiqueServie(politique), ...ajouts } };
}

// --- Famille 1 : le sens VERT — la politique est servie ---------------------------------

test('une reponse qui sert les quatre en-tetes a la lettre ne produit aucun manquement', () => {
  const rapport = inspecterEnTetes([reponseConforme()]);
  assert.deepEqual(rapport.manquements, []);
  assert.equal(rapport.issue, ISSUES.CONFORME);
  assert.equal(rapport.reponses, 1);
});

test('le vert ANNONCE ce qui a ete verifie : les URL, les en-tetes, et le compte de directives', () => {
  const rapport = inspecterEnTetes([
    reponseConforme('https://echo.ayfiweb.fr/'),
    reponseConforme('https://echo.ayfiweb.fr/robots.txt'),
  ]);
  const resume = resumeEnTetes(rapport);
  // Les URL mesurees sont nommees : un vert muet ne dit pas SUR QUOI il porte.
  assert.match(resume, /https:\/\/echo\.ayfiweb\.fr\//);
  assert.match(resume, /robots\.txt/);
  // Les quatre en-tetes sont nommes, pas resumes en « en-tetes de securite ».
  for (const nom of Object.keys(POLITIQUE_ATTENDUE)) {
    assert.match(resume.toLowerCase(), new RegExp(nom.toLowerCase()));
  }
  // Le compte de directives CSP reellement confrontees, pour qu un vert sur une CSP
  // amputee de moitie ne ressemble pas a un vert sur la CSP entiere.
  const attendues = directivesDe(POLITIQUE_ATTENDUE['content-security-policy'].valeur, ';').size;
  assert.match(resume, new RegExp(`${attendues}\\s*directive`));
});

test('la casse du NOM d en-tete est sans effet : HTTP ne la distingue pas', () => {
  const reponse = { url: 'https://echo.ayfiweb.fr/', statut: 200, enTetes: {} as Record<string, string> };
  for (const [nom, regle] of Object.entries(POLITIQUE_ATTENDUE)) {
    reponse.enTetes[nom.toUpperCase()] = regle.valeur;
  }
  assert.deepEqual(inspecterEnTetes([reponse]).manquements, []);
});

test("l ORDRE des directives CSP et les espaces surnumeraires ne rougissent pas : la politique est la meme", () => {
  const attendue = POLITIQUE_ATTENDUE['content-security-policy'].valeur;
  const melangee = attendue
    .split(';')
    .map((d) => d.trim())
    .reverse()
    .join(' ;   ');
  const rapport = inspecterEnTetes([reponseConforme('https://echo.ayfiweb.fr/', { 'content-security-policy': melangee })]);
  assert.deepEqual(rapport.manquements, []);
});

test('un en-tete SUPPLEMENTAIRE hors politique ne rougit pas : la garde tient une attente, pas une liste fermee', () => {
  const rapport = inspecterEnTetes([reponseConforme('https://echo.ayfiweb.fr/', { 'x-frame-options': 'DENY' })]);
  assert.deepEqual(rapport.manquements, []);
});

// --- Famille 2 : le sens ROUGE — la politique a disparu ou devie -------------------------

test("l en-tete ABSENT rougit en le NOMMANT — c est le defaut du 2026-08-10, reproduit", () => {
  // La production servait exactement ceci : 200, et rien d autre que les en-tetes de nginx.
  const reponse = {
    url: 'https://echo.ayfiweb.fr/',
    statut: 200,
    enTetes: { server: 'nginx/1.31.3', 'content-type': 'text/html' },
  };
  const rapport = inspecterEnTetes([reponse]);
  assert.equal(rapport.issue, ISSUES.ANOMALIE);
  assert.equal(rapport.manquements.length, 4);
  const texte = rapport.manquements.join('\n');
  for (const nom of Object.keys(POLITIQUE_ATTENDUE)) {
    assert.match(texte.toLowerCase(), new RegExp(`${nom.toLowerCase()}[^\\n]*absent`));
  }
  // L URL est nommee dans chaque manquement : quatre lignes sans adresse n envoient nulle part.
  for (const manquement of rapport.manquements) assert.match(manquement, /https:\/\/echo\.ayfiweb\.fr\//);
});

test('une directive CSP RETIREE est nommee, et la garde dit laquelle', () => {
  const ampute = POLITIQUE_ATTENDUE['content-security-policy'].valeur
    .split(';')
    .map((d) => d.trim())
    .filter((d) => !d.startsWith('script-src'))
    .join('; ');
  const rapport = inspecterEnTetes([
    reponseConforme('https://echo.ayfiweb.fr/', { 'content-security-policy': ampute }),
  ]);
  assert.equal(rapport.issue, ISSUES.ANOMALIE);
  assert.equal(rapport.manquements.length, 1);
  assert.match(rapport.manquements[0], /script-src/);
  assert.match(rapport.manquements[0], /manquante|absente/i);
});

test("une directive RELACHEE est nommee AVEC les deux valeurs : c est le cas qu on ne doit jamais laisser passer", () => {
  const relachee = POLITIQUE_ATTENDUE['content-security-policy'].valeur.replace(
    "script-src 'none'",
    "script-src 'self' 'unsafe-inline'",
  );
  const rapport = inspecterEnTetes([
    reponseConforme('https://echo.ayfiweb.fr/', { 'content-security-policy': relachee }),
  ]);
  assert.equal(rapport.issue, ISSUES.ANOMALIE);
  const texte = rapport.manquements.join('\n');
  assert.match(texte, /script-src/);
  assert.match(texte, /'none'/);
  assert.match(texte, /unsafe-inline/);
});

test('une directive CSP AJOUTEE est signalee : une politique elargie en silence est le defaut, pas la correction', () => {
  const elargie = `${POLITIQUE_ATTENDUE['content-security-policy'].valeur}; frame-src https://www.youtube-nocookie.com`;
  const rapport = inspecterEnTetes([
    reponseConforme('https://echo.ayfiweb.fr/', { 'content-security-policy': elargie }),
  ]);
  assert.equal(rapport.issue, ISSUES.ANOMALIE);
  assert.match(rapport.manquements.join('\n'), /frame-src/);
});

test('un en-tete simple dont la VALEUR devie rougit avec les deux valeurs', () => {
  const rapport = inspecterEnTetes([
    reponseConforme('https://echo.ayfiweb.fr/', { 'x-content-type-options': 'sniff' }),
  ]);
  assert.equal(rapport.issue, ISSUES.ANOMALIE);
  assert.match(rapport.manquements[0], /nosniff/);
  assert.match(rapport.manquements[0], /sniff/);
});

test('Permissions-Policy se compare DIRECTIVE PAR DIRECTIVE, sur la virgule et non sur le point-virgule', () => {
  const attendue = POLITIQUE_ATTENDUE['permissions-policy'].valeur;
  // Meme politique, autre ordre, autres espaces : conforme.
  const melangee = attendue
    .split(',')
    .map((d) => d.trim())
    .reverse()
    .join(',  ');
  assert.deepEqual(
    inspecterEnTetes([reponseConforme('https://echo.ayfiweb.fr/', { 'permissions-policy': melangee })]).manquements,
    [],
  );
  // Une permission REOUVERTE est nommee.
  const rouverte = attendue.replace('camera=()', 'camera=(self)');
  const rapport = inspecterEnTetes([
    reponseConforme('https://echo.ayfiweb.fr/', { 'permissions-policy': rouverte }),
  ]);
  assert.equal(rapport.issue, ISSUES.ANOMALIE);
  assert.match(rapport.manquements.join('\n'), /camera/);
});

test('UNE SEULE URL fautive parmi plusieurs suffit a rougir, et elle est nommee', () => {
  const rapport = inspecterEnTetes([
    reponseConforme('https://echo.ayfiweb.fr/'),
    { url: 'https://echo.ayfiweb.fr/medias/logo.svg', statut: 200, enTetes: { server: 'nginx/1.31.3' } },
  ]);
  assert.equal(rapport.issue, ISSUES.ANOMALIE);
  assert.match(rapport.manquements.join('\n'), /medias\/logo\.svg/);
  assert.equal(
    rapport.manquements.every((m: string) => m.includes('/medias/logo.svg')),
    true,
    'la reponse conforme ne doit produire aucun manquement',
  );
});

// --- Famille 3 : l INCAPACITE — ce qui n a pas pu etre mesure ----------------------------

test('zero reponse rend VERIFICATION_IMPOSSIBLE, jamais le vert : une garde branchee sur le vide ne prouve rien', () => {
  const rapport = inspecterEnTetes([]);
  assert.equal(rapport.issue, ISSUES.VERIFICATION_IMPOSSIBLE);
  assert.equal(rapport.manquements.length, 1);
  assert.match(rapport.manquements[0], /aucune reponse/i);
});

test('une erreur RESEAU est une incapacite, pas une absence d en-tete', () => {
  // Le piege exact : « je n ai pas pu joindre le site » et « le site ne sert plus la CSP »
  // enverraient corriger deux objets differents. Les confondre coute une demi-journee.
  const rapport = inspecterEnTetes([
    { url: 'https://echo.ayfiweb.fr/', erreur: 'getaddrinfo ENOTFOUND echo.ayfiweb.fr' },
  ]);
  assert.equal(rapport.issue, ISSUES.VERIFICATION_IMPOSSIBLE);
  assert.match(rapport.manquements[0], /ENOTFOUND/);
  assert.match(rapport.manquements[0], /https:\/\/echo\.ayfiweb\.fr\//);
});

test('un STATUT inattendu est une incapacite : on ne conclut pas sur la politique d une page qu on n a pas eue', () => {
  const rapport = inspecterEnTetes([{ url: 'https://echo.ayfiweb.fr/', statut: 503, enTetes: {} }]);
  assert.equal(rapport.issue, ISSUES.VERIFICATION_IMPOSSIBLE);
  assert.match(rapport.manquements[0], /503/);
});

test("l incapacite d UNE SEULE URL suffit : un vert partiel se ferait passer pour un vert entier", () => {
  const rapport = inspecterEnTetes([
    reponseConforme('https://echo.ayfiweb.fr/'),
    { url: 'https://echo.ayfiweb.fr/robots.txt', erreur: 'socket hang up' },
  ]);
  assert.equal(rapport.issue, ISSUES.VERIFICATION_IMPOSSIBLE);
});

// --- Famille 4 : les briques de comparaison ---------------------------------------------

test('directivesDe decoupe, normalise les espaces, et ignore les separateurs vides', () => {
  const d = directivesDe("default-src 'self';  script-src   'none' ;; ", ';');
  assert.deepEqual([...d.keys()], ['default-src', 'script-src']);
  assert.equal(d.get('default-src'), "'self'");
  assert.equal(d.get('script-src'), "'none'");
});

test('directivesDe garde le NOM en minuscules et la VALEUR telle quelle : `self` et `SELF` ne sont pas le meme jeton', () => {
  const d = directivesDe("Default-Src 'SELF'", ';');
  assert.equal(d.get('default-src'), "'SELF'");
});

test('jugerReponse rend AUSSI la liste de ce qui a ete verifie, pas seulement ce qui manque', () => {
  const { manquements, verifies } = jugerReponse(reponseConforme());
  assert.deepEqual(manquements, []);
  assert.equal(verifies.length, Object.keys(POLITIQUE_ATTENDUE).length);
  assert.match(verifies.join('\n').toLowerCase(), /content-security-policy/);
});

test('la politique attendue porte les quatre en-tetes du §5.5, et AUCUN autre', () => {
  // Un ajout silencieux ici change ce que la production doit servir : il doit se voir.
  assert.deepEqual(Object.keys(POLITIQUE_ATTENDUE).sort(), [
    'content-security-policy',
    'permissions-policy',
    'referrer-policy',
    'x-content-type-options',
  ]);
});

test("la CSP attendue reste FERMEE sur les trois directives qui portent des verdicts de la campagne", () => {
  // `script-src 'none'` fonde le « 0 octet de JS » ; `connect-src 'none'` explique le
  // verdict SEO ; `img-src 'self' data:` est l arbitrage T-01, qui n a pas bouge. Les
  // relacher est une DECISION, jamais un effet de bord d une retouche de ce fichier.
  const d = directivesDe(POLITIQUE_ATTENDUE['content-security-policy'].valeur, ';');
  assert.equal(d.get('script-src'), "'none'");
  assert.equal(d.get('connect-src'), "'none'");
  assert.equal(d.get('img-src'), "'self' data:");
  assert.equal(d.get('frame-ancestors'), "'none'");
});

// --- Famille 5 : LA FRONTIERE ENTRE LES DEUX POLITIQUES ---------------------------------

test('les trois prefixes du second routeur sont routes vers la politique OUVERTE, et eux seuls', () => {
  // La regle Traefik est `PathPrefix(/recherche) || PathPrefix(/en/recherche) ||
  // PathPrefix(/pagefind)`. Ce qui est route ici doit etre ce que le proxy route la-bas :
  // une frontiere qui differe d un chemin rend un verdict sur la mauvaise politique.
  for (const chemin of ['/recherche', '/recherche/', '/en/recherche', '/pagefind/pagefind.js', '/pagefind/wasm.fr.pagefind']) {
    assert.equal(
      politiquePour(`https://echo.ayfiweb.fr${chemin}`).nom,
      'recherche',
      `${chemin} devrait etre juge sur la politique ouverte`,
    );
  }
  for (const chemin of ['/', '/robots.txt', '/mentions-legales', '/a-propos', '/medias/logo.svg', '/en/']) {
    assert.equal(
      politiquePour(`https://echo.ayfiweb.fr${chemin}`).nom,
      'principale',
      `${chemin} devrait rester juge sur la politique fermee`,
    );
  }
});

test('la politique OUVERTE servie sur /recherche, /en/recherche et /pagefind ne produit aucun manquement', () => {
  const rapport = inspecterEnTetes([
    reponseConforme('https://echo.ayfiweb.fr/recherche'),
    reponseConforme('https://echo.ayfiweb.fr/en/recherche'),
    reponseConforme('https://echo.ayfiweb.fr/pagefind/pagefind.js'),
  ]);
  assert.deepEqual(rapport.manquements, []);
  assert.equal(rapport.issue, ISSUES.CONFORME);
});

test("/recherche qui sert la politique FERMEE rougit, et le rouge dit que la recherche est MORTE", () => {
  // Le defaut reellement survenu deux fois : la page repond 200, s affiche normalement, et
  // ne cherche pas. Aucun oeil ne le voit sans taper un mot dans le champ.
  const rapport = inspecterEnTetes([
    {
      url: 'https://echo.ayfiweb.fr/recherche',
      statut: 200,
      enTetes: politiqueServie(POLITIQUE_ATTENDUE),
    },
  ]);
  assert.equal(rapport.issue, ISSUES.ANOMALIE);
  const texte = rapport.manquements.join('\n');
  assert.match(texte, /\/recherche/);
  // Le rouge nomme LAQUELLE des deux politiques est servie a la place de l attendue.
  assert.match(texte.toLowerCase(), /principale/);
  assert.match(texte.toLowerCase(), /recherche/);
  // Et il nomme la consequence, pas seulement l ecart de chaine.
  assert.match(texte.toLowerCase(), /ne cherche|morte|second routeur/);
});

test("une page ORDINAIRE qui sert la politique OUVERTE rougit — c est le debordement, invisible a l oeil", () => {
  // Rien ne casse, rien ne s affiche differemment : le site entier a simplement perdu
  // `script-src 'none'`. C est la regression la plus grave et la moins visible des deux.
  const rapport = inspecterEnTetes([
    {
      url: 'https://echo.ayfiweb.fr/',
      statut: 200,
      enTetes: politiqueServie(POLITIQUE_RECHERCHE),
    },
  ]);
  assert.equal(rapport.issue, ISSUES.ANOMALIE);
  const texte = rapport.manquements.join('\n');
  assert.match(texte, /https:\/\/echo\.ayfiweb\.fr\//);
  assert.match(texte.toLowerCase(), /recherche/);
  assert.match(texte.toLowerCase(), /deborde|elargi|hors de son perimetre|toutes les pages/);
});

test('un ARTICLE qui sert la politique ouverte rougit aussi : le debordement ne se juge pas sur la seule racine', () => {
  const rapport = inspecterEnTetes([
    {
      url: 'https://echo.ayfiweb.fr/articles/la-filature',
      statut: 200,
      enTetes: politiqueServie(POLITIQUE_RECHERCHE),
    },
  ]);
  assert.equal(rapport.issue, ISSUES.ANOMALIE);
  assert.match(rapport.manquements.join('\n'), /la-filature/);
});

test("DEUX empreintes differentes passent toutes les deux : la garde juge la FORME, pas la valeur", () => {
  // L arbitrage assume : l empreinte a un domicile unique (`docs/empreinte-script-recherche.md`,
  // depot de DOC) et se perime a toute retouche du script. La recopier ici en ferait une
  // seconde source de verite qui divergerait en silence.
  const autre = "'sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='";
  assert.notEqual(autre, EMPREINTE_SERVIE);
  for (const empreinte of [EMPREINTE_SERVIE, autre]) {
    const rapport = inspecterEnTetes([
      {
        url: 'https://echo.ayfiweb.fr/recherche',
        statut: 200,
        enTetes: politiqueServie(POLITIQUE_RECHERCHE, empreinte),
      },
    ]);
    assert.deepEqual(rapport.manquements, [], `l empreinte ${empreinte} aurait du passer`);
  }
});

test("une empreinte MAL FORMEE rougit : sans ses apostrophes, le navigateur la refuse et la page est morte", () => {
  // Constate le 2026-08-11 (`docs/empreinte-script-recherche.md` §0) : une source
  // `sha256-…` ecrite sans apostrophes est INVALIDE — Chrome la signale une fois, puis
  // refuse le script. La CSP a l air bonne dans l ecran de configuration.
  for (const mauvaise of [
    'sha256-urNDGBXjkCXmKLEppFdMdUMasfH9vYiR+8cKV+DrGSc=', // apostrophes perdues
    "'sha256-urNDGBXjkCXmKLEpp'", // tronquee
    "'sha256-'", // vide
    "'unsafe-inline'", // remplacee par un joker
  ]) {
    const rapport = inspecterEnTetes([
      {
        url: 'https://echo.ayfiweb.fr/recherche',
        statut: 200,
        enTetes: politiqueServie(POLITIQUE_RECHERCHE, mauvaise),
      },
    ]);
    assert.equal(rapport.issue, ISSUES.ANOMALIE, `« ${mauvaise} » aurait du rougir`);
    assert.match(rapport.manquements.join('\n'), /script-src/);
  }
});

test('une source AJOUTEE a script-src rougit, empreinte valide ou non : un elargissement se decide', () => {
  const elargie = POLITIQUE_RECHERCHE['content-security-policy'].valeur
    .replace(MARQUEUR_EMPREINTE, EMPREINTE_SERVIE)
    .replace("'wasm-unsafe-eval'", "'wasm-unsafe-eval' 'unsafe-eval'");
  const rapport = inspecterEnTetes([
    reponseConforme('https://echo.ayfiweb.fr/recherche', { 'content-security-policy': elargie }),
  ]);
  assert.equal(rapport.issue, ISSUES.ANOMALIE);
  assert.match(rapport.manquements.join('\n'), /unsafe-eval/);
});

test("une source RETIREE de script-src rougit : sans 'wasm-unsafe-eval', le moteur ne demarre pas", () => {
  const amputee = POLITIQUE_RECHERCHE['content-security-policy'].valeur
    .replace(MARQUEUR_EMPREINTE, EMPREINTE_SERVIE)
    .replace(" 'wasm-unsafe-eval'", '');
  const rapport = inspecterEnTetes([
    reponseConforme('https://echo.ayfiweb.fr/recherche', { 'content-security-policy': amputee }),
  ]);
  assert.equal(rapport.issue, ISSUES.ANOMALIE);
  assert.match(rapport.manquements.join('\n'), /script-src/);
});

test("l ORDRE des sources dans script-src ne rougit pas : le navigateur n en tient aucun compte", () => {
  const attendue = POLITIQUE_RECHERCHE['content-security-policy'].valeur.replace(
    MARQUEUR_EMPREINTE,
    EMPREINTE_SERVIE,
  );
  const permutee = attendue.replace(
    `script-src 'self' ${EMPREINTE_SERVIE} 'wasm-unsafe-eval'`,
    `script-src 'wasm-unsafe-eval' ${EMPREINTE_SERVIE} 'self'`,
  );
  assert.notEqual(permutee, attendue, 'la permutation n a pas eu lieu : le test ne prouve rien');
  const rapport = inspecterEnTetes([
    reponseConforme('https://echo.ayfiweb.fr/recherche', { 'content-security-policy': permutee }),
  ]);
  assert.deepEqual(rapport.manquements, []);
});

test("connect-src RE-FERME sur /recherche rougit : c est le fetch de l index que le Worker perd", () => {
  const refermee = POLITIQUE_RECHERCHE['content-security-policy'].valeur
    .replace(MARQUEUR_EMPREINTE, EMPREINTE_SERVIE)
    .replace("connect-src 'self'", "connect-src 'none'");
  const rapport = inspecterEnTetes([
    reponseConforme('https://echo.ayfiweb.fr/pagefind/pagefind.js', {
      'content-security-policy': refermee,
    }),
  ]);
  assert.equal(rapport.issue, ISSUES.ANOMALIE);
  assert.match(rapport.manquements.join('\n'), /connect-src/);
});

test("les deux politiques ne different QUE sur script-src et connect-src", () => {
  /* CONTRE-EPREUVE de l ouverture elle-meme : l arbitrage `fe96fc8d` ouvre DEUX directives
     et pas une de plus. Un elargissement colle par erreur dans la politique de la recherche
     (un `style-src 'unsafe-inline'` recopie d un tutoriel, par exemple) passerait sinon
     inapercu — la garde le servirait comme attendu. */
  const fermee = directivesDe(POLITIQUE_ATTENDUE['content-security-policy'].valeur, ';');
  const ouverte = directivesDe(POLITIQUE_RECHERCHE['content-security-policy'].valeur, ';');
  const differentes = [...ouverte].filter(([nom, valeur]) => fermee.get(nom) !== valeur).map(([nom]) => nom);
  assert.deepEqual(differentes.sort(), ['connect-src', 'script-src']);
  assert.deepEqual([...ouverte.keys()].sort(), [...fermee.keys()].sort());
  // Les trois autres en-tetes sont les MEMES : le second routeur les recopie a la lettre.
  for (const nom of ['x-content-type-options', 'referrer-policy', 'permissions-policy']) {
    assert.equal(POLITIQUE_RECHERCHE[nom].valeur, POLITIQUE_ATTENDUE[nom].valeur);
  }
  assert.equal(ouverte.get('connect-src'), "'self'");
  assert.equal(ouverte.get('script-src'), `'self' ${MARQUEUR_EMPREINTE} 'wasm-unsafe-eval'`);
});

test('les URL mesurees par defaut couvrent les DEUX politiques — sans quoi la frontiere n est pas gardee', () => {
  /* Le trou exact du 2026-08-12 : trois URL mesurees, toutes du cote ferme. La garde
     restait VERTE pendant que la politique ouverte pouvait faire n importe quoi. */
  const parPolitique = new Map<string, string[]>();
  for (const chemin of URLS_PAR_DEFAUT) {
    const { nom } = politiquePour(chemin);
    parPolitique.set(nom, [...(parPolitique.get(nom) ?? []), chemin]);
  }
  assert.ok(
    (parPolitique.get('recherche') ?? []).length >= 3,
    'les trois routes ouvertes ne sont pas toutes mesurees : ' +
      `${JSON.stringify(parPolitique.get('recherche') ?? [])}`,
  );
  assert.ok(
    (parPolitique.get('principale') ?? []).length >= 3,
    'sans page fermee mesuree, le DEBORDEMENT de la politique ouverte ne se verrait plus',
  );
  // La route dont depend le Worker, donc celle dont la fermeture tue la recherche en
  // silence : elle est nommement mesuree, pas seulement « une URL sous /pagefind ».
  assert.ok(URLS_PAR_DEFAUT.includes('/pagefind/pagefind.js'));
  for (const prefixe of PREFIXES_RECHERCHE) {
    assert.ok(
      URLS_PAR_DEFAUT.some((u: string) => u.startsWith(prefixe)),
      `aucune URL mesuree sous « ${prefixe} »`,
    );
  }
});

test('le vert ANNONCE laquelle des deux politiques a ete confrontee sur chaque URL', () => {
  /* Sans cela, un vert obtenu en jugeant `/recherche` sur la politique FERMEE — c est-a-dire
     un routage casse — ressemblerait trait pour trait a un vert legitime. */
  const rapport = inspecterEnTetes([
    reponseConforme('https://echo.ayfiweb.fr/'),
    reponseConforme('https://echo.ayfiweb.fr/recherche'),
  ]);
  assert.deepEqual(rapport.manquements, []);
  const resume = resumeEnTetes(rapport);
  assert.match(resume.toLowerCase(), /principale/);
  assert.match(resume.toLowerCase(), /recherche/);
});
