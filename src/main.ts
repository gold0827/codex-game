import { completeCampaign } from "./scenarios/completeCampaign";
import { bridgeDefenseCampaign } from "./scenarios/bridgeDefenseOperation";
import "./styles/main.css";
import { mountProductionGame } from "./app/createGameWorkbench";

const root = document.querySelector<HTMLElement>("#app");

if (!root) {
  throw new Error("Application root not found");
}

const campaign = new URLSearchParams(window.location.search).get("campaign") === "bridge-defense"
  ? bridgeDefenseCampaign
  : completeCampaign;

mountProductionGame(root, campaign);
