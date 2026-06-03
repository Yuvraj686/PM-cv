import { FileQuestion, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0F1117] text-white p-6">
      <div className="max-w-md w-full text-center space-y-6 bg-[#161B22] p-8 rounded-2xl border border-[#30363D] shadow-2xl relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/10 via-transparent to-transparent pointer-events-none" />
        
        <div className="mx-auto w-16 h-16 bg-indigo-500/10 text-indigo-400 flex items-center justify-center rounded-full animate-pulse">
          <FileQuestion size={32} />
        </div>
        
        <div className="space-y-2">
          <h1 className="text-4xl font-extrabold tracking-tight text-indigo-400">404</h1>
          <h2 className="text-xl font-bold tracking-tight">Page Not Found</h2>
          <p className="text-[#8B949E] text-sm">
            We couldn&apos;t find the page you were looking for. It might have been moved or deleted.
          </p>
        </div>

        <div className="pt-2">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#6366F1] hover:bg-[#4f46e5] transition rounded-xl text-sm font-semibold text-white shadow-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <ArrowLeft size={16} />
            Back to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
