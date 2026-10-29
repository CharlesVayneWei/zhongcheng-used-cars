import type { CarStatus } from '@/lib/types';

const labels: Record<CarStatus, string> = { draft: '草稿', published: '在售', sold: '已售', archived: '已下架' };
const styles: Record<CarStatus, string> = {
  draft: 'bg-[#f0ece2] text-[#765e2d]', published: 'bg-[#e1efe9] text-[#1c624f]',
  sold: 'bg-[#f5e2df] text-[#9b4036]', archived: 'bg-[#e8ebea] text-[#5f6b67]',
};

export function StatusBadge({ status }: { status: CarStatus }) {
  return <span className={`inline-flex rounded-full px-3 py-1 text-[10px] font-black tracking-[.1em] ${styles[status]}`}>{labels[status]}</span>;
}
