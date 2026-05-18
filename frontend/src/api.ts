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

  getFamilies: () => req<unknown[]>('GET', '/admin/families'),
  createFamily: (data: { identifier: string; password: string; name: string }) =>
    req('POST', '/admin/families', data),
  deleteFamilyAdmin: (id: number) => req('DELETE', `/admin/families/${id}`),
  updateFamilyPassword: (id: number, password: string) =>
    req('PUT', `/admin/families/${id}/password`, { password }),

  getMembers: () => req<unknown[]>('GET', '/members'),
  createMember: (data: { name: string; color: string }) => req('POST', '/members', data),
  updateMember: (id: number, data: { name: string; color: string }) => req('PUT', `/members/${id}`, data),
  deleteMember: (id: number) => req('DELETE', `/members/${id}`),

  getEvents: (year?: number, month?: number) => {
    const q = year && month ? `?year=${year}&month=${month}` : '';
    return req<unknown[]>('GET', `/calendar${q}`);
  },
  createEvent: (data: { title: string; date: string; member_id?: number | null; description?: string }) =>
    req('POST', '/calendar', data),
  updateEvent: (id: number, data: unknown) => req('PUT', `/calendar/${id}`, data),
  deleteEvent: (id: number) => req('DELETE', `/calendar/${id}`),

  getTasks: () => req<unknown[]>('GET', '/tasks'),
  createTask: (title: string) => req('POST', '/tasks', { title }),
  updateTask: (id: number, data: { title: string; done: boolean }) => req('PUT', `/tasks/${id}`, data),
  deleteTask: (id: number) => req('DELETE', `/tasks/${id}`),

  getExpenses: (year?: number, month?: number) => {
    let q = '';
    if (year && month) q = `?year=${year}&month=${month}`;
    else if (year) q = `?year=${year}`;
    return req<unknown[]>('GET', `/expenses${q}`);
  },
  createExpense: (data: {
    amount: number; date: string; category: string; member_id?: number | null; description?: string;
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
  getReceiptFileUrl: (id: number) => `/api/receipts/${id}/file`,
};
