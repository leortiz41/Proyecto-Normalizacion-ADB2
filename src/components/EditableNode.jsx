import React, { useState } from 'react';

export default function EditableNode({ data, id }) {
  const [label, setLabel] = useState(data.label || "");

  const handleChange = (e) => {
    setLabel(e.target.value);
    if (data.onLabelChange) {
      data.onLabelChange(id, e.target.value);
    }
  };

  return (
    <div style={{ padding: 10, border: '1px solid #ccc', borderRadius: 4, background: '#fff' }}>
      <input 
        type="text" 
        value={label} 
        onChange={handleChange} 
        style={{ border: 'none', outline: 'none', width: '100%' }}
      />
    </div>
  );
}