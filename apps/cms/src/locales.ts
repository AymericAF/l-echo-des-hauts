/**
 * Les locales du projet, posees au demarrage.
 *
 * Pourquoi en code plutot qu'a la main dans l'admin : une instance Strapi
 * fraichement installee n'a **qu'une** locale, `en`, et elle est **par defaut**
 * (constate le 2026-08-07 sur `@strapi/i18n@5.51.1` — `initDefaultLocale` cree
 * `DEFAULT_LOCALE` quand la table est vide). Tout le modele de ce projet suppose
 * l'inverse : le francais est la locale de reference, l'anglais est le miroir
 * (`docs/modele-donnees.md`, A-06).
 *
 * La creation d'une locale n'est PAS exposee sur l'API de contenu — les routes
 * `POST /i18n/locales` du plugin sont `type: 'admin'`. Le seed, qui travaille
 * avec un jeton d'API, ne peut donc pas s'en charger : sans ce bootstrap, le
 * critere « un Strapi fraichement installe se repeuple par la seule commande
 * documentee au README » serait faux.
 */

export type Locale = { code: string; name: string };

export const LOCALE_PAR_DEFAUT: Locale = { code: 'fr', name: 'Francais (fr)' };
export const LOCALE_MIROIR: Locale = { code: 'en', name: 'English (en)' };
export const LOCALES_ATTENDUES: Locale[] = [LOCALE_PAR_DEFAUT, LOCALE_MIROIR];

/** La part du service i18n dont on depend — reduite a ce qu'on appelle. */
export type ServiceLocales = {
  findByCode(code: string): Promise<{ name?: string } | null | undefined>;
  create(locale: Locale): Promise<unknown>;
  getDefaultLocale(): Promise<string | null | undefined>;
  setDefaultLocale(arg: { code: string }): Promise<unknown>;
};

/** Ce qu'on a TROUVE pour une locale attendue, avant d'agir. */
export type ConstatLocale = {
  code: string;
  /** `true` si ce bootstrap-ci l'a creee ; `false` si elle etait deja la. */
  creee: boolean;
  /** Le nom PORTE PAR L'INSTANCE, `null` quand le service n'en rend pas. */
  nomTrouve: string | null;
  /** Le nom que ce depot declare pour elle. */
  nomDeclare: string;
};

export type RapportLocales = {
  constats: ConstatLocale[];
  creees: string[];
  defautAvant: string | null;
  defautApres: string;
  defautPose: boolean;
};

/**
 * Idempotent : cree ce qui manque, ne touche a rien d'autre.
 * Rendre le rapport plutot que de journaliser ici garde la fonction testable
 * sans instance Strapi.
 *
 * LE RAPPORT DIT CE QUI A ETE TROUVE, PAS SEULEMENT CE QUI A ETE ECRIT
 * (2026-08-12, tache f30fc73e). Il ne portait que `creees` et `defautPose` :
 * sur une instance deja conforme, les deux sont vides, et `index.ts` n'ecrivait
 * alors AUCUNE ligne. Un bootstrap qui a tourne sans rien avoir a faire et un
 * bootstrap qui n'a jamais tourne rendaient donc la MEME sortie — zero ligne —
 * ce qui rendait l'exercice du maillon INVERIFIABLE sur l'instance en service.
 * Mesure du 2026-08-12 sur le conteneur `echo-strapi` de Coolify (image
 * `3c430ab`, demarre le 2026-08-10 21:25:56 UTC) : `docker logs | grep 'locales]'`
 * = 0 occurrence, sur 4717 lignes et un unique « Strapi started successfully ».
 * Le code ETAIT pourtant deploye (`/opt/app/dist/src/locales.js` present).
 * Cf. `[[quand-succes-et-echec-rendent-la-meme-sortie]]`.
 */
export async function assurerLocales(service: ServiceLocales): Promise<RapportLocales> {
  const constats: ConstatLocale[] = [];

  for (const locale of LOCALES_ATTENDUES) {
    const existante = await service.findByCode(locale.code);
    if (!existante) {
      await service.create(locale);
      constats.push({
        code: locale.code,
        creee: true,
        nomTrouve: locale.name,
        nomDeclare: locale.name,
      });
      continue;
    }
    constats.push({
      code: locale.code,
      creee: false,
      nomTrouve: typeof existante.name === 'string' ? existante.name : null,
      nomDeclare: locale.name,
    });
  }

  const defautAvant = (await service.getDefaultLocale()) ?? null;
  const defautPose = defautAvant !== LOCALE_PAR_DEFAUT.code;
  if (defautPose) {
    await service.setDefaultLocale({ code: LOCALE_PAR_DEFAUT.code });
  }

  return {
    constats,
    creees: constats.filter((constat) => constat.creee).map((constat) => constat.code),
    defautAvant,
    defautApres: LOCALE_PAR_DEFAUT.code,
    defautPose,
  };
}

