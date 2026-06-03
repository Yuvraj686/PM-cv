import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Calendar, Pencil, Trash2, MessageSquare } from 'lucide-react';

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
      <div className="flex items-start justify-between gap-2 mb-2">
        <h3 className="text-sm font-medium leading-snug line-clamp-2 flex-1" style={{ color: 'var(--bloom-text)' }}>
          {task.title}
        </h3>
        <div className="shrink-0 flex items-center gap-1">
          {task.story_points !== null && task.story_points !== undefined && (
            <span
              className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md"
              style={{ background: 'var(--bloom-yellow-bg)', color: 'var(--bloom-yellow)' }}
              title={`${task.story_points} story point${task.story_points === 1 ? '' : 's'}`}
            >
              {task.story_points} SP
            </span>
          )}
          {(task.comment_count ?? 0) > 0 && (
            <span
              className="flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-md"
              style={{ background: 'var(--bloom-purple-bg)', color: 'var(--bloom-purple)' }}
              title={`${task.comment_count} comment${task.comment_count > 1 ? 's' : ''}`}
            >
              <MessageSquare size={10} />
              {task.comment_count}
            </span>
          )}
        </div>
      </div>

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
