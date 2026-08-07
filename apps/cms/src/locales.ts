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
  findByCode(code: string): Promise<unknown>;
  create(locale: Locale): Promise<unknown>;
  getDefaultLocale(): Promise<string | null | undefined>;
  setDefaultLocale(arg: { code: string }): Promise<unknown>;
};

export type RapportLocales = { creees: string[]; defautPose: boolean };

/**
 * Idempotent : cree ce qui manque, ne touche a rien d'autre.
 * Rendre le rapport plutot que de journaliser ici garde la fonction testable
 * sans instance Strapi.
 */
export async function assurerLocales(service: ServiceLocales): Promise<RapportLocales> {
  const creees: string[] = [];

  for (const locale of LOCALES_ATTENDUES) {
    const existante = await service.findByCode(locale.code);
    if (!existante) {
      await service.create(locale);
      creees.push(locale.code);
    }
  }

  const defautActuel = await service.getDefaultLocale();
  const defautPose = defautActuel !== LOCALE_PAR_DEFAUT.code;
  if (defautPose) {
    await service.setDefaultLocale({ code: LOCALE_PAR_DEFAUT.code });
  }

  return { creees, defautPose };
}
