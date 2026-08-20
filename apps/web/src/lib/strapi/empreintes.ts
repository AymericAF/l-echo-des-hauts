/**
 * LES EMPREINTES DE COMMIT VUES PAR UNE CONSTRUCTION — et la seule regle qui les juge.
 *
 * CE QUE CE MODULE FERME, mesure et non suppose (tache `a1d26d8e`, decision `982567fa` approuvee
 * le 2026-08-20). Pendant la bascule du CMS, DEUX conteneurs sont vivants, sains, et portent des
 * etiquettes Traefik IDENTIQUES au caractere pres — elles derivent de l UUID de l application,
 * jamais du nom du conteneur. `echoback.ayfiweb.fr` a donc deux amonts servant DEUX commits, et
 * tous deux repondent `200` avec un corps valide. Mesure sur 54 bascules depuis le 2026-08-03 :
 * 30,3 s en mediane, 14,5 a 35,9 s, 54 sur 54.
 *
 * ⚠️ LE CHIFFRE DE « ~4 s » QUI A CIRCULE PENDANT VINGT-QUATRE HEURES EST FAUX D UN FACTEUR SEPT :
 * c etait l ecart entre deux evenements d une seule queue, pas la largeur d une fenetre.
 *
 * POURQUOI AUCUN AUTRE REMEDE N ATTRAPE CELA. Les reprises de `client.ts` couvrent 502/503/504 :
 * elles ne se declenchent JAMAIS ici, parce qu il n y a rien a reprendre. La sonde
 * `attendre-schema.mjs` rend la main a sa premiere passe (~1 s) quand la construction s execute
 * APRES, pendant 2 a 30 s : elle ne REGARDE PAS la ou le fait se produit. Et aucun reglage de
 * delai ne distingue deux versions qui repondent toutes les deux correctement.
 *
 * LA REGLE, ET ELLE N EST PAS NEGOCIABLE :
 *
 *     ZERO empreinte vue vaut « je ne sais pas », et n echoue JAMAIS.
 *     Seules DEUX empreintes DISTINCTES pendant une meme construction font refuser.
 *
 * ⚠️ POURQUOI L ABSENCE NE PEUT PAS ETRE UN ECHEC. Une garde qui rougirait sur une empreinte
 * absente planterait TOUTES les constructions, y compris celles qui n ont aucune course a
 * rattraper : en developpement local `SOURCE_COMMIT` n existe pas, et le CMS ne pose alors
 * AUCUN en-tete. C est le mode d echec documente en tete de `apps/web/nixpacks.toml` — une
 * incapacite transformee en panne
 * ([[garde-en-ferme-dans-un-build-transforme-l-incapacite-en-panne]]). Le remede aurait un pire
 * mode d echec que le defaut.
 *
 * ⚠️ CE QU IL NE FAUT PAS « FINIR » PLUS TARD — comparer l empreinte du CMS a celle du BUILD.
 * Le build IGNORE la sienne : `include_source_commit_in_build` vaut `false` sur les trois
 * applications (releve en base le 2026-08-19) et Coolify efface `.git` avant de construire. Cette
 * comparaison-la est donc IMPOSSIBLE aujourd hui, et c est verifie. Seul un CHANGEMENT pendant la
 * construction est detectable — c est exactement ce qui est detecte ici, et rien d autre.
 *
 * ⚠️ ET SURTOUT PAS UNE EGALITE STRICTE ENTRE LES DEUX APPLICATIONS. `watch_paths` ne reveille le
 * CMS que sur `apps/cms/**` et le site que sur `apps/web/**` : le CMS tourne couramment sur un
 * commit PLUS RECENT que le site, et c est LEGITIME. Ce module ne compare jamais que les reponses
 * d une meme construction ENTRE ELLES.
 *
 * MODE D ECHEC ASSUME, ET IL EST ECRIT : refuser une construction qui n avait rien compose. Un
 * push touchant les DEUX arbres redeploie le CMS pendant que le site construit ; la bascule est
 * alors legitime, et la construction sera refusee quand meme. Le prix est UN REDEPLOIEMENT.
 * L erreur inverse — publier un site COMPOSE de deux versions — est, elle, SILENCIEUSE : c est le
 * mode d echec ou succes et echec rendent la meme sortie
 * ([[quand-succes-et-echec-rendent-la-meme-sortie]]). Sur 199 constructions mesurees en dix-sept
 * jours, TROIS ont chevauche une fenetre, et a peu pres zero une fois la fenetre reduite a sa
 * cause (`health_check_start_period`).
 */

/**
 * L EN-TETE PAR LEQUEL LE CONTENEUR DIT SA VERSION.
 *
 * DOMICILE UNIQUE POUR `apps/web` — `tests/garde-empreintes.test.ts` (cas 6) rougit si une seconde
 * copie de la chaine litterale apparait sous `src/`, `scripts/` ou `integrations/`. La copie de
 * `apps/cms/src/middlewares/empreinte-commit.ts` reste DEHORS et c est assume : c est un autre
 * espace de travail npm, il n y a pas de chemin d import entre les deux.
 */
