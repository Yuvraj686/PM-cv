export function KanbanSkeleton() {
  const columns = [
    { dot: '#9B8EC4', label: 'To do',       cards: 3 },
    { dot: '#C9A84C', label: 'In progress', cards: 2 },
    { dot: '#8DB88A', label: 'Done',        cards: 1 },
  ];

  return (
    <div className="flex gap-4 h-full items-start pb-4">
      {columns.map((col, colIdx) => (
        <div
          key={col.label}
          className="kanban-col flex flex-col"
          style={{ minHeight: 400 }}
        >
          {/* Column header */}
          <div className="flex items-center justify-between px-4 pt-4 pb-3 shrink-0">
            <div className="flex items-center gap-2">
              <span
                className="w-2.5 h-2.5 rounded-full animate-pulse"
                style={{ background: col.dot, animationDelay: `${colIdx * 200}ms` }}
              />
              <span
                className="h-4 w-16 rounded-md animate-pulse"
                style={{ background: 'rgba(0,0,0,0.08)', animationDelay: `${colIdx * 200 + 80}ms` }}
              />
              <span
                className="h-4 w-5 rounded-md animate-pulse ml-1"
                style={{ background: 'rgba(0,0,0,0.06)', animationDelay: `${colIdx * 200 + 160}ms` }}
              />
            </div>
          </div>

          {/* Card shimmers */}
          <div className="flex-1 px-3 pb-3 space-y-2">
            {[...Array(col.cards)].map((_, cardIdx) => {
              const delay = colIdx * 200 + cardIdx * 140;
              return (
                <div
                  key={cardIdx}
                  className="kanban-card space-y-3"
                  style={{ cursor: 'default' }}
                >
                  {/* Priority tag + avatar */}
                  <div className="flex items-center justify-between">
                    <div
                      className="h-3.5 w-14 rounded-md animate-pulse"
                      style={{
                        background: ['#FDEEE9', '#FDF6E3', '#EDF4EC'][cardIdx % 3],
                        animationDelay: `${delay}ms`,
                      }}
                    />
                    <div
                      className="w-6 h-6 rounded-full animate-pulse"
                      style={{
                        background: [
                          'var(--bloom-coral)',
                          'var(--bloom-green)',
                          'var(--bloom-purple)',
                        ][cardIdx % 3],
                        opacity: 0.3,
                        animationDelay: `${delay + 40}ms`,
                      }}
                    />
                  </div>

                  {/* Title lines */}
                  <div
                    className="h-3.5 w-4/5 rounded-md animate-pulse"
                    style={{ background: 'var(--bloom-border)', animationDelay: `${delay + 80}ms` }}
                  />
                  <div
                    className="h-3 w-3/5 rounded-md animate-pulse"
                    style={{
                      background: 'var(--bloom-border)',
                      opacity: 0.5,
                      animationDelay: `${delay + 120}ms`,
                    }}
                  />

                  {/* Due date tag */}
                  <div
                    className="h-5 w-20 rounded-lg animate-pulse"
                    style={{
                      background: 'var(--bloom-bg)',
                      animationDelay: `${delay + 160}ms`,
                    }}
                  />
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
