import { useState, useEffect } from 'react';
import { api } from '../api';
import { Task } from '../types';

type Filter = 'all' | 'todo' | 'done';

export default function Tasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [newTitle, setNewTitle] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => { fetchTasks(); }, []);

  const fetchTasks = async () => {
    const data = await api.getTasks();
    setTasks(data as Task[]);
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    setLoading(true);
    try {
      await api.createTask(newTitle.trim());
      setNewTitle('');
      await fetchTasks();
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = async (task: Task) => {
    await api.updateTask(task.id, { title: task.title, done: task.done === 0 });
    await fetchTasks();
  };

  const handleDelete = async (id: number) => {
    await api.deleteTask(id);
    await fetchTasks();
  };

  const filtered = tasks.filter(t => {
    if (filter === 'todo') return t.done === 0;
    if (filter === 'done') return t.done === 1;
    return true;
  });

  const doneCount = tasks.filter(t => t.done === 1).length;

  return (
    <div>
      <div className="filter-tabs">
        {(['all', 'todo', 'done'] as Filter[]).map(f => (
          <button
            key={f}
            className={`filter-tab ${filter === f ? 'active' : ''}`}
            onClick={() => setFilter(f)}
          >
            {f === 'all' ? `Toutes (${tasks.length})` : f === 'todo' ? `À faire (${tasks.length - doneCount})` : `Faites (${doneCount})`}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">{filter === 'done' ? '🎉' : '📋'}</div>
          <p>{filter === 'done' ? 'Aucune tâche terminée' : 'Aucune tâche à faire'}</p>
        </div>
      ) : (
        filtered.map(task => (
          <div key={task.id} className={`task-item ${task.done === 1 ? 'done' : ''}`}>
            <button
              className={`task-checkbox ${task.done === 1 ? 'checked' : ''}`}
              onClick={() => handleToggle(task)}
            >
              {task.done === 1 ? '✓' : ''}
            </button>
            <span className="task-title">{task.title}</span>
            <button className="btn-icon" onClick={() => handleDelete(task.id)}>🗑️</button>
          </div>
        ))
      )}

      <div style={{ height: 80 }} />

      <form className="add-task-bar" onSubmit={handleAdd}>
        <input
          className="input"
          placeholder="Nouvelle tâche..."
          value={newTitle}
          onChange={e => setNewTitle(e.target.value)}
        />
        <button type="submit" disabled={loading || !newTitle.trim()}>
          {loading ? '...' : 'Ajouter'}
        </button>
      </form>
    </div>
  );
}
