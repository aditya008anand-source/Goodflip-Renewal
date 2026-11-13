// Shared spinner shown by every route's loading.tsx (Next.js renders this
// automatically while that route's Server Component is fetching data, e.g.
// right after clicking "View Details" or a nav link) — without it, clicking
// something that takes a moment looked like nothing was happening.
export default function PageSpinner() {
  return (
    <div className="flex items-center justify-center py-24">
      <div className="h-8 w-8 rounded-full border-2 border-slate-200 border-t-brand-700 animate-spin" />
    </div>
  );
}
