import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { TaskCard } from './TaskCard';
import { Plus } from 'lucide-react';

const colHeader: Record<string, { dot: string; label: string }> = {
  todo:        { dot: '#9B8EC4', label: 'To do' },
  in_progress: { dot: '#C9A84C', label: 'In progress' },
  done:        { dot: '#8DB88A', label: 'Done' },
};

export function KanbanColumn({
  column,
  tasks,
  onEditTask,
  onDeleteTask,
  canDelete,
  canEditTask,
  onAddTask,
}: {
  column: any;
  tasks: any[];
  onEditTask: (task: any) => void;
  onDeleteTask: (task: any) => void;
  canDelete: boolean;
  canEditTask: (task: any) => boolean;
  onAddTask?: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: column.id,
    data: { type: 'Column', column },
  });

  const meta = colHeader[column.id] || { dot: '#aaa', label: column.title };

  return (
    <div
      ref={setNodeRef}
      className="kanban-col flex flex-col"
      style={{
        minHeight: 400,
        transition: 'background 0.15s',
        background: isOver ? '#E8E3DB' : '#F0EDE8',
      }}
    >
      {/* Column header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-3 shrink-0">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: meta.dot }} />
          <span className="font-semibold text-sm" style={{ color: 'var(--bloom-text)' }}>
            {meta.label}
          </span>
          <span
            className="text-xs font-semibold px-1.5 py-0.5 rounded-md ml-1"
            style={{ background: 'rgba(0,0,0,0.08)', color: 'var(--bloom-muted)' }}
          >
            {tasks.length}
          </span>
        </div>
        {onAddTask && (
          <button
            onClick={onAddTask}
            className="p-1 rounded-lg hover:bg-black/10 transition-colors"
            style={{ color: 'var(--bloom-muted)' }}
          >
            <Plus size={15} />
          </button>
        )}
      </div>

      {/* Cards */}
      <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-2">
        <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          {tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              onEdit={() => onEditTask(task)}
              onDelete={() => onDeleteTask(task)}
              canDelete={canDelete}
              canEdit={canEditTask(task)}
            />
          ))}
        </SortableContext>
      </div>

      {/* Add task link */}
      {onAddTask && (
        <button
          onClick={onAddTask}
          className="mx-3 mb-3 flex items-center gap-1.5 text-sm py-2 rounded-xl transition-colors hover:bg-black/5"
          style={{ color: 'var(--bloom-muted)' }}
        >
          <Plus size={13} />
          Add a task
        </button>
      )}
    </div>
  );
}
