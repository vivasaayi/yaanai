import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./style.css";
import { Provider } from 'react-redux';
import { createRoot } from 'react-dom/client';
import store from './store';

// ReactDOM.createRoot(document.getElementById("root")).render(
//   <React.StrictMode>
//     <App />
//   </React.StrictMode>
// );


createRoot(document.getElementById('root')).render(
  <Provider store={store}>
    <App />
  </Provider>,
)