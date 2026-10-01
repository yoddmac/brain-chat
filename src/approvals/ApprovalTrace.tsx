'use client';

import { NETWORK_APPROVAL_TOOL, type ApprovalScope } from './ApprovalCard';
import { useLocale } from '../i18n/locale';
import { ConversationMessageApprovalUio } from '@breign/client';
import { CheckIcon, GlobeIcon, TerminalIcon, XIcon } from 'lucide-react';

function formatWhen(at: string, locale: string): string {
  return new Date(at).toLocaleString(locale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Les décisions d'autorisation prises pendant un message : quel outil, sur quoi, par qui, quand.
 *
 * Elles viennent de l'HISTORIQUE de la conversation (`ConversationMessage.approvals`) et non d'une
 * requête à part. Sans elles la carte disparaissait sans rien laisser, et pour un accord ponctuel,
 * qui n'écrit aucune autorisation permanente, c'est la seule trace qui existe.
 */
export function ApprovalTrace({
  approvals,
  locale,
}: {
  approvals: ConversationMessageApprovalUio[];
  locale: string;
}) {
  const { t } = useLocale();
  if (approvals.length === 0) return null;

  return (
    <div className="bc:not-prose bc:my-2 bc:rounded-lg bc:border bc:border-neutral-200 bc:bg-neutral-50/70 bc:p-2.5">
      <p className="bc:text-[11px] bc:font-medium bc:uppercase bc:tracking-wide bc:text-neutral-500">
        {t('bubble.approvalTrace.title')}
      </p>

      <ul className="bc:mt-1.5 bc:flex bc:flex-col bc:gap-1.5">
        {approvals.map((approval, index) => (
          // Le couple outil + ressource peut se répéter dans un message : d'où l'indice.
          <li
            key={`${approval.tool}-${approval.resource}-${index}`}
            className="bc:flex bc:items-start bc:gap-2"
          >
            {approval.granted ? (
              <CheckIcon className="bc:mt-0.5 bc:size-3.5 bc:shrink-0 bc:text-emerald-600" />
            ) : (
              <XIcon className="bc:mt-0.5 bc:size-3.5 bc:shrink-0 bc:text-neutral-400" />
            )}

            <div className="bc:min-w-0">
              <p className="bc:flex bc:flex-wrap bc:items-center bc:gap-1.5 bc:text-xs bc:text-neutral-700">
                <span className="bc:font-medium">
                  {approval.granted
                    ? t('bubble.approvalTrace.granted')
                    : t('bubble.approvalTrace.refused')}
                </span>
                {approval.tool === NETWORK_APPROVAL_TOOL ? (
                  <GlobeIcon className="bc:size-3 bc:shrink-0 bc:text-neutral-400" />
                ) : (
                  <TerminalIcon className="bc:size-3 bc:shrink-0 bc:text-neutral-400" />
                )}
                {/* Ce qui a été accordé est ce qui compte : jamais tronqué, jamais cliquable. */}
                <span className="bc:break-all bc:font-mono bc:text-[11px]">{approval.resource}</span>
              </p>

              <p className="bc:text-[11px] bc:text-neutral-500">
                {[
                  approval.approvedBy,
                  formatWhen(approval.at, locale),
                  // La portée n'est écrite que sur un accord : un refus n'en a pas.
                  approval.scope === 'once'
                    ? t('bubble.approvalTrace.scopeOnce')
                    : approval.scope === 'agentUser'
                      ? t('bubble.approvalTrace.scopeAgent')
                      : undefined,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * La ligne à afficher immédiatement après un clic : le serveur écrit la sienne dans la foulée, elle
 * évite juste de laisser la bulle vide entre le clic et le rechargement.
 */
export function optimisticApproval(input: {
  tool: string;
  granted: boolean;
  resource: string;
  /** La portée telle que la carte l'a envoyée : une seule définition pour les deux. */
  scope?: ApprovalScope;
  approvedBy?: string;
}): ConversationMessageApprovalUio {
  return {
    tool: input.tool,
    granted: input.granted,
    resource: input.resource,
    ...(input.granted && input.scope ? { scope: input.scope } : {}),
    ...(input.approvedBy ? { approvedBy: input.approvedBy } : {}),
    at: new Date().toISOString(),
  };
}
