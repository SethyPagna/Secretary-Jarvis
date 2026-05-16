import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HudApp } from "./HudApp";
import "./styles.css";

const shell = new URLSearchParams(window.location.search).get("shell") ?? "overlay";
document.documentElement.dataset.shell = shell;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <HudApp />
  </StrictMode>
);
