export default function DashboardLoading() {
  return (
    <div className="p-6 h-full overflow-y-auto w-full">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header skeleton */}
        <div className="flex items-center justify-between">
          <div>
            <div
              className="h-7 w-52 rounded-lg animate-pulse"
              style={{ background: 'var(--bloom-border)' }}
            />
            <div
              className="h-4 w-36 rounded-md mt-2 animate-pulse"
              style={{ background: 'var(--bloom-border)', opacity: 0.6 }}
            />
          </div>
          <div
            className="h-10 w-36 rounded-xl animate-pulse"
            style={{ background: 'var(--bloom-border)' }}
          />
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bloom-card p-5 space-y-3">
              <div
                className="w-11 h-11 rounded-xl animate-pulse"
                style={{
                  background: ['var(--bloom-green-bg)', 'var(--bloom-coral-bg)', 'var(--bloom-yellow-bg)', 'var(--bloom-purple-bg)'][i],
                  animationDelay: `${i * 120}ms`,
                }}
              />
              <div
                className="h-8 w-16 rounded-lg animate-pulse"
                style={{ background: 'var(--bloom-border)', animationDelay: `${i * 120 + 60}ms` }}
              />
              <div
                className="h-3 w-24 rounded-md animate-pulse"
                style={{ background: 'var(--bloom-border)', opacity: 0.5, animationDelay: `${i * 120 + 120}ms` }}
              />
            </div>
          ))}
        </div>

        {/* Project cards row */}
        <div>
          <div
            className="h-5 w-32 rounded-md mb-4 animate-pulse"
            style={{ background: 'var(--bloom-border)' }}
          />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="bloom-card p-5 space-y-3">
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-xl animate-pulse"
                    style={{ background: 'var(--bloom-coral-bg)', animationDelay: `${i * 80}ms` }}
                  />
                  <div className="flex-1 space-y-1.5">
                    <div
                      className="h-4 w-3/4 rounded-md animate-pulse"
                      style={{ background: 'var(--bloom-border)', animationDelay: `${i * 80 + 40}ms` }}
                    />
                    <div
                      className="h-3 w-1/2 rounded-md animate-pulse"
                      style={{ background: 'var(--bloom-border)', opacity: 0.5, animationDelay: `${i * 80 + 80}ms` }}
                    />
                  </div>
                </div>
                {/* Progress bar shimmer */}
                <div
                  className="h-2 w-full rounded-full animate-pulse"
                  style={{ background: 'var(--bloom-border)', animationDelay: `${i * 80 + 120}ms` }}
                />
                <div className="flex items-center gap-2">
                  <div
                    className="h-3 w-20 rounded-md animate-pulse"
                    style={{ background: 'var(--bloom-border)', opacity: 0.5, animationDelay: `${i * 80 + 160}ms` }}
                  />
                  <div
                    className="h-3 w-16 rounded-md animate-pulse"
                    style={{ background: 'var(--bloom-border)', opacity: 0.4, animationDelay: `${i * 80 + 200}ms` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
