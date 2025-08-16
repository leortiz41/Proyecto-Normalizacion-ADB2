import React from 'react'
export function Button({ className='', children, style={}, ...props }){
  const baseStyle = { padding:'8px 12px', border:'1px solid #d1d5db', borderRadius:10, background:'#fff', cursor:'pointer' }
  return <button style={{...baseStyle, ...style}} className={className} {...props}>{children}</button>
}