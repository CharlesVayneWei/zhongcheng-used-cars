import Link from 'next/link';

export function Pagination({ page, pageSize, count, query }: { page: number; pageSize: number; count: number; query: Record<string, string | undefined> }) {
  const pages = Math.ceil(count / pageSize);
  if (pages <= 1) return null;
  const href = (nextPage: number) => {
    const params = new URLSearchParams(Object.entries(query).filter((entry): entry is [string, string] => Boolean(entry[1])));
    params.set('page', String(nextPage));
    return `/cars?${params}`;
  };
  return <nav className="mt-10 flex items-center justify-center gap-3" aria-label="车辆分页">
    <Link aria-disabled={page <= 1} className={`rounded-xl border px-4 py-2 text-sm ${page <= 1 ? 'pointer-events-none opacity-40' : 'bg-white'}`} href={href(page - 1)}>上一页</Link>
    <span className="text-sm text-[#68736f]">第 {page} / {pages} 页</span>
    <Link aria-disabled={page >= pages} className={`rounded-xl border px-4 py-2 text-sm ${page >= pages ? 'pointer-events-none opacity-40' : 'bg-white'}`} href={href(page + 1)}>下一页</Link>
  </nav>;
}
