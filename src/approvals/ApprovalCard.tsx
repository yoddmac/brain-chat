'use client';

import { Button } from '../ui/button';
import { Label } from '../ui/label';
import { RadioGroup, RadioGroupItem } from '../ui/radio-group';
import { useLocale } from '../i18n/locale';
import { ToolCallUio } from '@breign/client';
import { GlobeIcon, ShieldAlertIcon, TerminalIcon } from 'lucide-react';
import { useState } from 'react';

export const NETWORK_APPROVAL_TOOL = 'bash_network_approval';
export const COMMAND_APPROVAL_TOOL = 'bash_command_approval';

/**
 * Le nom que portait la carte des commandes quand python était le seul interpréteur. Encore
 * reconnu, jamais émis : une carte déjà ouverte dans une conversation au moment de la bascule doit
 * rester répondable.
 */
export const LEGACY_PYTHON_APPROVAL_TOOL = 'bash_python_approval';

function isCommandApprovalTool(tool: string): boolean {
  return tool === COMMAND_APPROVAL_TOOL || tool === LEGACY_PYTHON_APPROVAL_TOOL;
}

/**
 * Ce que le bac à sable demande la permission de faire : joindre une adresse, ou lancer une commande
 * — python ou js-exec, la ligne affichée dit laquelle. Ce qui est affiché n'est jamais tronqué ni
 * cliquable : une URL tronquée est une URL approuvée sans avoir été lue.
 */
export type ApprovalRequest =
  | {
      family: 'network';
      callId: string;
      /** Le nom d'outil de l'appel, repris tel quel : une carte héritée garde le sien. */
      tool: string;
      /** Adresse complète, telle que le bac à sable l'a résolue. */
      url: string;
      /** Ce qu'un « oui » accorde : origine + premier segment de chemin. */
      urlPrefix: string;
      /** Le domaine entier — la plus large des deux largeurs. */
      origin: string;
      host: string;
      /** Affichage seul : une autorisation ne porte jamais de méthode. */
      method: string;
    }
  | {
      family: 'command';
      callId: string;
      tool: string;
      /** Ligne de commande complète : à la fois ce qui doit être lu et ce qu'un « oui » accorde. */
      command: string;
    };

/**
 * Extrait la demande d'autorisation des appels d'outils qu'un message suspendu attend. Le premier
 * seulement : le tour est déjà arrêté, un second n'aurait aucun tour où revenir. Tout vient de
 * l'enregistrement du serveur, rien n'est recalculé ici.
 */
export function toApprovalRequest(calls: ToolCallUio[]): ApprovalRequest | null {
  const call = calls.find(
    (candidate) =>
      (candidate.tool === NETWORK_APPROVAL_TOOL || isCommandApprovalTool(candidate.tool)) &&
      candidate.status === 'pending',
  );
  if (!call) return null;

  const args = (call.arguments ?? {}) as Record<string, unknown>;

  if (isCommandApprovalTool(call.tool)) {
    const command = typeof args.command === 'string' ? args.command : undefined;
    return command
      ? { family: 'command', callId: call.callId, tool: call.tool, command }
      : null;
  }

  const url = typeof args.url === 'string' ? args.url : undefined;
  const urlPrefix = typeof args.urlPrefix === 'string' ? args.urlPrefix : undefined;
  const origin = typeof args.origin === 'string' ? args.origin : undefined;
  const host = typeof args.host === 'string' ? args.host : undefined;
  if (!url || !urlPrefix || !origin || !host) return null;

  return {
    family: 'network',
    callId: call.callId,
    tool: call.tool,
    url,
    urlPrefix,
    origin,
    host,
    method: typeof args.method === 'string' ? args.method : 'GET',
  };
}

/**
 * Jusqu'où porte un « oui ». `once` = la réponse suspendue seulement, rien n'est enregistré et la
 * demande sera reposée ; `agentUser` = cet agent, pour vous, partout, jusqu'à révocation.
 */
export type ApprovalScope = 'once' | 'agentUser';

export type ApprovalDecision = {
  callId: string;
  approved: boolean;
  scope: ApprovalScope;
  /** N'a de sens que pour la famille network, seule à avoir deux largeurs. */
  width: 'prefix' | 'origin';
};

/**
 * Le nom d'outil sous lequel le serveur enregistre la décision. Repris de l'appel plutôt que déduit
 * de la famille : une carte héritée porte l'ancien nom, et la trace affichée doit dire le vrai.
 */
export function approvalToolOf(request: ApprovalRequest): string {
  return request.tool;
}

/**
 * Ce qu'une décision porte, dit comme le serveur l'enregistre : la commande exacte, ou l'adresse à
 * la largeur choisie. Sur un REFUS, le préfixe demandé et non la largeur cliquée — sinon la ligne
 * affichée juste après le clic changerait au rechargement. Affichage immédiat seulement.
 */
export function approvalResourceOf(request: ApprovalRequest, decision: ApprovalDecision): string {
  if (request.family === 'command') return request.command;
  return decision.approved && decision.width === 'origin' ? request.origin : request.urlPrefix;
}

