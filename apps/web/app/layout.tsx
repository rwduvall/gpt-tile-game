import type { Metadata } from 'next';
import '../styles/global.css';
export const metadata: Metadata = {
  title: 'Tileworks',
  description: 'A local-first tile drafting game for two players.',
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
