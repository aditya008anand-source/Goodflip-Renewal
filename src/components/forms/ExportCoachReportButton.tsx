'use client';

// Exports the already-rendered "Coach-wise Detailed Report" table to an
// .xlsx file, entirely in the browser — the data is passed in as a prop
// (exactly what the page already computed server-side), so this never
// re-queries or re-calculates anything of its own.
export interface CoachReportExportRow {
  coach: string;
  totalLeads: number;
  activeLeads: number;
  careplanRenewed: number;
  careplanEligiblePct: number;
  careplanRevenue: number;
  careplanIncentive: number;
  nutraRevenue: number;
  nutraIncentive: number;
  cgmRevenue: number;
  cgmIncentive: number;
  bcaRevenue: number;
  bcaIncentive: number;
  medicineRevenue: number;
  medicineIncentive: number;
  totalIncentive: number;
}

export default function ExportCoachReportButton({
  month,
  careplanTarget,
  rows,
}: {
  month: string;
  careplanTarget: string;
  rows: CoachReportExportRow[];
}) {
  async function handleExport() {
    const XLSX = await import('xlsx');

    const header = [
      'Coach',
      'Total Leads',
      'Active Leads',
      'Careplan Target',
      'Careplan Renewed',
      'Careplan Eligible %',
      'Careplan Revenue',
      'Careplan Incentive',
      'Nutra Revenue',
      'Nutra Incentive',
      'CGM Revenue',
      'CGM Incentive',
      'BCA Revenue',
      'BCA Incentive',
      'Medicine Revenue',
      'Medicine Incentive',
      'Total Incentive',
    ];

    const body = rows.map((r) => [
      r.coach,
      r.totalLeads,
      r.activeLeads,
      careplanTarget,
      r.careplanRenewed,
      r.careplanEligiblePct,
      r.careplanRevenue,
      r.careplanIncentive,
      r.nutraRevenue,
      r.nutraIncentive,
      r.cgmRevenue,
      r.cgmIncentive,
      r.bcaRevenue,
      r.bcaIncentive,
      r.medicineRevenue,
      r.medicineIncentive,
      r.totalIncentive,
    ]);

    const sheet = XLSX.utils.aoa_to_sheet([header, ...body]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, 'Coach Report');
    XLSX.writeFile(workbook, `goodflip-coach-report-${month}.xlsx`);
  }

  return (
    <button type="button" onClick={handleExport} className="btn-secondary text-xs px-3 py-1.5">
      Export to Excel
    </button>
  );
}
