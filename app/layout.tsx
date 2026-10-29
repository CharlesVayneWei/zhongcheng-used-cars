import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: { default: '众成精品车行', template: '%s · 众成精品车行' },
  description: '真实车源、透明信息、专人服务的二手车展示平台。',
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
