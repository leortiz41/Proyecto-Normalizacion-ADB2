import React from 'react'
export function Input({ className='', style={}, ...props }){
  const base = { padding:'8px 10px', border:'1px solid #d1d5db', borderRadius:10, background:'#fff' }
  return <input style={{...base, ...style}} className={className} {...props} />
}