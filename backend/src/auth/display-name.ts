import { badRequest, unavailable } from '../common/errors.js';
import type { ModerationService } from '../moderation/moderation.service.js';
import { ModerationUnavailableError } from '../moderation/moderation.types.js';
export async function assertDisplayNameAllowed(moderation: ModerationService, displayName: string): Promise<void> {
  let verdict: 'allow' | 'block';
  try {
    verdict = await moderation.checkDisplayName(displayName);
  } catch (err) {
    if (err instanceof ModerationUnavailableError) {
      throw unavailable('MODERATION_UNAVAILABLE', "We couldn't check that name right now. Please try again.");
    }
    throw err;
  }
  if (verdict === 'block') throw badRequest('DISPLAY_NAME_REJECTED', 'Please choose a different display name.');
}
