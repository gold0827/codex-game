import { completeCampaign } from "./scenarios/completeCampaign";
import "./styles/main.css";
import { mountGameWorkbench } from "./ui/GameWorkbench";

const root = document.querySelector<HTMLElement>("#app");

if (!root) {
  throw new Error("Application root not found");
}

mountGameWorkbench(root, completeCampaign);
