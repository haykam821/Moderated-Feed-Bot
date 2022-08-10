import { SlashCommandBuilder } from "discord.js";

export const commands: SlashCommandBuilder[] = [];

export const inviteCommand = "invite";
commands.push(new SlashCommandBuilder()
	.setName(inviteCommand)
	.setDescription("Generates an invite link for the bot."));
