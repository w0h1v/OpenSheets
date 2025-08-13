import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// Global styles
const style = document.createElement('style');
style.textContent = `
  * {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }
  
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
    background: #f5f5f5;
  }
  
  button {
    padding: 6px 14px;
    border: none;
    border-radius: 4px;
    background: #1a73e8;
    color: white;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
  }
  
  button:hover {
    background: #1557b0;
  }
  
  button:active {
    transform: translateY(1px);
  }
`;
document.head.appendChild(style);

// Mount the app
const container = document.getElementById('root');
if (!container) {
  const root = document.createElement('div');
  root.id = 'root';
  document.body.appendChild(root);
}

const root = ReactDOM.createRoot(document.getElementById('root')!);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);