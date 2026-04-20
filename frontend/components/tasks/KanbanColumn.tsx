import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { TaskCard } from './TaskCard';

export function KanbanColumn({
  column,
  tasks,
  onEditTask,
  onDeleteTask,
  canDelete,
  canEditTask,
}: {
  column: any,
  tasks: any[],
  onEditTask: (task: any) => void,
  onDeleteTask: (task: any) => void,
  canDelete: boolean,
  canEditTask: (task: any) => boolean,
}) {
  const { setNodeRef } = useDroppable({
    id: column.id,
    data: {
      type: 'Column',
      column,
    },
  });

  return (
    <div
      ref={setNodeRef}
      className="flex flex-col bg-white/[0.02] border border-white/5 rounded-2xl w-80 h-full overflow-hidden"
    >
      <div className="p-4 border-b border-white/10 shrink-0 flex items-center justify-between bg-black/20">
        <div className="flex items-center space-x-2">
          <span className={`w-2.5 h-2.5 rounded-full ${
            column.id === 'todo' ? 'bg-gray-400' :
            column.id === 'in_progress' ? 'bg-indigo-400' : 'bg-emerald-400'
          }`} />
          <h2 className="font-semibold text-sm">{column.title}</h2>
        </div>
        <div className="bg-white/10 px-2 py-0.5 rounded text-xs text-gray-300 font-medium">
          {tasks.length}
        </div>
      </div>
      
      <div className="p-3 flex-1 overflow-y-auto space-y-3 custom-scrollbar">
        <SortableContext items={tasks.map(t => t.id)} strategy={verticalListSortingStrategy}>
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
    </div>
  );
}
