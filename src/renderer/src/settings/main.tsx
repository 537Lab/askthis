import { createRoot } from 'react-dom/client'
import { App } from './App'
import '../shared/theme.css'
import '../shared/components.css'
import './styles.css'

createRoot(document.getElementById('root')!).render(<App />)
