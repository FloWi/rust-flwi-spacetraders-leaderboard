import {StrictMode} from 'react'
import ReactDOM from 'react-dom/client'
import {createRouter, RouterProvider} from '@tanstack/react-router'
import './index.css'

// Import the generated route tree
import {routeTree} from './routeTree.gen'
import {OpenAPI} from "../generated";

// Setting a mutable variable seems to be the way to go in js-land :sob:
OpenAPI.BASE = `${window.location.origin}`

// Create a new router instance
const router = createRouter({routeTree})

// Register the router instance for type safety
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

// Render the app
const rootElement = document.getElementById('root')!
if (!rootElement.innerHTML) {
  const root = ReactDOM.createRoot(rootElement)
  root.render(
    <StrictMode>
      <RouterProvider router={router}/>
    </StrictMode>,
  )
}
