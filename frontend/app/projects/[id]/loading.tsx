export default function ProjectLoading() {
  return (
    <div className="p-6 h-full overflow-y-auto w-full">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Breadcrumb + title area */}
        <div className="space-y-2">
          <div
            className="h-3 w-40 rounded-md animate-pulse"
            style={{ background: 'var(--bloom-border)', opacity: 0.5 }}
          />
          <div
            className="h-7 w-60 rounded-lg animate-pulse"
            style={{ background: 'var(--bloom-border)' }}
          />
          <div
            className="h-4 w-80 rounded-md animate-pulse"
            style={{ background: 'var(--bloom-border)', opacity: 0.5, animationDelay: '100ms' }}
          />
        </div>

        {/* Tab navigation skeleton */}
        <div className="flex items-center gap-6 border-b" style={{ borderColor: 'var(--bloom-border)' }}>
          {['w-16', 'w-20', 'w-14', 'w-18', 'w-16', 'w-14'].map((w, i) => (
            <div
              key={i}
              className={`h-4 ${w} rounded-md animate-pulse pb-3`}
              style={{ background: 'var(--bloom-border)', opacity: i === 0 ? 0.8 : 0.4, animationDelay: `${i * 60}ms` }}
            />
          ))}
        </div>

        {/* Content area — three columns mimicking a kanban or detail layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {[...Array(3)].map((_, colIdx) => (
            <div key={colIdx} className="space-y-3">
              {/* Column header */}
              <div className="flex items-center gap-2 mb-2">
                <div
                  className="w-2.5 h-2.5 rounded-full animate-pulse"
                  style={{
                    background: ['var(--bloom-purple)', 'var(--bloom-yellow)', 'var(--bloom-green)'][colIdx],
                    animationDelay: `${colIdx * 150}ms`,
                  }}
                />
                <div
                  className="h-4 w-20 rounded-md animate-pulse"
                  style={{ background: 'var(--bloom-border)', animationDelay: `${colIdx * 150 + 50}ms` }}
                />
                <div
                  className="h-4 w-6 rounded-md animate-pulse ml-1"
                  style={{ background: 'var(--bloom-border)', opacity: 0.4, animationDelay: `${colIdx * 150 + 100}ms` }}
                />
              </div>

              {/* Card shimmers */}
              {[...Array(colIdx === 0 ? 3 : colIdx === 1 ? 2 : 1)].map((_, cardIdx) => (
                <div key={cardIdx} className="bloom-card p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div
                      className="h-3 w-14 rounded-md animate-pulse"
                      style={{ background: 'var(--bloom-coral-bg)', animationDelay: `${colIdx * 150 + cardIdx * 100}ms` }}
                    />
                    <div
                      className="w-6 h-6 rounded-full animate-pulse"
                      style={{ background: 'var(--bloom-border)', animationDelay: `${colIdx * 150 + cardIdx * 100 + 30}ms` }}
                    />
                  </div>
                  <div
                    className="h-4 w-4/5 rounded-md animate-pulse"
                    style={{ background: 'var(--bloom-border)', animationDelay: `${colIdx * 150 + cardIdx * 100 + 60}ms` }}
                  />
                  <div
                    className="h-3 w-3/5 rounded-md animate-pulse"
                    style={{ background: 'var(--bloom-border)', opacity: 0.5, animationDelay: `${colIdx * 150 + cardIdx * 100 + 90}ms` }}
                  />
                  <div
                    className="h-3 w-20 rounded-lg animate-pulse"
                    style={{ background: 'var(--bloom-bg)', animationDelay: `${colIdx * 150 + cardIdx * 100 + 120}ms` }}
                  />
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
