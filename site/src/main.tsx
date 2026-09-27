import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { config } from './config'
import { applyFavicon, applyTheme } from './lib/theme'
import './styles/index.css'

// Tema e identidade antes do primeiro render — evita piscar a paleta padrão.
applyTheme(config.colors)
applyFavicon(config.brand.faviconUrl, config.colors)
document.title = config.brand.tagline
  ? `${config.brand.name} — ${config.brand.tagline}`
  : config.brand.name

const root = document.getElementById('root')
if (!root) throw new Error('Elemento #root não encontrado no index.html')

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
