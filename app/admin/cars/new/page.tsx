import Link from 'next/link';
import { VehicleForm } from '@/components/admin/vehicle-form';

export default function NewCarPage() {
  return <div className="mx-auto max-w-5xl"><div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="eyebrow">Create vehicle</p><h1 className="display-font mt-2 text-4xl">新增车辆</h1><p className="mt-2 text-sm text-[#6e6e73]">先保存草稿创建车辆，再进入编辑页上传图片并发布。</p></div><Link className="text-sm font-semibold text-[#c6322b]" href="/admin/cars">返回列表</Link></div><VehicleForm/></div>;
}
