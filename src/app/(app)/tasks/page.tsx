'use client';

import { useEffect, useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import {
  CheckSquare,
  Circle,
  CheckCircle2,
  Clock,
  AlertCircle,
  Calendar,
  FileText,
  Plus,
} from 'lucide-react';
import Link from 'next/link';
import { AppHeader } from '@/components/layout/AppHeader';
import { Button, Card, EmptyState, Spinner, Badge } from '@/components/ui';
import { createClient } from '@/lib/supabase/client';
import type { Task, TaskStatus } from '@/types/database';
import { cn, formatDate, formatRelativeTime } from '@/lib/utils';

// Task status config
const statusConfig: Record<
  TaskStatus,
  { icon: typeof Circle; color: string; bgColor: string }
> = {
  pending: { icon: Circle, color: 'text-gray-500', bgColor: 'bg-gray-500/10' },
  in_progress: { icon: Clock, color: 'text-blue-500', bgColor: 'bg-blue-500/10' },
  completed: { icon: CheckCircle2, color: 'text-success', bgColor: 'bg-success/10' },
  cancelled: { icon: AlertCircle, color: 'text-text-soft', bgColor: 'bg-surface-alt' },
};

export default function TasksPage() {
  const t = useTranslations('tasks');
  const supabase = createClient();

  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<TaskStatus | 'all'>('all');

  const fetchTasks = useCallback(async () => {
    setLoading(true);

    let query = supabase
      .from('tasks')
      .select('*')
      .order('due_at', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false });

    if (filter !== 'all') {
      query = query.eq('status', filter);
    }

    const { data, error } = await query;

    if (!error && data) {
      setTasks(data);
    }
    setLoading(false);
  }, [supabase, filter]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  const updateTaskStatus = async (taskId: string, status: TaskStatus) => {
    const updates: Partial<Task> = { status };
    if (status === 'completed') {
      updates.completed_at = new Date().toISOString();
    }

    const { error } = await supabase.from('tasks').update(updates).eq('id', taskId);

    if (!error) {
      setTasks((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, ...updates } : t))
      );
    }
  };

  // Group tasks by status
  const groupedTasks = {
    overdue: tasks.filter(
      (t) =>
        t.due_at &&
        new Date(t.due_at) < new Date() &&
        t.status !== 'completed' &&
        t.status !== 'cancelled'
    ),
    upcoming: tasks.filter(
      (t) =>
        t.due_at &&
        new Date(t.due_at) >= new Date() &&
        t.status !== 'completed' &&
        t.status !== 'cancelled'
    ),
    noDue: tasks.filter(
      (t) => !t.due_at && t.status !== 'completed' && t.status !== 'cancelled'
    ),
    completed: tasks.filter((t) => t.status === 'completed'),
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <AppHeader title={t('title')} />

      <div className="flex-1 overflow-auto p-6">
        {/* Filters */}
        <div className="flex items-center gap-2 mb-6 flex-wrap">
          {(['all', 'pending', 'in_progress', 'completed', 'cancelled'] as const).map(
            (status) => (
              <button
                key={status}
                onClick={() => setFilter(status)}
                className={cn(
                  'px-4 py-2 rounded-full text-sm font-medium transition-colors',
                  filter === status
                    ? 'bg-accent text-white'
                    : 'bg-surface border border-border text-text-soft hover:border-accent'
                )}
              >
                {status === 'all' ? 'All' : t(`statuses.${status}`)}
              </button>
            )
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-64">
            <Spinner size="lg" />
          </div>
        ) : tasks.length === 0 ? (
          <EmptyState
            icon={<CheckSquare className="w-8 h-8" />}
            title={t('empty')}
            description={t('emptyDescription')}
          />
        ) : (
          <div className="space-y-8">
            {/* Overdue */}
            {groupedTasks.overdue.length > 0 && (
              <TaskSection
                title="Overdue"
                icon={AlertCircle}
                iconColor="text-error"
                tasks={groupedTasks.overdue}
                onStatusChange={updateTaskStatus}
              />
            )}

            {/* Upcoming */}
            {groupedTasks.upcoming.length > 0 && (
              <TaskSection
                title="Upcoming"
                icon={Calendar}
                iconColor="text-accent"
                tasks={groupedTasks.upcoming}
                onStatusChange={updateTaskStatus}
              />
            )}

            {/* No Due Date */}
            {groupedTasks.noDue.length > 0 && (
              <TaskSection
                title="No Due Date"
                icon={Clock}
                iconColor="text-text-soft"
                tasks={groupedTasks.noDue}
                onStatusChange={updateTaskStatus}
              />
            )}

            {/* Completed */}
            {filter === 'all' && groupedTasks.completed.length > 0 && (
              <TaskSection
                title="Completed"
                icon={CheckCircle2}
                iconColor="text-success"
                tasks={groupedTasks.completed.slice(0, 10)}
                onStatusChange={updateTaskStatus}
                collapsed
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

interface TaskSectionProps {
  title: string;
  icon: typeof Circle;
  iconColor: string;
  tasks: Task[];
  onStatusChange: (taskId: string, status: TaskStatus) => void;
  collapsed?: boolean;
}

function TaskSection({
  title,
  icon: Icon,
  iconColor,
  tasks,
  onStatusChange,
  collapsed,
}: TaskSectionProps) {
  const [isExpanded, setIsExpanded] = useState(!collapsed);

  return (
    <div>
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-2 mb-3 w-full text-left"
      >
        <Icon className={cn('w-5 h-5', iconColor)} />
        <h2 className="text-lg font-semibold text-text">{title}</h2>
        <Badge size="sm" variant="default">
          {tasks.length}
        </Badge>
        <span
          className={cn(
            'ml-auto text-text-soft transition-transform',
            isExpanded && 'rotate-180'
          )}
        >
          ▼
        </span>
      </button>

      {isExpanded && (
        <div className="space-y-2">
          {tasks.map((task) => (
            <TaskCard key={task.id} task={task} onStatusChange={onStatusChange} />
          ))}
        </div>
      )}
    </div>
  );
}

interface TaskCardProps {
  task: Task;
  onStatusChange: (taskId: string, status: TaskStatus) => void;
}

function TaskCard({ task, onStatusChange }: TaskCardProps) {
  const t = useTranslations('tasks.statuses');
  const config = statusConfig[task.status];
  const StatusIcon = config.icon;

  const isOverdue =
    task.due_at &&
    new Date(task.due_at) < new Date() &&
    task.status !== 'completed' &&
    task.status !== 'cancelled';

  return (
    <Card className="group" padding="md">
      <div className="flex items-start gap-3">
        {/* Status toggle */}
        <button
          onClick={() =>
            onStatusChange(
              task.id,
              task.status === 'completed' ? 'pending' : 'completed'
            )
          }
          className={cn(
            'mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors',
            task.status === 'completed'
              ? 'bg-success border-success'
              : 'border-border hover:border-accent'
          )}
        >
          {task.status === 'completed' && (
            <CheckCircle2 className="w-4 h-4 text-white" />
          )}
        </button>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <h3
            className={cn(
              'font-medium',
              task.status === 'completed'
                ? 'text-text-soft line-through'
                : 'text-text'
            )}
          >
            {task.title}
          </h3>

          {task.description && (
            <p className="text-sm text-text-soft mt-1 line-clamp-2">
              {task.description}
            </p>
          )}

          <div className="flex items-center gap-3 mt-2 flex-wrap">
            {task.due_at && (
              <span
                className={cn(
                  'text-xs flex items-center gap-1',
                  isOverdue ? 'text-error' : 'text-text-soft'
                )}
              >
                <Calendar className="w-3 h-3" />
                {formatDate(task.due_at)}
              </span>
            )}

            {task.document_id && (
              <span className="text-xs text-text-soft flex items-center gap-1">
                <FileText className="w-3 h-3" />
                From document
              </span>
            )}

            <Badge
              size="sm"
              className={cn(config.bgColor, config.color)}
            >
              {t(task.status)}
            </Badge>
          </div>
        </div>
      </div>
    </Card>
  );
}

