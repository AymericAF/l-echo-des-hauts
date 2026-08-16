/**
 * LES REGLAGES DE LA MEDIATHEQUE, POSES AU DEMARRAGE.
 *
 * POURQUOI CE MODULE EXISTE (2026-08-16, tache `e1f8115c`). Strapi RECOMPRESSE les
 * images matricielles a l'upload et leur genere quatre formats derives. Les octets
 * servis ne sont donc jamais ceux du depot — mesure sur `echoback.ayfiweb.fr` :
 * `partage-defaut.png` pese 21 660 octets ici et 6 835 la-bas ; `A01-col-des-trois-vents.png`,
 * 40 701 contre 13 751. Le seed, qui detecte un fichier modifie en comparant ses octets,
 * ne pouvait donc pas juger ces deux-la : il les exemptait, et un redessin y aurait dormi
 * avec tous les signaux au vert. Or ce sont les CARTES DE PARTAGE, exactement les fichiers
 * qu'on retouche quand un chiffre change.
 *
 * ── OU VIVENT CES REGLAGES, ET POURQUOI PAS DANS `config/plugins.ts` ───────────────────
 *
 * La tache proposait de « desactiver l'optimisation cote plugin upload (`config/plugins.ts`) ».
 * CE N'EST PAS LA QU'ILS VIVENT, et l'y ecrire n'aurait produit AUCUN effet, en silence.
 * `sizeOptimization`, `responsiveDimensions` et `autoOrientation` sont des reglages
 * d'ADMINISTRATION : le bootstrap du plugin (`@strapi/upload@5.51.1`,
 * `dist/server/bootstrap.js`) les pose dans le STORE DE PLUGIN — donc en base — et
 * `image-manipulation.js` les relit par `getService('upload').getSettings()`.
 *
 * ── POURQUOI LES DEUX DRAPEAUX, ET PAS UN SEUL ────────────────────────────────────────
 *
 * Ils repondent a deux questions differentes, et il faut les deux :
 *
 *  - `sizeOptimization: false` empeche le RE-ENCODAGE. Attention au piege : ce drapeau ne
 *    fait pas que baisser la qualite. `image-manipulation.js` ligne 121 lit
 *    `if ((sizeOptimization || autoOrientation) && isOptimizableFormat(format))` — quand
 *    les DEUX sont faux, la branche entiere est sautee et le fichier n'est jamais passe
 *    dans sharp. Laisser `autoOrientation` a `true` suffirait donc a ré-encoder quand meme,
 *    a `quality: 100`, ce qui ne rend PAS les octets d'origine. On pose donc les deux.
 *  - `responsiveDimensions: false` supprime les formats derives (ligne 177 :
 *    `if (!responsiveDimensions) return []`). Sans lui, chaque seed regenererait quatre
 *    fichiers pour rien.
 *
 * ── CE QUE CA COUTE, MESURE PLUTOT QUE SUPPOSE ────────────────────────────────────────
 *
 * Le corpus ne contient que DEUX images matricielles ; les 121 autres medias sont des SVG,
 * que Strapi sert intacts et qui ne passent par aucune de ces branches. Le surcout total
 * est donc de 41 775 octets, et il porte sur des fichiers qu'AUCUN lecteur ne telecharge :
 * les cartes de partage ne sortent qu'en `<meta og:image>` / `twitter:image`
 * (`src/lib/seo/metadonnees.ts`), jamais dans une balise `<img>`. La porte P2, qui mesure
 * le poids des ressources CHARGEES par la page, n'en voit rien.
 *
 * Ce raisonnement tient tant que le corpus n'a pas d'image matricielle SERVIE DANS UNE
 * PAGE. Ce n'est pas une convention : `tests/reglages-medias.test.ts` le garde.
 */

/** La part du store de plugin dont on depend — reduite a ce qu'on appelle. */
export type StorePlugin = {
  get(arg: Record<string, unknown>): Promise<Record<string, unknown> | null | undefined>;
  set(arg: { value: Record<string, unknown> }): Promise<unknown>;
};

/**
 * Ce que ce depot exige de la mediatheque, et rien de plus.
 *
 * Les autres cles du store (`aiMetadata`, `videoPreview`…) ne sont PAS touchees : elles
 * ne concernent pas la comparaison d'octets, et les ecraser serait une ecriture non
 * demandee sur une instance en service.
 */
export const REGLAGES_EXIGES = {
  sizeOptimization: false,
  responsiveDimensions: false,
  autoOrientation: false,
} as const;

