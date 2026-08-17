import "./styles/main.css";
import { mountProductionGame } from "./app/createGameWorkbench";

const root = document.querySelector<HTMLElement>("#app");

if (!root) {
  throw new Error("Application root not found");
}

mountProductionGame(root);
