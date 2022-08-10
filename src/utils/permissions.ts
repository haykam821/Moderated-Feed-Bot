import { IntentsBitField, OAuth2Scopes, Partials, PermissionsBitField } from "discord.js";

export const intents = [
	IntentsBitField.Flags.Guilds,
	IntentsBitField.Flags.GuildMessages,
	IntentsBitField.Flags.GuildMessageReactions,
];

export const partials: Partials[] = [
	Partials.Message,
	Partials.Channel,
	Partials.Reaction,
];

export const permissions = [
	PermissionsBitField.Flags.ViewChannel,
	PermissionsBitField.Flags.ReadMessageHistory,
	PermissionsBitField.Flags.SendMessages,
	PermissionsBitField.Flags.ManageMessages,
];

export const scopes: OAuth2Scopes[] = [
	OAuth2Scopes.Bot,
	OAuth2Scopes.ApplicationsCommands,
];
