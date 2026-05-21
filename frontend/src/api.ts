const BASE = '/api';

function getToken() {
  return localStorage.getItem('token') || '';
}

function authHeaders() {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${getToken()}`,
  };
}

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: authHeaders(),
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Erreur serveur');
  return data as T;
}

export const api = {
  login: (identifier: string, password: string) =>
    req<{ token: string; family: { id: number; identifier: string; name: string } }>('POST', '/auth/login', { identifier, password }),
  adminLogin: (username: string, password: string) =>
    req<{ token: string }>('POST', '/auth/admin/login', { username, password }),
  memberLogin: (family_identifier: string, member_name: string, password: string) =>
    req<{ token: string; family: { id: number; identifier: string; name: string }; member: { id: number; name: string; color: string } }>('POST', '/auth/member/login', { family_identifier, member_name, password }),

  getFamilies: () => req<unknown[]>('GET', '/admin/families'),
  createFamily: (data: { identifier: string; password: string; name: string }) =>
    req('POST', '/admin/families', data),
  deleteFamilyAdmin: (id: number) => req('DELETE', `/admin/families/${id}`),
  updateFamilyPassword: (id: number, password: string) =>
    req('PUT', `/admin/families/${id}/password`, { password }),

  health: () => req<{ ok: boolean; db: string; token: boolean; error?: string }>('GET', '/health'),
  ping: () => req('POST', '/members/ping', {}),

  getVapidKey: () => req<{ key: string }>('GET', '/push/vapid-public-key'),
  subscribePush: (sub: object) => req('POST', '/push/subscribe', sub),
  unsubscribePush: (endpoint: string) => req('POST', '/push/unsubscribe', { endpoint }),
  getMembers: () => req<unknown[]>('GET', '/members'),
  createMember: (data: { name: string; color: string; password?: string }) => req('POST', '/members', data),
  updateMember: (id: number, data: { name: string; color: string; password?: string }) => req('PUT', `/members/${id}`, data),
  deleteMember: (id: number) => req('DELETE', `/members/${id}`),
  updateLocation: (id: number, lat: number, lng: number) => req('PUT', `/members/${id}/location`, { lat, lng }),

  getLists: () => req<unknown[]>('GET', '/lists'),
  createList: (name: string) => req('POST', '/lists', { name }),
  deleteList: (id: number) => req('DELETE', `/lists/${id}`),
  addListItem: (listId: number, text: string) => req('POST', `/lists/${listId}/items`, { text }),
  toggleListItem: (listId: number, itemId: number, done: boolean) => req('PUT', `/lists/${listId}/items/${itemId}`, { done }),
  deleteListItem: (listId: number, itemId: number) => req('DELETE', `/lists/${listId}/items/${itemId}`),

  getMessages: () => req<unknown[]>('GET', '/messages'),
  sendMessage: (text: string, audio?: string) => req('POST', '/messages', { text, audio }),
  deleteMessage: (id: number) => req('DELETE', `/messages/${id}`),
  deleteEphemeral: (days: number) => req('DELETE', `/messages/ephemeral/${days}`),

  getEvents: (year?: number, month?: number, start_date?: string, end_date?: string) => {
    const p = new URLSearchParams();
    if (start_date && end_date) { p.set('start_date', start_date); p.set('end_date', end_date); }
    else if (year && month) { p.set('year', String(year)); p.set('month', String(month)); }
    const q = p.toString() ? `?${p}` : '';
    return req<unknown[]>('GET', `/calendar${q}`);
  },
  createEvent: (data: { title: string; date: string; time?: string; member_id?: number | null; member_ids?: number[]; description?: string; urgent?: boolean; recurrence?: string }) =>
    req('POST', '/calendar', data),
  updateEvent: (id: number, data: unknown) => req('PUT', `/calendar/${id}`, data),
  deleteEvent: (id: number) => req('DELETE', `/calendar/${id}`),

  getTasks: () => req<unknown[]>('GET', '/tasks'),
  createTask: (title: string, recurrence?: 'none' | 'daily') => req('POST', '/tasks', { title, recurrence: recurrence || 'none' }),
  updateTask: (id: number, data: { title: string; done: boolean }) => req('PUT', `/tasks/${id}`, data),
  deleteTask: (id: number) => req('DELETE', `/tasks/${id}`),

  getExpenses: (year?: number, month?: number) => {
    let q = '';
    if (year && month) q = `?year=${year}&month=${month}`;
    else if (year) q = `?year=${year}`;
    return req<unknown[]>('GET', `/expenses${q}`);
  },
  createExpense: (data: {
    amount: number; date: string; category: string; member_id?: number | null; member_ids?: number[]; description?: string;
  }) => req('POST', '/expenses', data),
  updateExpense: (id: number, data: unknown) => req('PUT', `/expenses/${id}`, data),
  deleteExpense: (id: number) => req('DELETE', `/expenses/${id}`),

  getReceipts: (year?: number, month?: number, category?: string) => {
    const p = new URLSearchParams();
    if (year) p.set('year', String(year));
    if (month) p.set('month', String(month));
    if (category) p.set('category', category);
    const q = p.toString() ? `?${p}` : '';
    return req<unknown[]>('GET', `/receipts${q}`);
  },
  createReceipt: (data: {
    filename: string; mimetype: string; data: string;
    amount?: number | null; date: string; category: string;
    description?: string; member_id?: number | null;
  }) => req<{ id: number }>('POST', '/receipts', data),
  deleteReceipt: (id: number) => req('DELETE', `/receipts/${id}`),
  getReceiptFileUrl: (id: number) => `/api/receipts/${id}/file?token=${getToken()}`,
  analyzeReceipt: (data: string, mimetype: string) =>
    req<{ amount: number | null; date: string; category: string; description: string }>('POST', '/receipts/analyze', { data, mimetype }),
  testGemini: () =>
    req<{ keyPrefix: string; results: { model: string; ok: boolean; response?: string; error?: string }[] }>('GET', '/receipts/test-gemini'),
  exportReceiptsYear: (year: number) => `/api/receipts/export/${year}?token=${getToken()}`,
  deleteReceiptsYear: (year: number) => req<{ ok: boolean; deleted: number }>('DELETE', `/receipts/year/${year}`),
  getLocationToken: () => req<{ token: string }>('GET', '/location/token'),
};