export function ApprovalCard({
  request,
  onDecide,
}: {
  request: ApprovalRequest;
  onDecide: (decision: ApprovalDecision) => void | Promise<void>;
}) {
  const { t } = useLocale();
  const [width, setWidth] = useState<'prefix' | 'origin'>('prefix');
  const [submitting, setSubmitting] = useState(false);

  // Chemin à un seul segment : le préfixe EST l'origine, proposer deux fois la même chose ferait
  // croire à un choix.
  const widthIsAChoice = request.family === 'network' && request.urlPrefix !== request.origin;

  const granted =
    request.family === 'network'
      ? width === 'origin'
        ? request.origin
        : request.urlPrefix
      : request.command;

  // La portée voyage avec la décision plutôt que d'être un état de la carte : chaque bouton EST une
  // réponse complète. Un refus n'accorde rien, sa portée est ignorée par le serveur.
  const decide = async (approved: boolean, scope: ApprovalScope) => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await onDecide({ callId: request.callId, approved, scope, width });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bc:not-prose bc:my-3 bc:rounded-lg bc:border bc:border-amber-300 bc:bg-amber-50/60 bc:p-3 bc:text-neutral-900">
      <div className="bc:flex bc:items-center bc:gap-2 bc:font-medium">
        <ShieldAlertIcon className="bc:size-4 bc:shrink-0 bc:text-amber-600" />
        <span>
          {request.family === 'network'
            ? t('bubble.networkApproval.title')
            : t('bubble.commandApproval.title')}
        </span>
      </div>

      <p className="bc:mt-2 bc:text-sm bc:text-neutral-700">
        {request.family === 'network'
          ? t('bubble.networkApproval.intro', { method: request.method })
          : t('bubble.commandApproval.intro')}
      </p>

      <div className="bc:mt-2">
        <Label className="bc:text-xs bc:uppercase bc:tracking-wide bc:text-neutral-500">
          {request.family === 'network'
            ? t('bubble.networkApproval.requested')
            : t('bubble.commandApproval.requested')}
        </Label>
        <pre className="bc:mt-1 bc:max-h-48 bc:overflow-auto bc:whitespace-pre-wrap bc:break-all bc:rounded bc:bg-white/80 bc:px-2 bc:py-1 bc:font-mono bc:text-xs">
          {request.family === 'network' ? request.url : request.command}
        </pre>
      </div>

      {widthIsAChoice && request.family === 'network' && (
        <RadioGroup
          className="bc:mt-3 bc:gap-2"
          value={width}
          onValueChange={(value) => setWidth(value as 'prefix' | 'origin')}
        >
          <div className="bc:flex bc:items-center bc:gap-2">
            <RadioGroupItem value="prefix" id={`width-prefix-${request.callId}`} />
            <Label htmlFor={`width-prefix-${request.callId}`} className="bc:cursor-pointer bc:text-sm">
              <span className="bc:font-mono">{request.urlPrefix}</span>
            </Label>
          </div>
          <div className="bc:flex bc:items-center bc:gap-2">
            <RadioGroupItem value="origin" id={`width-origin-${request.callId}`} />
            <Label htmlFor={`width-origin-${request.callId}`} className="bc:cursor-pointer bc:text-sm">
              {t('bubble.networkApproval.wholeDomain', { origin: request.origin })}
            </Label>
          </div>
        </RadioGroup>
      )}

      {/* Accordé : affiché à part, car plus large que la demande ci-dessus. */}
      <div className="bc:mt-3 bc:flex bc:items-start bc:gap-2 bc:rounded bc:bg-white/80 bc:px-2 bc:py-2">
        {request.family === 'network' ? (
          <GlobeIcon className="bc:mt-0.5 bc:size-4 bc:shrink-0 bc:text-neutral-500" />
        ) : (
          <TerminalIcon className="bc:mt-0.5 bc:size-4 bc:shrink-0 bc:text-neutral-500" />
        )}
        <div className="bc:min-w-0">
          <p className="bc:text-xs bc:font-medium bc:text-neutral-600">
            {request.family === 'network'
              ? t('bubble.networkApproval.granted')
              : t('bubble.commandApproval.granted')}
          </p>
          <p className="bc:break-all bc:font-mono bc:text-xs">{granted}</p>
          <p className="bc:mt-1 bc:text-xs bc:text-neutral-600">
            {request.family === 'network'
              ? t('bubble.networkApproval.prefixWarning')
              : t('bubble.commandApproval.exactWarning')}
          </p>
        </div>
      </div>

      {/* La différence entre les deux « oui » ne se devine pas de leur seul libellé. */}
      <p className="bc:mt-3 bc:text-xs bc:text-neutral-600">{t('bubble.approval.scopeExplainer')}</p>

      {/* Un clic = une décision, la portée la plus étroite en premier pour qu'un clic pressé
          accorde le moins. Le refus porte `once` par cohérence de type seulement. */}
      <div className="bc:mt-3 bc:flex bc:flex-wrap bc:items-center bc:gap-2">
        <Button size="sm" disabled={submitting} onClick={() => void decide(true, 'once')}>
          {t('bubble.approval.allowOnce')}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={submitting}
          onClick={() => void decide(true, 'agentUser')}
        >
          {t('bubble.approval.allowAlways')}
        </Button>
        <Button
          size="sm"
          variant="tertiary"
          disabled={submitting}
          onClick={() => void decide(false, 'once')}
        >
          {t('bubble.approval.refuse')}
        </Button>
      </div>

      <p className="bc:mt-2 bc:text-xs bc:text-neutral-500">{t('bubble.approval.revokeHint')}</p>
    </div>
  );
}
