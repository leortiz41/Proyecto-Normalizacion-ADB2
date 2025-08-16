import React from 'react'
export function Card({ className='', children, style={} }){
  const base = { border:'1px solid #e5e7eb', borderRadius:16, background:'#fff' }
  return <div style={{...base, ...style}} className={className}>{children}</div>
}
export function CardContent({ className='', children, style={} }){
  const base = { padding:16 }
  return <div style={{...base, ...style}} className={className}>{children}</div>
}