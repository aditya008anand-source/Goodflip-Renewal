import { LeadStatus } from '@/lib/types';

// Maps the messy free-text "Final Status" column from the November source
// sheet onto the portal's clean LeadStatus enum. Agreed approach: map
// anything with a clear, unambiguous match; everything else defaults to
// "New" rather than being guessed at (see import script for how unmatched
// values are still preserved as a review_note so nothing is silently lost).
const NORMALIZED_MAP: Record<string, LeadStatus> = {
  'not connected': 'Not Reachable',
  'not interested': 'Not Interested',
  'not intrested': 'Not Interested',
  interested: 'Interested',
  'payment received': 'Renewed',
  renewed: 'Renewed',
  'plan on hold': 'Follow-up Required',
  connected: 'Connected',
  'follow-up required': 'Follow-up Required',
  'follow up required': 'Follow-up Required',
  'not contacted': 'Not Contacted',
  rnr: 'Not Reachable', // Ring No Response
  lost: 'Lost',
};

export function mapFinalStatusToLeadStatus(rawValue: string): {
  status: LeadStatus;
  matched: boolean;
} {
  const cleaned = rawValue.trim().toLowerCase();

  if (!cleaned) {
    return { status: 'New', matched: true }; // blank is an expected, not ambiguous, case
  }

  // Exact normalized match.
  if (NORMALIZED_MAP[cleaned]) {
    return { status: NORMALIZED_MAP[cleaned], matched: true };
  }

  // Loose contains-match for near variants (e.g. "not intrested in renewal as pt wants...").
  for (const [key, status] of Object.entries(NORMALIZED_MAP)) {
    if (cleaned.includes(key)) {
      return { status, matched: true };
    }
  }

  // No confident match (e.g. "shared details", a stray date like "7-Nov").
  // Default to New per the agreed rule, but the caller should record the
  // original raw text in review_note so it's not lost.
  return { status: 'New', matched: false };
}
