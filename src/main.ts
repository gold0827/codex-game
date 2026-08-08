import { commandRoomScenario } from "./scenarios/commandRoomScenario";
import "./styles/main.css";
import { renderCommandRoom } from "./ui/CommandRoom";

const root = document.querySelector<HTMLElement>("#app");

if (!root) {
  throw new Error("Application root not found");
}

renderCommandRoom(root, commandRoomScenario);
