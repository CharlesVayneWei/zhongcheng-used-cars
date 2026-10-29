import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CarGallery } from '@/components/cars/car-gallery';
import { ContactDialogTrigger } from '@/components/contact/contact-dialog';
import { getPublicCar } from '@/lib/data/cars';
import { formatDate, formatLocation, formatMileage, formatYuan } from '@/lib/utils/format';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const car = await getPublicCar((await params).id);
  return car ? { title: car.title ?? '车辆详情', description: `${car.registration_year ?? ''} ${car.brand ?? ''} ${car.model ?? ''}` } : { title: '车辆不存在' };
}

export default async function CarDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const id = (await params).id;
  const car = await getPublicCar(id);
  if (!car) notFound();
  const sold = car.status === 'sold';
  return <div className="page-width py-10 sm:py-16">
    <div className="mb-6 text-xs text-[#86868b]"><a href="/cars" className="hover:text-black">全部车源</a><span className="mx-2">/</span><span>{car.brand}</span></div>
    {sold && <div className="mb-5 rounded-full bg-[#c6322b] px-5 py-3 text-center text-sm font-semibold text-white">此车辆已售，仅保留信息展示，不再接受购车咨询</div>}
    <div className="grid gap-8 lg:grid-cols-[1.5fr_.75fr]">
      <CarGallery car={car}/>
      <aside className="h-max rounded-[28px] bg-white p-6 shadow-[0_20px_60px_rgba(0,0,0,.06)] sm:p-8 lg:sticky lg:top-24">
        <p className="eyebrow">{car.brand}</p>
        <h1 className="mt-3 text-2xl font-semibold leading-9 tracking-[-.025em] sm:text-3xl">{car.title}</h1>
        <div className="mt-8 rounded-2xl bg-[#f5f5f7] p-5"><small className="text-[#86868b]">全款价格</small><strong className="mt-1 block text-4xl font-semibold tracking-[-.04em] text-[#1d1d1f]">{formatYuan(car.cash_price_yuan)}</strong>{car.installment_price_yuan != null && <p className="mt-3 text-sm text-[#515154]">分期价 <b>{formatYuan(car.installment_price_yuan)}</b> · 首付 <b>{formatYuan(car.down_payment_yuan)}</b></p>}</div>
        <dl className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-2xl bg-[#e8e8ed]">
          {[
            ['上牌年份', car.registration_year ? `${car.registration_year}年` : '—'],
            ['上牌地点', formatLocation(car.registration_province, car.registration_city)],
            ['实际里程', formatMileage(car.mileage_km)],
            ['保险状态', car.insurance_status === 'insured' ? `有保险 · ${formatDate(car.insurance_expiry)}` : car.insurance_status === 'uninsured' ? '无保险' : '未知'],
          ].map(([label, value]) => <div key={label} className="bg-white p-4"><dt className="text-[10px] text-[#86868b]">{label}</dt><dd className="mt-1 text-sm font-semibold">{value}</dd></div>)}
        </dl>
        {!sold && <ContactDialogTrigger className="primary-button mt-6 w-full" />}
      </aside>
    </div>
    <section className="mt-12 max-w-4xl rounded-[28px] bg-white p-6 sm:p-10"><p className="eyebrow">Vehicle condition</p><h2 className="display-font mt-3 text-3xl">车身状况</h2><p className="condition-copy mt-7 text-[15px] leading-8 text-[#515154]">{car.condition_description || '暂无车况说明。'}</p></section>
  </div>;
}
