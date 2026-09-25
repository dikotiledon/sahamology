import React from 'react';
import { sessionDateJakarta } from './market-calendar';

export function getDefaultDate(): string {
  return sessionDateJakarta(new Date());
}

export function renderWithLinks(text: string | undefined): React.ReactNode {
  if (!text) return null;
  
  // Regex to match URLs
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = text.split(urlRegex);
  
  return parts.map((part, i) => {
    if (part.match(urlRegex)) {
      return (
        <a 
          key={i} 
          href={part} 
          target="_blank" 
          rel="noopener noreferrer"
          style={{ 
            color: 'var(--accent-primary)', 
            textDecoration: 'underline',
            wordBreak: 'break-all',
            cursor: 'pointer'
          }}
          className="link-hover"
          onClick={(e) => e.stopPropagation()}
        >
          {part}
        </a>
      );
    }
    return part;
  });
}
