'use client';

import { useState } from 'react';
import type { Car } from '@/lib/types';
import { CarVisual } from './car-visual';

export function CarGallery({ car }: { car: Car }) {
  const images = car.car_images;
  const [selected, setSelected] = useState(Math.max(images.findIndex((image) => image.is_cover), 0));
  if (!images.length) return <div className="aspect-[16/10] overflow-hidden rounded-[28px]"><CarVisual car={car}/></div>;
  return (
    <div>
      <div className="relative aspect-[16/10] overflow-hidden rounded-[28px] bg-[#e8e8ed]">
        <img src={images[selected]?.public_url} alt={`${car.title} 图片 ${selected + 1}`} className="h-full w-full object-cover" />
        <span className="absolute bottom-4 right-4 rounded-full bg-black/60 px-3 py-1 text-xs text-white">{selected + 1} / {images.length}</span>
      </div>
      {images.length > 1 && <div className="mt-3 grid grid-cols-5 gap-2 sm:grid-cols-7">
        {images.map((image, index) => (
          <button key={image.id} onClick={() => setSelected(index)} className={`aspect-[4/3] overflow-hidden rounded-xl border-2 ${selected === index ? 'border-[#1d1d1f]' : 'border-transparent opacity-65 hover:opacity-100'}`} aria-label={`查看第 ${index + 1} 张图片`}>
            <img src={image.public_url} alt="" className="h-full w-full object-cover" />
          </button>
        ))}
      </div>}
    </div>
  );
}
