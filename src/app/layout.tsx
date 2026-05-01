import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Pricepoint Pricing Sandbox',
  description:
    'AI-driven hotel-pricing demo. Built as a portfolio reference for AI-agent-driven SaaS engineering.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-white text-ink font-sans antialiased">{children}</body>
    </html>
  );
}
