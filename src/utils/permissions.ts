import { Intents, InviteScope, PartialTypes, Permissions } from "discord.js";

export const intents = [
	Intents.FLAGS.GUILDS,
	Intents.FLAGS.GUILD_MESSAGES,
	Intents.FLAGS.GUILD_MESSAGE_REACTIONS,
];

export const partials: PartialTypes[] = [
	"MESSAGE",
	"CHANNEL",
	"REACTION",
];

export const permissions = [
	Permissions.FLAGS.VIEW_CHANNEL,
	Permissions.FLAGS.READ_MESSAGE_HISTORY,
	Permissions.FLAGS.SEND_MESSAGES,
	Permissions.FLAGS.MANAGE_MESSAGES,
];

export const scopes: InviteScope[] = [
	"bot",
	"applications.commands",
];