import Link from 'next/link';
import { StatusBadge } from '@/components/admin/status-badge';
import { listAdminCars } from '@/lib/data/admin';
import { formatDate, formatMileage, formatYuan } from '@/lib/utils/format';

type Params = Promise<Record<string, string | string[] | undefined>>;
const one = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;

export default async function AdminCarsPage({ searchParams }: { searchParams: Params }) {
  const params = await searchParams;
  const q = one(params.q)?.trim() ?? '';
  const status = one(params.status) ?? '';
  const cars = await listAdminCars(q, status);
  return <>
    <div className="flex flex-col items-start justify-between gap-5 sm:flex-row sm:items-end"><div><p className="eyebrow">Inventory management</p><h1 className="display-font mt-2 text-4xl">车辆管理</h1><p className="mt-2 text-sm text-[#6e6e73]">共 {cars.length} 条记录，草稿与下架车辆不会出现在客户前台。</p></div><Link className="rounded-full bg-[#1d1d1f] px-5 py-3 text-sm font-semibold text-white" href="/admin/cars/new">＋ 新增车辆</Link></div>
    {params.deleted && <div className="mt-6 rounded-xl bg-[#e1efe9] px-4 py-3 text-sm text-[#1c624f]">车辆已删除，关联图片已进入存储清理流程。</div>}
    <form className="mt-7 grid gap-3 rounded-2xl border border-[#d8dedb] bg-white p-4 sm:grid-cols-[1fr_180px_auto]">
      <input name="q" defaultValue={q} placeholder="搜索车辆名称" className="h-11 rounded-xl border border-[#d2d2d7] px-4 outline-none focus:border-[#1d1d1f]"/>
      <select name="status" defaultValue={status} className="h-11 rounded-xl border border-[#d8dedb] bg-white px-3"><option value="">全部状态</option><option value="draft">草稿</option><option value="published">在售</option><option value="sold">已售</option><option value="archived">已下架</option></select>
      <button className="h-11 rounded-full bg-[#1d1d1f] px-6 text-sm font-semibold text-white">筛选</button>
    </form>
    <div className="mt-5 overflow-hidden rounded-2xl border border-[#d8dedb] bg-white">
      <div className="overflow-x-auto"><table className="w-full border-collapse text-sm"><thead className="bg-[#eef1ef] text-left text-[11px] text-[#68736f]"><tr><th className="px-5 py-3">车辆</th><th className="px-5 py-3">状态</th><th className="px-5 py-3">里程</th><th className="px-5 py-3">全款价</th><th className="px-5 py-3">更新时间</th><th className="px-5 py-3"></th></tr></thead><tbody>
        {cars.map((car) => <tr key={car.id} className="border-t border-[#e7e7e9] hover:bg-[#fafafa]"><td className="px-5 py-4"><b className="block min-w-64">{car.title || '未命名草稿'}</b><small className="mt-1 block text-[#86868b]">{car.brand || '品牌待补'} · {car.registration_year || '年份待补'} · {car.car_images?.length ?? 0} 张图片</small></td><td className="px-5 py-4"><StatusBadge status={car.status}/></td><td className="px-5 py-4 whitespace-nowrap">{formatMileage(car.mileage_km)}</td><td className="px-5 py-4 whitespace-nowrap font-bold">{formatYuan(car.cash_price_yuan)}</td><td className="px-5 py-4 whitespace-nowrap text-[#6e6e73]">{formatDate(car.updated_at)}</td><td className="px-5 py-4"><Link className="font-semibold text-[#c6322b]" href={`/admin/cars/${car.id}`}>编辑 →</Link></td></tr>)}
        {!cars.length && <tr><td colSpan={6} className="px-5 py-20 text-center text-[#68736f]">没有符合条件的车辆。</td></tr>}
      </tbody></table></div>
    </div>
  </>;
}
