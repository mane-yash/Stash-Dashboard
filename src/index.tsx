import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App"; // <-- Removed .jsx extension
import "./App.css"; // <-- Changed from index.css to App.css

// 1. Import the Analytics component
import { Analytics } from "@vercel/analytics/react";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
    {/* 2. Add it right below your App component */}
    <Analytics />
  </React.StrictMode>,
);
