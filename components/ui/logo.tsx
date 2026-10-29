import Image from 'next/image';
import Link from 'next/link';

export function Logo({ name = '众成精品车行', admin = false, dark = false }: { name?: string; admin?: boolean; dark?: boolean }) {
  return (
    <Link href={admin ? '/admin/cars' : '/'} className="inline-flex shrink-0 items-center" aria-label={`${name}${admin ? '管理后台' : '首页'}`}>
      <Image
        src="/brand/zhongcheng-official.png"
        alt={`${name} · ZHONG CHENG JING PIN`}
        width={2172}
        height={724}
        className={`h-auto object-contain ${dark ? 'w-[250px]' : 'w-[170px] sm:w-[235px]'}`}
        priority
      />
    </Link>
  );
}
