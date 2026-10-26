/** Entry point (loaded as an ES module from index.html). */
import { App } from "./App.js";

const app = new App(document.getElementById("app"));
app.start();
