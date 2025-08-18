import React from 'react'

export function Card({ className = '', children, style = {} }) {
  // Se agrega box-shadow para dar profundidad y overflow hidden para evitar que el contenido desborde.
  const base = {
    border: '1px solid #e5e7eb',
    borderRadius: 16,
    background: '#fff',
    boxShadow: '0px 4px 12px rgba(0,0,0,0.1)',
    overflow: 'hidden',
  }
  return <div style={{ ...base, ...style }} className={className}>{children}</div>
}

export function CardContent({ className = '', children, style = {} }) {
  const base = { padding: 16 }
  return <div style={{ ...base, ...style }} className={className}>{children}</div>
}