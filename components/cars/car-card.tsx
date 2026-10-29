import Link from 'next/link';
import type { Car } from '@/lib/types';
import { formatMileage, formatWan } from '@/lib/utils/format';
import { CarVisual } from './car-visual';

export function CarCard({ car }: { car: Car }) {
  return (
    <Link href={`/cars/${car.id}`} className="group block overflow-hidden rounded-[24px] bg-white transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_22px_60px_rgba(0,0,0,.09)]">
      <div className="relative aspect-[16/10] overflow-hidden bg-[#e8e8ed]">
        <CarVisual car={car} className="transition duration-500 group-hover:scale-[1.035]" />
        <div className="absolute left-3 top-3 flex gap-2">
          <span className="rounded-full bg-white/90 px-3 py-1 text-[10px] font-semibold tracking-[.08em] text-[#1d1d1f] backdrop-blur">{car.registration_year ?? '年份待补'}</span>
          {car.status === 'sold' && <span className="rounded-full bg-[#c6322b] px-3 py-1 text-[10px] font-semibold tracking-[.08em] text-white">已售</span>}
        </div>
      </div>
      <div className="p-5 sm:p-6">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-[.18em] text-[#86868b]">{car.brand ?? '品牌待补'}</p>
        <h3 className="line-clamp-2 min-h-12 text-[17px] font-semibold leading-6 text-[#1d1d1f]">{car.title ?? '未命名车辆'}</h3>
        <div className="mt-4 flex items-center gap-3 text-xs text-[#86868b]">
          <span>{car.registration_city || '上牌地待补'}</span><span className="size-1 rounded-full bg-[#c7c7cc]"/><span>{formatMileage(car.mileage_km)}</span>
        </div>
        <div className="mt-5 flex items-end justify-between border-t border-[#edf0ed] pt-4">
          <div><small className="block text-[10px] text-[#86868b]">全款价</small><strong className="text-2xl font-semibold tracking-[-.03em] text-[#1d1d1f]">{formatWan(car.cash_price_yuan)}</strong></div>
          {car.installment_price_yuan != null && <div className="text-right"><small className="block text-[10px] text-[#86868b]">分期 / 首付</small><b className="text-sm font-medium text-[#3a3a3c]">{formatWan(car.installment_price_yuan)} / {formatWan(car.down_payment_yuan)}</b></div>}
        </div>
      </div>
    </Link>
  );
}
