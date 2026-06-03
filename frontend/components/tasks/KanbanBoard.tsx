'use client';

import { DndContext, DragOverlay, closestCorners, KeyboardSensor, PointerSensor, useSensor, useSensors, DragStartEvent, DragEndEvent } from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { KanbanColumn } from '@/components/tasks/KanbanColumn';
import { TaskCard } from '@/components/tasks/TaskCard';

const columns = [
  { id: 'todo',        title: 'To Do' },
  { id: 'in_progress', title: 'In Progress' },
  { id: 'done',        title: 'Done' },
];

export function KanbanBoard({
  tasks,
  activeTask,
  canDelete,
  canEditTask,
  canCreate,
  onEditTask,
  onDeleteTask,
  onAddTask,
  onDragStart,
  onDragEnd,
}: {
  tasks: any[];
  activeTask: any | null;
  canDelete: boolean;
  canEditTask: (task: any) => boolean;
  canCreate: boolean;
  onEditTask: (task: any) => void;
  onDeleteTask: (task: any) => void;
  onAddTask: (status: string) => void;
  onDragStart: (event: DragStartEvent) => void;
  onDragEnd: (event: DragEndEvent) => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  return (
    <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <div className="flex gap-4 h-full items-start pb-4">
        {columns.map((col) => (
          <KanbanColumn
            key={col.id}
            column={col}
            tasks={tasks.filter((t) => t.status === col.id)}
            onEditTask={(task: any) => canEditTask(task) && onEditTask(task)}
            onDeleteTask={(task: any) => canDelete && onDeleteTask(task)}
            canDelete={canDelete}
            canEditTask={canEditTask}
            onAddTask={canCreate ? () => onAddTask(col.id) : undefined}
          />
        ))}
      </div>
      <DragOverlay>
        {activeTask ? <TaskCard task={activeTask} /> : null}
      </DragOverlay>
    </DndContext>
  );
}
