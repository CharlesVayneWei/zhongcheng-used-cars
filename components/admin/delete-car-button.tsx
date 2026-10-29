'use client';

import { deleteCarAction } from '@/lib/actions/cars';

export function DeleteCarButton({ carId, title }: { carId: string; title: string }) {
  return <form action={deleteCarAction} onSubmit={(event) => { if (!window.confirm(`确定永久删除“${title}”？车辆记录将删除，图片会从存储清理。此操作不可撤销。`)) event.preventDefault(); }}><input type="hidden" name="carId" value={carId}/><button className="rounded-xl border border-[#dbb3ad] px-5 py-2.5 text-sm font-bold text-[#9b4036]">删除车辆</button></form>;
}
