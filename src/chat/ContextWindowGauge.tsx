'use client';

import { useLocale } from '../i18n/locale';
import type { TranslationFunction } from '../i18n/locale';
import type { ConversationContextUsageUio } from '@breign/client';

/**
 * Part de la fenêtre de contexte occupée par la conversation, en camembert.
 *
 * Rien n'est rendu tant qu'aucun tour n'a été mesuré : une jauge à 0 % se lirait « fenêtre vide »
 * là où la vérité est « occupation inconnue ».
 */

const SIZE = 20;
const CENTER = SIZE / 2;
const RADIUS = CENTER - 1;

/** Au-delà, les tours suivants vont commencer à tronquer l'historique. */
const WARN_RATIO = 0.75;
const CRITICAL_RATIO = 0.9;

const COLORS = {
  normal: '#004AEB',
  warn: '#D97706',
  critical: '#DC2626',
} as const;

function ratioColor(ratio: number): string {
  if (ratio >= CRITICAL_RATIO) return COLORS.critical;
  if (ratio >= WARN_RATIO) return COLORS.warn;
  return COLORS.normal;
}

/** Secteur circulaire partant de midi, dans le sens des aiguilles. */
function sectorPath(ratio: number): string {
  if (ratio <= 0) return '';
  // Un secteur complet ne se décrit pas avec un seul arc : ses deux extrémités se confondent.
  if (ratio >= 1) {
    return `M ${CENTER} ${CENTER - RADIUS} A ${RADIUS} ${RADIUS} 0 1 1 ${CENTER - 0.01} ${
      CENTER - RADIUS
    } Z`;
  }

  const angle = ratio * 2 * Math.PI;
  const x = CENTER + RADIUS * Math.sin(angle);
  const y = CENTER - RADIUS * Math.cos(angle);

  return `M ${CENTER} ${CENTER} L ${CENTER} ${CENTER - RADIUS} A ${RADIUS} ${RADIUS} 0 ${
    ratio > 0.5 ? 1 : 0
  } 1 ${x} ${y} Z`;
}

function formatTokens(value: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    notation: value >= 10_000 ? 'compact' : 'standard',
    maximumFractionDigits: value >= 10_000 ? 1 : 0,
  }).format(value);
}

/**
 * Le dénominateur n'est pas toujours mesuré : le taire rendrait le pourcentage plus sûr qu'il ne
 * l'est. `declared` est la seule origine sans nuance.
 */
function windowCaveat(
  confidence: ConversationContextUsageUio['contextWindowConfidence'],
  t: TranslationFunction,
): string | null {
  if (confidence === 'fallback') return t('chat.conversation.context.approximate');
  if (confidence === 'catalog') return t('chat.conversation.context.catalogued');
  return null;
}

export function ContextWindowGauge({ usage }: { usage: ConversationContextUsageUio | null }) {
  const { t, locale } = useLocale();

  if (!usage) return null;

  const ratio =
    usage.contextWindow > 0 ? Math.min(Math.max(usage.usedTokens / usage.contextWindow, 0), 1) : 0;
  const percent = new Intl.NumberFormat(locale, {
    style: 'percent',
    maximumFractionDigits: ratio > 0 && ratio < 0.01 ? 1 : 0,
  }).format(ratio);

  const detail = t('chat.conversation.context.detail', {
    used: formatTokens(usage.usedTokens, locale),
    window: formatTokens(usage.contextWindow, locale),
    percent,
  });
  const caveat = windowCaveat(usage.contextWindowConfidence, t);

  return (
    <div className="bc:group bc:relative bc:shrink-0">
      <div
        role="img"
        tabIndex={0}
        aria-label={`${t('chat.conversation.context.title')} — ${percent}`}
        className="bc:flex bc:items-center bc:gap-1.5 bc:rounded-lg bc:border bc:border-[#E5E5E5] bc:bg-white bc:px-2 bc:py-[7px] bc:outline-none bc:focus-visible:ring-2 bc:focus-visible:ring-[#004AEB]/40"
      >
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden="true">
          <circle cx={CENTER} cy={CENTER} r={RADIUS} fill="#ECEEFF" />
          {ratio > 0 ? <path d={sectorPath(ratio)} fill={ratioColor(ratio)} /> : null}
        </svg>
        <span className="bc:text-[12.5px] bc:tabular-nums bc:text-[#404040]">{percent}</span>
      </div>
      <div
        role="tooltip"
        className="bc:invisible bc:absolute bc:top-full bc:right-0 bc:z-30 bc:w-64 bc:pt-2 bc:group-hover:visible bc:group-focus-within:visible"
      >
        <div className="bc:rounded-lg bc:border bc:border-[#E5E5E5] bc:bg-white bc:px-3 bc:py-2.5 bc:text-left bc:shadow-[0_8px_24px_rgba(0,0,0,.12)]">
          <p className="bc:text-[13px] bc:font-semibold bc:text-[#171717]">
            {t('chat.conversation.context.title')}
          </p>
          <p className="bc:mt-1 bc:text-[12px] bc:leading-snug bc:text-[#525252]">{detail}</p>
          {usage.modelName ? (
            <p className="bc:mt-1 bc:text-[11.5px] bc:text-[#8A8FA8]">
              {t('chat.conversation.context.model', { model: usage.modelName })}
            </p>
          ) : null}
          {caveat ? <p className="bc:mt-1 bc:text-[11.5px] bc:text-[#8A8FA8]">{caveat}</p> : null}
        </div>
      </div>
    </div>
  );
}
