import { useState, useEffect } from 'react';
import { api } from '../api';
import { Task, List } from '../types';

type Filter = 'all' | 'todo' | 'done';
type SubTab = 'tasks' | 'lists';

export default function Tasks() {
  const [subTab, setSubTab] = useState<SubTab>('tasks');

  // Tasks state
  const [tasks, setTasks] = useState<Task[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [newTitle, setNewTitle] = useState('');
  const [isDaily, setIsDaily] = useState(false);
  const [loading, setLoading] = useState(false);

  // Lists state
  const [lists, setLists] = useState<List[]>([]);
  const [newListName, setNewListName] = useState('');
  const [openListId, setOpenListId] = useState<number | null>(null);
  const [newItemText, setNewItemText] = useState('');
  const [listLoading, setListLoading] = useState(false);

  useEffect(() => { fetchTasks(); fetchLists(); }, []);

  const fetchTasks = async () => {
    const data = await api.getTasks();
    setTasks(data as Task[]);
  };

  const fetchLists = async () => {
    const data = await api.getLists();
    setLists(data as List[]);
  };

  // --- Tasks ---
  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    setLoading(true);
    try {
      await api.createTask(newTitle.trim(), isDaily ? 'daily' : 'none');
      setNewTitle('');
      setIsDaily(false);
      await fetchTasks();
    } finally { setLoading(false); }
  };

  const handleToggle = async (task: Task) => {
    await api.updateTask(task.id, { title: task.title, done: task.done === 0 });
    await fetchTasks();
  };

  const handleDelete = async (id: number) => {
    await api.deleteTask(id);
    await fetchTasks();
  };

  // Tâches quotidiennes séparées des normales
  const dailyTasks = tasks.filter(t => (t as any).recurrence === 'daily');
  const normalTasks = tasks.filter(t => (t as any).recurrence !== 'daily');

  const filteredNormal = normalTasks.filter(t => {
    if (filter === 'todo') return t.done === 0;
    if (filter === 'done') return t.done === 1;
    return true;
  });

  const doneCount = normalTasks.filter(t => t.done === 1).length;
  const dailyDoneCount = dailyTasks.filter(t => t.done === 1).length;

  // --- Lists ---
  const handleCreateList = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newListName.trim()) return;
    setListLoading(true);
    try {
      await api.createList(newListName.trim());
      setNewListName('');
      await fetchLists();
    } finally { setListLoading(false); }
  };

  const handleDeleteList = async (id: number) => {
    if (!confirm('Supprimer cette liste ?')) return;
    await api.deleteList(id);
    if (openListId === id) setOpenListId(null);
    await fetchLists();
  };

  const handleAddItem = async (listId: number, e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemText.trim()) return;
    await api.addListItem(listId, newItemText.trim());
    setNewItemText('');
    await fetchLists();
  };

  const handleToggleItem = async (listId: number, itemId: number, done: boolean) => {
    await api.toggleListItem(listId, itemId, done);
    await fetchLists();
  };

  const handleDeleteItem = async (listId: number, itemId: number) => {
    await api.deleteListItem(listId, itemId);
    await fetchLists();
  };

  return (
    <div>
      {/* Sub-tab toggle */}
      <div className="view-toggle" style={{ marginBottom: 16 }}>
        <button className={`view-tab ${subTab === 'tasks' ? 'active' : ''}`} onClick={() => setSubTab('tasks')}>
          ✅ Tâches
        </button>
        <button className={`view-tab ${subTab === 'lists' ? 'active' : ''}`} onClick={() => setSubTab('lists')}>
          📋 Listes
        </button>
      </div>

      {/* TASKS TAB */}
      {subTab === 'tasks' && (
        <>
          {/* ── Tâches quotidiennes ── */}
          {dailyTasks.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                marginBottom: 10, padding: '6px 12px',
                background: 'var(--surface)', borderRadius: 10,
                border: '1px solid var(--border)',
              }}>
                <span style={{ fontSize: 16 }}>🔄</span>
                <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-1)' }}>Tâches quotidiennes</span>
                <span style={{
                  marginLeft: 'auto', fontSize: 12, fontWeight: 600,
                  color: dailyDoneCount === dailyTasks.length ? '#16A34A' : 'var(--text-2)',
                }}>
                  {dailyDoneCount}/{dailyTasks.length} faites
                </span>
              </div>

              {dailyTasks.map(task => (
                <div key={task.id} className={`task-item ${task.done === 1 ? 'done' : ''}`}
                  style={{ borderLeft: '3px solid #6366F1' }}>
                  <button
                    className={`task-checkbox ${task.done === 1 ? 'checked' : ''}`}
                    onClick={() => handleToggle(task)}
                    style={task.done === 1 ? { background: '#6366F1', borderColor: '#6366F1' } : { borderColor: '#6366F1' }}
                  >
                    {task.done === 1 ? '✓' : ''}
                  </button>
                  <div style={{ flex: 1 }}>
                    <span className="task-title">{task.title}</span>
                    <div style={{ fontSize: 11, color: '#6366F1', marginTop: 2 }}>
                      🔄 Se réinitialise à minuit
                      {task.done === 1 && (task as any).done_by && (
                        <span style={{ marginLeft: 6, color: '#16A34A', fontWeight: 700 }}>
                          · ✓ {(task as any).done_by}
                        </span>
                      )}
                    </div>
                  </div>
                  <button className="btn-icon" onClick={() => handleDelete(task.id)}>🗑️</button>
                </div>
              ))}
            </div>
          )}

          {/* ── Tâches normales ── */}
          <div className="filter-tabs">
            {(['all', 'todo', 'done'] as Filter[]).map(f => (
              <button
                key={f}
                className={`filter-tab ${filter === f ? 'active' : ''}`}
                onClick={() => setFilter(f)}
              >
                {f === 'all' ? `Toutes (${normalTasks.length})` : f === 'todo' ? `À faire (${normalTasks.length - doneCount})` : `Faites (${doneCount})`}
              </button>
            ))}
          </div>

          {filteredNormal.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">{filter === 'done' ? '🎉' : '📋'}</div>
              <p>{filter === 'done' ? 'Aucune tâche terminée' : 'Aucune tâche à faire'}</p>
            </div>
          ) : (
            filteredNormal.map(task => (
              <div key={task.id} className={`task-item ${task.done === 1 ? 'done' : ''}`}>
                <button
                  className={`task-checkbox ${task.done === 1 ? 'checked' : ''}`}
                  onClick={() => handleToggle(task)}
                >
                  {task.done === 1 ? '✓' : ''}
                </button>
                <div style={{ flex: 1 }}>
                  <span className="task-title">{task.title}</span>
                  {task.done === 1 && (task as any).done_by && (
                    <div style={{ fontSize: 11, color: '#16A34A', fontWeight: 700, marginTop: 2 }}>
                      ✓ {(task as any).done_by}
                    </div>
                  )}
                </div>
                <button className="btn-icon" onClick={() => handleDelete(task.id)}>🗑️</button>
              </div>
            ))
          )}

          <div style={{ height: 100 }} />

          {/* Barre d'ajout */}
          <form className="add-task-bar" onSubmit={handleAdd} style={{ flexDirection: 'column', gap: 8, alignItems: 'stretch' }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                className="input"
                placeholder="Nouvelle tâche..."
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                style={{ marginBottom: 0, flex: 1 }}
              />
              <button type="submit" disabled={loading || !newTitle.trim()}>
                {loading ? '...' : 'Ajouter'}
              </button>
            </div>
            {/* Toggle quotidien */}
            <button
              type="button"
              onClick={() => setIsDaily(d => !d)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '8px 12px', borderRadius: 10,
                border: `2px solid ${isDaily ? '#6366F1' : 'var(--border)'}`,
                background: isDaily ? '#EEF2FF' : 'var(--surface)',
                color: isDaily ? '#4338CA' : 'var(--text-2)',
                fontWeight: 600, fontSize: 13, cursor: 'pointer',
              }}
            >
              <span style={{ fontSize: 16 }}>🔄</span>
              {isDaily ? 'Tâche quotidienne activée — se réinitialise à minuit' : 'Rendre quotidienne'}
            </button>
          </form>
        </>
      )}

      {/* LISTS TAB */}
      {subTab === 'lists' && (
        <>
          {lists.length === 0 && (
            <div className="empty-state">
              <div className="empty-state-icon">📋</div>
              <p>Aucune liste pour l'instant</p>
            </div>
          )}

          {lists.map(list => {
            const doneItems = list.items.filter(i => i.done === 1).length;
            const isOpen = openListId === list.id;
            return (
              <div key={list.id} className="list-card">
                <div className="list-card-header" onClick={() => setOpenListId(isOpen ? null : list.id)}>
                  <div>
                    <span className="list-card-name">{list.name}</span>
                    <span className="list-card-count">{doneItems}/{list.items.length}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <button
                      className="btn-icon"
                      onClick={e => { e.stopPropagation(); handleDeleteList(list.id); }}
                    >🗑️</button>
                    <span style={{ fontSize: 18, color: 'var(--text-2)' }}>{isOpen ? '▲' : '▼'}</span>
                  </div>
                </div>

                {isOpen && (
                  <div className="list-card-body">
                    {list.items.map(item => (
                      <div key={item.id} className={`list-item ${item.done === 1 ? 'done' : ''}`}>
                        <button
                          className={`task-checkbox ${item.done === 1 ? 'checked' : ''}`}
                          onClick={() => handleToggleItem(list.id, item.id, item.done === 0)}
                        >
                          {item.done === 1 ? '✓' : ''}
                        </button>
                        <span className="list-item-text">{item.text}</span>
                        <button className="btn-icon" onClick={() => handleDeleteItem(list.id, item.id)}>🗑️</button>
                      </div>
                    ))}

                    <form style={{ display: 'flex', gap: 8, marginTop: 8 }} onSubmit={e => handleAddItem(list.id, e)}>
                      <input
                        className="input"
                        placeholder="Ajouter un élément..."
                        value={newItemText}
                        onChange={e => setNewItemText(e.target.value)}
                        style={{ marginBottom: 0, flex: 1 }}
                      />
                      <button type="submit" disabled={!newItemText.trim()} style={{ flexShrink: 0 }}>
                        +
                      </button>
                    </form>
                  </div>
                )}
              </div>
            );
          })}

          <div style={{ height: 80 }} />

          <form className="add-task-bar" onSubmit={handleCreateList}>
            <input
              className="input"
              placeholder="Nouvelle liste (ex: Courses)..."
              value={newListName}
              onChange={e => setNewListName(e.target.value)}
            />
            <button type="submit" disabled={listLoading || !newListName.trim()}>
              {listLoading ? '...' : 'Créer'}
            </button>
          </form>
        </>
      )}
    </div>
  );
}
