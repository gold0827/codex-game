import "./styles/main.css";
import { mountProductionGame } from "./app/createGameWorkbench";
import { mountProductionSquadBattle } from "./app/createSquadBattleGame";

const root = document.querySelector<HTMLElement>("#app");

if (!root) {
  throw new Error("Application root not found");
}

if (new URLSearchParams(window.location.search).get("legacy") === "1") {
  mountProductionGame(root);
} else {
  mountProductionSquadBattle(root);
}
