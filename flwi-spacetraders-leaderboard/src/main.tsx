import React from 'react'
import ReactDOM from 'react-dom/client'

import {createBrowserRouter, RouterProvider,} from "react-router-dom";
import './index.css'
import Root, {fetchData} from "./routes/root";
import ErrorPage from "./error-page.tsx";
import ResetPage, {loader} from "./routes/reset-page.tsx";

const router = createBrowserRouter([
  {
    path: "/",
    element: <Root />,
    errorElement: <ErrorPage />,
    loader: fetchData,
    children: [
      {
        path: "reset/:resetDate",
        element: <ResetPage/>,
        loader: loader //this is fine...
      },
    ],
  },
]);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
)
