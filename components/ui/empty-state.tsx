export function EmptyState({ title, description }: { title: string; description: string }) {
  return <div className="rounded-2xl border border-dashed border-[#cbd2ce] bg-white px-6 py-20 text-center"><div className="mx-auto mb-5 grid size-14 place-items-center rounded-full bg-[#e7efeb] text-2xl">⌕</div><h2 className="text-xl font-bold">{title}</h2><p className="mt-2 text-sm text-[#68736f]">{description}</p></div>;
}
