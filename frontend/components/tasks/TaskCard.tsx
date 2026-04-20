import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Calendar, AlignLeft, Pencil, Trash2 } from 'lucide-react';

export function TaskCard({
  task,
  onEdit,
  onDelete,
  canDelete,
  canEdit,
}: {
  task: any,
  onEdit?: () => void,
  onDelete?: () => void,
  canDelete?: boolean,
  canEdit?: boolean,
}) {
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({
    id: task.id,
    data: {
      type: 'Task',
      task,
    },
  });

  const style = {
    transition,
    transform: CSS.Transform.toString(transform),
  };

  const priorityColors = {
    low: 'bg-gray-500/20 text-gray-400 border-gray-500/20',
    medium: 'bg-blue-500/20 text-blue-400 border-blue-500/20',
    high: 'bg-amber-500/20 text-amber-500 border-amber-500/20',
    critical: 'bg-red-500/20 text-red-500 border-red-500/20',
  };

  const priorityColor = priorityColors[task.priority as keyof typeof priorityColors] || priorityColors.medium;

  if (isDragging) {
    return (
      <div 
        ref={setNodeRef} 
        style={style} 
        className="glass-panel p-4 rounded-xl border border-indigo-500/50 opacity-40 shadow-2xl h-32" 
      />
    );
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`glass-panel p-4 rounded-xl cursor-grab active:cursor-grabbing hover:border-white/20 transition-colors group relative overflow-hidden`}
    >
      {/* Priority accent bar */}
      <div className={`absolute left-0 top-0 bottom-0 w-1 ${
        task.priority === 'critical' ? 'bg-red-500' :
        task.priority === 'high' ? 'bg-amber-500' :
        task.priority === 'medium' ? 'bg-blue-500' : 'bg-gray-500'
      }`} />
      
      <div className="flex justify-between items-start mb-2">
        <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded border ${priorityColor}`}>
          {task.priority}
        </span>
        
        {task.assignee && (
          <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center text-[10px] font-bold text-white shadow-sm border border-white/20" title={task.assignee.name}>
            {task.assignee.name.charAt(0)}
          </div>
        )}
      </div>
      
      <h3 className="font-medium text-sm text-gray-100 group-hover:text-indigo-300 transition-colors line-clamp-2">
        {task.title}
      </h3>
      
      {task.description && (
        <div className="mt-2 flex items-center text-gray-500">
          <AlignLeft size={12} className="mr-1" />
        </div>
      )}
      
      {task.due_date && (
        <div className="mt-3 inline-flex items-center text-[11px] font-medium text-gray-400 bg-black/20 self-start px-2 py-1 rounded-md border border-white/5">
          <Calendar size={12} className="mr-1.5 opacity-70" />
          {new Date(task.due_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
        </div>
      )}

      {(canEdit || canDelete) && (
        <div className="mt-3 flex items-center gap-2">
          {canEdit && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onEdit?.();
              }}
              className="text-xs px-2 py-1 rounded bg-white/10 hover:bg-white/20 flex items-center gap-1"
            >
              <Pencil size={12} />
              Edit
            </button>
          )}
          {canDelete && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete?.();
              }}
              className="text-xs px-2 py-1 rounded bg-red-500/20 text-red-300 hover:bg-red-500/30 flex items-center gap-1"
            >
              <Trash2 size={12} />
              Delete
            </button>
          )}
        </div>
      )}
    </div>
  );
}
