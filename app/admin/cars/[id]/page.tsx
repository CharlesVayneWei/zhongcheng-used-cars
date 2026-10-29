import Link from 'next/link';
import { notFound } from 'next/navigation';
import { DeleteCarButton } from '@/components/admin/delete-car-button';
import { ImageManager } from '@/components/admin/image-manager';
import { StatusBadge } from '@/components/admin/status-badge';
import { VehicleForm } from '@/components/admin/vehicle-form';
import { getAdminCar } from '@/lib/data/admin';
import { formatDate } from '@/lib/utils/format';

export default async function EditCarPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const id = (await params).id;
  const car = await getAdminCar(id);
  if (!car) notFound();
  const query = await searchParams;
  return <div className="mx-auto max-w-5xl">
    <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><div className="flex items-center gap-3"><p className="eyebrow">Edit vehicle</p><StatusBadge status={car.status}/></div><h1 className="display-font mt-2 text-4xl">{car.title || '未命名草稿'}</h1><p className="mt-2 text-xs text-[#6e6e73]">创建于 {formatDate(car.created_at)} · 最后修改 {formatDate(car.updated_at)}</p></div><div className="flex gap-4"><Link className="text-sm font-semibold text-[#c6322b]" href={`/cars/${car.id}`}>前台预览 ↗</Link><Link className="text-sm font-semibold text-[#c6322b]" href="/admin/cars">返回列表</Link></div></div>
    {query.created && <div className="mb-5 rounded-xl bg-[#e1efe9] px-4 py-3 text-sm text-[#1c624f]">草稿已创建。现在可以上传图片，完善信息后再发布。</div>}
    <div className="grid gap-5"><VehicleForm car={car}/><ImageManager carId={car.id} images={car.car_images}/><section className="flex flex-col justify-between gap-4 rounded-2xl border border-[#e0bab4] bg-[#fff7f5] p-5 sm:flex-row sm:items-center"><div><h2 className="font-bold text-[#8d372e]">危险操作</h2><p className="mt-1 text-xs text-[#78635f]">删除前会再次确认，并清理对应 Storage 文件；失败项进入清理队列。</p></div><DeleteCarButton carId={car.id} title={car.title || '未命名车辆'}/></section></div>
  </div>;
}
