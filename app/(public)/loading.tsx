export default function PublicLoading() {
  return <div className="page-width py-16"><div className="h-12 w-56 animate-pulse rounded-xl bg-[#dfe5e1]"/><div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 6 }).map((_, index) => <div key={index} className="overflow-hidden rounded-2xl border bg-white"><div className="aspect-[16/10] animate-pulse bg-[#dfe5e1]"/><div className="space-y-3 p-5"><div className="h-4 w-2/3 animate-pulse rounded bg-[#e7ebe8]"/><div className="h-8 animate-pulse rounded bg-[#e7ebe8]"/></div></div>)}</div></div>;
}
