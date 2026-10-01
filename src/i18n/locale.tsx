import { createContext, useContext, useMemo, type ReactNode } from 'react';
import en from './en.json';
import fr from './fr.json';

export type ChatLocale = 'fr' | 'en';

type Vars = Record<string, string | number>;

const catalogs: Record<ChatLocale, unknown> = { fr, en };

function lookup(catalog: unknown, key: string): string | undefined {
  const value = key.split('.').reduce<unknown>((current, part) => {
    if (current && typeof current === 'object' && part in current) {
      return (current as Record<string, unknown>)[part];
    }
    return undefined;
  }, catalog);
  return typeof value === 'string' ? value : undefined;
}

export type Translate = (key: string, vars?: Vars) => string;
export type TranslationFunction = Translate;

export function createTranslator(locale: ChatLocale, labels?: Record<string, string>): Translate {
  const catalog = catalogs[locale] ?? catalogs.fr;
  return (key, vars) => {
    const template = labels?.[key] ?? lookup(catalog, key) ?? key;
    if (!vars) return template;
    return template.replace(/\{\{(\w+)\}\}/g, (_, name: string) => String(vars[name] ?? ''));
  };
}

type I18nValue = { t: Translate; locale: ChatLocale };

const I18nContext = createContext<I18nValue>({
  t: (key) => key,
  locale: 'fr',
});

export function I18nProvider({
  locale,
  labels,
  children,
}: {
  locale: ChatLocale;
  labels?: Record<string, string>;
  children: ReactNode;
}) {
  const value = useMemo<I18nValue>(
    () => ({ locale, t: createTranslator(locale, labels) }),
    [locale, labels],
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useLocale(): I18nValue {
  return useContext(I18nContext);
}