/**
 * LA LIGNE DE JOURNAL — TOUJOURS UNE, MEME QUAND IL N'Y A RIEN A FAIRE.
 *
 * C'est la seule trace par laquelle on peut CONSTATER, apres un deploiement, que
 * le bootstrap a bien tourne sur l'instance distante. Elle nomme donc l'etat
 * TROUVE, jamais le seul geste accompli : un journal qui ne parle que de ses
 * ecritures se tait exactement quand il n'a rien ecrit, c'est-a-dire dans le cas
 * ou l'on doute qu'il ait tourne.
 *
 * ELLE SIGNALE AUSSI UN NOM DIVERGENT, SANS LE CORRIGER. La locale `fr` de
 * `echoback.ayfiweb.fr` s'appelle « French (fr) » — le libelle du selecteur ISO
 * de l'admin — la ou ce depot declare « Francais (fr) ». C'est la SIGNATURE
 * d'une locale posee A LA MAIN, et c'est ainsi qu'on a su que le maillon
 * `bootstrap -> fr` n'avait jamais ete exerce ici (creee le 2026-08-06 22:06 UTC,
 * quand `src/locales.ts` n'existe que depuis le commit `c2474e2` du 2026-08-07).
 * Le bootstrap ne RENOMME PAS : renommer serait une ecriture non demandee sur une
 * instance en service, et l'ecart est sans consequence fonctionnelle — le code
 * seul compte. Il le DIT, ce qui suffit a ne plus l'apprendre par hasard.
 */
export function journalLocales(rapport: RapportLocales): string[] {
  const parLocale = rapport.constats.map((constat) => {
    if (constat.creee) return `${constat.code} CREEE`;
    if (constat.nomTrouve !== null && constat.nomTrouve !== constat.nomDeclare) {
      return `${constat.code} deja presente (nom sur l'instance « ${constat.nomTrouve} » != « ${constat.nomDeclare} » declare ici — locale posee a la main, non renommee)`;
    }
    return `${constat.code} deja presente`;
  });

  const defaut = rapport.defautPose
    ? `locale par defaut POSEE sur « ${rapport.defautApres} » (elle etait « ${rapport.defautAvant ?? 'aucune'} »)`
    : `locale par defaut deja « ${rapport.defautApres} », inchangee`;

  return [
    `[locales] bootstrap exerce — ${parLocale.join(' ; ')} ; ${defaut}`,
  ];
}

/** La part de Strapi dont le bootstrap depend — reduite a ce qu'il appelle. */
export type StrapiDuBootstrap = {
  plugin(nom: string): { service(nom: string): ServiceLocales };
  log: { info(message: string): void };
};

/**
 * LE BOOTSTRAP COMPLET : assurer, PUIS journaliser — inconditionnellement.
 *
 * IL VIT ICI ET PAS DANS `src/index.ts`, POUR UNE RAISON MECANIQUE. Strapi
 * importe `./locales` sans extension ; le lanceur de tests de Node ne resout pas
 * cet import, si bien que RIEN dans `index.ts` n'est atteignable par un test.
 * C'est precisement la ou le defaut du 2026-08-12 s'etait loge : deux `if`
 * autour du journal, dans le seul fichier que personne ne pouvait exercer.
 * Deplacer le corps ici le met sous garde ; `index.ts` n'est plus qu'un appel.
 */
export async function poserLocales(strapi: StrapiDuBootstrap): Promise<RapportLocales> {
  const rapport = await assurerLocales(strapi.plugin('i18n').service('locales'));

  /* AUCUNE CONDITION. Une ligne toujours, meme quand rien n'a change : c'est la
     seule trace par laquelle le passage du maillon se constate apres un
     deploiement. En remettre une reouvre le defaut. */
  for (const ligne of journalLocales(rapport)) strapi.log.info(ligne);

  return rapport;
}
