'use client';

export default function PublicError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <div className="page-width py-28 text-center"><h1 className="display-font text-4xl">页面暂时无法加载</h1><p className="mt-3 text-sm text-[#6e6e73]">请稍后重试；如果问题持续，请联系网站管理员检查数据库连接。</p><button onClick={reset} className="primary-button mt-7">重新加载</button></div>;
}