export const EN_TETE_EMPREINTE = 'X-Echo-Commit';

/**
 * L empreinte servie par une reponse, ou `null` quand il n y en a pas d utilisable.
 *
 * `headers.get` est INSENSIBLE A LA CASSE (RFC 9110) : un proxy peut renormaliser le nom, et un
 * acces direct a une cle en dur rendrait `null` sur un proxy poli — un silence qui se lirait
 * exactement comme « le CMS ne dit pas sa version ».
 *
 * Une valeur VIDE est ramenee a `null`, et ce n est pas de la coquetterie : deux conteneurs qui
 * ignorent leur version rendraient la MEME chaine vide, et toute comparaison les declarerait
 * egaux — un vert fabrique a partir de deux ignorances.
 */
export function lireEmpreinte(
  entetes: { get?: (nom: string) => string | null } | null | undefined,
): string | null {
  const brut = entetes?.get?.(EN_TETE_EMPREINTE);
  if (typeof brut !== 'string') return null;
  const propre = brut.trim();
  return propre === '' ? null : propre;
}

/** Ce qu une construction a vu du CMS. Un etat de PROCESSUS : une construction, un registre. */
export interface RegistreEmpreintes {
  /** Les empreintes DISTINCTES, dans l ordre de premiere apparition. */
  vues: string[];
  /** Toutes les reponses observees, porteuses ou non. */
  reponses: number;
  /** Celles qui portaient une empreinte lisible. */
  porteuses: number;
}

export function creerRegistre(): RegistreEmpreintes {
  return { vues: [], reponses: 0, porteuses: 0 };
}

/**
 * Inscrit ce qu une reponse a dit de sa version.
 *
 * @returns Le motif du REFUS si — et SEULEMENT si — cette reponse fait apparaitre une SECONDE
 *   empreinte distincte. `null` dans tous les autres cas, absence comprise.
 */
export function inscrire(
  registre: RegistreEmpreintes,
  empreinte: string | null,
  chemin: string,
): string | null {
  registre.reponses += 1;
  if (empreinte === null) return null; // « je ne sais pas » — et cela n echoue JAMAIS.

  registre.porteuses += 1;
  if (registre.vues.includes(empreinte)) return null; // la meme version, encore : rien de neuf.

  registre.vues.push(empreinte);
  if (registre.vues.length < 2) return null; // la premiere ne prouve rien a elle seule.

  const [premiere, ...suivantes] = registre.vues;
  return (
    `DEUX VERSIONS DU CMS ONT REPONDU A CETTE CONSTRUCTION — ${premiere}, puis ` +
    `${suivantes.join(', ')} (vue sur ${chemin}, a la reponse n° ${registre.reponses}). ` +
    'Le proxy a bascule PENDANT la lecture du corpus : le site en cours de construction serait ' +
    'COMPOSE de deux versions, et rien ne le dirait une fois publie. La construction est donc ' +
    'REFUSEE. Ce n est pas une panne du CMS : les deux conteneurs repondaient correctement. ' +
    'CE QU IL FAUT FAIRE : relancer le deploiement du site une fois celui de `echo-strapi` ' +
    'termine — la fenetre dure une trentaine de secondes au plus.'
  );
}

/** Ce que le registre permet de dire, une fois la traversee du corpus terminee. */
export interface Verdict {
  sorte: 'muet' | 'unique' | 'rupture';
  message: string;
}

/**
 * LE MOT DE LA FIN, a dire UNE fois.
 *
 * Il n echoue pas : la rupture, elle, a deja arrete la construction a l instant ou elle s est
 * produite. Ce verdict existe pour que « le build a lu UNE version » et « le build n a rien pu
 * savoir » ne rendent pas la MEME observation — un build vert. Sans lui, personne ne saurait,
 * apres coup, si la garde a servi ou si elle etait aveugle
 * ([[quand-succes-et-echec-rendent-la-meme-sortie]]).
 */
export function verdict(registre: RegistreEmpreintes): Verdict {
  if (registre.vues.length === 0) {
    return {
      sorte: 'muet',
      message:
        `empreinte du CMS : ABSENTE sur les ${registre.reponses} reponse(s) lue(s). La version ` +
        'servie pendant cette construction est donc INCONNUE — « je ne sais pas », et non « tout ' +
        'va bien ». La garde de bascule n a rien pu juger. Attendu en developpement local, ou ' +
        '`SOURCE_COMMIT` n existe pas ; EN DEPLOIEMENT, c est le signe que le middleware ' +
        '`global::empreinte-commit` du CMS ne pose plus son en-tete.',
    };
  }

  if (registre.vues.length === 1) {
    return {
      sorte: 'unique',
      message:
        `empreinte du CMS : ${registre.vues[0]}, UNIQUE sur les ${registre.porteuses} reponse(s) ` +
        `porteuses (${registre.reponses} lues). Une seule version a repondu a cette construction.`,
    };
  }

  return {
    sorte: 'rupture',
    message:
      `empreinte du CMS : ${registre.vues.length} versions distinctes — ` +
      `${registre.vues.join(', ')}. La construction aurait du etre refusee.`,
  };
}
