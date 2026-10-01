import { ChatApiError } from '../client';
import type { Translate } from '../i18n/locale';

export function describeChatError(error: unknown, t: Translate, fallbackKey: string): string {
  if (error instanceof ChatApiError) {
    if (error.code === 'API') return t('chat.errors.api', { message: error.detail ?? '' });
    return t(`chat.errors.${error.code}`);
  }
  if (error instanceof Error && error.message) return error.message;
  return t(fallbackKey);
}
