import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Calendar, Pencil, Trash2 } from 'lucide-react';

const TAG_COLORS: Record<string, { bg: string; color: string }> = {
  critical: { bg: '#FDEEE9', color: '#E07A5F' },
  high:     { bg: '#FDF6E3', color: '#9b7a28' },
  medium:   { bg: '#EDF4EC', color: '#4a8a46' },
  low:      { bg: '#F0EDE8', color: '#6b6460' },
};

const AVATAR_COLORS = ['#E07A5F','#8DB88A','#C9A84C','#9B8EC4','#7A8FA6'];
function avatarColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h += name.charCodeAt(i);
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

export function TaskCard({
  task,
  onEdit,
  onDelete,
  canDelete,
  canEdit,
}: {
  task: any;
  onEdit?: () => void;
  onDelete?: () => void;
  canDelete?: boolean;
  canEdit?: boolean;
}) {
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({
    id: task.id,
    data: { type: 'Task', task },
  });

  const style = { transition, transform: CSS.Transform.toString(transform) };
  const tag = TAG_COLORS[task.priority] || TAG_COLORS.medium;

  if (isDragging) {
    return (
      <div
        ref={setNodeRef}
        style={style}
        className="kanban-card opacity-40 h-24"
      />
    );
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="kanban-card group"
    >
      {/* Priority tag */}
      <div className="flex items-center justify-between mb-2.5">
        <span
          className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md"
          style={{ background: tag.bg, color: tag.color }}
        >
          {task.priority}
        </span>
        {task.assignee && (
          <div
            className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white"
            style={{ background: avatarColor(task.assignee.name) }}
            title={task.assignee.name}
          >
            {task.assignee.name.charAt(0)}
          </div>
        )}
      </div>

      {/* Title */}
      <h3 className="text-sm font-medium leading-snug mb-2 line-clamp-2" style={{ color: 'var(--bloom-text)' }}>
        {task.title}
      </h3>

      {/* Due date */}
      {task.due_date && (
        <div
          className="inline-flex items-center gap-1 text-[11px] mt-1 px-2 py-1 rounded-lg"
          style={{ background: 'var(--bloom-bg)', color: 'var(--bloom-muted)' }}
        >
          <Calendar size={11} />
          {new Date(task.due_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
        </div>
      )}

      {/* Actions */}
      {(canEdit || canDelete) && (
        <div className="mt-2.5 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
          {canEdit && (
            <button
              onClick={(e) => { e.stopPropagation(); onEdit?.(); }}
              className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg transition-colors hover:bg-black/5"
              style={{ color: 'var(--bloom-muted)' }}
            >
              <Pencil size={11} />
              Edit
            </button>
          )}
          {canDelete && (
            <button
              onClick={(e) => { e.stopPropagation(); onDelete?.(); }}
              className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg transition-colors"
              style={{ color: 'var(--bloom-coral)', background: 'var(--bloom-coral-bg)' }}
            >
              <Trash2 size={11} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
