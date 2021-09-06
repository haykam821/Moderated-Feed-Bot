import { ModeratedFeedBot } from "./bot";
import { getConfig } from "./utils/config";

async function start() {
	const config = await getConfig();

	const bot = new ModeratedFeedBot(config);
	bot.start();
}
start();