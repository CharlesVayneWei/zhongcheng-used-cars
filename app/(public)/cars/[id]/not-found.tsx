import Link from 'next/link';

export default function CarNotFound() {
  return <div className="page-width py-28 text-center"><p className="text-5xl">🚙</p><h1 className="display-font mt-6 text-4xl">车辆不存在或已下架</h1><p className="mt-3 text-[#6e6e73]">草稿、下架和已删除车辆不会在前台公开。</p><Link className="primary-button mt-7" href="/cars">查看其他车源</Link></div>;
}
