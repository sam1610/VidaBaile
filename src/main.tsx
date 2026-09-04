import React from 'react';
import ReactDOM from 'react-dom/client';
import { Amplify } from 'aws-amplify';
import outputs from '../amplify_outputs.json'; 
import App from './App.tsx';

// 1. Log to verify Vite is actually reading the JSON
console.log("JSON Load Check:", outputs);

// 2. Configure synchronously before React touches the DOM
Amplify.configure(outputs);

// 3. Log to verify the core library accepted the config
console.log("Core Config Check:", Amplify.getConfig());

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);