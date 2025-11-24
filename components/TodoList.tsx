
import * as React from 'react';
import { CheckCircle2, Circle, ListTodo } from 'lucide-react';
import { TodoItem, ThemeConfig } from '../types';

interface TodoListProps {
  todos: TodoItem[];
  theme: ThemeConfig;
  onToggle?: (id: string) => void;
}

const TodoList: React.FC<TodoListProps> = ({ todos, theme, onToggle }) => {
  // Group by Phase
  const byPhase = todos.reduce((acc, todo) => {
      const phase = todo.phase || 'General';
      if (!acc[phase]) acc[phase] = [];
      acc[phase].push(todo);
      return acc;
  }, {} as Record<string, TodoItem[]>);

  if (todos.length === 0) {
      return (
          <div className={`p-4 text-center ${theme.textMuted} text-xs italic`}>
              <ListTodo className="w-8 h-8 mx-auto mb-2 opacity-20" />
              No active tasks. The AI will create a plan for complex requests.
          </div>
      );
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto custom-scrollbar p-2 space-y-4">
        {Object.entries(byPhase).map(([phase, items]) => (
            <div key={phase} className={`border ${theme.border} rounded-lg overflow-hidden`}>
                <div className={`px-3 py-1.5 ${theme.bgPanelHeader} text-xs font-bold uppercase tracking-wider ${theme.textMuted}`}>
                    {phase}
                </div>
                <div className={`p-2 space-y-1 ${theme.bgApp}`}>
                    {items.map(item => (
                        <div key={item.id} className="flex items-start gap-2 p-1.5 rounded hover:bg-white/5">
                            <button 
                                onClick={() => onToggle && onToggle(item.id)}
                                className={`mt-0.5 ${item.status === 'completed' ? 'text-green-500' : 'text-gray-500'}`}
                            >
                                {item.status === 'completed' ? <CheckCircle2 className="w-4 h-4" /> : <Circle className="w-4 h-4" />}
                            </button>
                            <span className={`text-sm ${item.status === 'completed' ? 'line-through opacity-50' : theme.textMain}`}>
                                {item.task}
                            </span>
                        </div>
                    ))}
                </div>
            </div>
        ))}
    </div>
  );
};

export default TodoList;
