'use client';

import { startTransition, useActionState, useEffect, useState } from 'react';
import {
  deleteCarImageAction, moveCarImageAction, setCoverImageAction, uploadCarImageAction,
} from '@/lib/actions/cars';
import type { ActionState, CarImage } from '@/lib/types';

const initialState: ActionState = { ok: false, message: '' };

async function compressImage(file: File) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('仅支持 JPG、PNG、WEBP 图片');
  const bitmap = await createImageBitmap(file);
  const maxEdge = 1920;
  const ratio = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * ratio);
  canvas.height = Math.round(bitmap.height * ratio);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('浏览器无法处理图片');
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', .84));
  if (!blob) throw new Error('图片压缩失败');
  return new File([blob], `${file.name.replace(/\.[^.]+$/, '')}.webp`, { type: 'image/webp' });
}

export function ImageManager({ carId, images }: { carId: string; images: CarImage[] }) {
  const [state, uploadAction, pending] = useActionState(uploadCarImageAction, initialState);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [clientError, setClientError] = useState('');
  const [preview, setPreview] = useState('');

  useEffect(() => {
    if (!selectedFiles[0]) {
      setPreview('');
      return;
    }

    const objectUrl = URL.createObjectURL(selectedFiles[0]);
    setPreview(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [selectedFiles]);

  async function handleUpload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setClientError('');
    const input = event.currentTarget.elements.namedItem('image') as HTMLInputElement;
    const rawFiles = Array.from(input.files ?? []);
    if (!rawFiles.length) return setClientError('请选择图片');
    if (rawFiles.length > 6) return setClientError('每次最多选择 6 张图片');
    try {
      const data = new FormData();
      data.set('carId', carId);
      let totalBytes = 0;
      for (const raw of rawFiles) {
        const compressed = await compressImage(raw);
        if (compressed.size > 5 * 1024 * 1024) throw new Error(`${raw.name} 压缩后仍超过 5 MB`);
        totalBytes += compressed.size;
        data.append('images', compressed);
      }
      if (totalBytes > 7 * 1024 * 1024) throw new Error('本批图片压缩后总大小超过 7 MB，请分批上传');
      startTransition(() => uploadAction(data));
    } catch (error) {
      setClientError(error instanceof Error ? error.message : '图片处理失败');
    }
  }

  return <section className="rounded-[24px] border border-[#d2d2d7] bg-white p-5 sm:p-7">
    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end"><div><p className="eyebrow">Vehicle images</p><h2 className="mt-1 text-xl font-semibold">车辆图片</h2><p className="mt-2 text-xs text-[#6e6e73]">浏览器先压缩，服务器会再次校验并转换为 WebP；单张不超过 5 MB。可调整顺序并设置封面。</p></div><span className="text-xs font-semibold text-[#6e6e73]">{images.length} 张</span></div>
    {(clientError || state.message) && <div className={`mt-5 rounded-xl px-4 py-3 text-sm ${state.ok && !clientError ? 'bg-[#e1efe9] text-[#1c624f]' : 'bg-[#f7e5e1] text-[#983f34]'}`}>{clientError || state.message}</div>}
    <form onSubmit={handleUpload} className="mt-5 grid gap-3 rounded-xl border border-dashed border-[#bfc8c3] bg-[#f8faf8] p-4 sm:grid-cols-[1fr_auto] sm:items-end">
      <label className="grid gap-2 text-sm font-bold">选择车辆图片<input type="file" name="image" accept="image/jpeg,image/png,image/webp" multiple onChange={(event) => setSelectedFiles(Array.from(event.target.files ?? []))} className="block w-full rounded-xl border border-[#d8dedb] bg-white p-2 text-xs"/></label>
      <button disabled={pending} className="h-11 rounded-full bg-[#1d1d1f] px-5 text-sm font-semibold text-white disabled:opacity-60">{pending ? '处理并上传中…' : `压缩并上传${selectedFiles.length ? ` ${selectedFiles.length} 张` : ''}`}</button>
      {preview && <div className="flex items-center gap-3"><img src={preview} alt="待上传图片预览" className="max-h-28 rounded-lg object-cover"/><span className="text-xs text-[#68736f]">共选择 {selectedFiles.length} 张</span></div>}
    </form>
    <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {images.map((image, index) => <article key={image.id} className="overflow-hidden rounded-xl border border-[#d2d2d7]"><div className="relative aspect-[4/3] bg-[#e8e8ed]"><img src={image.public_url} alt={`车辆图片 ${index + 1}`} className="h-full w-full object-cover"/>{image.is_cover && <span className="absolute left-2 top-2 rounded-full bg-[#1d1d1f] px-2.5 py-1 text-[10px] font-semibold text-white">封面</span>}</div><div className="flex flex-wrap gap-1 p-3">
        <form action={moveCarImageAction}><input type="hidden" name="carId" value={carId}/><input type="hidden" name="imageId" value={image.id}/><button name="direction" value="up" disabled={index === 0} className="rounded-lg border px-2.5 py-1.5 text-xs disabled:opacity-30">← 前移</button></form>
        <form action={moveCarImageAction}><input type="hidden" name="carId" value={carId}/><input type="hidden" name="imageId" value={image.id}/><button name="direction" value="down" disabled={index === images.length - 1} className="rounded-lg border px-2.5 py-1.5 text-xs disabled:opacity-30">后移 →</button></form>
        {!image.is_cover && <form action={setCoverImageAction}><input type="hidden" name="carId" value={carId}/><input type="hidden" name="imageId" value={image.id}/><button className="rounded-lg border px-2.5 py-1.5 text-xs">设为封面</button></form>}
        <form action={deleteCarImageAction} onSubmit={(event) => { if (!window.confirm('确定移除这张图片？')) event.preventDefault(); }}><input type="hidden" name="carId" value={carId}/><input type="hidden" name="imageId" value={image.id}/><button className="rounded-lg border border-[#e1bbb5] px-2.5 py-1.5 text-xs text-[#9b4036]">移除</button></form>
      </div></article>)}
      {!images.length && <div className="sm:col-span-2 lg:col-span-3 rounded-xl border border-dashed border-[#cbd2ce] py-12 text-center text-sm text-[#68736f]">尚未上传图片。草稿可以保存，但至少上传一张后才能发布。</div>}
    </div>
  </section>;
}
