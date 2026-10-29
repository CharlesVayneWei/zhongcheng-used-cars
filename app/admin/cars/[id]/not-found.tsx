import Link from 'next/link';

export default function AdminCarNotFound() {
  return <div className="rounded-[24px] border bg-white py-24 text-center"><h1 className="display-font text-4xl">车辆不存在</h1><p className="mt-3 text-sm text-[#6e6e73]">记录可能已被删除，或当前账号无权访问。</p><Link className="primary-button mt-6" href="/admin/cars">返回车辆列表</Link></div>;
}
