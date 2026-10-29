import type { Car } from '@/lib/types';

export function CarVisual({ car, className = '' }: { car: Car; className?: string }) {
  const cover = car.car_images.find((image) => image.is_cover) ?? car.car_images[0];
  if (cover?.public_url) {
    return <img src={cover.public_url} alt={car.title ?? '车辆图片'} className={`h-full w-full object-cover ${className}`} />;
  }
  return (
    <div className={`car-placeholder grid h-full w-full place-items-center ${className}`} role="img" aria-label={`${car.title ?? '车辆'}暂无照片`}>
      <svg viewBox="0 0 420 180" className="relative z-10 w-[82%] text-white/85" fill="none" aria-hidden="true">
        <path d="M68 112 94 72c8-12 22-20 37-21l140-5c19-1 37 8 48 24l28 39 29 10c9 3 15 11 15 21v7H31v-9c0-11 8-21 19-23l18-3Z" fill="currentColor" opacity=".92"/>
        <path d="m118 68-19 38h211l-25-36c-5-7-14-12-23-12l-123 3c-9 0-17 3-21 7Z" fill="#252527" opacity=".72"/>
        <circle cx="105" cy="145" r="27" fill="#1d1d1f" stroke="white" strokeOpacity=".7" strokeWidth="7"/>
        <circle cx="315" cy="145" r="27" fill="#1d1d1f" stroke="white" strokeOpacity=".7" strokeWidth="7"/>
        <path d="M34 126h43M344 119h36" stroke="#d84a40" strokeWidth="7" strokeLinecap="round"/>
      </svg>
      <span className="absolute bottom-4 left-5 z-10 text-[10px] font-bold uppercase tracking-[0.22em] text-white/75">Photo pending</span>
    </div>
  );
}
