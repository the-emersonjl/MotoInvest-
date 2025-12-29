
import React from 'react';

interface MarkdownRendererProps {
  content: string;
}

// Basic custom markdown-like renderer for common elements returned by AI
const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content }) => {
  const lines = content.split('\n');
  
  const renderLine = (line: string, index: number) => {
    // Basic Table Detection
    if (line.includes('|') && line.trim().startsWith('|')) {
      const cells = line.split('|').filter(c => c.trim() !== '');
      return (
        <tr key={index} className="border-b border-slate-700 bg-slate-800/30">
          {cells.map((cell, i) => (
            <td key={i} className="px-4 py-2 text-sm font-medium border-x border-slate-700">
              {cell.trim()}
            </td>
          ))}
        </tr>
      );
    }

    // Bold
    if (line.match(/\*\*(.*?)\*\*/)) {
       const parts = line.split(/(\*\*.*?\*\*)/g);
       return (
         <p key={index} className="mb-2">
           {parts.map((part, i) => 
             part.startsWith('**') && part.endsWith('**') ? 
             <strong key={i} className="text-emerald-400">{part.slice(2, -2)}</strong> : part
           )}
         </p>
       );
    }

    // Headlines
    if (line.startsWith('### ')) return <h3 key={index} className="text-lg font-bold text-emerald-400 mt-4 mb-2">{line.slice(4)}</h3>;
    if (line.startsWith('## ')) return <h2 key={index} className="text-xl font-bold text-emerald-400 mt-6 mb-3 border-b border-emerald-900 pb-1">{line.slice(3)}</h2>;
    if (line.startsWith('# ')) return <h1 key={index} className="text-2xl font-bold text-emerald-400 mt-8 mb-4">{line.slice(2)}</h1>;

    // Lists
    if (line.trim().startsWith('- ') || line.trim().startsWith('* ')) {
      return <li key={index} className="ml-4 mb-1 text-slate-300">{line.trim().slice(2)}</li>;
    }

    if (line.trim() === '') return <div key={index} className="h-2" />;

    return <p key={index} className="mb-2 leading-relaxed text-slate-200">{line}</p>;
  };

  const processedContent: React.ReactNode[] = [];
  let currentTable: React.ReactNode[] = [];

  lines.forEach((line, i) => {
    if (line.includes('|') && line.trim().startsWith('|')) {
      if (line.includes('---')) return; // Skip separator lines
      currentTable.push(renderLine(line, i));
    } else {
      if (currentTable.length > 0) {
        processedContent.push(
          <div className="overflow-x-auto my-4 rounded-lg border border-slate-700" key={`table-${i}`}>
            <table className="min-w-full divide-y divide-slate-700">
              <tbody>{currentTable}</tbody>
            </table>
          </div>
        );
        currentTable = [];
      }
      processedContent.push(renderLine(line, i));
    }
  });

  return <div className="markdown-body">{processedContent}</div>;
};

export default MarkdownRenderer;
