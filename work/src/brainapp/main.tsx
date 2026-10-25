import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import BrainApp from "./BrainApp";
import "../index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrainApp />
  </StrictMode>,
);
