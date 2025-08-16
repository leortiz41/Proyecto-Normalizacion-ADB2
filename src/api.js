const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

export async function listTables(){
  const r = await fetch(`${API_URL}/api/tablas`); if(!r.ok) throw new Error('Error listando tablas'); return r.json();
}
export async function fetchTable(name, top=1000){
  const r = await fetch(`${API_URL}/api/tabla/${encodeURIComponent(name)}?top=${top}`); if(!r.ok) throw new Error('Error obteniendo tabla'); return r.json();
}
export async function uploadNormalized(tables, options={ schema:'dbo', ifExists:'drop' }){
  const r = await fetch(`${API_URL}/api/upload`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ ...options, tables }) }); if(!r.ok) throw new Error('Error subiendo tablas'); return r.json();
}