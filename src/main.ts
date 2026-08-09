import { createGameController } from "./game";
import { completeCampaign } from "./scenarios/completeCampaign";
import "./styles/main.css";
import { mountGameApp } from "./ui/GameApp";

const root = document.querySelector<HTMLElement>("#app");

if (!root) {
  throw new Error("Application root not found");
}

const controller = createGameController(completeCampaign, "production-campaign");
mountGameApp(root, completeCampaign, controller);
