import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HudApp } from "./HudApp";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <HudApp />
  </StrictMode>
);
