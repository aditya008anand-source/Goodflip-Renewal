// Hand-written types mirroring supabase/schema.sql. If you prefer generated
// types, run: npx supabase gen types typescript --project-id <id> > src/lib/types.ts
// (and then re-export the pieces below from the generated file instead).

export type UserRole = 'admin' | 'coach';

export type LeadStatus =
  | 'New'
  | 'Not Contacted'
  | 'Connected'
  | 'Interested'
  | 'Follow-up Required'
  | 'Payment Pending'
  | 'Renewed'
  | 'Not Interested'
  | 'Not Reachable'
  | 'Lost';

export const LEAD_STATUSES: LeadStatus[] = [
  'New',
  'Not Contacted',
  'Connected',
  'Interested',
  'Follow-up Required',
  'Payment Pending',
  'Renewed',
  'Not Interested',
  'Not Reachable',
  'Lost',
];

export type Priority = 'High' | 'Medium' | 'Low';

export type PaymentStatus = 'Pending' | 'Paid';

export interface Coach {
  id: string;
  user_id: string;
  display_name: string;
  active: boolean;
  created_at: string;
}

export interface Lead {
  id: string;
  patient_name: string;
  mobile_number: string;
  coach_id: string | null;
  programme: string | null;
  condition: string | null;
  clinical_discipline: string | null; // "Coaches" column from source sheet
  team: string | null; // "Team" column from source sheet
  source_coach_name: string | null; // "Renewal Coach" name from sheet, pending account match
  month_cohort: string; // e.g. '2026-11'
  plan_start_date: string | null;
  plan_expiry_date: string | null;
  priority: Priority;
  status: LeadStatus;
  payment_status: PaymentStatus;
  lead_master_status: string | null; // sheet Column I: "Active" / "Inactive" / "Nutra Order" — separate from the workflow `status` above
  source_row_key: string | null; // dedup/sync key (mobile number, or mobile+name on collision)
  needs_review: boolean; // flagged during import/sync when data was ambiguous
  review_note: string | null;
  created_at: string;
  updated_at: string;
}

export interface Interaction {
  id: string;
  lead_id: string;
  attempt_number: number;
  call_datetime: string;
  outcome: string;
  comment: string | null;
  next_followup_date: string | null;
  updated_by: string | null; // users.id
  updated_by_name: string | null; // denormalised for migrated rows with no portal user
  created_at: string;
}

export type CategoryKind = 'product' | 'service';

export type IncentiveMode = 'simple_percentage' | 'target_tiered';

export interface PaymentCategory {
  id: string;
  name: string;
  kind: CategoryKind;
  team_subcategory: string | null; // e.g. 'Field', 'Inside Sales' — only meaningful for kind='service'
  active: boolean;
  incentive_mode: IncentiveMode;
  created_at: string;
}

// A tier ladder for a target_tiered category, for one month: reach at
// least min_value (either a % of this coach's own Active-status leads
// converted, or a flat count of conversions — see target_type) and the
// incentive rate on this category's revenue becomes incentive_percent.
export interface IncentiveTargetTier {
  id: string;
  category_id: string;
  month_cohort: string | null; // e.g. '2026-11' — null = default ladder for any month without its own
  target_type: TargetType;
  min_value: number;
  incentive_percent: number;
  effective_from: string;
  created_at: string;
}

export type VerificationStatus = 'pending' | 'verified' | 'rejected';

export interface Payment {
  id: string;
  lead_id: string;
  status: PaymentStatus;
  amount: number | null;
  payment_date: string | null;
  payment_ref: string | null;
  screenshot_path: string | null;
  remarks: string | null;
  category_id: string | null; // which Product/Service this payment is for
  recorded_by: string | null;
  verification_status: VerificationStatus;
  verified_by: string | null;
  verified_at: string | null;
  verification_note: string | null;
  order_id: string | null;
  tracking_link: string | null;
  plan_assigned: boolean;
  order_updated_by: string | null;
  order_updated_at: string | null;
  created_at: string;
}

export interface IncentiveSetting {
  id: string;
  programme: string | null; // legacy, no longer set by the app — kept for old rows
  category_id: string | null; // null = default/fallback rule applied to any category
  month_cohort: string | null; // e.g. '2026-11' — null = default rule for any month without its own
  type: 'fixed' | 'percentage';
  value: number;
  effective_from: string;
  created_at: string;
}

export type TargetType = 'percentage' | 'count';

export interface SyncLog {
  id: string;
  source: 'google_sheet' | 'csv_upload';
  status: 'success' | 'partial' | 'failed';
  rows_seen: number;
  rows_added: number;
  rows_updated: number;
  rows_flagged: number;
  error_message: string | null;
  run_at: string;
}

// Minimal Database type shape so @supabase/ssr's generics don't complain.
// Expand with `supabase gen types` if you want full column-level typing.
export type Database = any;
