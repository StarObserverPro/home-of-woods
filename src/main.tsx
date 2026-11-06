import { createRoot } from "react-dom/client";
import { App } from "./ui/App.tsx";
import "./ui/style.css";
import "./ui/hud-layout.css";
import "./ui/menu-art.css";
createRoot(document.getElementById("root")!).render(<App />);
