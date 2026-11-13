export function formatMonthCohort(cohort: string): string {
  // '2026-11' -> 'November 2026'
  const [year, month] = cohort.split('-').map(Number);
  const date = new Date(year, (month ?? 1) - 1, 1);
  return date.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}

export function currentMonthCohort(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}
