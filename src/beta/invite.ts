// The message an admin sends to invite someone to the beta.

export function inviteText(url: string): string {
  return [
    'You’re invited to try Hour Keeper (beta) — for logging our hours against each job.',
    '',
    `1. On your phone, open ${url}`,
    '2. Tap “Request an account” and sign up with your work email.',
    '3. Add it to your home screen so it opens like an app and works with no signal:',
    '   • iPhone (Safari): Share → Add to Home Screen',
    '   • Android (Chrome): ⋮ menu → Add to Home screen',
    '',
    'I’ll approve your account and add you to the job. Use More → Send feedback to tell us what works and what doesn’t.',
  ].join('\n');
}
