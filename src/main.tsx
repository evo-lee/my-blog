import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import { HelmetProvider } from 'react-helmet-async'
import './index.css'
import { TRPCProvider } from "@/providers/trpc"
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <HelmetProvider>
    <BrowserRouter>
      <TRPCProvider>
        <App />
      </TRPCProvider>
    </BrowserRouter>
  </HelmetProvider>,
)
