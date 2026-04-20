'use client';

import { Sidebar } from '@/components/layout/Sidebar';
import { Navbar } from '@/components/layout/Navbar';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen bg-background overflow-hidden relative">
      {/* Background gradients for premium feel */}
      <div className="absolute top-0 left-0 w-full h-[500px] bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-900/10 via-background to-background" />
      
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 z-10">
        <Navbar />
        <main className="flex-1 overflow-y-auto w-full relative p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