export type ConstatReglage = {
  cle: string;
  /** La valeur TROUVEE sur l'instance, `null` quand la cle est absente. */
  trouvee: boolean | null;
  exigee: boolean;
  /** `true` si ce bootstrap-ci l'a corrigee. */
  posee: boolean;
};

export type RapportReglages = {
  constats: ConstatReglage[];
  posees: string[];
  /** `true` si le store n'avait aucun reglage — instance fraiche. */
  storeVide: boolean;
};

/**
 * Idempotent : ne reecrit que ce qui diverge, laisse le reste intact.
 *
 * Rendre le rapport plutot que de journaliser ici garde la fonction testable sans instance
 * Strapi — meme raison que `assurerLocales`, et meme piege evite : le rapport dit ce qui a
 * ete TROUVE, pas seulement ce qui a ete ecrit.
 */
export async function assurerReglagesMedias(store: StorePlugin): Promise<RapportReglages> {
  const actuels = (await store.get({})) ?? null;
  const constats: ConstatReglage[] = [];

  for (const [cle, exigee] of Object.entries(REGLAGES_EXIGES)) {
    const brut = actuels?.[cle];
    const trouvee = typeof brut === 'boolean' ? brut : null;
    constats.push({ cle, trouvee, exigee, posee: trouvee !== exigee });
  }

  const posees = constats.filter((constat) => constat.posee);
  if (posees.length > 0) {
    await store.set({ value: { ...(actuels ?? {}), ...REGLAGES_EXIGES } });
  }

  return {
    constats,
    posees: posees.map((constat) => constat.cle),
    storeVide: actuels === null || Object.keys(actuels).length === 0,
  };
}

/**
 * LA LIGNE DE JOURNAL — TOUJOURS UNE, MEME QUAND IL N'Y A RIEN A FAIRE.
 *
 * Meme exigence que pour les locales, et pour la meme raison : c'est la seule trace par
 * laquelle on peut CONSTATER, apres un deploiement, que ce bootstrap a tourne sur
 * l'instance distante. Un journal qui ne parle que de ses ecritures se tait exactement
 * quand on doute qu'il ait tourne. Cf. `[[quand-succes-et-echec-rendent-la-meme-sortie]]`.
 */
export function journalReglagesMedias(rapport: RapportReglages): string[] {
  const parCle = rapport.constats.map((constat) => {
    if (constat.trouvee === null) return `${constat.cle} ABSENTE -> ${constat.exigee}`;
    if (constat.posee) return `${constat.cle} POSEE a ${constat.exigee} (elle etait ${constat.trouvee})`;
    return `${constat.cle} deja ${constat.exigee}`;
  });

  return [
    `[medias] bootstrap exerce — ${parCle.join(' ; ')}${rapport.storeVide ? ' ; store VIDE au demarrage (instance fraiche)' : ''}`,
  ];
}

/** La part de Strapi dont ce bootstrap depend — reduite a ce qu'il appelle. */
export type StrapiDuBootstrapMedias = {
  store(arg: { type: string; name: string; key: string }): StorePlugin;
  log: { info(message: string): void };
};

/**
 * LE BOOTSTRAP COMPLET : assurer, PUIS journaliser — inconditionnellement.
 *
 * IL VIT ICI ET PAS DANS `src/index.ts`, pour la meme raison mecanique que
 * `poserLocales` : Strapi importe ce module sans extension, ce que le lanceur de tests de
 * Node ne resout pas. Rien de ce qui vit dans `index.ts` n'est atteignable par un test —
 * le fichier le dit lui-meme, et il a deja abrite un defaut pour cette raison exacte.
 *
 * L'ORDRE COMPTE, ET IL EST DANS NOTRE SENS : le bootstrap du plugin `upload` tourne AVANT
 * celui de l'application, et il ne pose ses defauts que si les cles manquent
 * (`configurator.get({})` puis `continue`). Notre ecriture passe donc apres la sienne et
 * la corrige, sans qu'il la reecrase au demarrage suivant.
 */
export async function poserReglagesMedias(
  strapi: StrapiDuBootstrapMedias,
): Promise<RapportReglages> {
  const rapport = await assurerReglagesMedias(
    strapi.store({ type: 'plugin', name: 'upload', key: 'settings' }),
  );

  /* AUCUNE CONDITION — meme regle que pour les locales : une ligne toujours, sans quoi
     « a tourne sans rien changer » et « n'a jamais tourne » rendent la meme sortie. */
  for (const ligne of journalReglagesMedias(rapport)) strapi.log.info(ligne);

  return rapport;
}
