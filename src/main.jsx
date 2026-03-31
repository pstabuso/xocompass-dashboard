import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
// 1. Import the Provider here at the absolute root
import { DatasetFileProvider } from './context/DatasetFileContext'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {/* 2. Wrap the entire App inside the Provider */}
    <DatasetFileProvider>
      <App />
    </DatasetFileProvider>
  </React.StrictMode>,
)
