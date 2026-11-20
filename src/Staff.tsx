import { StoreProvider } from './store'
import App from './App'
import './styles.css'

/** Everything behind a staff sign-in: the admin back office and the front-desk operator screen. */
export default function Staff() {
  return (
    <StoreProvider>
      <App />
    </StoreProvider>
  )
}
